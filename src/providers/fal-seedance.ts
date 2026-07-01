import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.js';
import type { VideoGenRequest, VideoGenResult } from '../types.js';

// ─── Seedance 1.5 Pro (image→video) via fal.ai ───────────────────────────────
//
// Endpoint:  fal-ai/bytedance/seedance/v1.5/pro/image-to-video
// Auth:      Authorization: Key <FAL_KEY>
// Queue:     POST https://queue.fal.run/{model} → { request_id, status_url, response_url }
//            poll status_url until status === 'COMPLETED', then GET response_url
// Image:     image_url accepts a base64 data URI (no separate upload step)
// Audio:     generate_audio: true → synchronized audio + lip-synced dialogue.
//            Dialogue is written INLINE in the prompt (e.g. he says "...").
//
// Why a distinct provider from providers/seedance.ts: that one rides the
// Higgsfield envelope and is silent (Seedance 1.0 Pro). This is the fal path
// for the talking-UGC model.

const FAL_MODEL = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video';
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function falHeaders(): { Authorization: string; 'Content-Type': string } {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY is not set');
  return { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
}

/** Map our requested seconds onto Seedance 1.5's allowed range (4–12). */
function mapDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 4) return '4';
  if (rounded > 12) return '12';
  return String(rounded);
}

async function imageToDataUri(imagePath: string): Promise<string> {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buf = await fs.readFile(imagePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buf);
}

export async function generateFalSeedanceClip(req: VideoGenRequest): Promise<VideoGenResult> {
  const headers = falHeaders();
  const duration = mapDuration(req.duration);
  logger.step(`fal Seedance 1.5 Pro: ${req.outputPath} (${duration}s, ${req.aspectRatio}, audio)`);

  const imageDataUri = await imageToDataUri(req.imageReference);

  const input = {
    prompt: req.prompt,
    image_url: imageDataUri,
    aspect_ratio: req.aspectRatio,
    resolution: '1080p',
    duration,
    generate_audio: true,
    camera_fixed: false,
  };

  const submitRes = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`fal submit failed: HTTP ${submitRes.status} — ${body}`);
  }
  const submit = (await submitRes.json()) as { request_id: string; status_url: string; response_url: string };
  logger.step(`fal Seedance: queued (request ${submit.request_id})`);

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`fal Seedance timed out after ${POLL_TIMEOUT_MS / 1000}s (request ${submit.request_id})`);
    }
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetch(submit.status_url, { headers });
    if (!statusRes.ok) {
      const body = await statusRes.text();
      throw new Error(`fal status failed: HTTP ${statusRes.status} — ${body}`);
    }
    const status = (await statusRes.json()) as { status: string };
    if (status.status === 'COMPLETED') break;
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`fal Seedance generation ${status.status} (request ${submit.request_id})`);
    }
  }

  const resultRes = await fetch(submit.response_url, { headers });
  if (!resultRes.ok) {
    const body = await resultRes.text();
    throw new Error(`fal result fetch failed: HTTP ${resultRes.status} — ${body}`);
  }
  const result = (await resultRes.json()) as { video?: { url?: string } };
  const videoUrl = result.video?.url;
  if (!videoUrl) throw new Error(`fal Seedance returned no video URL — ${JSON.stringify(result)}`);

  await downloadVideo(videoUrl, req.outputPath);
  logger.success(`fal Seedance: done — ${req.outputPath}`);
  return { path: req.outputPath };
}

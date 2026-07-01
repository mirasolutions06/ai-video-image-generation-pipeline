import { promises as fs } from 'node:fs';
import path from 'node:path';
import { retry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';
import type { VideoGenRequest, VideoGenResult } from '../types.js';

// ─── Higgsfield REST API ────────────────────────────────────────────────────
//
// Auth:     hf-api-key + hf-secret headers
// Submit:   POST {API_BASE}/{endpoint}  body: { params: { ... } }   ← envelope!
// Response: { id }   ← NOT { request_id, job_set_url }
// Polling:  GET {API_BASE}/job-sets/{id}
// Image:    POST /files/generate-upload-url to get a presigned PUT URL,
//           then PUT bytes directly. The /v1/uploads endpoint does NOT exist.
//
// All three video providers (DoP, Seedance, Kling) ride on this same envelope.

export const API_BASE = 'https://platform.higgsfield.ai';
const DOP_ENDPOINT = '/v1/image2video/dop';
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 180; // 12 minutes; Kling master 10s can take 6-8 min

export function getHfHeaders(): { 'hf-api-key': string; 'hf-secret': string; 'Content-Type': string } {
  const apiKey = process.env.HF_API_KEY;
  const secret = process.env.HF_API_SECRET;
  if (!apiKey || !secret) throw new Error('HF_API_KEY and HF_API_SECRET are required');
  return { 'hf-api-key': apiKey, 'hf-secret': secret, 'Content-Type': 'application/json' };
}

/**
 * Upload a local image to Higgsfield's CDN and return the public URL.
 * Two-step flow: presign → PUT. The legacy `/v1/uploads` multipart endpoint 404s.
 */
export async function uploadImageToHiggsfield(imagePath: string): Promise<string> {
  const ext = path.extname(imagePath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  // Step 1: presign
  const presignRes = await fetch(`${API_BASE}/files/generate-upload-url`, {
    method: 'POST',
    headers: getHfHeaders(),
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!presignRes.ok) {
    throw new Error(`Higgsfield presign failed: HTTP ${presignRes.status} — ${await presignRes.text()}`);
  }
  const { upload_url, public_url } = (await presignRes.json()) as { upload_url: string; public_url: string };

  // Step 2: PUT bytes
  const buf = await fs.readFile(imagePath);
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buf,
  });
  if (!putRes.ok) {
    throw new Error(`Higgsfield image upload failed: HTTP ${putRes.status} — ${await putRes.text()}`);
  }

  return public_url;
}

export interface PollOptions {
  jobSetUrl: string;
  maxAttempts?: number;
  intervalMs?: number;
}

interface JobSetPollResponse {
  jobs: Array<{
    status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw';
    results: { raw?: { url: string }; min?: { url: string } } | null;
  }>;
}

/**
 * Poll a job-set until the first job reaches a terminal status.
 * Returns the resulting video URL (raw quality preferred, then min).
 */
export async function pollJobSet(opts: PollOptions): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(opts.jobSetUrl, { headers: getHfHeaders() });
    if (!res.ok) {
      // Transient 5xx → retry next tick
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      throw new Error(`Polling failed: HTTP ${res.status} — ${(await res.text()).slice(0, 400)}`);
    }
    const json = (await res.json()) as JobSetPollResponse;
    const job = json.jobs?.[0];
    if (!job) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (job.status === 'failed' || job.status === 'nsfw') {
      throw new Error(`Job ended with status ${job.status}: ${JSON.stringify(json).slice(0, 400)}`);
    }
    if (job.status === 'completed') {
      const url = job.results?.raw?.url ?? job.results?.min?.url;
      if (!url) throw new Error(`Completed job returned no video URL: ${JSON.stringify(job).slice(0, 400)}`);
      return url;
    }
    // queued | in_progress — keep waiting
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Polling timed out after ${maxAttempts} attempts`);
}

/**
 * Submit a request to a Higgsfield endpoint and poll until completion.
 * The payload MUST already be the inner params object — this function adds the
 * `{ params }` envelope. Returns the CDN URL of the generated mp4.
 */
export async function submitAndPoll(endpoint: string, params: object): Promise<string> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const submitRes = await retry(
    () => fetch(url, {
      method: 'POST',
      headers: getHfHeaders(),
      body: JSON.stringify({ params }),
    }),
    { attempts: 3, baseMs: 2000 },
  );
  if (!submitRes.ok) {
    throw new Error(`Submit failed: HTTP ${submitRes.status} — ${(await submitRes.text()).slice(0, 600)}`);
  }
  const submitJson = (await submitRes.json()) as { id?: string };
  if (!submitJson.id) {
    throw new Error(`Submit returned no id: ${JSON.stringify(submitJson).slice(0, 400)}`);
  }
  const jobSetUrl = `${API_BASE}/v1/job-sets/${submitJson.id}`;
  return pollJobSet({ jobSetUrl });
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buf);
}

/** Map an arbitrary requested duration to Higgsfield DoP's allowed durations. */
function mapDuration(seconds: number): number {
  return seconds <= 5 ? 5 : 10;
}

/**
 * Generate a video clip via Higgsfield DoP.
 * Image-to-video; the storyboard frame is uploaded to the HF CDN first.
 */
export async function generateHiggsfieldClip(req: VideoGenRequest): Promise<VideoGenResult> {
  logger.step(`Higgsfield DoP: scene at ${req.outputPath} (${req.duration}s)`);

  const publicUrl = await uploadImageToHiggsfield(req.imageReference);
  const duration = mapDuration(req.duration);

  const params: Record<string, unknown> = {
    model: 'dop-turbo',
    prompt: req.prompt,
    input_images: [{ type: 'image_url', image_url: publicUrl }],
    duration: String(duration),
    aspect_ratio: req.aspectRatio,
    enhance_prompt: true,
  };
  if (req.soulId) params.soul_id = req.soulId;

  const videoUrl = await submitAndPoll(DOP_ENDPOINT, params);
  await downloadVideo(videoUrl, req.outputPath);
  logger.success(`Higgsfield DoP: done — ${req.outputPath}`);
  return { path: req.outputPath };
}

import { logger } from '../lib/logger.js';
import { uploadImageToHiggsfield, submitAndPoll } from './higgsfield.js';
import type { VideoGenRequest, VideoGenResult } from '../types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Seedance 1.0 Pro via Higgsfield ────────────────────────────────────────
//
// Endpoint: /v1/image2video/seedance
// Model:    'seedance_pro' (NOT 'seedance-1-0-pro')
// Duration: integer 3-12 (NOT a string, field is `duration`, NOT `duration_seconds`)
// Image:    `input_image` wrapped as { type: 'image_url', image_url: <public_url> }
// Envelope: submitAndPoll wraps the payload in { params: ... } automatically.

const SEEDANCE_ENDPOINT = '/v1/image2video/seedance';
const SEEDANCE_MODEL = 'seedance_pro';

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buf);
}

/** Clamp the requested duration to Seedance's allowed integer range (3-12). */
function mapSeedanceDuration(seconds: number): number {
  const rounded = Math.round(seconds);
  if (rounded < 3) return 3;
  if (rounded > 12) return 12;
  return rounded;
}

export async function generateSeedanceClip(req: VideoGenRequest): Promise<VideoGenResult> {
  logger.step(`Seedance: scene at ${req.outputPath} (${req.duration}s)`);

  const duration = mapSeedanceDuration(req.duration);
  const publicUrl = await uploadImageToHiggsfield(req.imageReference);

  const params: Record<string, unknown> = {
    model: SEEDANCE_MODEL,
    prompt: req.prompt,
    input_image: { type: 'image_url', image_url: publicUrl },
    duration,
    aspect_ratio: req.aspectRatio,
    camera_fixed: true,
    enhance_prompt: true,
  };

  const videoUrl = await submitAndPoll(SEEDANCE_ENDPOINT, params);
  await downloadVideo(videoUrl, req.outputPath);
  logger.success(`Seedance: done — ${req.outputPath}`);
  return { path: req.outputPath };
}

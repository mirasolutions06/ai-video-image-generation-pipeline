import { logger } from '../lib/logger.js';
import { uploadImageToHiggsfield, submitAndPoll } from './higgsfield.js';
import type { VideoGenRequest, VideoGenResult } from '../types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Kling 2.1 via Higgsfield ───────────────────────────────────────────────
//
// Endpoint: /v1/image2video/kling
// Models:
//   - 'kling-v2-1-master'  (default — best quality for single-frame i2v)
//   - 'kling-v2-1'         (standard — REQUIRED for keyframe interpolation; the
//                            master variant accepts input_image_end but then fails
//                            silently at ~16s with no error payload)
// Duration: literal 5 or 10 (integer, not string, field is `duration`)
// Image:    `input_image` wrapped as { type: 'image_url', image_url: <public_url> }
// Envelope: submitAndPoll wraps the payload in { params: ... } automatically.
//
// Anti-dance negative prompt is applied in single-frame mode only — in keyframe
// interpolation mode the natural body rotation between start→end conflicts with
// "no camera movement / no gestures" hints.

const KLING_ENDPOINT = '/v1/image2video/kling';
const KLING_MODEL_DEFAULT = 'kling-v2-1-master';
const KLING_MODEL_KEYFRAMES = 'kling-v2-1';

const ANTI_DANCE_NEGATIVE = 'dancing, choreography, jumping, twirling, camera movement, zoom, pan, tilt, shake, crane, dolly, moving camera, rotating camera, orbit, fast motion, exaggerated gestures, fashion pose performance';

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buf);
}

/** Clamp requested duration to Kling's allowed enum (5 or 10). */
function mapKlingDuration(seconds: number): 5 | 10 {
  return seconds > 5 ? 10 : 5;
}

export async function generateKlingClip(req: VideoGenRequest): Promise<VideoGenResult> {
  const duration = mapKlingDuration(req.duration);
  const isKeyframe = req.imageReferenceEnd !== undefined;
  const model = isKeyframe ? KLING_MODEL_KEYFRAMES : KLING_MODEL_DEFAULT;

  logger.step(`Kling ${model}: scene at ${req.outputPath} (${duration}s${isKeyframe ? ', keyframe' : ''})`);

  const startUrl = await uploadImageToHiggsfield(req.imageReference);
  const endUrl = isKeyframe ? await uploadImageToHiggsfield(req.imageReferenceEnd!) : undefined;

  const params: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    input_image: { type: 'image_url', image_url: startUrl },
    duration,
    cfg_scale: 0.3,
    enhance_prompt: true,
  };

  if (endUrl) {
    params.input_image_end = { type: 'image_url', image_url: endUrl };
  } else {
    params.negative_prompt = ANTI_DANCE_NEGATIVE;
  }

  const videoUrl = await submitAndPoll(KLING_ENDPOINT, params);
  await downloadVideo(videoUrl, req.outputPath);
  logger.success(`Kling: done — ${req.outputPath}`);
  return { path: req.outputPath };
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import type { VideoGenRequest, VideoGenResult } from '../types.js';
import { logger } from '../lib/logger.js';
import { retry } from '../lib/retry.js';

const MODEL_STANDARD = 'veo-3.0-generate-001';
const MODEL_FAST = 'veo-3.0-fast-generate-001';
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const ANTI_MOTION_NEGATIVE = 'camera movement, zoom, pan, tilt, shake, crane, dolly, push-in, pull-out, orbit, rotating camera, fast motion, motion blur, exaggerated gestures, dancing, choreography, fashion pose performance, on-screen text, logos, captions';

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function generateVeoClip(req: VideoGenRequest): Promise<VideoGenResult> {
  return runVeo(req, MODEL_STANDARD);
}

export function generateVeoFastClip(req: VideoGenRequest): Promise<VideoGenResult> {
  return runVeo(req, MODEL_FAST);
}

async function runVeo(req: VideoGenRequest, model: string): Promise<VideoGenResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const client = new GoogleGenAI({ apiKey });

  logger.step(`Veo ${model}: scene at ${req.outputPath} (${req.duration}s, ${req.aspectRatio})`);

  const buf = await fs.readFile(req.imageReference);
  const imageBytes = buf.toString('base64');
  const mimeType = inferMimeType(req.imageReference);

  let operation = await retry(
    () => client.models.generateVideos({
      model,
      prompt: req.prompt,
      image: { imageBytes, mimeType },
      config: {
        aspectRatio: req.aspectRatio,
        durationSeconds: req.duration,
        numberOfVideos: 1,
        negativePrompt: ANTI_MOTION_NEGATIVE,
      },
    }),
    { attempts: 3, baseMs: 2000 },
  );

  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`Veo operation timed out after ${POLL_TIMEOUT_MS / 1000}s (op=${operation.name ?? 'unknown'})`);
    }
    await sleep(POLL_INTERVAL_MS);
    operation = await client.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
    throw new Error(`Veo operation failed: ${JSON.stringify(operation.error)}`);
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) {
    const filtered = operation.response?.raiMediaFilteredReasons?.join('; ');
    throw new Error(`Veo returned no video${filtered ? ` (RAI filter: ${filtered})` : ''}`);
  }

  await fs.mkdir(path.dirname(req.outputPath), { recursive: true });
  const downloadPath = req.outputPath.replace(/\.mp4$/, '.with-audio.mp4');
  await client.files.download({ file: video, downloadPath });
  await stripAudio(downloadPath, req.outputPath);
  await fs.unlink(downloadPath);
  logger.success(`Veo: done — ${req.outputPath}`);
  return { path: req.outputPath };
}

function stripAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', inputPath, '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath], { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code} while stripping audio from ${inputPath}`));
    });
  });
}

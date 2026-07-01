import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getFal } from '../lib/fal-client.js';
import { logger } from '../lib/logger.js';

// ─── Sync Lipsync 2.0 via fal ─────────────────────────────────────────────────
// Endpoint: fal-ai/sync-lipsync/v2. Re-drives ONLY the mouth region of an
// existing video to match a new audio track — the scene, product, label, and
// identity are preserved. sync_mode: cut_off truncates to the shorter stream.
// The base video is uploaded to fal storage to get a public video_url.

const LIPSYNC_MODEL = 'fal-ai/sync-lipsync/v2';

export type LipsyncModel = 'lipsync-2' | 'lipsync-2-pro';
export type SyncMode = 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap';

export interface LipsyncRequest {
  videoPath: string;
  /** fal-hosted (or any public) audio URL. */
  audioUrl: string;
  model?: LipsyncModel;
  syncMode?: SyncMode;
  outputPath: string;
}

export async function lipsyncVideo(req: LipsyncRequest): Promise<string> {
  const fal = getFal();

  logger.step(`Uploading base video to fal: ${path.basename(req.videoPath)}`);
  const buf = await fs.readFile(req.videoPath);
  const videoUrl = await fal.storage.upload(new Blob([buf], { type: 'video/mp4' }));

  const model = req.model ?? 'lipsync-2-pro';
  const syncMode = req.syncMode ?? 'cut_off';
  logger.step(`Lipsync ${model} (${syncMode})…`);

  // The fal client's bundled types for this endpoint are stale (they list the
  // old lipsync-1.x model ids); the live API takes lipsync-2 / lipsync-2-pro.
  const input = {
    model,
    video_url: videoUrl,
    audio_url: req.audioUrl,
    sync_mode: syncMode,
  } as Record<string, unknown>;
  const result = await fal.subscribe(LIPSYNC_MODEL, { input: input as never });

  const data = (result as { data?: unknown }).data ?? result;
  const outUrl = (data as { video?: { url?: string } }).video?.url;
  if (!outUrl) throw new Error(`Lipsync returned no video url — ${JSON.stringify(data)}`);

  const res = await fetch(outUrl);
  if (!res.ok) throw new Error(`Lipsync download failed: HTTP ${res.status}`);
  const outBuf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(req.outputPath), { recursive: true });
  await fs.writeFile(req.outputPath, outBuf);
  logger.success(`Lipsync: done — ${req.outputPath}`);

  return req.outputPath;
}

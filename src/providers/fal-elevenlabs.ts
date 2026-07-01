import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getFal } from '../lib/fal-client.js';
import { logger } from '../lib/logger.js';

// ─── ElevenLabs TTS via fal ───────────────────────────────────────────────────
// Endpoint: fal-ai/elevenlabs/tts/multilingual-v2 (real ElevenLabs voices).
// `voice` is a preset name (e.g. "George", "Will", "Brian") or a voice id.
// Output is a fal-hosted audio URL — pass it straight to the lipsync model.

const TTS_MODEL = 'fal-ai/elevenlabs/tts/multilingual-v2';

export interface VoiceoverRequest {
  text: string;
  voice: string;
  /** 0.7–1.2. Higher = faster speech (used to fit a fixed-length clip). */
  speed?: number;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  /** Local path to save the generated mp3. */
  outputPath: string;
}

export interface VoiceoverResult {
  /** fal-hosted audio URL (input for the lipsync model). */
  audioUrl: string;
  localPath: string;
}

export async function generateVoiceover(req: VoiceoverRequest): Promise<VoiceoverResult> {
  const fal = getFal();
  logger.step(`ElevenLabs TTS (${req.voice}, speed ${req.speed ?? 1}): "${req.text.slice(0, 56)}…"`);

  const result = await fal.subscribe(TTS_MODEL, {
    input: {
      text: req.text,
      voice: req.voice,
      stability: req.stability ?? 0.45,
      similarity_boost: req.similarityBoost ?? 0.8,
      style: req.style ?? 0.1,
      speed: req.speed ?? 1,
    },
  });

  const data = (result as { data?: unknown }).data ?? result;
  const audioUrl = (data as { audio?: { url?: string } }).audio?.url;
  if (!audioUrl) throw new Error(`ElevenLabs TTS returned no audio url — ${JSON.stringify(data)}`);

  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`TTS audio download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(req.outputPath), { recursive: true });
  await fs.writeFile(req.outputPath, buf);
  logger.success(`TTS: saved ${req.outputPath}`);

  return { audioUrl, localPath: req.outputPath };
}

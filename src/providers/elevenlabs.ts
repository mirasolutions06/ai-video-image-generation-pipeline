import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ElevenLabsClient } from 'elevenlabs';
import { hashInputs } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

export interface VoiceoverInput {
  script: string;
  voiceId: string;
  outputPath: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export async function generateVoiceover(input: VoiceoverInput): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required for voiceover');

  const cacheKey = hashInputs([input.script, input.voiceId, input.stability, input.similarityBoost, input.style]);
  const cachePath = path.join(path.dirname(input.outputPath), `.cache-vo-${cacheKey}.mp3`);

  if (await fileExists(cachePath)) {
    await fs.copyFile(cachePath, input.outputPath);
    logger.skip(`Voiceover: cached (${cacheKey})`);
    return input.outputPath;
  }

  logger.step(`Voiceover: generating (${input.script.length} chars)`);

  const client = new ElevenLabsClient({ apiKey });
  const stream = await client.generate({
    voice: input.voiceId,
    text: input.script,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: input.stability ?? 0.5,
      similarity_boost: input.similarityBoost ?? 0.75,
      style: input.style ?? 0,
    },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(cachePath, buf);
  await fs.copyFile(cachePath, input.outputPath);

  logger.success(`Voiceover: done — ${input.outputPath}`);
  return input.outputPath;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

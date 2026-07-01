import { promises as fs } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { hashInputs } from './cache.js';
import { logger } from './logger.js';
import type { WhisperResult } from '../types.js';

export async function transcribeAudio(audioPath: string, cacheDir: string): Promise<WhisperResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for Whisper transcription');

  const fileBuf = await fs.readFile(audioPath);
  const cacheKey = hashInputs([fileBuf.length, audioPath]);
  const cachePath = path.join(cacheDir, `whisper-${cacheKey}.json`);

  try {
    const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8')) as WhisperResult;
    logger.skip(`Whisper: cached (${cacheKey})`);
    return cached;
  } catch {
    // Miss; proceed.
  }

  logger.step('Whisper: transcribing');

  const client = new OpenAI({ apiKey });
  const audioFile = new File([fileBuf], path.basename(audioPath), { type: 'audio/mpeg' });
  const result = await client.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  const words = ((result as unknown as { words?: Array<{ word: string; start: number; end: number }> }).words ?? [])
    .map((w) => ({ word: w.word, start: w.start, end: w.end }));

  const out: WhisperResult = {
    words,
    fullText: (result as { text: string }).text,
    language: (result as { language?: string }).language ?? 'en',
  };

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(out, null, 2));
  logger.success(`Whisper: done — ${words.length} words`);
  return out;
}

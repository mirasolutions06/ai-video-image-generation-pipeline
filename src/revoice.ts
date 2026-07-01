#!/usr/bin/env node
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { logger } from './lib/logger.js';
import { generateVoiceover } from './providers/fal-elevenlabs.js';
import { lipsyncVideo, type LipsyncModel } from './providers/fal-lipsync.js';

// Replace a clip's audio with an ElevenLabs voiceover and lip-sync the talent
// to it. The visual (scene, product, label, identity) is preserved — only the
// mouth is re-driven. Auto-fits VO speed so cut_off never clips the tail.

function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve(parseFloat(out.trim())) : reject(new Error(`ffprobe exited ${code}`))));
  });
}

const program = new Command()
  .requiredOption('--video <path>', 'Source mp4 to revoice')
  .option('--script <text>', 'VO script')
  .option('--script-file <path>', 'Read VO script from a file')
  .option('--voice <name>', 'ElevenLabs voice (preset name or id)', 'George')
  .option('--model <model>', 'lipsync-2 | lipsync-2-pro', 'lipsync-2-pro')
  .option('--speed <n>', 'TTS speed 0.7-1.2; omit to auto-fit to clip length', parseFloat)
  .option('--out <path>', 'Output mp4 path')
  .option('--tts-only', 'Generate the VO mp3 and stop — audition voices before paying for lipsync')
  .parse();

async function main(): Promise<void> {
  const o = program.opts<{
    video: string; script?: string; scriptFile?: string;
    voice: string; model: string; speed?: number; out?: string; ttsOnly?: boolean;
  }>();

  const videoPath = path.resolve(o.video);
  let script = o.script;
  if (!script && o.scriptFile) script = await fs.readFile(path.resolve(o.scriptFile), 'utf-8');
  if (!script || !script.trim()) throw new Error('Provide --script "..." or --script-file <path>');
  script = script.trim();

  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const voiceSlug = o.voice.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const outPath = o.out ? path.resolve(o.out) : path.join(dir, `${base}-${voiceSlug}-lipsync.mp4`);
  const mp3Path = path.join(dir, `${base}-${voiceSlug}-vo.mp3`);

  const videoDur = await ffprobeDuration(videoPath);
  logger.info(`Source video: ${videoDur.toFixed(2)}s`);

  // TTS — render, then auto-fit speed so the VO fits within the clip length.
  let speed = o.speed ?? 1.0;
  let vo = await generateVoiceover({ text: script, voice: o.voice, speed, outputPath: mp3Path });
  let audioDur = await ffprobeDuration(mp3Path);
  logger.info(`VO: ${audioDur.toFixed(2)}s @ speed ${speed}`);

  if (o.speed === undefined && audioDur > videoDur + 0.15) {
    const needed = Math.min(1.2, Number((audioDur / videoDur * speed).toFixed(2)));
    if (needed > speed) {
      logger.step(`VO longer than clip — re-rendering at speed ${needed} to fit`);
      speed = needed;
      vo = await generateVoiceover({ text: script, voice: o.voice, speed, outputPath: mp3Path });
      audioDur = await ffprobeDuration(mp3Path);
      logger.info(`VO: ${audioDur.toFixed(2)}s @ speed ${speed}`);
    }
    if (audioDur > videoDur + 0.25) {
      logger.warn(`VO still ${(audioDur - videoDur).toFixed(2)}s longer than clip; cut_off will trim the tail. Shorten the script or use a longer base clip.`);
    }
  }

  if (o.ttsOnly) {
    logger.success(`VO audio (audition): ${mp3Path}`);
    return;
  }

  await lipsyncVideo({
    videoPath,
    audioUrl: vo.audioUrl,
    model: o.model as LipsyncModel,
    syncMode: 'cut_off',
    outputPath: outPath,
  });

  logger.success(`Revoiced clip: ${outPath}`);
  logger.success(`VO audio:      ${mp3Path}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`revoice failed: ${message}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

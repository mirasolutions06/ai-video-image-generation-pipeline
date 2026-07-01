import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import type { VideoConfig, SceneResult, CaptionWord } from '../types.js';
import { logger } from '../lib/logger.js';
import { generateVoiceover } from '../providers/elevenlabs.js';
import { transcribeAudio } from '../lib/whisper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_TSX = path.resolve(__dirname, 'Root.tsx');

const FORMAT_TO_COMPOSITION: Record<string, string> = {
  'youtube-short': 'YoutubeShort',
  'tiktok': 'TikTok',
  'ad-16x9': 'Ad',
  'ad-1x1': 'Ad',
  'web-hero': 'WebHero',
};

export interface RenderInput {
  config: VideoConfig;
  vDir: string;
  projectDir: string;
  sceneResults: SceneResult[];
}

export async function renderVideo(input: RenderInput): Promise<string> {
  const { config, vDir, projectDir, sceneResults } = input;

  // Voiceover (if script + voiceId)
  let voiceoverPath: string | undefined;
  let captions: CaptionWord[] = [];
  if (config.script && config.voiceId) {
    voiceoverPath = path.join(vDir, 'voiceover.mp3');
    await generateVoiceover({
      script: config.script, voiceId: config.voiceId, outputPath: voiceoverPath,
    });
    if (config.captions !== false) {
      const cacheDir = path.join(projectDir, '.cache');
      const result = await transcribeAudio(voiceoverPath, cacheDir);
      captions = result.words;
    }
  }

  const compositionId = FORMAT_TO_COMPOSITION[config.format];
  if (!compositionId) throw new Error(`Unknown format: ${config.format}`);

  logger.step('Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: ROOT_TSX,
    publicDir: projectDir,
    webpackOverride: (cfg) => ({
      ...cfg,
      resolve: {
        ...cfg.resolve,
        extensionAlias: { '.js': ['.tsx', '.ts', '.js'] },
      },
    }),
  });

  const clipPaths = sceneResults.filter((s) => s.path !== null).map((s) => s.path!);
  const totalSeconds = config.clips.reduce((sum, c) => sum + (c.duration ?? 5), 0);
  const totalFrames = Math.round(totalSeconds * 30);

  const inputProps = {
    config,
    clipPaths: clipPaths.map((p) => path.relative(projectDir, p)),
    voiceoverPath: voiceoverPath ? path.relative(projectDir, voiceoverPath) : undefined,
    captions,
  };

  logger.step(`Selecting composition: ${compositionId}`);
  const composition = await selectComposition({ serveUrl: bundleLocation, id: compositionId, inputProps });

  const finalPath = path.join(vDir, 'final.mp4');
  logger.step(`Rendering ${totalFrames} frames at 30fps...`);
  await renderMedia({
    composition: { ...composition, durationInFrames: totalFrames },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: finalPath,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 10 === 0) logger.info(`Render progress: ${pct}%`);
    },
  });

  logger.success(`Render complete: ${finalPath}`);
  return finalPath;
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AspectRatio, VideoConfig, VideoProvider, RunOptions, RunResult, SceneResult } from '../types.js';
import { FORMAT_META } from '../types.js';
import { logger } from '../lib/logger.js';
import { CostTracker, costFor, type CostKey } from '../lib/cost.js';
import { parallelLimit } from '../lib/parallel.js';
import { nextVersion, versionDir, writeRunJson, type SceneRecord } from '../lib/versioning.js';
import { BrandMemory } from '../lib/memory.js';
import { generateHiggsfieldClip } from '../providers/higgsfield.js';
import { generateSeedanceClip } from '../providers/seedance.js';
import { generateFalSeedanceClip } from '../providers/fal-seedance.js';
import { generateKlingClip } from '../providers/kling.js';
import { generateVeoClip, generateVeoFastClip } from '../providers/veo.js';

const PARALLEL_LIMIT = 2;

export interface VideoRunInput {
  projectDir: string;
  memoryRoot: string;
  config: VideoConfig;
  options: RunOptions;
}

function videoCostKey(provider: VideoProvider, duration: number): CostKey {
  const long = duration > 5;
  if (provider === 'fal-seedance') return long ? 'fal-seedance-10s' : 'fal-seedance-5s';
  if (provider === 'seedance') return long ? 'seedance-10s' : 'seedance-5s';
  if (provider === 'kling') return long ? 'kling-10s' : 'kling-5s';
  return long ? 'higgsfield-10s' : 'higgsfield-5s';
}

export async function runVideoMode(input: VideoRunInput): Promise<RunResult> {
  const { projectDir, memoryRoot, config, options } = input;
  const startMs = Date.now();
  const cost = new CostTracker();

  const outputRoot = path.join(projectDir, 'output');
  const version = await nextVersion(outputRoot);
  const vDir = path.join(versionDir(outputRoot, version) + '-video');
  await fs.mkdir(vDir, { recursive: true });

  const formatMeta = FORMAT_META[config.format];
  const defaultProvider = config.videoProvider ?? 'seedance';

  logger.info(`Project: ${config.title} | Brand: ${config.brand} | Format: ${config.format} | Version: v${version}-video`);

  if (options.dryRun) {
    let estimate = 0;
    for (const clip of config.clips) {
      const provider = clip.videoProvider ?? defaultProvider;
      const duration = clip.duration ?? 5;
      if (provider === 'veo' || provider === 'veo-fast') continue;
      const key = videoCostKey(provider, duration);
      cost.log(key);
      estimate += costFor(key);
    }
    logger.info(`[DRY RUN] Would generate ${config.clips.length} clips. Estimated cost: $${estimate.toFixed(2)}`);
    return { version, versionDir: vDir, scenes: [], totalCost: estimate, durationMs: Date.now() - startMs };
  }

  const tasks = config.clips.map((clip, i) => () => generateClip({
    clip, sceneIndex: i + 1, vDir, projectDir, defaultProvider, aspectRatio: formatMeta.aspectRatio, soulId: config.soulId, cost,
  }));
  const sceneResults = await parallelLimit(tasks, PARALLEL_LIMIT);

  // Persist run.json
  const sceneRecords: Record<number, SceneRecord> = {};
  for (const s of sceneResults) {
    if (s.path) sceneRecords[s.sceneIndex] = { path: path.basename(s.path), inherited: false, prompt: s.prompt };
  }
  await writeRunJson(vDir, {
    version,
    timestamp: new Date().toISOString(),
    scenes: sceneRecords,
    totalCost: cost.total(),
  });

  await new BrandMemory(memoryRoot, config.brand).recordRun({
    date: new Date().toISOString().slice(0, 10),
    project: config.title,
    sceneCount: sceneResults.length,
    totalCost: cost.total(),
  });

  // Optional: Remotion render path (lazy-loaded — module added in a later Plan 3 task)
  if (options.render) {
    logger.step('Loading render path (lazy import)...');
    // @ts-expect-error — render module is provided by a later Plan 3 task; resolved at runtime.
    const renderMod: { renderVideo: (input: { config: VideoConfig; vDir: string; projectDir: string; sceneResults: SceneResult[] }) => Promise<void> } = await import('../render/index.js');
    await renderMod.renderVideo({ config, vDir, projectDir, sceneResults });
  }

  logger.success(`Video run v${version} complete. ${sceneResults.filter((s) => s.path).length}/${sceneResults.length} clips. Cost: $${cost.total().toFixed(2)}`);

  return { version, versionDir: vDir, scenes: sceneResults, totalCost: cost.total(), durationMs: Date.now() - startMs };
}

interface GenerateClipInput {
  clip: VideoConfig['clips'][number];
  sceneIndex: number;
  vDir: string;
  projectDir: string;
  defaultProvider: VideoProvider;
  aspectRatio: AspectRatio;
  soulId?: string | undefined;
  cost: CostTracker;
}

async function generateClip(input: GenerateClipInput): Promise<SceneResult> {
  const { clip, sceneIndex, vDir, projectDir, defaultProvider, aspectRatio, soulId, cost } = input;
  const provider = clip.videoProvider ?? defaultProvider;
  const duration = clip.duration ?? 5;
  const outputPath = path.join(vDir, `scene-${sceneIndex}.mp4`);
  const imageRef = path.isAbsolute(clip.imageReference) ? clip.imageReference : path.join(projectDir, clip.imageReference);
  const imageRefEnd = clip.imageReferenceEnd
    ? (path.isAbsolute(clip.imageReferenceEnd) ? clip.imageReferenceEnd : path.join(projectDir, clip.imageReferenceEnd))
    : undefined;

  const req = {
    prompt: clip.prompt,
    imageReference: imageRef,
    ...(imageRefEnd ? { imageReferenceEnd: imageRefEnd } : {}),
    duration,
    aspectRatio,
    outputPath,
    ...(soulId ? { soulId } : {}),
  };

  try {
    if (provider === 'seedance') await generateSeedanceClip(req);
    else if (provider === 'fal-seedance') await generateFalSeedanceClip(req);
    else if (provider === 'kling') await generateKlingClip(req);
    else if (provider === 'veo') await generateVeoClip(req);
    else if (provider === 'veo-fast') await generateVeoFastClip(req);
    else await generateHiggsfieldClip(req);

    if (provider !== 'veo' && provider !== 'veo-fast') cost.log(videoCostKey(provider, duration));
    return {
      sceneIndex, path: outputPath, prompt: clip.prompt,
      refs: [imageRef], inherited: false, cost: 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Scene ${sceneIndex}: failed — ${message}`);
    return {
      sceneIndex, path: null, prompt: clip.prompt,
      refs: [imageRef], inherited: false, cost: 0,
    };
  }
}

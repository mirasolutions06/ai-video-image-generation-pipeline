import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Clip, GeminiImageModel, ProjectConfig, RunOptions, RunResult, SceneResult } from '../types.js';
import { logger } from '../lib/logger.js';
import { CostTracker, COST_MAP, geminiImageCost } from '../lib/cost.js';
import { discoverRefs, filterRefsForScene } from '../lib/refs.js';
import { loadLibraryContext } from '../lib/library.js';
import { BrandMemory } from '../lib/memory.js';
import { nextVersion, versionDir, writeRunJson, type SceneRecord } from '../lib/versioning.js';
import { parallelLimit } from '../lib/parallel.js';
import { generateGeminiImage } from '../providers/gemini.js';
import { generateOpenAIImage } from '../providers/openai.js';

const TOTAL_REF_CAP = 12;
const LIBRARY_REF_CAP = 3;

const PARALLEL_LIMIT = 1;

function resolveGeminiModel(config: ProjectConfig): GeminiImageModel {
  return config.imageModel
    ?? (process.env.GEMINI_IMAGE_MODEL as GeminiImageModel | undefined)
    ?? 'gemini-3-pro-image-preview';
}

export interface ImagesRunInput {
  projectDir: string;
  memoryRoot: string;
  config: ProjectConfig;
  options: RunOptions;
}

export async function runImagesMode(input: ImagesRunInput): Promise<RunResult> {
  const { projectDir, memoryRoot, config, options } = input;
  const startMs = Date.now();
  const cost = new CostTracker();

  const outputRoot = path.join(projectDir, 'output');
  const version = await nextVersion(outputRoot);
  const vDir = versionDir(outputRoot, version);
  await fs.mkdir(vDir, { recursive: true });

  logger.info(`Project: ${config.title} | Brand: ${config.brand} | Version: v${version}`);

  const refs = await discoverRefs(projectDir);
  logger.info(
    `Refs: product=${refs.product.length} model=${refs.model.length} style=${refs.style.length} location=${refs.location.length}`,
  );

  const library = await loadLibraryContext(memoryRoot, config.brand);
  if (library.totalEntries > 0) {
    logger.info(`Brand library: ${library.totalEntries} prior winners across ${Object.keys(library.entriesByTag).length} tags`);
  }

  if (options.dryRun) {
    const totalImages = config.clips.length;
    const estimate = cost.estimateImages(totalImages, 1, resolveGeminiModel(config), config.imageSize ?? '2K');
    logger.info(`[DRY RUN] Would generate ${totalImages} images. Estimated cost: $${estimate.toFixed(2)}`);
    return {
      version,
      versionDir: vDir,
      scenes: [],
      totalCost: estimate,
      durationMs: Date.now() - startMs,
    };
  }

  const useAnchor = config.anchorScenes !== false;

  // Phase 1: Generate scene 1 (style anchor unless anchorScenes=false)
  const scene1Result = await generateScene(0, config, refs, library, vDir, undefined, cost);

  // Phase 2: Generate scenes 2..N in parallel; pass scene 1 anchor when enabled
  const anchorPath = useAnchor ? (scene1Result.path ?? undefined) : undefined;
  const remainingTasks = config.clips.slice(1).map((_clip, idx) => () =>
    generateScene(idx + 1, config, refs, library, vDir, anchorPath, cost),
  );
  const remainingResults = await parallelLimit(remainingTasks, PARALLEL_LIMIT);

  const allScenes: SceneResult[] = [scene1Result, ...remainingResults];

  // Persist run.json
  const sceneRecords: Record<number, SceneRecord> = {};
  for (const s of allScenes) {
    if (s.path) {
      sceneRecords[s.sceneIndex] = {
        path: path.basename(s.path),
        inherited: false,
        prompt: s.prompt,
        refs: s.refs,
      };
    }
  }
  await writeRunJson(vDir, {
    version,
    timestamp: new Date().toISOString(),
    scenes: sceneRecords,
    totalCost: cost.total(),
  });

  // Record run in brand memory
  const memory = new BrandMemory(memoryRoot, config.brand);
  await memory.recordRun({
    date: new Date().toISOString().slice(0, 10),
    project: config.title,
    sceneCount: allScenes.length,
    totalCost: cost.total(),
  });

  logger.success(`Run v${version} complete. ${allScenes.filter((s) => s.path).length}/${allScenes.length} scenes generated. Cost: $${cost.total().toFixed(2)}`);

  return {
    version,
    versionDir: vDir,
    scenes: allScenes,
    totalCost: cost.total(),
    durationMs: Date.now() - startMs,
  };
}

/**
 * Tier 2.5 brand library plug-in: pick up to 3 most-recent past winners from
 * tag buckets that match the scene's intent. These act as visual style anchors
 * (color, light, framing) without overriding the user's primary refs.
 */
function selectLibraryRefs(
  library: Awaited<ReturnType<typeof loadLibraryContext>>,
  clip: Clip,
): string[] {
  const buckets: string[] = [];
  if (clip.hasModel) {
    if (library.entriesByTag.portrait) buckets.push(...library.entriesByTag.portrait.map((e) => e.imagePath));
    if (library.entriesByTag.lifestyle) buckets.push(...library.entriesByTag.lifestyle.map((e) => e.imagePath));
  } else if (clip.isDetail) {
    if (library.entriesByTag.detail) buckets.push(...library.entriesByTag.detail.map((e) => e.imagePath));
  } else if (clip.hasProduct) {
    if (library.entriesByTag.hero) buckets.push(...library.entriesByTag.hero.map((e) => e.imagePath));
  }
  return buckets.slice(0, LIBRARY_REF_CAP);
}

async function generateScene(
  index: number,
  config: ProjectConfig,
  refs: Awaited<ReturnType<typeof discoverRefs>>,
  library: Awaited<ReturnType<typeof loadLibraryContext>>,
  vDir: string,
  anchor: string | undefined,
  cost: CostTracker,
): Promise<SceneResult> {
  const clip = config.clips[index]!;
  const sceneIndex = index + 1;
  const baseRefs = clip.refs && clip.refs.length > 0
    ? clip.refs.map((r) => path.resolve(r))
    : filterRefsForScene(refs, clip);

  // Append brand library refs as visual style anchors (Tier 2.5)
  const libraryRefs = selectLibraryRefs(library, clip);
  // Cap total refs to leave Gemini headroom (max ~14 supported)
  const sceneRefs = [...baseRefs, ...libraryRefs].slice(0, TOTAL_REF_CAP);

  const format = clip.formats?.[0] ?? config.formats?.[0] ?? 'square';
  const outputPath = path.join(vDir, `scene-${sceneIndex}.png`);
  const provider = clip.imageProvider ?? config.imageProvider ?? 'gemini';

  logger.step(
    `Scene ${sceneIndex}: generating via ${provider} (${format}, ${sceneRefs.length} refs${libraryRefs.length > 0 ? ` incl. ${libraryRefs.length} library` : ''})`,
  );

  try {
    const baseReq = {
      prompt: clip.prompt,
      format,
      refs: sceneRefs,
      ...(anchor ? { anchor } : {}),
      outputPath,
    };
    const geminiModel = resolveGeminiModel(config);
    const size = config.imageSize ?? '2K';
    const result = provider === 'gpt-image'
      ? await generateOpenAIImage(baseReq)
      : await generateGeminiImage({ ...baseReq, model: geminiModel, ...(config.imageSize ? { imageSize: config.imageSize } : {}), ...(config.aspectRatio ? { aspectRatio: config.aspectRatio } : {}) });
    const costKey = provider === 'gpt-image' ? 'gpt-image' : 'gemini-image';
    const amount = provider === 'gpt-image' ? (COST_MAP['gpt-image'] ?? 0) : geminiImageCost(geminiModel, size);
    cost.log(costKey, amount);
    logger.success(`Scene ${sceneIndex}: done`);
    return {
      sceneIndex,
      path: result.path,
      prompt: clip.prompt,
      refs: sceneRefs,
      inherited: false,
      cost: amount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Scene ${sceneIndex}: failed — ${message}`);
    return {
      sceneIndex,
      path: null,
      prompt: clip.prompt,
      refs: sceneRefs,
      inherited: false,
      cost: 0,
    };
  }
}

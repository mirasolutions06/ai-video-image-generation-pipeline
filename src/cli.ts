#!/usr/bin/env node
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import type { AnyConfig, RunOptions } from './types.js';
import { logger } from './lib/logger.js';
import { validateConfig, validateEnv, validateOverlayConfig, validateVideoConfig } from './lib/validate.js';
import { runImagesMode } from './modes/images.js';
import { runOverlayMode } from './modes/overlay.js';

const program = new Command()
  .requiredOption('--project <name>', 'Project folder name under projects/')
  .option('--dry-run', 'Preview cost, no API calls')
  .option('--render', 'Enable Remotion render path (video mode only — Plan 3)')
  .option('--research', 'Run Tier 3 research before config write (skill-driven)')
  .parse();

const PROJECTS_ROOT = path.resolve(process.cwd(), 'projects');
const MEMORY_ROOT = path.resolve(process.cwd(), 'memory');

async function loadConfig(projectDir: string): Promise<AnyConfig> {
  const configPath = path.join(projectDir, 'config.json');
  const text = await fs.readFile(configPath, 'utf-8');
  const parsed = JSON.parse(text) as { mode?: string };
  if (parsed.mode === 'video') {
    validateVideoConfig(parsed);
    return parsed;
  }
  if (parsed.mode === 'overlay') {
    validateOverlayConfig(parsed);
    return parsed;
  }
  validateConfig(parsed);
  return parsed;
}

async function main(): Promise<void> {
  const opts = program.opts<{
    project: string;
    dryRun?: boolean;
    render?: boolean;
    research?: boolean;
  }>();

  const projectDir = path.join(PROJECTS_ROOT, opts.project);
  if (!(await pathExists(projectDir))) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  const config = await loadConfig(projectDir);

  const runOptions: RunOptions = {};
  if (opts.dryRun) runOptions.dryRun = true;
  if (opts.render) runOptions.render = true;
  if (opts.research) runOptions.research = true;

  if (!opts.dryRun) {
    if (config.mode === 'images') {
      const usesGpt = config.imageProvider === 'gpt-image'
        || config.clips.some((c) => c.imageProvider === 'gpt-image');
      const usesGemini = !config.imageProvider || config.imageProvider === 'gemini'
        || config.clips.some((c) => !c.imageProvider || c.imageProvider === 'gemini');
      const keys: string[] = [];
      if (usesGemini) keys.push('GEMINI_API_KEY');
      if (usesGpt) keys.push('OPENAI_API_KEY');
      validateEnv(keys);
    }
  }

  logger.step(`Starting v3 pipeline | mode=${config.mode}`);

  if (config.mode === 'images') {
    const result = await runImagesMode({ projectDir, memoryRoot: MEMORY_ROOT, config, options: runOptions });
    logger.success(`Output: ${result.versionDir}`);
  } else if (config.mode === 'overlay') {
    const result = await runOverlayMode({ projectDir, config, options: runOptions });
    logger.success(`Output: ${result.versionDir}`);
  } else if (config.mode === 'video') {
    const defaultProvider = config.videoProvider ?? 'seedance';
    const providers = new Set(config.clips.map((c) => c.videoProvider ?? defaultProvider));
    const keys = new Set<string>();
    for (const p of providers) {
      if (p === 'fal-seedance') keys.add('FAL_KEY');
      else if (p === 'veo' || p === 'veo-fast') keys.add('GEMINI_API_KEY');
      else { keys.add('HF_API_KEY'); keys.add('HF_API_SECRET'); }
    }
    if (keys.size > 0) validateEnv([...keys]);
    if (runOptions.render) validateEnv(['ELEVENLABS_API_KEY', 'OPENAI_API_KEY']);
    const { runVideoMode } = await import('./modes/video.js');
    // loadConfig() already routed through validateVideoConfig for mode === 'video'.
    const result = await runVideoMode({ projectDir, memoryRoot: MEMORY_ROOT, config: config as import('./types.js').VideoConfig, options: runOptions });
    logger.success(`Output: ${result.versionDir}`);
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Pipeline failed: ${message}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

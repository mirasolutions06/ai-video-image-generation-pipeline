import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
}));

import { runImagesMode } from '../../src/modes/images.js';
import type { ProjectConfig } from '../../src/types.js';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(tmpdir(), 'v3-e2e-'));
  process.env.GEMINI_API_KEY = 'fake';

  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  generateContent.mockResolvedValue({
    candidates: [{
      content: {
        parts: [{ inlineData: { data: fakePng.toString('base64'), mimeType: 'image/png' } }],
      },
    }],
  });
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
  generateContent.mockReset();
});

describe('runImagesMode end-to-end', () => {
  it('generates 2 scenes, writes v1 with run.json, records run in brand memory', async () => {
    const projectDir = path.join(workspace, 'projects', 'demo');
    const memoryRoot = path.join(workspace, 'memory');
    await fs.mkdir(projectDir, { recursive: true });

    const config: ProjectConfig = {
      mode: 'images',
      title: 'demo',
      brand: 'TestBrand',
      clips: [
        { prompt: 'scene 1 prompt', hasProduct: true },
        { prompt: 'scene 2 prompt', hasProduct: true },
      ],
    };

    const result = await runImagesMode({ projectDir, memoryRoot, config, options: {} });

    expect(result.version).toBe(1);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes.every((s) => s.path !== null)).toBe(true);

    const v1 = path.join(projectDir, 'output', 'v1');
    expect((await fs.stat(path.join(v1, 'scene-1.png'))).isFile()).toBe(true);
    expect((await fs.stat(path.join(v1, 'scene-2.png'))).isFile()).toBe(true);
    expect((await fs.stat(path.join(v1, 'run.json'))).isFile()).toBe(true);

    const runJson = JSON.parse(await fs.readFile(path.join(v1, 'run.json'), 'utf-8'));
    expect(runJson.version).toBe(1);
    expect(Object.keys(runJson.scenes)).toHaveLength(2);

    const manifestPath = path.join(memoryRoot, 'brands', 'testbrand', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(manifest.runCount).toBe(1);
  });

  it('second run produces v2 alongside v1', async () => {
    const projectDir = path.join(workspace, 'projects', 'demo');
    const memoryRoot = path.join(workspace, 'memory');
    await fs.mkdir(projectDir, { recursive: true });

    const config: ProjectConfig = {
      mode: 'images',
      title: 'demo',
      brand: 'TestBrand',
      clips: [{ prompt: 'one', hasProduct: true }],
    };

    const r1 = await runImagesMode({ projectDir, memoryRoot, config, options: {} });
    const r2 = await runImagesMode({ projectDir, memoryRoot, config, options: {} });

    expect(r1.version).toBe(1);
    expect(r2.version).toBe(2);

    const v1Exists = (await fs.stat(path.join(projectDir, 'output', 'v1', 'scene-1.png'))).isFile();
    const v2Exists = (await fs.stat(path.join(projectDir, 'output', 'v2', 'scene-1.png'))).isFile();
    expect(v1Exists).toBe(true);
    expect(v2Exists).toBe(true);
  });

  it('appends library entries as visual refs when brand has past winners', async () => {
    const projectDir = path.join(workspace, 'projects', 'demo');
    const memoryRoot = path.join(workspace, 'memory');
    await fs.mkdir(projectDir, { recursive: true });

    // Pre-populate library with one hero
    const { BrandMemory } = await import('../../src/lib/memory.js');
    const m = new BrandMemory(memoryRoot, 'TestBrand');
    await m.loadOrInit();
    const heroSrc = path.join(workspace, 'past-hero.jpg');
    await fs.writeFile(heroSrc, 'fakehero');
    await m.tagImage({ sourceImagePath: heroSrc, tag: 'hero', prompt: 'past hero' });

    const config: ProjectConfig = {
      mode: 'images',
      title: 'demo',
      brand: 'TestBrand',
      clips: [{ prompt: 'new hero', hasProduct: true }],
    };

    const result = await runImagesMode({ projectDir, memoryRoot, config, options: {} });
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]!.path).toBeTruthy();
    // The library hero should have appeared in the refs passed to Gemini
    expect(result.scenes[0]!.refs).toEqual(expect.arrayContaining([
      expect.stringContaining('library/hero/'),
    ]));
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BrandMemory } from '../../src/lib/memory.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), 'v3-mem-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('BrandMemory', () => {
  it('loadOrInit creates a fresh manifest', async () => {
    const m = new BrandMemory(tmp, 'test-brand');
    const manifest = await m.loadOrInit();
    expect(manifest.brand).toBe('test-brand');
    expect(manifest.runCount).toBe(0);
    expect(manifest.libraryByTag).toEqual({});
  });

  it('recordRun appends a run record and updates lastRunAt', async () => {
    const m = new BrandMemory(tmp, 'test-brand');
    await m.loadOrInit();
    await m.recordRun({
      date: '2026-05-07',
      project: 'demo',
      sceneCount: 8,
      totalCost: 0.64,
    });
    const manifest = await m.loadOrInit();
    expect(manifest.runCount).toBe(1);
    expect(manifest.lastRunAt).toBeDefined();
  });

  it('tagImage saves image + metadata to library and updates manifest', async () => {
    const m = new BrandMemory(tmp, 'test-brand');
    await m.loadOrInit();
    const sourceImage = path.join(tmp, 'source.jpg');
    await fs.writeFile(sourceImage, 'imagedata');

    await m.tagImage({
      sourceImagePath: sourceImage,
      tag: 'hero',
      prompt: 'a hero shot prompt',
    });

    const manifest = await m.loadOrInit();
    expect(manifest.libraryByTag.hero).toHaveLength(1);
    const entry = manifest.libraryByTag.hero![0]!;
    expect(entry.tag).toBe('hero');
    expect(entry.prompt).toBe('a hero shot prompt');

    const brandDir = path.join(tmp, 'brands', 'test-brand');
    const exists = await fs.stat(path.join(brandDir, entry.imagePath));
    expect(exists.isFile()).toBe(true);
  });
});

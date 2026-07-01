import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BrandMemory } from '../../src/lib/memory.js';
import { loadLibraryContext } from '../../src/lib/library.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), 'v3-lib-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('loadLibraryContext', () => {
  it('returns empty context for unknown brand', async () => {
    const ctx = await loadLibraryContext(tmp, 'unknown-brand');
    expect(ctx.entriesByTag).toEqual({});
    expect(ctx.totalEntries).toBe(0);
  });

  it('returns library entries grouped by tag for known brand', async () => {
    const m = new BrandMemory(tmp, 'test');
    await m.loadOrInit();

    const src = path.join(tmp, 'sample.jpg');
    await fs.writeFile(src, 'data');

    await m.tagImage({ sourceImagePath: src, tag: 'hero', prompt: 'hero prompt' });
    await m.tagImage({ sourceImagePath: src, tag: 'lifestyle', prompt: 'lifestyle prompt' });

    const ctx = await loadLibraryContext(tmp, 'test');
    expect(ctx.totalEntries).toBe(2);
    expect(ctx.entriesByTag.hero).toHaveLength(1);
    expect(ctx.entriesByTag.lifestyle).toHaveLength(1);

    expect(path.isAbsolute(ctx.entriesByTag.hero![0]!.imagePath)).toBe(true);
  });
});

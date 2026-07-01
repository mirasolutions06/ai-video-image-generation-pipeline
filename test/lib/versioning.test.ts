import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  nextVersion,
  versionDir,
  writeRunJson,
  readRunJson,
  resolveScene,
} from '../../src/lib/versioning.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), 'v3-version-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('nextVersion', () => {
  it('returns 1 for empty output dir', async () => {
    const v = await nextVersion(tmp);
    expect(v).toBe(1);
  });

  it('returns next integer when versions exist', async () => {
    await fs.mkdir(path.join(tmp, 'v1'));
    await fs.mkdir(path.join(tmp, 'v3'));
    const v = await nextVersion(tmp);
    expect(v).toBe(4);
  });
});

describe('writeRunJson + readRunJson', () => {
  it('round-trips a run record', async () => {
    const dir = path.join(tmp, 'v1');
    await fs.mkdir(dir);
    const record = {
      version: 1,
      timestamp: '2026-05-07T12:00:00Z',
      scenes: { 1: { path: 'scene-1.jpg', inherited: false } },
    };
    await writeRunJson(dir, record);
    const back = await readRunJson(dir);
    expect(back).toEqual(record);
  });
});

describe('resolveScene', () => {
  it('resolves a scene from current version when not inherited', async () => {
    const dir = path.join(tmp, 'v1');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'scene-1.jpg'), 'x');
    await writeRunJson(dir, {
      version: 1,
      timestamp: 'now',
      scenes: { 1: { path: 'scene-1.jpg', inherited: false } },
    });
    const result = await resolveScene(tmp, 1, 1);
    expect(result).toBe(path.join(dir, 'scene-1.jpg'));
  });

  it('resolves an inherited scene from parent version', async () => {
    await fs.mkdir(path.join(tmp, 'v1'));
    await fs.writeFile(path.join(tmp, 'v1', 'scene-1.jpg'), 'x');
    await writeRunJson(path.join(tmp, 'v1'), {
      version: 1,
      timestamp: 'now',
      scenes: { 1: { path: 'scene-1.jpg', inherited: false } },
    });
    await fs.mkdir(path.join(tmp, 'v2'));
    await writeRunJson(path.join(tmp, 'v2'), {
      version: 2,
      timestamp: 'now',
      parentVersion: 1,
      scenes: { 1: { path: 'scene-1.jpg', inherited: true } },
    });
    const result = await resolveScene(tmp, 2, 1);
    expect(result).toBe(path.join(tmp, 'v1', 'scene-1.jpg'));
  });
});

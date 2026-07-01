import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RunJson {
  version: number;
  timestamp: string;
  parentVersion?: number;
  scenes: Record<number, SceneRecord>;
  totalCost?: number;
  notes?: string;
}

export interface SceneRecord {
  path: string;
  inherited: boolean;
  prompt?: string;
  refs?: string[];
}

export function versionDir(outputRoot: string, version: number): string {
  return path.join(outputRoot, `v${version}`);
}

export async function nextVersion(outputRoot: string): Promise<number> {
  try {
    const entries = await fs.readdir(outputRoot);
    const versions = entries
      .filter((e) => /^v\d+$/.test(e))
      .map((e) => parseInt(e.slice(1), 10));
    if (versions.length === 0) return 1;
    return Math.max(...versions) + 1;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 1;
    throw err;
  }
}

export async function writeRunJson(dir: string, record: RunJson): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, 'run.json.tmp');
  await fs.writeFile(tmpPath, JSON.stringify(record, null, 2));
  await fs.rename(tmpPath, path.join(dir, 'run.json'));
}

export async function readRunJson(dir: string): Promise<RunJson> {
  const text = await fs.readFile(path.join(dir, 'run.json'), 'utf-8');
  return JSON.parse(text) as RunJson;
}

export async function resolveScene(
  outputRoot: string,
  version: number,
  sceneIndex: number,
): Promise<string | null> {
  const dir = versionDir(outputRoot, version);
  const run = await readRunJson(dir);
  const scene = run.scenes[sceneIndex];
  if (!scene) return null;
  if (!scene.inherited) {
    return path.join(dir, scene.path);
  }
  if (run.parentVersion === undefined) return null;
  return resolveScene(outputRoot, run.parentVersion, sceneIndex);
}

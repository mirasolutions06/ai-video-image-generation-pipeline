import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SceneTags } from '../types.js';

export interface RefBuckets {
  product: string[];
  model: string[];
  style: string[];
  location: string[];
}

const PATTERNS = {
  product: /^product(-\d+)?\.(jpg|jpeg|png|webp)$/i,
  model: /^model(-\d+|-sheet|-body)?\.(jpg|jpeg|png|webp)$/i,
  style: /^style(-\d+)?\.(jpg|jpeg|png|webp)$/i,
  location: /^location(-\d+)?\.(jpg|jpeg|png|webp)$/i,
};

export async function discoverRefs(projectDir: string): Promise<RefBuckets> {
  const buckets: RefBuckets = { product: [], model: [], style: [], location: [] };
  let entries: string[];
  try {
    entries = await fs.readdir(projectDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return buckets;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(projectDir, entry);
    for (const [bucket, pattern] of Object.entries(PATTERNS) as Array<[keyof RefBuckets, RegExp]>) {
      if (pattern.test(entry)) buckets[bucket].push(full);
    }
  }
  for (const k of Object.keys(buckets) as Array<keyof RefBuckets>) {
    buckets[k].sort();
  }
  return buckets;
}

export function filterRefsForScene(refs: RefBuckets, tags: SceneTags): string[] {
  const out: string[] = [];

  if (tags.hasProduct) out.push(...refs.product);
  if (tags.hasModel) out.push(...refs.model);
  if (tags.isDetail && refs.model.length > 0) {
    for (const m of refs.model) if (!out.includes(m)) out.push(m);
  }

  if (tags.hasModel || tags.hasProduct) {
    out.push(...refs.style);
  } else {
    out.push(...refs.style, ...refs.location);
    return out;
  }

  out.push(...refs.location);
  return out;
}

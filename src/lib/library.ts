import path from 'node:path';
import type { LibraryEntry } from '../types.js';
import { BrandMemory, brandSlug } from './memory.js';

export interface LibraryContext {
  brand: string;
  entriesByTag: Record<string, AbsoluteLibraryEntry[]>;
  totalEntries: number;
}

export interface AbsoluteLibraryEntry extends LibraryEntry {
  /** imagePath rewritten to absolute path on disk. */
  imagePath: string;
}

export async function loadLibraryContext(
  memoryRoot: string,
  brand: string,
): Promise<LibraryContext> {
  const m = new BrandMemory(memoryRoot, brand);
  const manifest = await m.loadOrInit();

  const brandDir = path.join(memoryRoot, 'brands', brandSlug(brand));

  const entriesByTag: Record<string, AbsoluteLibraryEntry[]> = {};
  let totalEntries = 0;

  for (const [tag, entries] of Object.entries(manifest.libraryByTag)) {
    const absolute = entries.map((e) => ({
      ...e,
      imagePath: path.join(brandDir, e.imagePath),
    }));
    entriesByTag[tag] = absolute;
    totalEntries += absolute.length;
  }

  return { brand: manifest.brand, entriesByTag, totalEntries };
}

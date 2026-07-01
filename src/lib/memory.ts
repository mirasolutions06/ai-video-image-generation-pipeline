import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrandManifest, LibraryEntry, RunRecord } from '../types.js';

export interface TagImageInput {
  sourceImagePath: string;
  tag: string;
  prompt: string;
}

export function brandSlug(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export class BrandMemory {
  private brandDir: string;

  constructor(memoryRoot: string, brand: string) {
    this.brandDir = path.join(memoryRoot, 'brands', brandSlug(brand));
  }

  private get manifestPath(): string {
    return path.join(this.brandDir, 'manifest.json');
  }

  async loadOrInit(): Promise<BrandManifest> {
    try {
      const text = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(text) as BrandManifest;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const manifest: BrandManifest = {
      brand: path.basename(this.brandDir),
      createdAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
      runCount: 0,
      libraryByTag: {},
    };
    await this.save(manifest);
    return manifest;
  }

  async save(manifest: BrandManifest): Promise<void> {
    await fs.mkdir(this.brandDir, { recursive: true });
    const tmpPath = `${this.manifestPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2));
    await fs.rename(tmpPath, this.manifestPath);
  }

  async recordRun(record: RunRecord): Promise<void> {
    const manifest = await this.loadOrInit();
    manifest.runCount += 1;
    manifest.lastRunAt = new Date().toISOString();
    await this.save(manifest);

    const runsDir = path.join(this.brandDir, 'runs');
    await fs.mkdir(runsDir, { recursive: true });
    const safeProject = record.project.replace(/[/\\]+/g, '-');
    const filename = `${record.date}-${safeProject}.json`;
    await fs.writeFile(path.join(runsDir, filename), JSON.stringify(record, null, 2));
  }

  async tagImage(input: TagImageInput): Promise<LibraryEntry> {
    const tagDir = path.join(this.brandDir, 'library', input.tag);
    await fs.mkdir(tagDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const ext = path.extname(input.sourceImagePath) || '.jpg';
    const baseName = `${date}-${path.basename(input.sourceImagePath, ext)}`;
    const imagePathRel = path.join('library', input.tag, `${baseName}${ext}`);
    const metaPathRel = path.join('library', input.tag, `${baseName}.json`);

    await fs.copyFile(input.sourceImagePath, path.join(this.brandDir, imagePathRel));

    const entry: LibraryEntry = {
      imagePath: imagePathRel,
      metadataPath: metaPathRel,
      tag: input.tag,
      taggedAt: new Date().toISOString(),
      prompt: input.prompt,
    };

    await fs.writeFile(
      path.join(this.brandDir, metaPathRel),
      JSON.stringify(entry, null, 2),
    );

    const manifest = await this.loadOrInit();
    if (!manifest.libraryByTag[input.tag]) manifest.libraryByTag[input.tag] = [];
    manifest.libraryByTag[input.tag]!.push(entry);
    await this.save(manifest);

    return entry;
  }
}

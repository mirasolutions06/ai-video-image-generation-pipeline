import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { ImageFormat, OverlayPreset } from '../types.js';

export interface MaskRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FORMAT_DIMENSIONS: Record<ImageFormat, { width: number; height: number }> = {
  story:     { width: 1024, height: 1536 },
  square:    { width: 1024, height: 1024 },
  landscape: { width: 1536, height: 1024 },
};

/**
 * Mask geometry per (preset, format). All coordinates target the GPT-image-2 output size.
 * Type sits inside the IG safe area (top 13% / bottom 17% reserved for IG UI on portrait).
 * Sized small on purpose — real campaign typography is a whisper, not a billboard.
 */
const REGIONS_BY_FORMAT: Record<ImageFormat, Record<OverlayPreset, MaskRegion[]>> = {
  story: {
    'sandwich-lockup':   [{ x: 212, y: 600,  w: 600, h: 340 }],
    'wordmark-centered': [{ x: 252, y: 240,  w: 520, h: 140 }],
    'top-left-credit':   [{ x: 64,  y: 220,  w: 360, h: 220 }],
    'corner-stamp':      [{ x: 372, y: 1280, w: 280, h: 80  }],
    'spec-chip':         [{ x: 64,  y: 220,  w: 380, h: 220 }],
  },
  square: {
    'sandwich-lockup':   [{ x: 212, y: 360,  w: 600, h: 300 }],
    'wordmark-centered': [{ x: 252, y: 120,  w: 520, h: 120 }],
    'top-left-credit':   [{ x: 64,  y: 80,   w: 340, h: 200 }],
    'corner-stamp':      [{ x: 372, y: 880,  w: 280, h: 70  }],
    'spec-chip':         [{ x: 64,  y: 80,   w: 360, h: 200 }],
  },
  landscape: {
    'sandwich-lockup':   [{ x: 468, y: 320,  w: 600, h: 340 }],
    'wordmark-centered': [{ x: 508, y: 100,  w: 520, h: 140 }],
    'top-left-credit':   [{ x: 64,  y: 100,  w: 360, h: 220 }],
    'corner-stamp':      [{ x: 628, y: 880,  w: 280, h: 70  }],
    'spec-chip':         [{ x: 64,  y: 100,  w: 380, h: 220 }],
  },
};

export function regionsFor(preset: OverlayPreset, format: ImageFormat): MaskRegion[] {
  return REGIONS_BY_FORMAT[format][preset];
}

export async function resizeSource(sourcePath: string, format: ImageFormat, outputPath: string): Promise<void> {
  const { width, height } = FORMAT_DIMENSIONS[format];
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toFile(outputPath);
}

export async function generateMask(
  preset: OverlayPreset,
  format: ImageFormat,
  outputPath: string,
): Promise<MaskRegion[]> {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const regions = regionsFor(preset, format);
  const channels = 4;
  const buf = Buffer.alloc(width * height * channels, 255);
  for (const r of regions) {
    const xMax = Math.min(width, r.x + r.w);
    const yMax = Math.min(height, r.y + r.h);
    for (let y = r.y; y < yMax; y++) {
      for (let x = r.x; x < xMax; x++) {
        const i = (y * width + x) * channels;
        buf[i + 3] = 0;
      }
    }
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);
  return regions;
}

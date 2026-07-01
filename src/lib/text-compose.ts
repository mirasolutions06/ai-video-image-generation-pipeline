import { promises as fs } from 'node:fs';
import path from 'node:path';
import opentype, { type Font } from 'opentype.js';
import sharp from 'sharp';
import type { OverlayClip, OverlayConfig, OverlayPreset } from '../types.js';
import { FORMAT_DIMENSIONS, resizeSource } from './overlay-mask.js';

const FONT_BASE = path.resolve('node_modules/@fontsource');

interface TypeSpec {
  fontPath: string;
  /** Font size in pixels at output dimensions. */
  size: number;
  /** Letter-spacing as em fraction. 0 = none, 0.3 = wide tracked-out caps. */
  tracking: number;
  /** Hex color. */
  color: string;
}

interface BrandTypeset {
  hero: TypeSpec;
  eyebrow: TypeSpec;
  outro: TypeSpec;
  wordmark: TypeSpec;
  /** Optional drop shadow for legibility on busy photos. */
  shadow?: { offset: number; opacity: number };
  /** Optional per-format size multipliers. Square format is shorter — scale up. */
  formatScale?: Partial<Record<'square' | 'landscape', number>>;
}

function fp(family: string, variant: string): string {
  return path.join(FONT_BASE, family, 'files', `${family}-latin-${variant}.woff`);
}

const BRAND_TYPESETS: Record<string, BrandTypeset> = {
  'warm-sans': {
    hero:     { fontPath: fp('cormorant',          '600-italic'), size: 175, tracking: 0,    color: '#F4E8D4' },
    eyebrow:  { fontPath: fp('inter',              '500-normal'), size: 20,  tracking: 0.34, color: '#F4E8D4' },
    outro:    { fontPath: fp('inter',              '500-normal'), size: 20,  tracking: 0.34, color: '#F4E8D4' },
    wordmark: { fontPath: fp('inter',              '400-normal'), size: 26,  tracking: 0.55, color: '#F2DEC0' },
    shadow:   { offset: 1, opacity: 0.22 },
  },
  'editorial-serif': {
    hero:     { fontPath: fp('eb-garamond',        '500-italic'), size: 44,  tracking: 0.18, color: '#F0E8D2' },
    eyebrow:  { fontPath: fp('jetbrains-mono',     '400-normal'), size: 14,  tracking: 0.28, color: '#F0E8D2' },
    outro:    { fontPath: fp('jetbrains-mono',     '400-normal'), size: 14,  tracking: 0.28, color: '#F0E8D2' },
    wordmark: { fontPath: fp('eb-garamond',        '500-italic'), size: 36,  tracking: 0.10, color: '#F0E8D2' },
  },
  'plex-editorial': {
    hero:     { fontPath: fp('ibm-plex-serif',     '300-normal'), size: 36,  tracking: 0.42, color: '#E8DDC8' },
    eyebrow:  { fontPath: fp('ibm-plex-mono',      '300-normal'), size: 14,  tracking: 0.32, color: '#E8DDC8' },
    outro:    { fontPath: fp('ibm-plex-mono',      '300-normal'), size: 14,  tracking: 0.32, color: '#E8DDC8' },
    wordmark: { fontPath: fp('ibm-plex-serif',     '300-normal'), size: 28,  tracking: 0.42, color: '#E8DDC8' },
    shadow:   { offset: 1, opacity: 0.15 },
  },
  'bold-sans': {
    hero:     { fontPath: fp('archivo',            '900-normal'), size: 38,  tracking: 0.04, color: '#FAFAFA' },
    eyebrow:  { fontPath: fp('archivo',            '500-normal'), size: 22,  tracking: 0.02, color: '#FAFAFA' },
    outro:    { fontPath: fp('jetbrains-mono',     '500-normal'), size: 16,  tracking: 0.18, color: '#FAFAFA' },
    wordmark: { fontPath: fp('archivo',            '900-normal'), size: 28,  tracking: 0.04, color: '#FAFAFA' },
  },
  'light-serif': {
    hero:     { fontPath: fp('cormorant',          '300-normal'), size: 32,  tracking: 0.06, color: '#3A3530' },
    eyebrow:  { fontPath: fp('jetbrains-mono',     '300-normal'), size: 13,  tracking: 0.32, color: '#3A3530' },
    outro:    { fontPath: fp('jetbrains-mono',     '300-normal'), size: 13,  tracking: 0.32, color: '#3A3530' },
    wordmark: { fontPath: fp('cormorant',          '300-normal'), size: 36,  tracking: 0.10, color: '#3A3530' },
    formatScale: { square: 1.7 },
  },
  'display-serif': {
    hero:     { fontPath: fp('eb-garamond',        '500-italic'), size: 96,  tracking: 0.02, color: '#EBDFC9' },
    eyebrow:  { fontPath: fp('jetbrains-mono',     '300-normal'), size: 16,  tracking: 0.32, color: '#EBDFC9' },
    outro:    { fontPath: fp('jetbrains-mono',     '300-normal'), size: 16,  tracking: 0.32, color: '#EBDFC9' },
    wordmark: { fontPath: fp('eb-garamond',        '500-italic'), size: 32,  tracking: 0.04, color: '#EBDFC9' },
    shadow:   { offset: 1, opacity: 0.12 },
    formatScale: { square: 1.6 },
  },
};

const fontCache = new Map<string, Font>();

async function loadFont(fontPath: string): Promise<Font> {
  let font = fontCache.get(fontPath);
  if (font) return font;
  const buf = await fs.readFile(fontPath);
  font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fontCache.set(fontPath, font);
  return font;
}

interface RenderedText {
  svgPath: string;
  width: number;
  height: number;
}

/**
 * Convert text → SVG path with manual letter-spacing.
 * Returns the path d-string anchored at (0, 0) with the baseline at y=0,
 * plus the total advance width and glyph height for layout.
 */
function sanitizePathData(d: string): string {
  return d.replace(/NaN/g, '0');
}

interface GlyphPath {
  d: string;
}

function textToGlyphPaths(font: Font, text: string, spec: TypeSpec): { glyphs: GlyphPath[]; width: number; height: number } {
  const trackingPx = spec.tracking * spec.size;
  const scale = spec.size / font.unitsPerEm;
  const glyphs: GlyphPath[] = [];
  let cursor = 0;
  for (const char of [...text]) {
    const glyph = font.charToGlyph(char);
    const gpath = glyph.getPath(cursor, 0, spec.size);
    glyphs.push({ d: sanitizePathData(gpath.toPathData(2)) });
    cursor += (glyph.advanceWidth ?? 0) * scale + trackingPx;
  }
  const ascender = (font.ascender ?? 0) * scale;
  const descender = (font.descender ?? 0) * scale;
  return {
    glyphs,
    width: cursor - trackingPx,
    height: ascender - descender,
  };
}

function textToPath(font: Font, text: string, spec: TypeSpec): RenderedText {
  const r = textToGlyphPaths(font, text, spec);
  return {
    svgPath: r.glyphs.map((g) => g.d).join(' '),
    width: r.width,
    height: r.height,
  };
}

interface PlacedText {
  svg: string;
  text: string;
}

interface ElementSpec {
  text: string;
  spec: TypeSpec;
}

type Anchor = 'tl' | 'tc' | 'tr' | 'cl' | 'cc' | 'cr' | 'bl' | 'bc' | 'br';

interface Layout {
  /** Anchor x (px from left at output dimensions). */
  x: number;
  /** Anchor y (px from top at output dimensions). */
  y: number;
  anchor: Anchor;
  /** Vertical gap between stacked elements (px). */
  gap: number;
}

const PRESET_LAYOUT: Record<OverlayPreset, Record<'story' | 'square' | 'landscape', Layout>> = {
  'sandwich-lockup': {
    story:     { x: 512,  y: 760,  anchor: 'cc', gap: 24 },
    square:    { x: 512,  y: 512,  anchor: 'cc', gap: 22 },
    landscape: { x: 768,  y: 512,  anchor: 'cc', gap: 22 },
  },
  'wordmark-centered': {
    story:     { x: 512,  y: 320,  anchor: 'cc', gap: 12 },
    square:    { x: 512,  y: 200,  anchor: 'cc', gap: 12 },
    landscape: { x: 768,  y: 200,  anchor: 'cc', gap: 12 },
  },
  'top-left-credit': {
    story:     { x: 64,   y: 250,  anchor: 'tl', gap: 8  },
    square:    { x: 64,   y: 100,  anchor: 'tl', gap: 8  },
    landscape: { x: 64,   y: 120,  anchor: 'tl', gap: 8  },
  },
  'corner-stamp': {
    story:     { x: 512,  y: 1450, anchor: 'bc', gap: 0  },
    square:    { x: 512,  y: 970,  anchor: 'bc', gap: 0  },
    landscape: { x: 768,  y: 970,  anchor: 'bc', gap: 0  },
  },
  'spec-chip': {
    story:     { x: 64,   y: 250,  anchor: 'tl', gap: 6  },
    square:    { x: 64,   y: 100,  anchor: 'tl', gap: 6  },
    landscape: { x: 64,   y: 120,  anchor: 'tl', gap: 6  },
  },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function renderElement(el: ElementSpec, x: number, y: number, anchor: 'l' | 'c' | 'r', shadow?: BrandTypeset['shadow']): Promise<{ svg: string; height: number }> {
  const font = await loadFont(el.spec.fontPath);
  const rendered = textToGlyphPaths(font, el.text, el.spec);
  let dx = 0;
  if (anchor === 'c') dx = -rendered.width / 2;
  else if (anchor === 'r') dx = -rendered.width;
  const transform = `translate(${(x + dx).toFixed(2)} ${y.toFixed(2)})`;
  const glyphPaths = rendered.glyphs.map((g) => `<path d="${g.d}" fill="${el.spec.color}"/>`).join('');
  const shadowGlyphs = shadow
    ? rendered.glyphs.map((g) => `<path d="${g.d}" fill="#000000"/>`).join('')
    : '';
  const shadowSvg = shadow
    ? `<g transform="${transform}" opacity="${shadow.opacity}"><g transform="translate(${shadow.offset} ${shadow.offset})">${shadowGlyphs}</g></g>`
    : '';
  const fillSvg = `<g transform="${transform}">${glyphPaths}</g>`;
  return { svg: `${shadowSvg}${fillSvg}<!-- ${escapeXml(el.text)} -->`, height: el.spec.size };
}

function brandKey(brand: string): string {
  const lower = brand.toLowerCase();
  if (BRAND_TYPESETS[lower]) return lower;
  return 'warm-sans';
}

interface ComposeInput {
  sourcePath: string;
  outputPath: string;
  clip: OverlayClip;
  config: OverlayConfig;
}

/** Auto-scale a TypeSpec down so the rendered text fits within maxWidth. */
async function fitToWidth(text: string, spec: TypeSpec, maxWidth: number): Promise<TypeSpec> {
  const font = await loadFont(spec.fontPath);
  const r = textToPath(font, text, spec);
  if (r.width <= maxWidth) return spec;
  const scale = maxWidth / r.width;
  return { ...spec, size: spec.size * scale };
}

function applyFormatScale(spec: TypeSpec, mult: number): TypeSpec {
  if (mult === 1) return spec;
  return { ...spec, size: spec.size * mult };
}

export async function composeText(input: ComposeInput): Promise<string> {
  const { sourcePath, outputPath, clip, config } = input;
  const format = clip.format ?? 'story';
  const dims = FORMAT_DIMENSIONS[format];
  const baseTypeset = BRAND_TYPESETS[brandKey(config.brand)]!;
  const scale = baseTypeset.formatScale?.[format as 'square' | 'landscape'] ?? 1;
  const typeset: BrandTypeset = scale === 1 ? baseTypeset : {
    ...baseTypeset,
    hero:     applyFormatScale(baseTypeset.hero, scale),
    eyebrow:  applyFormatScale(baseTypeset.eyebrow, scale),
    outro:    applyFormatScale(baseTypeset.outro, scale),
    wordmark: applyFormatScale(baseTypeset.wordmark, scale),
  };
  const layout = PRESET_LAYOUT[clip.text.preset][format];

  const inputDir = path.join(path.dirname(outputPath), '_input');
  const resizedSource = path.join(inputDir, `${path.basename(outputPath, path.extname(outputPath))}.png`);
  await resizeSource(sourcePath, format, resizedSource);

  const maxTextWidth = dims.width * 0.88;
  const colorOverride = clip.color && /^#[0-9a-f]{6}$/i.test(clip.color) ? clip.color : undefined;
  const withColor = (s: TypeSpec): TypeSpec => (colorOverride ? { ...s, color: colorOverride } : s);

  const elements: ElementSpec[] = [];
  if (clip.text.preset === 'corner-stamp') {
    elements.push({ text: clip.text.hero, spec: await fitToWidth(clip.text.hero, withColor(typeset.wordmark), maxTextWidth) });
  } else if (clip.text.preset === 'wordmark-centered') {
    elements.push({ text: clip.text.hero, spec: await fitToWidth(clip.text.hero, withColor(typeset.wordmark), maxTextWidth) });
  } else {
    if (clip.text.eyebrow) {
      elements.push({ text: clip.text.eyebrow, spec: await fitToWidth(clip.text.eyebrow, withColor(typeset.eyebrow), maxTextWidth) });
    }
    elements.push({ text: clip.text.hero, spec: await fitToWidth(clip.text.hero, withColor(typeset.hero), maxTextWidth) });
    if (clip.text.outro) {
      elements.push({ text: clip.text.outro, spec: await fitToWidth(clip.text.outro, withColor(typeset.outro), maxTextWidth) });
    }
  }

  const renderedHeights: number[] = [];
  const heightCache: number[] = [];
  for (const el of elements) {
    const font = await loadFont(el.spec.fontPath);
    const r = textToPath(font, el.text, el.spec);
    renderedHeights.push(r.height);
    heightCache.push(el.spec.size);
  }

  const totalHeight = renderedHeights.reduce((s, h) => s + h, 0) + layout.gap * (elements.length - 1);

  let cursorY: number;
  const horizAnchor: 'l' | 'c' | 'r' =
    layout.anchor.endsWith('l') ? 'l' :
    layout.anchor.endsWith('r') ? 'r' : 'c';

  if (layout.anchor.startsWith('t')) {
    cursorY = layout.y + heightCache[0]! * 0.78;
  } else if (layout.anchor.startsWith('b')) {
    cursorY = layout.y - totalHeight + heightCache[0]! * 0.78;
  } else {
    cursorY = layout.y - totalHeight / 2 + heightCache[0]! * 0.78;
  }

  const svgParts: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    const rendered = await renderElement(el, layout.x, cursorY, horizAnchor, typeset.shadow);
    svgParts.push(rendered.svg);
    if (i < elements.length - 1) {
      cursorY += heightCache[i]! * 0.22 + layout.gap + heightCache[i + 1]! * 0.78;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}" viewBox="0 0 ${dims.width} ${dims.height}">${svgParts.join('')}</svg>`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(resizedSource)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

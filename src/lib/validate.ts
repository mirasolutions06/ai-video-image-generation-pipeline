import type { OverlayConfig, OverlayPreset, ProjectConfig, VideoConfig } from '../types.js';

const VALID_MODES = ['images', 'video', 'overlay'] as const;
const VALID_OVERLAY_PRESETS: readonly OverlayPreset[] = [
  'sandwich-lockup',
  'wordmark-centered',
  'top-left-credit',
  'corner-stamp',
  'spec-chip',
];
const VALID_FORMATS = ['story', 'square', 'landscape'] as const;
const VALID_IMAGE_PROVIDERS = ['gemini', 'gpt-image'] as const;
const VALID_IMAGE_MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'] as const;

export function validateConfig(config: unknown): asserts config is ProjectConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('config must be a JSON object');
  }
  const c = config as Record<string, unknown>;

  if (typeof c.title !== 'string' || c.title.length === 0) {
    throw new Error('config.title is required and must be a non-empty string');
  }
  if (typeof c.brand !== 'string' || c.brand.length === 0) {
    throw new Error('config.brand is required and must be a non-empty string');
  }
  if (!VALID_MODES.includes(c.mode as never)) {
    throw new Error(`config.mode must be one of ${VALID_MODES.join('|')}, got: ${c.mode}`);
  }
  if (!Array.isArray(c.clips) || c.clips.length === 0) {
    throw new Error('config.clips must be a non-empty array');
  }
  if (c.imageProvider !== undefined && !VALID_IMAGE_PROVIDERS.includes(c.imageProvider as never)) {
    throw new Error(`config.imageProvider must be one of ${VALID_IMAGE_PROVIDERS.join('|')}`);
  }
  if (c.imageModel !== undefined && !VALID_IMAGE_MODELS.includes(c.imageModel as never)) {
    throw new Error(`config.imageModel must be one of ${VALID_IMAGE_MODELS.join('|')}`);
  }
  if (c.formats !== undefined) {
    if (!Array.isArray(c.formats)) throw new Error('config.formats must be an array');
    for (const f of c.formats) {
      if (!VALID_FORMATS.includes(f as never)) {
        throw new Error(`config.formats contains invalid value: ${f}`);
      }
    }
  }

  for (let i = 0; i < c.clips.length; i++) {
    const clip = c.clips[i] as Record<string, unknown>;
    if (typeof clip.prompt !== 'string' || clip.prompt.length === 0) {
      throw new Error(`config.clips[${i}].prompt is required and must be a non-empty string`);
    }
  }
}

export function validateEnv(requiredKeys: string[]): void {
  const missing = requiredKeys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const VALID_VIDEO_FORMATS = ['youtube-short', 'tiktok', 'ad-16x9', 'ad-1x1', 'web-hero'] as const;
const VALID_VIDEO_PROVIDERS = ['higgsfield', 'seedance', 'fal-seedance', 'kling', 'veo', 'veo-fast'] as const;

export function validateVideoConfig(config: unknown): asserts config is VideoConfig {
  if (typeof config !== 'object' || config === null) throw new Error('config must be a JSON object');
  const c = config as Record<string, unknown>;

  if (c.mode !== 'video') throw new Error('validateVideoConfig requires mode: "video"');
  if (typeof c.title !== 'string' || c.title.length === 0) throw new Error('config.title is required');
  if (typeof c.brand !== 'string' || c.brand.length === 0) throw new Error('config.brand is required');
  if (!VALID_VIDEO_FORMATS.includes(c.format as never)) {
    throw new Error(`video config.format must be one of ${VALID_VIDEO_FORMATS.join('|')}, got: ${c.format}`);
  }
  if (c.videoProvider !== undefined && !VALID_VIDEO_PROVIDERS.includes(c.videoProvider as never)) {
    throw new Error(`video config.videoProvider must be one of ${VALID_VIDEO_PROVIDERS.join('|')}`);
  }
  if (!Array.isArray(c.clips) || c.clips.length === 0) throw new Error('video config.clips must be a non-empty array');

  for (let i = 0; i < c.clips.length; i++) {
    const clip = c.clips[i] as Record<string, unknown>;
    if (typeof clip.prompt !== 'string' || clip.prompt.length === 0) {
      throw new Error(`video config.clips[${i}].prompt is required`);
    }
    if (typeof clip.imageReference !== 'string' || clip.imageReference.length === 0) {
      throw new Error(`video config.clips[${i}].imageReference is required (image-to-video)`);
    }
  }
}

export function validateOverlayConfig(config: unknown): asserts config is OverlayConfig {
  if (typeof config !== 'object' || config === null) throw new Error('config must be a JSON object');
  const c = config as Record<string, unknown>;

  if (c.mode !== 'overlay') throw new Error('validateOverlayConfig requires mode: "overlay"');
  if (typeof c.title !== 'string' || c.title.length === 0) throw new Error('overlay config.title is required');
  if (typeof c.brand !== 'string' || c.brand.length === 0) throw new Error('overlay config.brand is required');
  const campaign = c.campaign as Record<string, unknown> | undefined;
  if (!campaign || typeof campaign !== 'object') {
    throw new Error('overlay config.campaign is required (CampaignMeta with brandName, concept, palette, typography)');
  }
  for (const f of ['brandName', 'concept', 'palette', 'typography']) {
    if (typeof campaign[f] !== 'string' || (campaign[f] as string).length === 0) {
      throw new Error(`overlay config.campaign.${f} is required`);
    }
  }
  if (!Array.isArray(c.clips) || c.clips.length === 0) throw new Error('overlay config.clips must be a non-empty array');

  for (let i = 0; i < c.clips.length; i++) {
    const clip = c.clips[i] as Record<string, unknown>;
    if (typeof clip.source !== 'string' || clip.source.length === 0) {
      throw new Error(`overlay config.clips[${i}].source is required`);
    }
    const text = clip.text as Record<string, unknown> | undefined;
    if (!text || typeof text !== 'object') {
      throw new Error(`overlay config.clips[${i}].text is required`);
    }
    if (typeof text.hero !== 'string' || text.hero.length === 0) {
      throw new Error(`overlay config.clips[${i}].text.hero is required (the wordmark/hero phrase)`);
    }
    if (!VALID_OVERLAY_PRESETS.includes(text.preset as OverlayPreset)) {
      throw new Error(`overlay config.clips[${i}].text.preset must be one of ${VALID_OVERLAY_PRESETS.join('|')}`);
    }
    if (clip.styleRef !== undefined && (typeof clip.styleRef !== 'string' || clip.styleRef.length === 0)) {
      throw new Error(`overlay config.clips[${i}].styleRef must be a non-empty string when set`);
    }
  }
}

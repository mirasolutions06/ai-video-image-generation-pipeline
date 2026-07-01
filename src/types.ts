// ─── Modes ─────────────────────────────────────────────────────────────────
export type PipelineMode = 'images' | 'video' | 'overlay';
export type ImageProvider = 'gemini' | 'gpt-image';
export type VideoProvider = 'higgsfield' | 'seedance' | 'fal-seedance' | 'kling' | 'veo' | 'veo-fast';
export type ImageFormat = 'story' | 'square' | 'landscape';
export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5' | '21:9';
export type ImageSize = '1K' | '2K' | '4K';
export type GeminiImageModel = 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image';

export const FORMAT_RATIO: Record<ImageFormat, AspectRatio> = {
  story: '9:16',
  square: '1:1',
  landscape: '16:9',
};

// ─── Scene tags (smart ref filtering) ──────────────────────────────────────
export interface SceneTags {
  hasModel?: boolean;
  hasProduct?: boolean;
  isDetail?: boolean;
}

// ─── Clip (a single scene) ──────────────────────────────────────────────────
export interface Clip extends SceneTags {
  /** Fully-enriched prompt written by the Director skill. */
  prompt: string;
  /** Output shape: which formats to render. Default: ['square']. */
  formats?: ImageFormat[];
  /** Per-clip image provider override. */
  imageProvider?: ImageProvider;
  /** Per-clip ref override. If omitted, smart filtering applies. */
  refs?: string[];
  /** Library tag bucket if this scene is later promoted (set during tag, not config). */
  libraryTag?: string;
}

// ─── Project config ─────────────────────────────────────────────────────────
export interface ProjectConfig {
  mode: 'images';
  title: string;
  brand: string;
  /** One-paragraph context describing the brand's visual world. */
  brief?: string;
  /** Default image provider for the run. */
  imageProvider?: ImageProvider;
  /** Gemini image model. Default: 'gemini-3-pro-image-preview'. Use 'gemini-2.5-flash-image' for cheap iteration. */
  imageModel?: GeminiImageModel;
  /** Default formats for clips that don't override. */
  formats?: ImageFormat[];
  /** Output resolution for Gemini renders. Default: '2K'. */
  imageSize?: ImageSize;
  /** Override the rendered aspect ratio (e.g. '4:5'). Falls back to FORMAT_RATIO[format] when unset. */
  aspectRatio?: AspectRatio;
  /** If false, scenes 2..N do not use scene 1 as a style anchor. Default: true. */
  anchorScenes?: boolean;
  clips: Clip[];
}

// ─── Run output ─────────────────────────────────────────────────────────────
export interface RunResult {
  version: number;
  versionDir: string;
  scenes: SceneResult[];
  totalCost: number;
  durationMs: number;
}

export interface SceneResult {
  sceneIndex: number;
  /** Absolute path on disk, OR null if generation failed. */
  path: string | null;
  prompt: string;
  refs: string[];
  /** Whether this scene was inherited from an earlier version (no API call). */
  inherited: boolean;
  cost: number;
}

// ─── Brand memory ───────────────────────────────────────────────────────────
export interface BrandManifest {
  brand: string;
  createdAt: string;
  lastRunAt: string;
  runCount: number;
  libraryByTag: Record<string, LibraryEntry[]>;
}

export interface LibraryEntry {
  imagePath: string;       // relative to brand dir
  metadataPath: string;    // relative to brand dir
  tag: string;             // e.g., "hero", "lifestyle", "detail"
  taggedAt: string;
  prompt: string;
}

export interface RunRecord {
  date: string;
  project: string;
  sceneCount: number;
  totalCost: number;
  notes?: string;
}

// ─── Run options (CLI flags) ────────────────────────────────────────────────
export interface RunOptions {
  dryRun?: boolean;
  render?: boolean;
  research?: boolean;
}

// ─── Image generation request ──────────────────────────────────────────────
export interface ImageGenRequest {
  prompt: string;
  format: ImageFormat;
  /** Reference images as absolute paths. */
  refs: string[];
  /** Gemini image model override. */
  model?: GeminiImageModel;
  /** Anchor image path (scene 1 output for scenes 2+). */
  anchor?: string;
  /** Output resolution. Default: '2K'. */
  imageSize?: ImageSize;
  /** Override aspect ratio. Falls back to FORMAT_RATIO[format] when unset. */
  aspectRatio?: AspectRatio;
}

export interface ImageGenResult {
  path: string;
  cost: number;
}

// ─── Video format ──────────────────────────────────────────────────────────
export type VideoFormat = 'youtube-short' | 'tiktok' | 'ad-16x9' | 'ad-1x1' | 'web-hero';
export type CaptionTheme = 'bold' | 'editorial' | 'minimal';
export type TransitionType = 'crossfade' | 'cut' | 'wipe';

// ─── Video clip ────────────────────────────────────────────────────────────
export interface VideoClip {
  prompt: string;
  /** Path to starting frame for image-to-video. */
  imageReference: string;
  /** Optional end frame for keyframe interpolation (Kling only). */
  imageReferenceEnd?: string;
  /** Clip duration in seconds. Default 5. */
  duration?: number;
  /** Per-clip provider override. */
  videoProvider?: VideoProvider;
}

// ─── Video config ──────────────────────────────────────────────────────────
export interface VideoConfig {
  mode: 'video';
  title: string;
  brand: string;
  format: VideoFormat;
  /** Default video provider for clips that don't override. */
  videoProvider?: VideoProvider;
  /** Higgsfield SOUL ID for character consistency across clips. */
  soulId?: string;
  /** Voiceover script. Only used with --render. */
  script?: string;
  /** ElevenLabs voice ID. Only used with --render. */
  voiceId?: string;
  /** Captions in render. Default true for shorts/tiktok, false for web-hero. */
  captions?: boolean;
  captionTheme?: CaptionTheme;
  /** Hook text shown first 2s. */
  hookText?: string;
  /** Background music — uses music.mp3 in project dir. */
  music?: boolean;
  musicVolume?: number;
  /** Transition between clips. Default 'crossfade'. */
  transition?: TransitionType;
  clips: VideoClip[];
}

// ─── Overlay mode (text-on-photo via gpt-image-2 + mask) ───────────────────
/**
 * Category-tuned typographic systems derived from real brand campaigns:
 *   - sandwich-lockup     → jewelry (Awaken, Mejuri): tiny tracked caps + italic display + tiny tracked caps
 *   - wordmark-centered   → perfume (Jo Malone): brand mark only, letter-spaced thin serif, upper-third
 *   - top-left-credit     → performance (Nike Air Max): swoosh + product name + caption, top-left
 *   - corner-stamp        → spirits/anything (Sophie Bille Brahe, Tom Wood): wordmark only, foot/corner
 *   - spec-chip           → performance specs / fragrance notes: small mono lockup with provenance/stats
 */
export type OverlayPreset =
  | 'sandwich-lockup'
  | 'wordmark-centered'
  | 'top-left-credit'
  | 'corner-stamp'
  | 'spec-chip';

export interface OverlayText {
  /** The hero word or wordmark (single word or 2-3 word fragment). */
  hero: string;
  /** Tiny tracked caps line ABOVE the hero (e.g. "INTRODUCING", "ATELIER"). */
  eyebrow?: string;
  /** Tiny tracked caps line BELOW the hero (e.g. "DROP TWO", "NO. 04"). */
  outro?: string;
  preset: OverlayPreset;
  /** Photo-derived or near-invisible. Default: ivory-white tuned to image. */
  color?: string;
}

export interface OverlayClip {
  /** Path to source image. Absolute, OR relative to project dir, OR relative to OverlayConfig.sourceRoot. */
  source: string;
  /** Output basename (no extension). Default: derived from source filename. */
  slug?: string;
  /** Optional path to a STYLE reference image — passed alongside the source so gpt-image-2 mimics its typographic lockup. */
  styleRef?: string;
  /** Output aspect/format. Default: 'story' (1024x1536 portrait). */
  format?: ImageFormat;
  /** Per-clip font directive (named typeface + weight + treatment). Overrides campaign.typography for this clip. */
  font?: string;
  /** Per-clip color directive — descriptor like "warm bone sampled from the skin highlights" or hex. */
  color?: string;
  /** Per-clip size hint (e.g. "hero at 7% of frame height", "mark at 1.4% of frame height"). */
  size?: string;
  /** Optional one-line creative note explaining the purpose of THIS specific shot in the campaign. */
  note?: string;
  text: OverlayText;
}

export interface CampaignMeta {
  /** Real brand wordmark / name (e.g. "LUMEN", "VERDE", "ATLAS", "NOVA"). */
  brandName: string;
  /** One-line campaign concept (e.g. "DROP 04 — Worn All Week"). */
  concept: string;
  /** Palette description grounded in the photos (e.g. "warm bone + freckled-skin amber, photo-sampled, never pure white"). */
  palette: string;
  /** Named typography system with weights + treatment (e.g. "Domaine Display Italic for hero + Söhne Mono tracked all-caps for spec lines"). */
  typography: string;
}

export interface OverlayConfig {
  mode: 'overlay';
  title: string;
  brand: string;
  /** One-paragraph brand brief — fed into the prompt for tone-aware typography. */
  brief?: string;
  /** REQUIRED — the brand identity + campaign concept the typography should serve. */
  campaign: CampaignMeta;
  /** Optional root for resolving relative clip.source paths. */
  sourceRoot?: string;
  clips: OverlayClip[];
}

// ─── Discriminated union for any config ────────────────────────────────────
export type AnyConfig = ProjectConfig | VideoConfig | OverlayConfig;

// ─── Video gen request / result ────────────────────────────────────────────
export interface VideoGenRequest {
  prompt: string;
  imageReference: string;
  imageReferenceEnd?: string;
  duration: number;
  aspectRatio: AspectRatio;
  outputPath: string;
  soulId?: string;
}

export interface VideoGenResult {
  path: string;
}

// ─── Caption word (Whisper) ────────────────────────────────────────────────
export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperResult {
  words: CaptionWord[];
  fullText: string;
  language: string;
}

// ─── Format metadata ────────────────────────────────────────────────────────
export interface FormatMeta {
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatio;
  defaultCaptions: boolean;
}

export const FORMAT_META: Record<VideoFormat, FormatMeta> = {
  'youtube-short': { width: 1080, height: 1920, fps: 30, aspectRatio: '9:16', defaultCaptions: true },
  'tiktok':        { width: 1080, height: 1920, fps: 30, aspectRatio: '9:16', defaultCaptions: true },
  'ad-16x9':       { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', defaultCaptions: false },
  'ad-1x1':        { width: 1080, height: 1080, fps: 30, aspectRatio: '1:1', defaultCaptions: false },
  'web-hero':      { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', defaultCaptions: false },
};

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OverlayClip, OverlayConfig, OverlayPreset, OverlayText, RunOptions, RunResult, SceneResult } from '../types.js';
import { logger } from '../lib/logger.js';
import { CostTracker, COST_MAP } from '../lib/cost.js';
import { nextVersion, versionDir, writeRunJson, type SceneRecord } from '../lib/versioning.js';
import { parallelLimit } from '../lib/parallel.js';
import { composeText } from '../lib/text-compose.js';

const PARALLEL_LIMIT = 3;

export interface OverlayRunInput {
  projectDir: string;
  config: OverlayConfig;
  options: RunOptions;
}

export async function runOverlayMode(input: OverlayRunInput): Promise<RunResult> {
  const { projectDir, config, options } = input;
  const startMs = Date.now();
  const cost = new CostTracker();

  const outputRoot = path.join(projectDir, 'output');
  const version = await nextVersion(outputRoot);
  const vDir = versionDir(outputRoot, version);

  if (options.dryRun) {
    const estimate = COST_MAP['gpt-image'] * config.clips.length;
    logger.info(`Project: ${config.title} | Brand: ${config.brand} | Version: v${version} (overlay)`);
    logger.info(`[DRY RUN] Would render ${config.clips.length} overlays. Estimated cost: $${estimate.toFixed(2)}`);
    return { version, versionDir: vDir, scenes: [], totalCost: estimate, durationMs: Date.now() - startMs };
  }

  await fs.mkdir(vDir, { recursive: true });
  logger.info(`Project: ${config.title} | Brand: ${config.brand} | Version: v${version} (overlay)`);

  const tasks = config.clips.map((clip, idx) => () =>
    renderOverlay(idx, clip, config, projectDir, vDir, cost),
  );
  const scenes = await parallelLimit(tasks, PARALLEL_LIMIT);

  const sceneRecords: Record<number, SceneRecord> = {};
  for (const s of scenes) {
    if (s.path) {
      sceneRecords[s.sceneIndex] = {
        path: path.basename(s.path),
        inherited: false,
        prompt: s.prompt,
        refs: s.refs,
      };
    }
  }
  await writeRunJson(vDir, {
    version,
    timestamp: new Date().toISOString(),
    scenes: sceneRecords,
    totalCost: cost.total(),
  });

  logger.success(`Run v${version} complete. ${scenes.filter((s) => s.path).length}/${scenes.length} overlays. Cost: $${cost.total().toFixed(2)}`);

  return { version, versionDir: vDir, scenes, totalCost: cost.total(), durationMs: Date.now() - startMs };
}

function resolvePath(p: string, projectDir: string, sourceRoot?: string): string {
  if (path.isAbsolute(p)) return p;
  if (sourceRoot) return path.resolve(sourceRoot, p);
  return path.resolve(projectDir, p);
}

function deriveSlug(clip: OverlayClip, idx: number): string {
  if (clip.slug) return clip.slug;
  const base = path.basename(clip.source).replace(/\.[^.]+$/, '');
  return `${String(idx + 1).padStart(2, '0')}-${base}`;
}

async function renderOverlay(
  index: number,
  clip: OverlayClip,
  config: OverlayConfig,
  projectDir: string,
  vDir: string,
  _cost: CostTracker,
): Promise<SceneResult> {
  const sceneIndex = index + 1;
  const slug = deriveSlug(clip, index);
  const sourcePath = resolvePath(clip.source, projectDir, config.sourceRoot);
  const outputPath = path.join(vDir, `${slug}.png`);

  logger.step(`Overlay ${sceneIndex}/${config.clips.length}: ${slug} (${clip.text.preset})`);

  try {
    await composeText({ sourcePath, outputPath, clip, config });
    logger.success(`Overlay ${sceneIndex}: done → ${path.basename(outputPath)}`);
    return {
      sceneIndex,
      path: outputPath,
      prompt: `[deterministic compose: ${clip.text.preset}]`,
      refs: [path.basename(sourcePath)],
      inherited: false,
      cost: 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Overlay ${sceneIndex}: failed — ${message}`);
    return { sceneIndex, path: null, prompt: '', refs: [sourcePath], inherited: false, cost: 0 };
  }
}

const PRESET_DIRECTION: Record<OverlayPreset, (t: OverlayText, hasStyleRef: boolean) => string> = {
  'sandwich-lockup': (t, hasRef) => `Typographic system: ${hasRef ? 'MIRROR the lockup of the second reference image' : 'editorial-luxury jewelry lockup (Mejuri / Sophie Bille Brahe / Awaken-campaign style)'} — three stacked elements:
  • Eyebrow: tiny all-caps tracked-out (letter-spacing 350-450), set in a refined sans or transitional serif. Text: ${t.eyebrow ? `"${t.eyebrow}"` : 'OMIT this line entirely if not provided'}
  • Hero: italic display serif (Domaine Display Italic / Canela Deck / Adobe Garamond Italic), MIXED-CASE not all caps, generous size, optical-centered. Text: "${t.hero}"
  • Outro: tiny all-caps tracked-out matching the eyebrow weight & tracking. Text: ${t.outro ? `"${t.outro}"` : 'OMIT this line entirely if not provided'}
Centered horizontally inside the transparent mask region. NO band, NO panel — type sits on the photo with whisper-faint drop shadow only where it crosses bright skin. Color: ivory-white sampled from the photo's lightest highlight, NOT pure #FFFFFF.`,

  'wordmark-centered': (t, hasRef) => `Typographic system: ${hasRef ? 'MIRROR the brand-mark treatment of the second reference image' : 'editorial fragrance wordmark (Jo Malone London / Aesop / Diptyque style)'} — ONLY the wordmark, nothing else, free-floating:
  • Wordmark: "${t.hero}" set in an elegant condensed thin serif (think Engravers Roman / Ogg Roman / ITC Garamond Light), generous letter-spacing 80-150, centered inside the transparent mask region (which sits in the SKY/EMPTY area above the product — do NOT paint the wordmark onto the product itself).
  • Tone: looks PHOTOGRAPHED into the scene with subtle film-grain integration — not pasted in post.
  • Color: off-white tuned to the photo's mid-tone (NOT pure #FFFFFF).
NO eyebrow, NO outro, NO subhead, NO CTA, NO hashtags, NO product names, NO label, NO sticker, NO rectangular panel or background fill behind the wordmark — the wordmark is FREE-FLOATING TYPE on the photograph and nothing else.`,

  'top-left-credit': (t, hasRef) => `Typographic system: ${hasRef ? 'MIRROR the top-left credit lockup of the second reference image' : 'performance/lifestyle credit lockup (Nike Air Max Moto 2K / On Running / NB Made in USA style)'} — three small elements stacked top-left inside the transparent mask region:
  • Mark or wordmark line: "${t.hero}" — set in a clean medium-weight grotesque sans (think Söhne / Helvetica Now / NB Akademie), tight stack
  • Mid line (if provided): ${t.eyebrow ? `"${t.eyebrow}" — slightly smaller, same family` : 'OMIT'}
  • Caption (if provided): ${t.outro ? `"${t.outro}" — smallest, monospace or condensed sans, like a colourway code` : 'OMIT'}
Left-aligned, ALL elements stacked tightly. White type, NO band, NO panel — sits directly on the photo. Mark height ~3% of frame height — small, not headline-sized.`,

  'corner-stamp': (t) => `Typographic system: a whisper-quiet brand mark only — single line set inside the transparent mask region:
  • "${t.hero}" set in a thin tracked-out grotesque sans (Söhne Light / NB Akademie Std Light) OR a thin condensed Didone wordmark (Sophie Bille Brahe / Tom Wood style)
  • ~1.5% of frame height — smaller than feels right, deliberately recessive
  • Off-white tuned to the photo's mid-tone, NOT pure white
NO secondary text. The brand mark IS the only typography in the entire frame.`,

  'spec-chip': (t, hasRef) => `Typographic system: ${hasRef ? 'MIRROR the spec/info lockup of the second reference image' : 'editorial info/spec block (a performance spec card, New Balance / Nike Pegasus style)'} — short stacked text blocks inside the transparent mask region:
  • Hero/wordmark line: "${t.hero}" set in italic small-caps OR condensed sans, slightly larger than the spec lines
  • Eyebrow/category line (if provided): ${t.eyebrow ? `"${t.eyebrow}" — small mono or grotesque, ALL CAPS, letter-spaced` : 'OMIT'}
  • Outro/provenance line (if provided): ${t.outro ? `"${t.outro}" — smallest, mono, ALL CAPS, letter-spaced` : 'OMIT'}
Top-left aligned tight micro-block. White type. NO band, NO panel — sits on the photo. Reads as a credit line, NOT a headline.`,
};

export function buildOverlayPrompt(
  clip: OverlayClip,
  config: OverlayConfig,
  hasStyleRef = false,
): string {
  const { text } = clip;
  const direction = PRESET_DIRECTION[text.preset](text, hasStyleRef);
  const cm = config.campaign;

  const fontDirective = clip.font ?? cm.typography;
  const colorDirective = clip.color ?? `${cm.palette} (the type color is photo-sampled, NEVER pure #FFFFFF, NEVER pure #000000)`;
  const sizeDirective = clip.size ?? 'sized smaller than feels comfortable — type whispers, never shouts';

  const lines: string[] = [];
  lines.push('You are rendering a real luxury-editorial brand campaign onto an existing product photograph.');
  lines.push('');
  lines.push(`CAMPAIGN: ${cm.brandName} — ${cm.concept}`);
  if (clip.note) lines.push(`THIS SHOT: ${clip.note}`);
  lines.push('');
  lines.push('PHOTO PRESERVATION (non-negotiable): Outside the transparent mask region, preserve the source photograph (the FIRST input image) pixel-for-pixel — do not re-render, recolor, retouch, or re-light any part of the photo outside the mask. The first image is the canvas; only the masked region is editable.');
  if (hasStyleRef) {
    lines.push('');
    lines.push('STYLE REFERENCE: The SECOND input image is a real brand campaign showing the exact typographic SYSTEM to mimic — letter weight, tracking, scale relationship, color integration. Match its SYSTEM, not its content. Do NOT copy its words or its photograph. Only borrow its treatment.');
  }
  lines.push('');
  lines.push(direction);
  lines.push('');
  lines.push(`TYPOGRAPHY (specific): ${fontDirective}`);
  lines.push(`COLOR (specific): ${colorDirective}`);
  lines.push(`SCALE (specific): ${sizeDirective}`);
  lines.push('');
  lines.push(`Render every text element ONCE and ONLY as written above — exact spelling, exact case, exact punctuation. The brand name "${cm.brandName}" must be spelled exactly as written. NO additional headlines, taglines, hashtags, captions, prices, model names, watermarks, secondary brand logos, or text of any kind beyond what is quoted above.`);
  if (config.brief) {
    lines.push('');
    lines.push(`Brand context (informs tone, does NOT add visible text): ${config.brief}`);
  }
  lines.push('');
  lines.push('STRICTLY AVOID: black bars, white bars, color-block panels, gradient panels, "PowerPoint" bottom bands, generic Helvetica/Arial/Inter (use the named typeface above), pure #FFFFFF white at any scale, "headline + subhead + CTA" stack, anything that reads as a slide deck. The result must look like a real published luxury brand campaign — not Canva, not PowerPoint, not stock advertising.');
  return lines.join('\n');
}


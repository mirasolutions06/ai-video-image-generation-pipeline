import type { ImageSize } from '../types.js';

export const COST_MAP = {
  'gemini-image': 0.08,
  'gpt-image': 0.19,
  'higgsfield-5s': 0.80,
  'higgsfield-10s': 1.60,
  'seedance-5s': 0.80,
  'seedance-10s': 1.60,
  'fal-seedance-5s': 0.50,
  'fal-seedance-10s': 0.90,
  'kling-5s': 1.50,
  'kling-10s': 3.00,
  'elevenlabs': 0.50,
  'whisper': 0.02,
} as const;

export type CostKey = keyof typeof COST_MAP;

export function costFor(key: CostKey | string): number {
  return (COST_MAP as Record<string, number>)[key] ?? 0;
}

/** Per-image USD cost for a Gemini image model at a given output resolution. */
export function geminiImageCost(model: string, imageSize: ImageSize = '2K'): number {
  if (model === 'gemini-2.5-flash-image') return 0.039;
  if (model === 'gemini-3-pro-image-preview') return imageSize === '4K' ? 0.24 : 0.134;
  return COST_MAP['gemini-image'] ?? 0;
}

export interface CostStep {
  key: string;
  amount: number;
  at: string;
}

export class CostTracker {
  private entries: CostStep[] = [];

  log(key: CostKey | string, amount?: number): void {
    const resolved = amount ?? (COST_MAP as Record<string, number>)[key] ?? 0;
    this.entries.push({ key, amount: resolved, at: new Date().toISOString() });
  }

  total(): number {
    return this.entries.reduce((sum, e) => sum + e.amount, 0);
  }

  steps(): readonly CostStep[] {
    return this.entries;
  }

  estimateImages(sceneCount: number, formatCount: number, model?: string, imageSize?: ImageSize): number {
    const per = model !== undefined ? geminiImageCost(model, imageSize) : (COST_MAP['gemini-image'] ?? 0);
    return per * sceneCount * formatCount;
  }
}

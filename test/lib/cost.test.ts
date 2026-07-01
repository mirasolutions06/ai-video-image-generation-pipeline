import { describe, it, expect } from 'vitest';
import { CostTracker, COST_MAP, geminiImageCost } from '../../src/lib/cost.js';

describe('COST_MAP', () => {
  it('has gemini-image entry', () => {
    expect(COST_MAP['gemini-image']).toBeGreaterThan(0);
  });
});

describe('CostTracker', () => {
  it('tracks each logged step', () => {
    const t = new CostTracker();
    t.log('gemini-image');
    t.log('gemini-image');
    expect(t.total()).toBe(COST_MAP['gemini-image']! * 2);
    expect(t.steps()).toHaveLength(2);
  });

  it('returns zero for unknown step', () => {
    const t = new CostTracker();
    t.log('unknown-key' as never);
    expect(t.total()).toBe(0);
  });

  it('estimateImages multiplies by formats and clips', () => {
    const t = new CostTracker();
    const cost = t.estimateImages(8, 1);
    expect(cost).toBe(COST_MAP['gemini-image']! * 8);
  });
});

describe('geminiImageCost', () => {
  it('prices flash image at ~$0.039 regardless of size', () => {
    expect(geminiImageCost('gemini-2.5-flash-image')).toBeCloseTo(0.039);
    expect(geminiImageCost('gemini-2.5-flash-image', '4K')).toBeCloseTo(0.039);
  });
  it('prices pro image at $0.134 up to 2K and $0.24 at 4K', () => {
    expect(geminiImageCost('gemini-3-pro-image-preview', '1K')).toBeCloseTo(0.134);
    expect(geminiImageCost('gemini-3-pro-image-preview', '2K')).toBeCloseTo(0.134);
    expect(geminiImageCost('gemini-3-pro-image-preview', '4K')).toBeCloseTo(0.24);
  });
  it('falls back to the legacy gemini-image cost for an unknown model', () => {
    expect(geminiImageCost('mystery-model')).toBe(COST_MAP['gemini-image']);
  });
});

describe('CostTracker explicit amount + model estimate', () => {
  it('logs an explicit amount over the map value', () => {
    const t = new CostTracker();
    t.log('gemini-image', 0.039);
    t.log('gemini-image', 0.24);
    expect(t.total()).toBeCloseTo(0.279);
  });
  it('estimateImages uses flash cost when a model is given', () => {
    expect(new CostTracker().estimateImages(9, 1, 'gemini-2.5-flash-image', '2K')).toBeCloseTo(0.351);
  });
  it('estimateImages uses pro 4K cost when a model is given', () => {
    expect(new CostTracker().estimateImages(3, 1, 'gemini-3-pro-image-preview', '4K')).toBeCloseTo(0.72);
  });
});

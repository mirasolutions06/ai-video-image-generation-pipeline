import { describe, it, expect } from 'vitest';
import { validateConfig, validateEnv } from '../../src/lib/validate.js';

describe('validateConfig', () => {
  it('accepts a valid images config', () => {
    expect(() => validateConfig({
      mode: 'images',
      title: 'demo',
      brand: 'Test Brand',
      clips: [{ prompt: 'a hero shot' }],
    })).not.toThrow();
  });

  it('rejects missing title', () => {
    expect(() => validateConfig({
      mode: 'images',
      brand: 'b',
      clips: [{ prompt: 'p' }],
    } as never)).toThrow(/title/);
  });

  it('rejects empty clips array', () => {
    expect(() => validateConfig({
      mode: 'images',
      title: 't',
      brand: 'b',
      clips: [],
    })).toThrow(/clips/);
  });

  it('rejects invalid mode', () => {
    expect(() => validateConfig({
      mode: 'banana' as never,
      title: 't',
      brand: 'b',
      clips: [{ prompt: 'p' }],
    })).toThrow(/mode/);
  });

  it('rejects clip without prompt', () => {
    expect(() => validateConfig({
      mode: 'images',
      title: 't',
      brand: 'b',
      clips: [{ prompt: '' }],
    })).toThrow(/prompt/);
  });

  it('rejects invalid imageProvider', () => {
    expect(() => validateConfig({
      mode: 'images',
      title: 't',
      brand: 'b',
      imageProvider: 'midjourney' as never,
      clips: [{ prompt: 'p' }],
    })).toThrow(/imageProvider/);
  });

  it('rejects invalid formats entry', () => {
    expect(() => validateConfig({
      mode: 'images',
      title: 't',
      brand: 'b',
      formats: ['banana' as never],
      clips: [{ prompt: 'p' }],
    })).toThrow(/formats/);
  });
});

describe('validateEnv', () => {
  it('throws when required key is missing', () => {
    delete process.env.TEST_FAKE_KEY;
    expect(() => validateEnv(['TEST_FAKE_KEY'])).toThrow(/TEST_FAKE_KEY/);
  });

  it('passes when key is set', () => {
    process.env.TEST_FAKE_KEY = 'x';
    expect(() => validateEnv(['TEST_FAKE_KEY'])).not.toThrow();
    delete process.env.TEST_FAKE_KEY;
  });
});

describe('validateConfig imageModel', () => {
  const base = { mode: 'images', title: 't', brand: 'b', clips: [{ prompt: 'p' }] };
  it('accepts a valid imageModel', () => {
    expect(() => validateConfig({ ...base, imageModel: 'gemini-2.5-flash-image' })).not.toThrow();
    expect(() => validateConfig({ ...base, imageModel: 'gemini-3-pro-image-preview' })).not.toThrow();
  });
  it('rejects an invalid imageModel', () => {
    expect(() => validateConfig({ ...base, imageModel: 'gpt-5-image' } as never)).toThrow(/imageModel/);
  });
  it('allows imageModel to be omitted', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
  });
});

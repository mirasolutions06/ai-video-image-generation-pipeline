import { describe, it, expect } from 'vitest';
import { hashInputs, cacheKey } from '../../src/lib/cache.js';

describe('hashInputs', () => {
  it('produces stable hash for same inputs', () => {
    const a = hashInputs(['gemini', 'a prompt', { format: 'square' }]);
    const b = hashInputs(['gemini', 'a prompt', { format: 'square' }]);
    expect(a).toBe(b);
  });

  it('produces different hash for different inputs', () => {
    const a = hashInputs(['gemini', 'prompt 1']);
    const b = hashInputs(['gemini', 'prompt 2']);
    expect(a).not.toBe(b);
  });

  it('produces 16-char hex string', () => {
    expect(hashInputs(['x'])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('cacheKey', () => {
  it('prefixes with provider name', () => {
    const key = cacheKey('gemini', 'prompt', 'square');
    expect(key).toMatch(/^gemini-[0-9a-f]{16}$/);
  });
});

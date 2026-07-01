import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../src/lib/retry.js';

describe('retry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { attempts: 3, baseMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');
    const result = await retry(fn, { attempts: 3, baseMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    await expect(retry(fn, { attempts: 2, baseMs: 1 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

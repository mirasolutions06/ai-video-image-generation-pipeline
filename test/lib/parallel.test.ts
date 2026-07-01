import { describe, it, expect } from 'vitest';
import { parallelLimit } from '../../src/lib/parallel.js';

describe('parallelLimit', () => {
  it('runs all tasks and returns results in order', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const results = await parallelLimit(tasks, 2);
    expect(results).toEqual([1, 2, 3]);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return 'ok';
    });
    await parallelLimit(tasks, 2);
    expect(maxActive).toBe(2);
  });

  it('handles empty input', async () => {
    const results = await parallelLimit([], 3);
    expect(results).toEqual([]);
  });
});

export interface RetryOptions {
  attempts: number;
  /** Base delay in milliseconds. Each attempt: baseMs * 2^(attempt-1). */
  baseMs?: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const baseMs = opts.baseMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < opts.attempts) {
        const delay = baseMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

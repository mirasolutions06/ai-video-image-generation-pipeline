import { createHash } from 'node:crypto';

export function hashInputs(inputs: unknown[]): string {
  const json = JSON.stringify(inputs);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

export function cacheKey(provider: string, ...inputs: unknown[]): string {
  return `${provider}-${hashInputs(inputs)}`;
}

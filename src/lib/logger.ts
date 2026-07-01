const PREFIX = {
  step: '→',
  success: '✓',
  skip: '⏭',
  warn: '⚠',
  error: '✗',
  info: 'ℹ',
} as const;

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export const logger = {
  step: (msg: string) => console.log(`${ts()} ${PREFIX.step} ${msg}`),
  success: (msg: string) => console.log(`${ts()} ${PREFIX.success} ${msg}`),
  skip: (msg: string) => console.log(`${ts()} ${PREFIX.skip} ${msg}`),
  warn: (msg: string) => console.warn(`${ts()} ${PREFIX.warn} ${msg}`),
  error: (msg: string) => console.error(`${ts()} ${PREFIX.error} ${msg}`),
  info: (msg: string) => console.log(`${ts()} ${PREFIX.info} ${msg}`),
};

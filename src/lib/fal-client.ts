import { fal } from '@fal-ai/client';

let configured = false;

/** Lazily configure and return the shared fal client. Throws if FAL_KEY is unset. */
export function getFal(): typeof fal {
  if (!configured) {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error('FAL_KEY is not set');
    fal.config({ credentials: key });
    configured = true;
  }
  return fal;
}

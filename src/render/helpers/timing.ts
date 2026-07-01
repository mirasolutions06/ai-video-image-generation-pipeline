import { FORMAT_META, type VideoFormat, type FormatMeta } from '../../types.js';

/**
 * Returns canonical width/height/fps/aspectRatio for each video format.
 * Single source of truth used by all compositions and the pipeline orchestrator.
 *
 * Re-exports the FORMAT_META constant from types.ts as a function for callers
 * that prefer the lookup helper style.
 */
export function getFormatMeta(format: VideoFormat): FormatMeta {
  return FORMAT_META[format];
}

/**
 * Converts seconds to Remotion frames given a frame rate.
 * All timing calculations in compositions should use this instead of magic numbers.
 */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/**
 * Converts Remotion frames to seconds.
 */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

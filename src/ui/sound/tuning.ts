import type { Volume } from '../settings';

/** Engine numbers. Every value here is a first guess to be tuned on the phone. */
export const SOUND = {
  /** Master gain for each Volume setting. */
  master: { off: 0, low: 0.35, medium: 0.65, high: 1 } satisfies Record<Volume, number>,
  /** Most sound effects alive at once; music does not count. */
  voiceCap: 16,
  /** The compressor that keeps a loud moment from clipping. */
  limiter: { threshold: -10, knee: 10, ratio: 12, attack: 0.003, release: 0.25 },
  noiseSeconds: 1,
  /** A voice that is pushed out by a more important one fades over this long. */
  stealFadeSeconds: 0.02,
  /** The music dips to `level` for `holdSeconds`, then recovers over `recoverSeconds`. */
  duck: { level: 0.4, holdSeconds: 0.15, recoverSeconds: 0.1 },
} as const;

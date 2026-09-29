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

/** A short attack-and-decay envelope keeps a sound from clicking when it starts. */
export const ENVELOPE_ATTACK = 0.004;

export type VoiceName =
  | 'hit'
  | 'playerHurt'
  | 'counter'
  | 'dash'
  | 'studyHit'
  | 'phaseChange'
  | 'defeat'
  | 'fall'
  | 'warningGold'
  | 'warningRed';

/**
 * One layer of a sound: a tone (an oscillator gliding from `from` to `to` Hz) or a burst of the shared noise through a
 * filter (`freq` to `to` Hz). `delay` starts it that many seconds late; `volume` is the peak gain before the master volume.
 */
export type Part =
  | { tone: OscillatorType; from: number; to?: number; seconds: number; volume: number; delay?: number }
  | { noise: BiquadFilterType; freq: number; to?: number; q?: number; seconds: number; volume: number; delay?: number };

/** The sounds. Task 4 replaces the first ten beeps with richer ones; these are the old placeholders, ported unchanged. */
export const RECIPES: Record<VoiceName, readonly Part[]> = {
  hit: [{ tone: 'square', from: 220, seconds: 0.09, volume: 0.15 }],
  playerHurt: [{ tone: 'sawtooth', from: 110, seconds: 0.2, volume: 0.2 }],
  counter: [{ tone: 'triangle', from: 1100, seconds: 0.16, volume: 0.18 }],
  dash: [{ tone: 'triangle', from: 660, seconds: 0.07, volume: 0.1 }],
  studyHit: [{ tone: 'sine', from: 150, seconds: 0.09, volume: 0.08 }],
  phaseChange: [{ tone: 'sawtooth', from: 140, seconds: 0.45, volume: 0.18 }],
  defeat: [{ tone: 'sawtooth', from: 80, seconds: 0.5, volume: 0.2 }],
  fall: [{ tone: 'triangle', from: 523, seconds: 0.32, volume: 0.2 }],
  warningGold: [{ tone: 'sine', from: 880, seconds: 0.14, volume: 0.14 }],
  warningRed: [{ tone: 'sawtooth', from: 330, seconds: 0.14, volume: 0.1 }],
};

/** When more sounds arrive than the voice cap allows, the higher number wins. */
export const PRIORITY: Record<VoiceName, number> = {
  playerHurt: 10,
  defeat: 10,
  fall: 9,
  counter: 9,
  warningGold: 8,
  warningRed: 8,
  phaseChange: 8,
  hit: 7,
  dash: 4,
  studyHit: 3,
};

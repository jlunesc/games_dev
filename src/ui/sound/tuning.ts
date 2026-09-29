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

/** The pitch of a boss hit shifts by up to `steps / 2` times `spread` either way, so it does not repeat identically. */
export const HIT_VARIATION = { steps: 9, spread: 0.02 } as const;

/** The sounds. Every number is a first guess for the phone. */
export const RECIPES: Record<VoiceName, readonly Part[]> = {
  // Short and punchy: a low thump plus a noise tick.
  hit: [
    { tone: 'sine', from: 170, to: 70, seconds: 0.09, volume: 0.32 },
    { noise: 'bandpass', freq: 1800, q: 0.8, seconds: 0.05, volume: 0.16 },
  ],
  // Low, rough, downward sweep, the loudest sound in the game.
  playerHurt: [
    { tone: 'sawtooth', from: 200, to: 60, seconds: 0.28, volume: 0.3 },
    { tone: 'square', from: 130, to: 50, seconds: 0.22, volume: 0.18, delay: 0.02 },
    { noise: 'lowpass', freq: 900, to: 300, seconds: 0.25, volume: 0.2 },
  ],
  // A thump, then a rising two-note ring.
  counter: [
    { tone: 'sine', from: 160, to: 70, seconds: 0.08, volume: 0.18 },
    { tone: 'sine', from: 660, seconds: 0.12, volume: 0.16 },
    { tone: 'sine', from: 990, seconds: 0.2, volume: 0.16, delay: 0.07 },
    { tone: 'triangle', from: 1980, seconds: 0.18, volume: 0.05, delay: 0.07 },
  ],
  // A quick filtered whoosh.
  dash: [
    { noise: 'bandpass', freq: 500, to: 2200, q: 1.2, seconds: 0.12, volume: 0.14 },
    { tone: 'triangle', from: 400, to: 900, seconds: 0.08, volume: 0.04 },
  ],
  // Soft and low: the study hurts nobody.
  studyHit: [
    { tone: 'sine', from: 130, to: 90, seconds: 0.12, volume: 0.07 },
    { noise: 'lowpass', freq: 500, seconds: 0.06, volume: 0.04 },
  ],
  // A rising growl and a low pulse.
  phaseChange: [
    { tone: 'sawtooth', from: 70, to: 260, seconds: 0.55, volume: 0.22 },
    { tone: 'sine', from: 55, to: 45, seconds: 0.6, volume: 0.3 },
    { noise: 'lowpass', freq: 400, to: 1200, seconds: 0.5, volume: 0.1 },
  ],
  // The player goes down: a long falling tone and a fading tail.
  defeat: [
    { tone: 'sawtooth', from: 160, to: 40, seconds: 0.7, volume: 0.22 },
    { tone: 'sine', from: 70, to: 30, seconds: 0.8, volume: 0.28 },
    { noise: 'lowpass', freq: 700, to: 150, seconds: 0.7, volume: 0.12 },
  ],
  // A boss goes down: a falling tone and a fading noise tail.
  fall: [
    { tone: 'triangle', from: 420, to: 110, seconds: 0.5, volume: 0.2 },
    { noise: 'lowpass', freq: 1400, to: 200, seconds: 0.6, volume: 0.12, delay: 0.05 },
  ],
  // Counterable: a clear high two-note ting.
  warningGold: [
    { tone: 'sine', from: 880, seconds: 0.14, volume: 0.14 },
    { tone: 'sine', from: 1320, seconds: 0.14, volume: 0.08, delay: 0.07 },
  ],
  // Must-dodge: low and rough.
  warningRed: [
    { tone: 'sawtooth', from: 330, to: 260, seconds: 0.16, volume: 0.11 },
    { noise: 'bandpass', freq: 250, seconds: 0.1, volume: 0.05 },
  ],
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

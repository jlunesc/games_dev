import type { Pose } from '../../bosses/schema';
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
  | 'warningRed'
  | 'swell'
  | 'charge'
  | 'whoosh'
  | 'strike'
  | 'leapUp'
  | 'slam'
  | 'diveDown'
  | 'shotLaunch'
  | 'arcLaunch'
  | 'arcLand'
  | 'eruptionMark'
  | 'eruptionBlast'
  | 'boltPass';

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
  // The wind-up swell; the pitch is multiplied by the pose (see POSE_PITCH).
  swell: [{ tone: 'triangle', from: 220, to: 330, seconds: 0.3, volume: 0.1 }],
  // A shooter charging: a rising whine.
  charge: [
    { tone: 'sine', from: 180, to: 520, seconds: 0.35, volume: 0.1 },
    { tone: 'triangle', from: 360, to: 1040, seconds: 0.35, volume: 0.04 },
  ],
  // A rising whoosh for a dash or a lunge.
  whoosh: [{ noise: 'bandpass', freq: 400, to: 2400, q: 1, seconds: 0.22, volume: 0.13 }],
  // The moment the danger becomes real: a falling swipe.
  strike: [
    { noise: 'bandpass', freq: 1600, to: 600, q: 0.9, seconds: 0.1, volume: 0.14 },
    { tone: 'sawtooth', from: 300, to: 150, seconds: 0.08, volume: 0.08 },
  ],
  leapUp: [
    { tone: 'triangle', from: 200, to: 700, seconds: 0.25, volume: 0.12 },
    { noise: 'bandpass', freq: 500, to: 1500, seconds: 0.2, volume: 0.07 },
  ],
  // A heavy landing.
  slam: [
    { tone: 'sine', from: 110, to: 38, seconds: 0.3, volume: 0.34 },
    { noise: 'lowpass', freq: 1200, to: 150, seconds: 0.3, volume: 0.22 },
  ],
  // A falling whistle.
  diveDown: [{ tone: 'sine', from: 1400, to: 350, seconds: 0.4, volume: 0.1 }],
  shotLaunch: [
    { tone: 'square', from: 500, to: 300, seconds: 0.1, volume: 0.09 },
    { noise: 'bandpass', freq: 2000, seconds: 0.06, volume: 0.05 },
  ],
  arcLaunch: [
    { tone: 'triangle', from: 240, to: 520, seconds: 0.18, volume: 0.1 },
    { noise: 'lowpass', freq: 800, seconds: 0.1, volume: 0.06 },
  ],
  arcLand: [
    { tone: 'sine', from: 130, to: 50, seconds: 0.22, volume: 0.26 },
    { noise: 'lowpass', freq: 1000, to: 200, seconds: 0.2, volume: 0.16 },
  ],
  // A soft low tick: the floor is about to erupt.
  eruptionMark: [
    { tone: 'sine', from: 90, seconds: 0.18, volume: 0.09 },
    { noise: 'lowpass', freq: 300, seconds: 0.15, volume: 0.05 },
  ],
  eruptionBlast: [
    { noise: 'lowpass', freq: 1800, to: 200, seconds: 0.4, volume: 0.26 },
    { tone: 'sawtooth', from: 90, to: 40, seconds: 0.35, volume: 0.2 },
  ],
  boltPass: [{ noise: 'bandpass', freq: 900, to: 600, seconds: 0.12, volume: 0.05 }],
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
  swell: 6,
  charge: 6,
  whoosh: 6,
  strike: 5,
  leapUp: 6,
  slam: 7,
  diveDown: 6,
  shotLaunch: 5,
  arcLaunch: 5,
  arcLand: 6,
  eruptionMark: 4,
  eruptionBlast: 7,
  boltPass: 2,
};

/** The wind-up swell is pitched by the pose, so the ear can tell a raised arm from a crouch. */
export const POSE_PITCH: Record<Pose, number> = { raised: 1.5, sideways: 1, back: 0.8, down: 0.7, crouch: 0.6 };

/** In a pair fight, boss 0 sounds this far left and every other boss this far right (-1 is full left, 1 full right). */
export const PAIR_PAN = 0.35;

/** A bolt within `range` world units of the player counts as passing by; the sound pans `pan` toward its side. */
export const SHOT_PASS = { range: 90, pan: 0.5 } as const;

export type Mode = 'minor' | 'major';

/** A boss's music: the key's tonic as a MIDI note (60 is middle C; the bass plays it as written), the mode and the tempo. */
export interface Theme {
  root: number;
  mode: Mode;
  bpm: number;
}

/** One theme per boss id. A boss that is not here (a generated one) gets a key from the fight's seed instead. */
export const THEMES: Record<string, Theme> = {
  'ember-duelist': { root: 45, mode: 'minor', bpm: 118 },
  'ashen-hound': { root: 38, mode: 'minor', bpm: 138 },
  'quill-warden': { root: 40, mode: 'minor', bpm: 108 },
  'cinder-golem': { root: 36, mode: 'minor', bpm: 84 },
  'veil-dancer': { root: 42, mode: 'minor', bpm: 112 },
  'gale-reaver': { root: 43, mode: 'minor', bpm: 148 },
  'brass-sentinel': { root: 38, mode: 'major', bpm: 100 },
  'vesper-sage': { root: 46, mode: 'minor', bpm: 96 },
  'tremor-brute': { root: 41, mode: 'minor', bpm: 90 },
  'storm-kite': { root: 40, mode: 'major', bpm: 126 },
  trainee: { root: 36, mode: 'major', bpm: 100 },
};

/** A generated boss: root `lowest` plus the seed modulo 12, tempo `bpmMin` plus the seed modulo `bpmSpan`. */
export const SEEDED = { lowest: 36, bpmMin: 96, bpmSpan: 44 } as const;

/** Drums come in at this health fraction or below (or in phase 2), the lead at the second one (or in the last phase). */
export const LAYERS = { drumsAtHp: 0.5, leadAtHp: 0.25 } as const;

/**
 * One chord per bar, four bars, then round again. `offset` is semitones above the tonic and `third` the size of the
 * chord's third (3 minor, 4 major). Every chord tone stays inside the natural scale of its mode.
 */
export const PROGRESSIONS: Record<Mode, ReadonlyArray<{ offset: number; third: 3 | 4 }>> = {
  minor: [
    { offset: 0, third: 3 },
    { offset: 8, third: 4 },
    { offset: 3, third: 4 },
    { offset: 10, third: 4 },
  ],
  major: [
    { offset: 0, third: 4 },
    { offset: 7, third: 4 },
    { offset: 9, third: 3 },
    { offset: 5, third: 4 },
  ],
};

/** The music. Every value is a first guess to be tuned on the phone. */
export const MUSIC = {
  /** The sequencer wakes this often and schedules what falls in the next `lookaheadSeconds` of the audio clock. */
  timerMs: 25,
  lookaheadSeconds: 0.12,
  /** The first beat sounds this long after the music starts. */
  startDelaySeconds: 0.05,
  startFadeSeconds: 0.5,
  stopFadeSeconds: 0.3,
  /** A step already this far in the past (the timer was starved, the page was hidden) is skipped, not played late. */
  lateSeconds: 0.1,
  /** How often, in updates, the fight is looked at to decide the layers (they only change on a bar line anyway). */
  checkEvery: 10,
  /** The whole music against the sound effects. */
  level: 0.5,
  /** How loud each layer plays when it is on. */
  layerGain: { pad: 0.5, bass: 0.9, drums: 0.7, lead: 0.5 },
  /** The pad when it plays alone (the study): quieter, so watching is not drowned. */
  studyPadGain: 0.3,
  note: {
    /** A chord tone held for the bar, fading in and out so a bar melts into the next. */
    pad: { tone: 'triangle', volume: 0.09, attackSeconds: 0.5, releaseSeconds: 0.5 },
    /** The bass is a triangle with a quiet square an octave up so it can be heard on a phone speaker. */
    bass: {
      seconds: 0.2,
      parts: [
        { tone: 'triangle', semitones: 0, volume: 0.3 },
        { tone: 'square', semitones: 12, volume: 0.04 },
      ],
    },
    lead: { tone: 'square', seconds: 0.18, volume: 0.05 },
    kick: { from: 120, to: 45, seconds: 0.16, volume: 0.5 },
    hat: { freq: 7000, seconds: 0.04, volume: 0.1 },
  },
  /** A win sting is `semitones` above the tonic plus `above`; a loss sting the same. */
  sting: {
    priority: 10,
    spacing: 0.11,
    win: { tone: 'triangle', semitones: [0, 4, 7, 12], above: 24, seconds: 0.6, volume: 0.2 },
    loss: { tone: 'sawtooth', semitones: [7, 3, 0, -5], above: 12, seconds: 0.7, volume: 0.1 },
  },
} as const;

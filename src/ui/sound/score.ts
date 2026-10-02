import type { FightDef } from '../../game/fight';
import { allBosses, type GameState } from '../../game/state';
import { MELODIES } from './melodies';
import { LAYERS, PHASE_TWO, PROGRESSIONS, SEEDED, THEMES, type Mode, type Theme } from './tuning';

export interface Layers {
  pad: boolean;
  bass: boolean;
  drums: boolean;
  lead: boolean;
  /** The boss's own two melodies (`melodies.ts`); a boss without them is silent here. */
  melody: boolean;
  /** The second phase's music: darker and faster (`darkTheme`). */
  phaseTwo: boolean;
}

/** What the fight looks like to the music: the study, how hurt the bosses are, and how far into their phases. */
export interface Intensity {
  study: boolean;
  /** Bosses' health left, all of them together, from 0 to 1. */
  hpFraction: number;
  /** Some boss is past its first phase. */
  laterPhase: boolean;
  /** Some boss with more than one phase is in its last. */
  lastPhase: boolean;
}

export type NoteVoice = 'bass' | 'pad' | 'kick' | 'hat' | 'lead' | 'melody';

/** A note in a bar of eight eighth-notes: it starts at `step` (0 to 7) and lasts `steps`. Drums have no pitch. */
export interface Note {
  voice: NoteVoice;
  step: number;
  steps: number;
  midi?: number;
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const known = (id: string): Theme | undefined => (Object.prototype.hasOwnProperty.call(THEMES, id) ? THEMES[id] : undefined);

/** The key, mode and tempo for a fight: the first boss's, with the average tempo for a pair; a generated boss uses the seed. */
export function themeFor(bossIds: readonly string[], seed: number): Theme {
  const themes = bossIds.map(known).filter((t): t is Theme => t !== undefined);
  const first = themes[0];
  if (first === undefined) {
    const s = seed >>> 0;
    return {
      root: SEEDED.lowest + (s % 12),
      mode: (s >>> 4) % 2 === 0 ? 'minor' : 'major',
      bpm: SEEDED.bpmMin + ((s >>> 8) % SEEDED.bpmSpan),
    };
  }
  const bpm = Math.round(themes.reduce((sum, t) => sum + t.bpm, 0) / themes.length);
  const lead = bossIds.find((id) => known(id) !== undefined)!;
  return { root: first.root, mode: first.mode, bpm, ...(Object.prototype.hasOwnProperty.call(MELODIES, lead) ? { melody: lead } : {}) };
}

/** The second phase's version of a theme: a lower key, minor, faster. */
export function darkTheme(theme: Theme): Theme {
  return {
    ...theme,
    root: theme.root + PHASE_TWO.rootShift,
    mode: 'minor',
    bpm: Math.round(theme.bpm * PHASE_TWO.tempoFactor),
    dark: true,
  };
}

export function intensityOf(state: GameState, fight: FightDef): Intensity {
  let hp = 0;
  let max = 0;
  let laterPhase = false;
  let lastPhase = false;
  allBosses(state).forEach((boss, index) => {
    const def = fight.bosses[index];
    if (def === undefined) return;
    hp += Math.max(0, boss.hp);
    max += def.maxHp;
    if (boss.phase >= 1) laterPhase = true;
    if (def.phases.length > 1 && boss.phase >= def.phases.length - 1) lastPhase = true;
  });
  return { study: state.study.active, hpFraction: max > 0 ? hp / max : 1, laterPhase, lastPhase };
}

export function layersFor(intensity: Intensity): Layers {
  if (intensity.study) return { pad: true, bass: false, drums: false, lead: false, melody: false, phaseTwo: false };
  return {
    pad: true,
    bass: true,
    drums: intensity.laterPhase || intensity.hpFraction <= LAYERS.drumsAtHp,
    lead: intensity.lastPhase || intensity.hpFraction <= LAYERS.leadAtHp,
    melody: true,
    phaseTwo: intensity.laterPhase,
  };
}

const SCALE: Record<Mode, readonly number[]> = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };

/** The melody's notes for one bar: the boss's two melodies in turn, four bars each, from the first bar. */
function melodyNotes(theme: Theme, bar: number): Note[] {
  const tune =
    theme.melody !== undefined && Object.prototype.hasOwnProperty.call(MELODIES, theme.melody) ? MELODIES[theme.melody] : undefined;
  if (tune === undefined) return [];
  const text = tune[(((Math.floor(bar / 4) % 2) + 2) % 2) as 0 | 1][((bar % 4) + 4) % 4]!;
  const scale = SCALE[theme.mode];
  const chord = PROGRESSIONS[theme.mode][((bar % 4) + 4) % 4]!;
  const degree = scale.indexOf(chord.offset);
  const runs: { step: number; steps: number; up: number }[] = [];
  let open: (typeof runs)[number] | null = null;
  [...text].forEach((c, step) => {
    if (c === '-' && open !== null) open.steps += 1;
    else if (c >= '0' && c <= '9') {
      open = { step, steps: 1, up: Number(c) };
      runs.push(open);
    } else open = null;
  });
  const notes: Note[] = [];
  for (const run of runs) {
    const index = degree + run.up;
    const midi = theme.root + 24 + scale[index % 7]! + 12 * Math.floor(index / 7);
    const strikes = theme.dark === true && run.steps >= 4 ? Math.floor(run.steps / PHASE_TWO.strikeSteps) : 1;
    for (let k = 0; k < strikes; k++) {
      const length = strikes === 1 ? run.steps : k === strikes - 1 ? run.steps - k * PHASE_TWO.strikeSteps : PHASE_TWO.strikeSteps;
      notes.push({ voice: 'melody', step: run.step + k * PHASE_TWO.strikeSteps, steps: length, midi });
    }
  }
  return notes;
}

const LEAD_PATTERN = [0, 1, 2, 3, 2, 1, 2, 1] as const;

/** The notes of one bar for the layers that are on. Pure: the same theme, bar and layers always give the same notes. */
export function notesFor(theme: Theme, bar: number, layers: Layers): Note[] {
  const progression = PROGRESSIONS[theme.mode];
  const chord = progression[((bar % 4) + 4) % 4]!;
  const root = theme.root + chord.offset;
  const tones = [root, root + chord.third, root + 7, root + 12];
  const odd = bar % 2 === 1;
  const notes: Note[] = [];
  if (layers.pad) {
    for (const tone of tones.slice(0, 3)) notes.push({ voice: 'pad', step: 0, steps: 8, midi: tone + 12 });
  }
  if (layers.bass) {
    for (const step of [0, 2, 4, 6]) notes.push({ voice: 'bass', step, steps: 1, midi: root });
    if (odd) notes.push({ voice: 'bass', step: 3, steps: 1, midi: root + 7 });
  }
  if (layers.drums) {
    for (const step of odd ? [0, 4, 6] : [0, 4]) notes.push({ voice: 'kick', step, steps: 1 });
    for (const step of [1, 3, 5, 7]) notes.push({ voice: 'hat', step, steps: 1 });
  }
  if (layers.melody) notes.push(...melodyNotes(theme, bar));
  if (layers.lead) {
    LEAD_PATTERN.forEach((toneIndex, step) => {
      if (odd && step === 7) return;
      notes.push({ voice: 'lead', step, steps: 1, midi: tones[toneIndex]! + 24 });
    });
  }
  return notes;
}

import { parseBoss } from '../bosses/parse';
import type { AttackDef, BossDef, PhaseDef } from '../bosses/schema';

/** The things that make a boss harder or easier. Each is a number where 1 is the boss file as written. */
export type DialId =
  | 'speed'
  | 'frequency'
  | 'readability'
  | 'health'
  | 'damage'
  | 'range'
  | 'variety';

export type Dials = Record<DialId, number>;

export interface DialDef {
  id: DialId;
  label: string;
  /** One line in plain language for the Tweak screen. */
  help: string;
  min: number;
  max: number;
  step: number;
}

export const DIALS: readonly DialDef[] = [
  {
    id: 'speed',
    label: 'Speed',
    help: 'How fast the boss moves, and how quickly it recovers after an attack.',
    min: 0.7,
    max: 1.4,
    step: 0.05,
  },
  {
    id: 'frequency',
    label: 'Attack frequency',
    help: 'How often the boss attacks. Higher means shorter pauses between attacks.',
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  {
    id: 'readability',
    label: 'Warning length',
    help: 'How long you get to read an attack before it lands. Lower is harder.',
    min: 0.6,
    max: 1.6,
    step: 0.05,
  },
  {
    id: 'health',
    label: 'Boss health',
    help: 'How much it takes to beat the boss.',
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  {
    id: 'damage',
    label: 'Damage',
    help: 'How many of your hits each attack costs.',
    min: 1,
    max: 3,
    step: 1,
  },
  {
    id: 'range',
    label: 'Attack range',
    help: 'How far the attacks reach, and how far away the boss starts them.',
    min: 0.8,
    max: 1.2,
    step: 0.05,
  },
  {
    id: 'variety',
    label: 'Variety',
    help: 'How many different attacks the boss uses. Lower means fewer kinds.',
    min: 0.5,
    max: 1,
    step: 0.05,
  },
];

export const NORMAL_DIALS: Dials = {
  speed: 1,
  frequency: 1,
  readability: 1,
  health: 1,
  damage: 1,
  range: 1,
  variety: 1,
};

export type PresetId = 'easy' | 'normal' | 'hard';

export interface Preset {
  id: PresetId;
  label: string;
  dials: Dials;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'easy',
    label: 'Easy',
    dials: {
      speed: 0.85,
      frequency: 0.7,
      readability: 1.3,
      health: 0.7,
      damage: 1,
      range: 0.9,
      variety: 0.65,
    },
  },
  { id: 'normal', label: 'Normal', dials: NORMAL_DIALS },
  {
    id: 'hard',
    label: 'Hard',
    dials: {
      speed: 1.15,
      frequency: 1.4,
      readability: 0.8,
      health: 1.4,
      damage: 2,
      range: 1.1,
      variety: 1,
    },
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Keeps a dial value inside its range and on its step (so repeated tweaks never drift). */
export function clampDial(id: DialId, value: number): number {
  const def = DIALS.find((d) => d.id === id);
  if (def === undefined) return value;
  const clamped = Math.min(def.max, Math.max(def.min, value));
  return round2(Math.round((clamped - def.min) / def.step) * def.step + def.min);
}

export function dialsEqual(a: Dials, b: Dials): boolean {
  return DIALS.every((d) => Math.abs(a[d.id] - b[d.id]) < 1e-9);
}

/** The dials whose value differs from `base` (in dial order). */
export function changedDials(base: Dials, dials: Dials): DialId[] {
  return DIALS.filter((d) => Math.abs(base[d.id] - dials[d.id]) >= 1e-9).map((d) => d.id);
}

const atLeastOne = (n: number): number => Math.max(1, Math.round(n));

function adjustAttack(attack: AttackDef, boss: BossDef, d: Dials): AttackDef {
  // A counterable attack keeps at least the counter window, or it could never be countered.
  const floor = attack.class === 'counterable' ? boss.counter.window : 1;
  const windup = Math.max(floor, Math.round(attack.windup * d.readability));
  // Hit windows and moves are timed from the start of the attack, so they move with the warning.
  const shift = windup - attack.windup;
  const next: AttackDef = {
    ...attack,
    windup,
    recovery: Math.round(attack.recovery / d.speed),
    damage: atLeastOne(attack.damage * d.damage),
    range: { min: attack.range.min * d.range, max: attack.range.max * d.range },
    hits: attack.hits.map((hit) => ({
      ...hit,
      from: hit.from + shift,
      to: hit.to + shift,
      x0: hit.x0 * d.range,
      x1: hit.x1 * d.range,
    })),
  };
  if (attack.move !== undefined) {
    next.move = {
      from: attack.move.from + shift,
      to: attack.move.to + shift,
      speed: attack.move.speed * d.speed,
    };
  }
  return next;
}

function adjustPhase(phase: PhaseDef, d: Dials): PhaseDef {
  const keep = atLeastOne(phase.attacks.length * d.variety);
  // Keep the most frequent attacks (ties keep list order), then put them back in list order.
  const kept = phase.attacks
    .map((attack, index) => ({ attack, index }))
    .sort((a, b) => b.attack.weight - a.attack.weight || a.index - b.index)
    .slice(0, keep)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.attack);
  return {
    ...phase,
    attacks: kept,
    gap: Math.max(0, Math.round(phase.gap / d.frequency)),
    walkSpeed: phase.walkSpeed * d.speed,
    retreatSpeed: phase.retreatSpeed * d.speed,
  };
}

/**
 * The boss with the dials applied: an adjusted copy, checked by the validator, so a dial can never produce a
 * boss the game cannot run. The boss file itself is never touched.
 */
export function applyDials(boss: BossDef, dials: Dials): BossDef {
  return parseBoss({
    ...boss,
    maxHp: atLeastOne(boss.maxHp * dials.health),
    attacks: boss.attacks.map((attack) => adjustAttack(attack, boss, dials)),
    phases: boss.phases.map((phase) => adjustPhase(phase, dials)),
  });
}

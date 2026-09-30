import { parseBoss } from '../bosses/parse';
import type { AttackDef, BossDef, PhaseDef } from '../bosses/schema';
import { makeFight, type FightDef } from './fight';
import { nextRandom } from './rng';

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
    // The floor is 0.7 because at 0.6 the sweep's warning is 233 ms, which cannot be reacted to (measured with bots).
    min: 0.7,
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
    help: 'How many of your hits each attack costs, so at 3 two mistakes end the fight.',
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

/** The dial values of a preset, as a new object. */
export function presetDials(id: PresetId): Dials {
  return { ...(PRESETS.find((p) => p.id === id)?.dials ?? NORMAL_DIALS) };
}

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

/** Which way a dial moves to make the boss harder: 1 is up, -1 is down. Damage is left out on purpose (see `redoDials`). */
const HARDER_DIRECTION: Record<Exclude<DialId, 'damage'>, 1 | -1> = {
  speed: 1,
  frequency: 1,
  readability: -1,
  health: 1,
  range: 1,
  variety: 1,
};

export interface RedoChange {
  dial: DialId;
  from: number;
  to: number;
  harder: boolean;
}

/**
 * The dials for a redo of a fight: one random dial (never damage) moved one step, harder after a win and easier
 * after a loss. Damage is always set to 1. A dial already at its limit that way is not picked; when none can move
 * the dials come back unchanged (except damage) and `change` is null. Pure: the seed makes the pick repeatable.
 */
export function redoDials(dials: Dials, won: boolean, seed: number): { dials: Dials; change: RedoChange | null } {
  const next: Dials = { ...dials, damage: 1 };
  const movable = DIALS.flatMap((def) => {
    if (def.id === 'damage') return [];
    const direction = won ? HARDER_DIRECTION[def.id] : (-HARDER_DIRECTION[def.id] as 1 | -1);
    const to = clampDial(def.id, dials[def.id] + direction * def.step);
    return to === dials[def.id] ? [] : [{ dial: def.id, to }];
  });
  const pick = movable[Math.floor(nextRandom(seed).value * movable.length)];
  if (pick === undefined) return { dials: next, change: null };
  next[pick.dial] = pick.to;
  return { dials: next, change: { dial: pick.dial, from: dials[pick.dial], to: pick.to, harder: won } };
}

const atLeastOne = (n: number): number => Math.max(1, Math.round(n));

function adjustAttack(attack: AttackDef, boss: BossDef, d: Dials): AttackDef {
  // A counterable attack keeps at least the counter window, or it could never be countered.
  // A held attack keeps 2 so it can hold.
  const floor = attack.class === 'counterable' ? boss.counter.window : attack.hold !== undefined ? 2 : 1;
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
    // Spread first so the direction (`dir`) survives: a back-dash must never turn into a forward dash.
    next.move = {
      ...attack.move,
      from: attack.move.from + shift,
      to: attack.move.to + shift,
      speed: attack.move.speed * d.speed,
    };
  }
  if (attack.leap !== undefined) {
    // The flight length and height are not scaled by any dial: stretching the flight would move the landing
    // (and its shockwave) in time. Only the timing shifts with the warning, and the range dial sets how far it lands.
    next.leap = { ...attack.leap, from: attack.leap.from + shift, to: attack.leap.to + shift };
    // The parser needs a distance of at least 1, so a small distance at a low range must not fall below it.
    if (attack.leap.distance !== undefined) next.leap.distance = Math.max(1, attack.leap.distance * d.range);
  }
  if (attack.dive !== undefined) {
    // Like a leap: only the timing shifts, and the range dial sets how far it goes. Its shape and length stay.
    next.dive = { ...attack.dive, from: attack.dive.from + shift, to: attack.dive.to + shift };
    if (attack.dive.distance !== undefined) next.dive.distance = Math.max(1, attack.dive.distance * d.range);
  }
  if (attack.shots !== undefined) {
    // A bolt's height and size and an arc's flight and peak are not scaled by any dial: a bolt that can be jumped
    // stays one that can be jumped. Timing shifts with the warning; speed scales a bolt; range scales an arc's reach
    // and an eruption's width and offset.
    next.shots = attack.shots.map((shot) => {
      if (shot.kind === 'bolt') return { ...shot, at: shot.at + shift, speed: shot.speed * d.speed };
      if (shot.kind === 'eruption') {
        // Warning length stretches the delay (the mark is the warning); range widens the blast and pushes the side marks out.
        return {
          ...shot,
          at: shot.at + shift,
          delay: Math.max(8, Math.round(shot.delay * d.readability)),
          width: Math.max(40, shot.width * d.range),
          offset: shot.offset * d.range,
        };
      }
      const arc = { ...shot, at: shot.at + shift, radius: Math.max(10, shot.radius * d.range) };
      if (shot.distance !== undefined) arc.distance = Math.max(1, shot.distance * d.range);
      return arc;
    });
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
  const keptIds = new Set(kept.map((entry) => entry.id));
  const combos = phase.combos?.filter((steps) => keptIds.has(steps[0]!));
  return {
    ...phase,
    attacks: kept,
    ...(combos === undefined ? {} : { combos }),
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

/** Applies the dials to every boss of a fight, then rebuilds the enraged copies so the enrage is applied on top of the dials. */
export function applyDialsToFight(fight: FightDef, dials: Dials): FightDef {
  return makeFight(
    fight.bosses.map((boss) => applyDials(boss, dials)),
    fight.enrage,
  );
}

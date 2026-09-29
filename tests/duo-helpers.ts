import type { BossDef } from '../src/bosses/schema';
import { makeFight, type EnrageDef, type FightDef } from '../src/game/fight';
import { bolt, shooter } from './shot-helpers';

/**
 * A boss that fires one bolt per attack, waits `gap` updates between attacks and never walks. The bolt flies at
 * `height` above the floor (the default is over the player's head), so the player is never hurt.
 */
export function unit(gap: number, startX: number, maxHp = 30, height = 400): BossDef {
  const base = shooter([bolt({ height })]);
  return { ...base, startX, maxHp, phases: [{ ...base.phases[0]!, gap }] };
}

/** A target that stands still and never attacks. */
export function dummy(startX: number, maxHp = 30): BossDef {
  const base = unit(1, startX, maxHp);
  return { ...base, phases: base.phases.map((phase) => ({ ...phase, attacks: [] })) };
}

export const pair = (a: BossDef, b: BossDef, enrage: EnrageDef | null = null): FightDef =>
  makeFight([a, b], enrage);

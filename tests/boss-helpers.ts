import type { AttackDef, BossDef, PhaseAttack, PhaseDef } from '../src/bosses/schema';
import { DT } from '../src/engine/time';
import { PLAYER } from '../src/game/params';
import { step } from '../src/game/step';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { DUELIST } from './helpers';

export const isWindup = (e: GameEvent): boolean => e === 'bossWindupGold' || e === 'bossWindupRed';
export const windupUpdates = (states: GameState[]): number[] =>
  states.flatMap((s, i) => (s.events.some(isWindup) ? [i + 1] : []));
export const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));
export const attackIds = (states: GameState[]): string[] =>
  states.flatMap((s) => (s.events.some(isWindup) ? [s.boss.attackId ?? ''] : []));

/** The real boss with its attacks removed: it walks and keeps its distance but never attacks. */
export const WALKER: BossDef = {
  ...DUELIST,
  phases: DUELIST.phases.map((p) => ({ ...p, attacks: [] })),
};

/** The real boss using only attack `id`, starting a new attack one update after the last one ends, never walking. */
export function solo(id: string): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    phases: DUELIST.phases.map((p) => ({
      ...p,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id, weight: 1 }],
    })),
  };
}

/** The real boss with every attack usable from any distance and no walking, so a test decides when it strikes. */
export function anywhere(): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    attacks: DUELIST.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
  };
}

/** A fresh fight with the player `distance` units to the left of the boss. */
export function standAt(boss: BossDef, distance: number, seed = 1): GameState {
  const s = createInitialState(boss, seed);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

/** The move input of a player who runs at the boss and stops exactly on its centre (never attacks or dashes). */
export const crowdInput = (s: GameState): InputFrame => {
  const perUpdate = PLAYER.runSpeed * DT;
  return { ...NO_INPUT, moveX: Math.max(-1, Math.min(1, (s.boss.x - s.player.x) / perUpdate)) };
};

/** Runs `count` updates with the player crowding the boss all the time; returns every resulting state (index 0 is update 1). */
export function runCrowding(state: GameState, count: number, boss: BossDef): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 0; n < count; n++) {
    s = step(s, crowdInput(s), boss);
    states.push(s);
  }
  return states;
}

/** A plain must-dodge swing (wind-up 6, active 4, recovery 4) that can be started from any distance. */
export const melee = (id: string, over: Partial<AttackDef> = {}): AttackDef => ({
  id,
  name: id,
  pose: 'sideways',
  class: 'mustDodge',
  damage: 1,
  windup: 6,
  active: 4,
  recovery: 4,
  range: { min: 0, max: 1e9 },
  hits: [{ from: 6, to: 10, x0: 0, x1: 50, bottom: 0, top: 50 }],
  ...over,
});

/**
 * The Duelist's body with the given attacks and a single phase that never walks and never chains. Pass what the phase
 * should change (at least its `attacks`) in `phaseOver`, and boss-level changes in `bossOver`.
 */
export function customBoss(
  attacks: AttackDef[],
  phaseOver: Partial<PhaseDef> & { attacks: PhaseAttack[] },
  bossOver: Partial<BossDef> = {},
): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    predictability: 0,
    attacks,
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        gap: 1,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 100,
        retreatSpeed: 100,
        ...phaseOver,
      },
    ],
    ...bossOver,
  };
}

/** The boss with no walking and every attack usable from any distance, so a test decides when it strikes. */
export function openField(base: BossDef): BossDef {
  return {
    ...base,
    spacing: { min: 0, max: 1e9 },
    attacks: base.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: base.phases.map((p) => (p.spacing === undefined ? p : { ...p, spacing: { min: 0, max: 1e9 } })),
  };
}

/** The boss using only attack `id` (and its combo, if `id` starts one), starting a new attack one update after the last ends. */
export function only(base: BossDef, id: string): BossDef {
  const open = openField(base);
  return {
    ...open,
    phases: open.phases.map((p) => ({
      ...p,
      opening: undefined,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id, weight: 1 }],
    })),
  };
}

/**
 * The share of started attacks whose id is in `ids`, over several seeded fights against a player who does nothing and
 * cannot die. The boss's temper counter (in updates) is forced to `temper` before every update, so a test compares a
 * calm boss (0) with a furious one (`TEMPER.start + TEMPER.ramp`).
 */
export function pickShare(
  boss: BossDef,
  ids: string[],
  temper: number,
  seeds: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
  updates = 6000,
): number {
  let picked = 0;
  let all = 0;
  for (const seed of seeds) {
    let s = createInitialState(boss, seed);
    s.player.health = 1e9;
    for (let n = 0; n < updates; n++) {
      s.boss.temper = temper;
      s = step(s, NO_INPUT, boss);
      if (s.events.some(isWindup)) {
        all += 1;
        if (ids.includes(s.boss.attackId ?? '')) picked += 1;
      }
    }
  }
  return picked / all;
}

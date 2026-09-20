import type { BossDef } from '../src/bosses/schema';
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

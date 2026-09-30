import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DT } from '../src/engine/time';
import type { FightDef } from '../src/game/fight';
import { PLAYER } from '../src/game/params';
import { allBosses, createInitialState, isDowned, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { withInput } from './helpers';

export { NO_INPUT };

/** A fresh fight state with the player moved to `x`, and optionally given a different health. */
export function stand(fight: FightDef, seed: number, x: number, health?: number): GameState {
  const s = createInitialState(fight, seed);
  s.player.x = x;
  s.player.prevX = x;
  if (health !== undefined) s.player.health = health;
  return s;
}

/** Runs `bot` until the fight ends or `cap` updates pass; `each` sees every state. */
export function play(
  fight: FightDef,
  start: GameState,
  cap: number,
  bot: (s: GameState) => InputFrame,
  each: (s: GameState) => void = () => {},
): GameState {
  let s = start;
  for (let n = 0; n < cap && s.phase === 'fight'; n++) {
    s = step(s, bot(s), fight);
    each(s);
  }
  return s;
}

/** Runs at the nearest boss still standing and swings once close enough; never dashes, jumps or dodges. */
export function chaser(s: GameState): InputFrame {
  const p = s.player;
  const perUpdate = PLAYER.runSpeed * DT;
  const live = allBosses(s).filter((_, i) => !isDowned(s, i));
  let target = live[0]!;
  for (const b of live) if (Math.abs(b.x - p.x) < Math.abs(target.x - p.x)) target = b;
  const dx = target.x - p.x;
  return withInput({
    moveX: Math.max(-1, Math.min(1, dx / perUpdate)),
    attackPressed: Math.abs(dx) < PLAYER.attack.reach && p.attackTick < 0,
  });
}

import { EMBER_DUELIST } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import type { GameState } from '../src/game/state';

/** The real Ember Duelist. */
export const DUELIST: BossDef = EMBER_DUELIST;

/**
 * The Duelist with no attacks and no walking: a stationary target for tests about the player.
 * (It skips the validator on purpose; it is only ever used by tests.)
 */
export const QUIET_BOSS: BossDef = {
  ...EMBER_DUELIST,
  spacing: { min: 0, max: 1e9 },
  phases: EMBER_DUELIST.phases.map((phase) => ({ ...phase, attacks: [] })),
};

export const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

/** Runs `count` updates with the same input and returns the final state. */
export function advance(
  state: GameState,
  count: number,
  input: InputFrame = NO_INPUT,
  boss: BossDef = QUIET_BOSS,
): GameState {
  let s = state;
  for (let i = 0; i < count; i++) s = step(s, input, boss);
  return s;
}

/** Runs updates numbered 1..count, asking `inputFor(n)` for update n, and returns every resulting state (index 0 is update 1). */
export function run(
  state: GameState,
  count: number,
  inputFor: (update: number) => InputFrame,
  boss: BossDef = QUIET_BOSS,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= count; n++) {
    s = step(s, inputFor(n), boss);
    states.push(s);
  }
  return states;
}

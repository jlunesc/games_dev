import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import type { GameState } from '../src/game/state';

export const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

/** Runs `count` updates with the same input and returns the final state. */
export function advance(state: GameState, count: number, input: InputFrame = NO_INPUT): GameState {
  let s = state;
  for (let i = 0; i < count; i++) s = step(s, input);
  return s;
}

/** Runs updates numbered 1..count, asking `inputFor(n)` for update n, and returns every resulting state (index 0 is update 1). */
export function run(
  state: GameState,
  count: number,
  inputFor: (update: number) => InputFrame,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= count; n++) {
    s = step(s, inputFor(n));
    states.push(s);
  }
  return states;
}

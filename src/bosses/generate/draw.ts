import { nextRandom } from '../../game/rng';

/** A value drawn from the stream, and the stream's state after drawing it. */
export interface Draw<T> {
  value: T;
  state: number;
}

/** Draws a uniform float in `[min, max]` and advances the stream. */
export function uniform(state: number, min: number, max: number): Draw<number> {
  const draw = nextRandom(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/** Draws a uniform integer in `[min, max]` and advances the stream. */
export function uniformInt(state: number, min: number, max: number): Draw<number> {
  const draw = uniform(state, min, max);
  return { value: Math.round(draw.value), state: draw.state };
}

/** Picks one of `options` with equal chance and advances the stream. */
export function pick<T>(state: number, options: readonly T[]): Draw<T> {
  const draw = nextRandom(state);
  const index = Math.min(options.length - 1, Math.floor(draw.value * options.length));
  return { value: options[index]!, state: draw.state };
}

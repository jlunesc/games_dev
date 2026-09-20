import { describe, expect, it } from 'vitest';
import { nextRandom } from '../src/game/rng';

function sequence(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const next = nextRandom(state);
    out.push(next.value);
    state = next.state;
  }
  return out;
}

describe('nextRandom', () => {
  it('gives the same numbers for the same seed', () => {
    expect(sequence(7, 50)).toEqual(sequence(7, 50));
  });

  it('gives different numbers for different seeds', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it('always returns a value from 0 up to but not including 1', () => {
    for (const value of sequence(12345, 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads the values across the range', () => {
    const values = sequence(99, 5000);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(2200);
    expect(values.filter((v) => v < 0.5).length).toBeLessThan(2800);
  });

  it('moves on to a new state on every draw and never returns a negative or fractional state', () => {
    const first = nextRandom(5);
    const second = nextRandom(first.state);
    expect(second.state).not.toBe(first.state);
    expect(Number.isInteger(first.state)).toBe(true);
    expect(first.state).toBeGreaterThanOrEqual(0);
  });
});

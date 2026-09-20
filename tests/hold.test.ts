import { describe, expect, it } from 'vitest';
import { advanceHold } from '../src/engine/hold';

describe('advanceHold', () => {
  it('stays at zero while the button is not held', () => {
    expect(advanceHold(0, false, 16, 1000)).toEqual({ heldMs: 0, done: false });
  });

  it('adds the elapsed time while the button is held', () => {
    expect(advanceHold(100, true, 50, 1000)).toEqual({ heldMs: 150, done: false });
  });

  it('is done once the threshold is reached, not before', () => {
    expect(advanceHold(984, true, 15, 1000).done).toBe(false);
    expect(advanceHold(984, true, 16, 1000).done).toBe(true);
    expect(advanceHold(1200, true, 16, 1000).done).toBe(true);
  });

  it('starts over when the button is released', () => {
    expect(advanceHold(900, false, 16, 1000)).toEqual({ heldMs: 0, done: false });
  });

  it('ignores negative elapsed time', () => {
    expect(advanceHold(100, true, -5, 1000)).toEqual({ heldMs: 100, done: false });
  });
});

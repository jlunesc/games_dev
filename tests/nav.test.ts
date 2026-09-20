import { describe, expect, it } from 'vitest';
import {
  NAV_REPEAT_DELAY_MS,
  NAV_REPEAT_INTERVAL_MS,
  NAV_START,
  advanceNav,
  type NavAction,
  type NavState,
} from '../src/ui/nav';

/** Feeds one direction held from `from` to `to` (in ms) at a 60 Hz frame rate; returns the actions fired. */
function hold(moveX: number, moveY: number, from: number, to: number): NavAction[] {
  const fired: NavAction[] = [];
  let state: NavState = NAV_START;
  for (let now = from; now <= to; now += 1000 / 60) {
    const result = advanceNav(state, moveX, moveY, now);
    state = result.state;
    if (result.action !== null) fired.push(result.action);
  }
  return fired;
}

describe('advanceNav', () => {
  it('does nothing while nothing is pressed', () => {
    expect(advanceNav(NAV_START, 0, 0, 1000)).toEqual({ state: NAV_START, action: null });
  });

  it('fires once on a press and each direction maps to its action', () => {
    expect(advanceNav(NAV_START, 0, -1, 0).action).toBe('up');
    expect(advanceNav(NAV_START, 0, 1, 0).action).toBe('down');
    expect(advanceNav(NAV_START, -1, 0, 0).action).toBe('left');
    expect(advanceNav(NAV_START, 1, 0, 0).action).toBe('right');
  });

  it('a short tap fires exactly once', () => {
    expect(hold(0, 1, 0, NAV_REPEAT_DELAY_MS - 20)).toEqual(['down']);
  });

  it('holding repeats after the delay, once per interval', () => {
    const fired = hold(0, 1, 0, NAV_REPEAT_DELAY_MS + 5 * NAV_REPEAT_INTERVAL_MS);
    expect(fired[0]).toBe('down');
    // The first repeat comes at the delay; then about one every interval.
    expect(fired.length).toBeGreaterThanOrEqual(5);
    expect(fired.length).toBeLessThanOrEqual(7);
    expect(fired.every((a) => a === 'down')).toBe(true);
  });

  it('releasing resets, so the next press fires at once', () => {
    const first = advanceNav(NAV_START, 1, 0, 0);
    const released = advanceNav(first.state, 0, 0, 50);
    expect(released.state).toEqual(NAV_START);
    expect(advanceNav(released.state, 1, 0, 60).action).toBe('right');
  });

  it('a new direction fires at once even while another was held', () => {
    const first = advanceNav(NAV_START, 0, 1, 0);
    expect(advanceNav(first.state, 1, 0, 30).action).toBe('right');
  });

  it('vertical wins when both are held', () => {
    expect(advanceNav(NAV_START, 1, -1, 0).action).toBe('up');
  });
});

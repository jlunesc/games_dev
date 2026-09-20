import { describe, expect, it } from 'vitest';
import {
  NAV_REPEAT_DELAY_MS,
  NAV_REPEAT_INTERVAL_MS,
  NAV_START,
  advanceNav,
  wrap,
  type NavAction,
  type NavState,
} from '../src/ui/nav';

/** Feeds one direction held from `from` to `to` (in ms) at a 60 Hz frame rate; returns the actions fired. */
function holdTimes(moveX: number, moveY: number, from: number, to: number): number[] {
  const fired: number[] = [];
  let state: NavState = NAV_START;
  for (let now = from; now <= to; now += 1000 / 60) {
    const result = advanceNav(state, moveX, moveY, now);
    state = result.state;
    if (result.action !== null) fired.push(now);
  }
  return fired;
}

/** The same hold, as the actions fired. */
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

describe('wrap', () => {
  it('moves one step and wraps at both ends', () => {
    expect(wrap(0, -1, 4)).toBe(3);
    expect(wrap(3, 1, 4)).toBe(0);
    expect(wrap(1, 1, 4)).toBe(2);
    expect(wrap(2, -1, 4)).toBe(1);
  });
});

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
    const end = NAV_REPEAT_DELAY_MS + 5 * NAV_REPEAT_INTERVAL_MS;
    const fired = holdTimes(0, 1, 0, end);
    expect(fired[0]).toBe(0);
    // Nothing fires before the delay has passed; the first repeat is at or after it.
    expect(fired[1]!).toBeGreaterThanOrEqual(NAV_REPEAT_DELAY_MS);
    expect(fired[1]!).toBeLessThan(NAV_REPEAT_DELAY_MS + 1000 / 60 + 1);
    // Then no two repeats are closer than one interval.
    for (let i = 2; i < fired.length; i++) {
      expect(fired[i]! - fired[i - 1]!).toBeGreaterThanOrEqual(NAV_REPEAT_INTERVAL_MS);
    }
    expect(fired.length).toBeGreaterThanOrEqual(5);
    expect(fired.length).toBeLessThanOrEqual(7);
    expect(hold(0, 1, 0, end).every((a) => a === 'down')).toBe(true);
  });

  it('changing direction in the middle of a hold restarts the delay', () => {
    // Hold down for 300 ms, then right from 300 ms on: the first right repeat is a full delay after 300.
    let state: NavState = NAV_START;
    const rights: number[] = [];
    for (let now = 0; now <= 300 + NAV_REPEAT_DELAY_MS + 100; now += 1000 / 60) {
      const result = now < 300 ? advanceNav(state, 0, 1, now) : advanceNav(state, 1, 0, now);
      state = result.state;
      if (result.action === 'right') rights.push(now);
    }
    expect(rights[0]!).toBeGreaterThanOrEqual(300);
    expect(rights[0]!).toBeLessThan(300 + 1000 / 60);
    expect(rights[1]!).toBeGreaterThanOrEqual(300 + NAV_REPEAT_DELAY_MS);
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

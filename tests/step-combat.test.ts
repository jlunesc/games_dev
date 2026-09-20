import { describe, expect, it } from 'vitest';
import { isInvulnerable } from '../src/game/geometry';
import { DUMMY, PLAYER } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { run, withInput } from './helpers';

/** A fresh fight where the dummy will not sweep for a very long time. */
function quiet(): GameState {
  const s = createInitialState();
  s.dummy.nextSweepIn = 100000;
  return s;
}

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

describe('attack', () => {
  const swing = (playerX: number): GameState[] => {
    const start = quiet();
    start.player.x = playerX;
    start.player.prevX = playerX;
    return run(start, 30, (n) => withInput({ attackPressed: n === 1 }));
  };

  it('hits the dummy once, on the fourth update of the swing', () => {
    expect(updatesWith(swing(850), 'dummyHit')).toEqual([4]);
  });

  it('misses when the dummy is out of reach', () => {
    expect(updatesWith(swing(320), 'dummyHit')).toEqual([]);
  });

  it('lasts 16 updates in total', () => {
    const states = run(quiet(), 20, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[15]!.player.attackTick).toBe(15);
    expect(states[16]!.player.attackTick).toBe(-1);
  });

  it('slows the player to half speed while swinging', () => {
    const states = run(quiet(), 2, (n) => withInput({ attackPressed: n === 1, moveX: 1 }));
    const moved = states[1]!.player.x - states[0]!.player.x;
    expect(moved).toBeCloseTo((PLAYER.runSpeed * PLAYER.attack.moveFactor) / 60, 5);
  });

  it('locks the facing direction for the whole swing', () => {
    const states = run(quiet(), 6, (n) => withInput({ attackPressed: n === 1, moveX: n === 1 ? 1 : -1 }));
    expect(states[5]!.player.facing).toBe(1);
  });

  it('refills the dummy display health instead of letting it die', () => {
    const start = quiet();
    start.player.x = 850;
    start.dummy.hp = 1;
    const states = run(start, 5, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[3]!.events).toContain('dummyHit');
    expect(states[3]!.dummy.hp).toBe(DUMMY.maxHp);
  });
});

describe('dash', () => {
  it('starts at once and makes the player untouchable for exactly 11 updates', () => {
    const states = run(quiet(), 15, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    expect(states[0]!.events).toContain('dash');
    const untouchable = states.map((s) => isInvulnerable(s.player));
    expect(untouchable.slice(0, 11).every(Boolean)).toBe(true);
    expect(untouchable[11]).toBe(false);
  });

  it('covers the planned distance', () => {
    const states = run(quiet(), 11, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    const expected = PLAYER.startX + (PLAYER.dash.duration * PLAYER.dash.speed) / 60;
    expect(states[10]!.player.x).toBeCloseTo(expected, 3);
  });

  it('cannot be repeated until the cooldown after it has ended is over', () => {
    const states = run(quiet(), 60, () => withInput({ dashPressed: true }));
    expect(updatesWith(states, 'dash')).toEqual([1, 36]);
  });

  it('is not pulled down by gravity while dashing in the air', () => {
    const start = quiet();
    start.player.y = 540;
    start.player.onGround = false;
    const states = run(start, 12, (n) => withInput({ dashPressed: n === 1 }));
    expect(states.slice(0, 11).every((s) => s.player.y === 540)).toBe(true);
    expect(states[11]!.player.y).toBeGreaterThan(540);
  });

  it('goes the way the player faces when no direction is held', () => {
    const start = quiet();
    start.player.facing = -1;
    const states = run(start, 3, (n) => withInput({ dashPressed: n === 1 }));
    expect(states[2]!.player.x).toBeLessThan(PLAYER.startX);
  });

  it('cancels a swing in progress', () => {
    const states = run(quiet(), 3, (n) => withInput({ attackPressed: n === 1, dashPressed: n === 2 }));
    expect(states[1]!.player.attackTick).toBe(-1);
    expect(states[1]!.player.dashTick).toBe(0);
  });

  it('wins over an attack pressed on the same update', () => {
    const states = run(quiet(), 1, () => withInput({ attackPressed: true, dashPressed: true }));
    expect(states[0]!.player.dashTick).toBe(0);
    expect(states[0]!.player.attackTick).toBe(-1);
  });
});

import { describe, expect, it } from 'vitest';
import { isInvulnerable } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { QUIET_BOSS, run, withInput } from './helpers';

/** A fresh fight against a boss that stands still and never attacks. */
function quiet(): GameState {
  return createInitialState(QUIET_BOSS);
}

const { startup, active, recovery } = PLAYER.attack;
const SWING_LENGTH = startup + active + recovery;
const DASH = PLAYER.dash;

/** A player x from which the swing reaches half its length into the boss. */
const IN_REACH_X = QUIET_BOSS.startX - QUIET_BOSS.width / 2 - PLAYER.width / 2 - PLAYER.attack.reach / 2;

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

describe('attack', () => {
  const swing = (playerX: number): GameState[] => {
    const start = quiet();
    start.player.x = playerX;
    start.player.prevX = playerX;
    return run(start, SWING_LENGTH + 10, (n) => withInput({ attackPressed: n === 1 }));
  };

  it('hits the boss once, on the first update after the start-up', () => {
    expect(updatesWith(swing(IN_REACH_X), 'bossHit')).toEqual([startup + 1]);
  });

  it('misses when the boss is out of reach', () => {
    expect(updatesWith(swing(320), 'bossHit')).toEqual([]);
  });

  it('lasts start-up plus active plus recovery updates in total', () => {
    const states = run(quiet(), SWING_LENGTH + 4, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[SWING_LENGTH - 1]!.player.attackTick).toBe(SWING_LENGTH - 1);
    expect(states[SWING_LENGTH]!.player.attackTick).toBe(-1);
  });

  it('slows the player to half speed while swinging', () => {
    const states = run(quiet(), 2, (n) => withInput({ attackPressed: n === 1, moveX: 1 }));
    const expected = (PLAYER.runSpeed * PLAYER.attack.moveFactor) / 60;
    // The swing starts on the very update it is pressed, so update 1 is already slowed.
    expect(states[0]!.player.x - PLAYER.startX).toBeCloseTo(expected, 5);
    expect(states[1]!.player.x - states[0]!.player.x).toBeCloseTo(expected, 5);
  });

  it('locks the facing direction for the whole swing', () => {
    const states = run(quiet(), 6, (n) => withInput({ attackPressed: n === 1, moveX: n === 1 ? 1 : -1 }));
    expect(states[5]!.player.facing).toBe(1);
  });

  it('takes one hit point off the boss per swing', () => {
    const start = quiet();
    start.player.x = IN_REACH_X;
    const states = run(start, startup + 2, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[startup]!.events).toContain('bossHit');
    expect(states[startup]!.boss.hp).toBe(QUIET_BOSS.maxHp - 1);
  });
});

describe('dash', () => {
  it('starts at once and makes the player untouchable for exactly the dash duration', () => {
    const states = run(quiet(), DASH.duration + 4, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    expect(states[0]!.events).toContain('dash');
    const untouchable = states.map((s) => isInvulnerable(s.player));
    expect(untouchable.slice(0, DASH.duration).every(Boolean)).toBe(true);
    expect(untouchable[DASH.duration]).toBe(false);
  });

  it('covers the planned distance', () => {
    const states = run(quiet(), DASH.duration, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    const expected = PLAYER.startX + (DASH.duration * DASH.speed) / 60;
    expect(states[DASH.duration - 1]!.player.x).toBeCloseTo(expected, 3);
  });

  it('cannot be repeated until the cooldown after it has ended is over', () => {
    const again = 1 + DASH.duration + DASH.cooldown;
    const states = run(quiet(), again + 20, () => withInput({ dashPressed: true }));
    expect(updatesWith(states, 'dash')).toEqual([1, again]);
  });

  it('is not pulled down by gravity while dashing in the air', () => {
    const start = quiet();
    start.player.y = WORLD.floorY - 100;
    start.player.onGround = false;
    const states = run(start, DASH.duration + 1, (n) => withInput({ dashPressed: n === 1 }));
    expect(states.slice(0, DASH.duration).every((s) => s.player.y === WORLD.floorY - 100)).toBe(true);
    expect(states[DASH.duration]!.player.y).toBeGreaterThan(WORLD.floorY - 100);
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

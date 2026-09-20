import { describe, expect, it } from 'vitest';
import {
  attackActive,
  attackBox,
  bossBox,
  isInvulnerable,
  overlaps,
  playerBox,
} from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { DUELIST, QUIET_BOSS } from './helpers';

describe('overlaps', () => {
  it('is true for overlapping boxes and false for touching ones', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });
});

describe('boxes', () => {
  it('places the player box around its centre and feet', () => {
    const p = createInitialState(QUIET_BOSS).player;
    expect(playerBox(p)).toEqual({ x: 296, y: 544, w: 48, h: 96 });
  });

  it('places the boss box on the floor', () => {
    const b = createInitialState(DUELIST).boss;
    expect(bossBox(b, DUELIST)).toEqual({
      x: DUELIST.startX - DUELIST.width / 2,
      y: WORLD.floorY - DUELIST.height,
      w: DUELIST.width,
      h: DUELIST.height,
    });
  });

  it('puts the attack box in front of the player, vertically centred', () => {
    const p = createInitialState(QUIET_BOSS).player;
    const { reach, height } = PLAYER.attack;
    const top = WORLD.floorY - PLAYER.height / 2 - height / 2;
    p.x = 850;
    p.facing = 1;
    expect(attackBox(p)).toEqual({ x: 850 + PLAYER.width / 2, y: top, w: reach, h: height });
    p.facing = -1;
    expect(attackBox(p)).toEqual({ x: 850 - PLAYER.width / 2 - reach, y: top, w: reach, h: height });
  });
});

describe('predicates', () => {
  it('the attack is active only during its active updates', () => {
    const p = createInitialState(QUIET_BOSS).player;
    const { startup, active } = PLAYER.attack;
    const ticks = Array.from({ length: startup + active + 3 }, (_, i) => i - 1);
    const result = ticks.map((t) => {
      p.attackTick = t;
      return attackActive(p);
    });
    expect(result).toEqual(ticks.map((t) => t >= startup && t < startup + active));
    expect(result.filter(Boolean)).toHaveLength(active);
  });

  it('the player is untouchable after a hit or while dashing', () => {
    const p = createInitialState(QUIET_BOSS).player;
    expect(isInvulnerable(p)).toBe(false);
    p.invulnerableTicks = 5;
    expect(isInvulnerable(p)).toBe(true);
    p.invulnerableTicks = 0;
    p.dashTick = 0;
    expect(isInvulnerable(p)).toBe(true);
  });
});

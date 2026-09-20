import { describe, expect, it } from 'vitest';
import {
  attackActive,
  attackBox,
  dummyBox,
  isInvulnerable,
  overlaps,
  playerBox,
} from '../src/game/geometry';
import { createInitialState } from '../src/game/state';

describe('overlaps', () => {
  it('is true for overlapping boxes and false for touching ones', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });
});

describe('boxes', () => {
  it('places the player box around its centre and feet', () => {
    const p = createInitialState().player;
    expect(playerBox(p)).toEqual({ x: 296, y: 544, w: 48, h: 96 });
  });

  it('places the dummy box on the floor', () => {
    const d = createInitialState().dummy;
    expect(dummyBox(d)).toEqual({ x: 912, y: 480, w: 96, h: 160 });
  });

  it('puts the attack box in front of the player, vertically centred', () => {
    const p = createInitialState().player;
    p.x = 850;
    p.facing = 1;
    expect(attackBox(p)).toEqual({ x: 874, y: 552, w: 90, h: 80 });
    p.facing = -1;
    expect(attackBox(p)).toEqual({ x: 736, y: 552, w: 90, h: 80 });
  });
});

describe('predicates', () => {
  it('the attack is active only during its active updates', () => {
    const p = createInitialState().player;
    const active = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) => {
      p.attackTick = t;
      return attackActive(p);
    });
    expect(active).toEqual([false, false, false, false, true, true, true, true, false, false]);
  });

  it('the player is untouchable after a hit or while dashing', () => {
    const p = createInitialState().player;
    expect(isInvulnerable(p)).toBe(false);
    p.invulnerableTicks = 5;
    expect(isInvulnerable(p)).toBe(true);
    p.invulnerableTicks = 0;
    p.dashTick = 0;
    expect(isInvulnerable(p)).toBe(true);
  });
});

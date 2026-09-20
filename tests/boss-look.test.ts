import { describe, expect, it } from 'vitest';
import { BOSS_COLORS, armRect, bossLook } from '../src/ui/render';
import { createInitialState } from '../src/game/state';
import { DUELIST } from './helpers';

describe('armRect', () => {
  it('raises the arm above the shoulder', () => {
    const r = armRect('raised', 1, 100, 300);
    expect(r.y + r.h).toBe(300);
    expect(r.y).toBeLessThan(300);
    expect(r.x + r.w / 2).toBe(100);
  });

  it('holds the arm out sideways to the side the boss faces', () => {
    const right = armRect('sideways', 1, 100, 300);
    expect(right.x).toBe(100);
    expect(right.w).toBeGreaterThan(right.h);
    const left = armRect('sideways', -1, 100, 300);
    expect(left.x + left.w).toBe(100);
  });

  it('pulls the arm back behind the boss', () => {
    const facingRight = armRect('back', 1, 100, 300);
    expect(facingRight.x + facingRight.w).toBe(100);
    const facingLeft = armRect('back', -1, 100, 300);
    expect(facingLeft.x).toBe(100);
  });

  it('points the arm down for a stomp', () => {
    const r = armRect('down', 1, 100, 300);
    expect(r.y).toBe(300);
    expect(r.h).toBeGreaterThan(r.w);
  });
});

describe('bossLook', () => {
  const attacking = (id: string, tick: number) => {
    const b = createInitialState(DUELIST).boss;
    b.mode = 'attack';
    b.attackId = id;
    b.attackTick = tick;
    return b;
  };
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;

  it('has no glow while waiting', () => {
    expect(bossLook(createInitialState(DUELIST).boss, DUELIST)).toEqual({
      body: BOSS_COLORS.ember,
      glow: null,
    });
  });

  it('glows gold during a counterable attack and red during a must-dodge one', () => {
    expect(bossLook(attacking('slam', 5), DUELIST).glow).toBe(BOSS_COLORS.gold);
    expect(bossLook(attacking('sweep', 5), DUELIST).glow).toBe(BOSS_COLORS.red);
  });

  it('stops glowing once the attack is over and it is recovering', () => {
    expect(bossLook(attacking('slam', slam.windup + slam.active), DUELIST).glow).toBeNull();
    expect(bossLook(attacking('sweep', sweep.windup + sweep.active - 1), DUELIST).glow).toBe(
      BOSS_COLORS.red,
    );
  });

  it('turns blue when staggered and glows white while powering up', () => {
    const staggered = createInitialState(DUELIST).boss;
    staggered.mode = 'stagger';
    expect(bossLook(staggered, DUELIST)).toEqual({ body: BOSS_COLORS.stagger, glow: null });
    const powering = createInitialState(DUELIST).boss;
    powering.mode = 'transition';
    expect(bossLook(powering, DUELIST).glow).toBe(BOSS_COLORS.power);
  });
});

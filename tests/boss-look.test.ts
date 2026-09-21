import { describe, expect, it } from 'vitest';
import { BOSS_COLORS, armRect, bossLook } from '../src/ui/render';
import { ASHEN_HOUND } from '../src/bosses';
import { createInitialState } from '../src/game/state';
import { moodFor } from '../src/ui/look/moods';
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

  it('raises the arm above the shoulder for both facings', () => {
    for (const facing of [1, -1] as const) {
      const r = armRect('raised', facing, 100, 300);
      expect(r.x + r.w / 2).toBe(100);
      expect(r.y + r.h).toBe(300);
    }
  });

  it('hangs the downward arm on the side the boss faces', () => {
    const right = armRect('down', 1, 100, 300);
    expect(right.x).toBeGreaterThan(100);
    const left = armRect('down', -1, 100, 300);
    expect(left.x + left.w).toBeLessThan(100);
    expect(left.y).toBe(300);
    expect(left.h).toBeGreaterThan(left.w);
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

describe('bossLook: the body colour of each boss', () => {
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const distance = (a: string, b: string): number => {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  };
  const houndState = (over: Partial<ReturnType<typeof createInitialState>['boss']>) => {
    const b = createInitialState(ASHEN_HOUND).boss;
    Object.assign(b, over);
    return b;
  };

  it('keeps the Duelist ember body and gives a boss without a mood the same ember body', () => {
    const b = createInitialState(DUELIST).boss;
    expect(bossLook(b, DUELIST).body).toBe(BOSS_COLORS.ember);
    expect(bossLook(b, { ...DUELIST, id: 'made-up-boss' }).body).toBe(BOSS_COLORS.ember);
    expect(bossLook(b, { ...DUELIST, id: 'toString' }).body).toBe(BOSS_COLORS.ember);
  });

  it('gives the Ashen Hound its own ash-blue body, from its mood', () => {
    const body = bossLook(houndState({}), ASHEN_HOUND).body;
    expect(body).toBe(moodFor('ashen-hound').bodyColor);
    expect(body).not.toBe(BOSS_COLORS.ember);
    expect(distance(body, BOSS_COLORS.ember)).toBeGreaterThan(100);
  });

  it('keeps the Hound body colour while it attacks, and glows as before', () => {
    const attacking = bossLook(houndState({ mode: 'attack', attackId: 'bite', attackTick: 5 }), ASHEN_HOUND);
    expect(attacking.body).toBe(moodFor('ashen-hound').bodyColor);
    expect(attacking.glow).toBe(BOSS_COLORS.red);
  });

  it('shows a staggered Hound in the stagger colour, which the body colour cannot be mistaken for', () => {
    const staggered = bossLook(houndState({ mode: 'stagger' }), ASHEN_HOUND);
    expect(staggered).toEqual({ body: BOSS_COLORS.stagger, glow: null });
    expect(distance(moodFor('ashen-hound').bodyColor, BOSS_COLORS.stagger)).toBeGreaterThan(100);
  });

  it('keeps the Hound body colour while it powers up between phases', () => {
    const powering = bossLook(houndState({ mode: 'transition' }), ASHEN_HOUND);
    expect(powering).toEqual({ body: moodFor('ashen-hound').bodyColor, glow: BOSS_COLORS.power });
  });

  it('stands out from the Hound backdrop', () => {
    const mood = moodFor('ashen-hound');
    for (const c of [mood.skyTop, mood.skyBottom, mood.floor]) expect(distance(mood.bodyColor, c)).toBeGreaterThan(70);
    for (const layer of mood.layers) expect(distance(mood.bodyColor, layer.color)).toBeGreaterThan(70);
  });
});

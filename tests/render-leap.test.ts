import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { WORLD } from '../src/game/params';
import { armRect, bossDrawBox, landingRing, landingSpan } from '../src/ui/render';
import { step } from '../src/game/step';
import { standAt } from './boss-helpers';
import { DUELIST, run } from './helpers';

/** The real Duelist using only `attack`, from any distance, never walking. */
const withAttack = (attack: AttackDef): BossDef => ({
  ...DUELIST,
  spacing: { min: 0, max: 1e9 },
  attacks: [attack],
  phases: DUELIST.phases.map((p) => ({
    ...p,
    gap: 1,
    maxChain: 1,
    chainChance: 0,
    attacks: [{ id: attack.id, weight: 1 }],
  })),
});

const pounce: AttackDef = {
  id: 'pounce',
  name: 'Pounce',
  pose: 'crouch',
  class: 'mustDodge',
  damage: 1,
  windup: 30,
  active: 30,
  recovery: 30,
  range: { min: 0, max: 1e9 },
  leap: { from: 30, to: 52, height: 200, target: 'player' },
  hits: [
    { from: 52, to: 54, x0: 0, x1: 120, bottom: 0, top: 60 },
    { from: 54, to: 58, x0: 0, x1: 200, bottom: 0, top: 60 },
  ],
};
const hop: AttackDef = { ...pounce, id: 'hop', hits: [] };

describe('armRect crouch', () => {
  it('hangs the arm low in front of a boss facing right', () => {
    expect(armRect('crouch', 1, 100, 200)).toEqual({ x: 100 + 20 - 8, y: 230, w: 16, h: 54 });
  });

  it('hangs the arm low in front of a boss facing left', () => {
    expect(armRect('crouch', -1, 100, 200)).toEqual({ x: 100 - 20 - 8, y: 230, w: 16, h: 54 });
  });
});

/** A shockwave whose windows have different near and far edges, to show the smallest x0 and the largest x1 are used. */
const wave: AttackDef = {
  ...pounce,
  id: 'wave',
  hits: [
    { from: 52, to: 54, x0: 30, x1: 120, bottom: 0, top: 60 },
    { from: 54, to: 58, x0: 10, x1: 220, bottom: 0, top: 60 },
  ],
};

/** The states of a fight where the player stands `offset` from the boss (negative: left of it), while the boss flies. */
const flyingStates = (boss: BossDef, offset: number) => {
  const s = standAt(boss, 120);
  s.player.x = s.boss.x + offset;
  s.player.prevX = s.player.x;
  return run(s, 120, () => NO_INPUT, boss).filter((st) => st.boss.leapToX !== null);
};

describe('landingRing', () => {
  it('is null on a fresh state', () => {
    expect(landingRing(createInitialState(DUELIST).boss, DUELIST)).toBeNull();
  });

  it('is null mid-attack for an attack that does not leap', () => {
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const boss = withAttack(sweep);
    const states = run(standAt(boss, 120), 60, () => NO_INPUT, boss);
    const attacking = states.filter((s) => s.boss.mode === 'attack');
    expect(attacking.length).toBeGreaterThan(10);
    for (const s of attacking) expect(landingRing(s.boss, boss)).toBeNull();
  });

  it.each([
    [-120, -1],
    [120, 1],
  ] as const)('reports the one-sided shockwave with the player at %i (boss facing %i)', (offset, facing) => {
    const boss = withAttack(wave);
    const flying = flyingStates(boss, offset);
    expect(flying.length).toBeGreaterThan(5);
    for (const s of flying) {
      expect(s.boss.facing).toBe(facing);
      expect(landingRing(s.boss, boss)).toEqual({
        x: s.boss.leapToX,
        x0: 10,
        x1: 220,
        facing,
        harmless: false,
      });
    }
  });

  it('turns the ring into a one-sided floor span towards the way the boss faces', () => {
    const ring = { x: 500, x0: 10, x1: 220, facing: 1 as const, harmless: false };
    expect(landingSpan(ring)).toEqual({ left: 510, right: 720 });
    expect(landingSpan({ ...ring, facing: -1 })).toEqual({ left: 280, right: 490 });
  });

  it('turns a harmless ring into a span centred on the landing spot, whichever way the boss faces', () => {
    const ring = { x: 500, x0: -45, x1: 45, facing: 1 as const, harmless: true };
    expect(landingSpan(ring)).toEqual({ left: 455, right: 545 });
    expect(landingSpan({ ...ring, facing: -1 })).toEqual({ left: 455, right: 545 });
  });

  it('is null once the leap is over', () => {
    const boss = withAttack(pounce);
    const states = run(standAt(boss, 120), 200, () => NO_INPUT, boss);
    const last = states.map((s) => s.boss.leapToX !== null).lastIndexOf(true);
    expect(last).toBeGreaterThan(0);
    expect(states[last + 1]!.boss.leapToX).toBeNull();
    expect(landingRing(states[last + 1]!.boss, boss)).toBeNull();
  });

  it.each([
    [-120, -1],
    [120, 1],
  ] as const)('is harmless, centred on the landing spot and as wide as the boss, for a reposition leap with no hits (facing %i)', (offset, facing) => {
    const boss = withAttack(hop);
    const flying = flyingStates(boss, offset);
    expect(flying.length).toBeGreaterThan(5);
    for (const s of flying) {
      expect(landingRing(s.boss, boss)).toEqual({
        x: s.boss.leapToX,
        x0: -boss.width / 2,
        x1: boss.width / 2,
        facing,
        harmless: true,
      });
    }
  });

  it('falls back to the harmless marker when no attack is running but a landing point is set', () => {
    const boss = withAttack(wave);
    const b = { ...createInitialState(boss).boss, leapToX: 400, attackId: null };
    expect(landingRing(b, boss)).toEqual({
      x: 400,
      x0: -boss.width / 2,
      x1: boss.width / 2,
      facing: b.facing,
      harmless: true,
    });
  });
});

describe('bossDrawBox', () => {
  const floorTop = (boss: BossDef): number => WORLD.floorY - boss.height;

  it('stands on the floor at full height when idle', () => {
    const boss = withAttack(pounce);
    expect(bossDrawBox(createInitialState(boss).boss, boss)).toEqual({
      top: floorTop(boss),
      height: boss.height,
      crouching: false,
    });
  });

  it('is 25% shorter while crouching in the warning of a crouch attack, standing on the floor', () => {
    const boss = withAttack(pounce);
    const states = run(standAt(boss, 120), 120, () => NO_INPUT, boss);
    const crouching = states.filter((s) => s.boss.mode === 'attack' && s.boss.attackTick < pounce.windup);
    expect(crouching.length).toBeGreaterThan(10);
    for (const s of crouching) {
      expect(bossDrawBox(s.boss, boss)).toEqual({
        top: WORLD.floorY - boss.height * 0.75,
        height: boss.height * 0.75,
        crouching: true,
      });
    }
  });

  it('is not crouching after take-off, and is lifted by exactly the boss lift in flight', () => {
    const boss = withAttack(pounce);
    const states = run(standAt(boss, 120), 120, () => NO_INPUT, boss);
    const after = states.filter((s) => s.boss.mode === 'attack' && s.boss.attackTick >= pounce.windup);
    expect(after.length).toBeGreaterThan(10);
    for (const s of after) {
      const box = bossDrawBox(s.boss, boss);
      expect(box.crouching).toBe(false);
      expect(box.height).toBe(boss.height);
      expect(box.top).toBe(floorTop(boss) - s.boss.lift);
    }
    expect(after.some((s) => s.boss.lift > 0)).toBe(true);
  });

  it('does not crouch for an attack whose pose is not crouch', () => {
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const boss = withAttack(sweep);
    const states = run(standAt(boss, 120), 60, () => NO_INPUT, boss);
    const attacking = states.filter((s) => s.boss.mode === 'attack');
    expect(attacking.length).toBeGreaterThan(10);
    for (const s of attacking) expect(bossDrawBox(s.boss, boss).crouching).toBe(false);
  });

  it('is unchanged for the Duelist over a real fight (the old formula, on every update)', () => {
    let s = createInitialState(DUELIST, 5);
    let checked = 0;
    for (let n = 1; n <= 1500 && s.phase === 'fight'; n++) {
      const dx = s.boss.x - s.player.x;
      s = step(
        s,
        {
          ...NO_INPUT,
          moveX: Math.abs(dx) < 120 ? 0 : dx > 0 ? 1 : -1,
          attackPressed: n % 14 === 0,
          dashPressed: n % 97 === 0,
        },
        DUELIST,
      );
      const box = bossDrawBox(s.boss, DUELIST);
      expect(box.height).toBe(DUELIST.height);
      expect(box.top).toBe(WORLD.floorY - DUELIST.height - s.boss.lift);
      expect(box.crouching).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(500);
  });
});

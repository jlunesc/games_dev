import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { armRect, landingRing, landingSpan } from '../src/ui/render';
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
  ] as const)('is harmless, reaching half the boss width, for a reposition leap with no hits (facing %i)', (offset, facing) => {
    const boss = withAttack(hop);
    const flying = flyingStates(boss, offset);
    expect(flying.length).toBeGreaterThan(5);
    for (const s of flying) {
      expect(landingRing(s.boss, boss)).toEqual({
        x: s.boss.leapToX,
        x0: 0,
        x1: boss.width / 2,
        facing,
        harmless: true,
      });
    }
  });

  it('falls back to the harmless marker when no attack is running but a landing point is set', () => {
    const boss = withAttack(wave);
    const b = { ...createInitialState(boss).boss, leapToX: 400, attackId: null };
    expect(landingRing(b, boss)).toEqual({ x: 400, x0: 0, x1: boss.width / 2, facing: b.facing, harmless: true });
  });
});

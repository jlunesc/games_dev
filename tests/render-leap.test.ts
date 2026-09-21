import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { armRect, landingRing } from '../src/ui/render';
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

  it('marks the landing spot with the widest shockwave reach during a leap', () => {
    const boss = withAttack(pounce);
    const states = run(standAt(boss, 120), 120, () => NO_INPUT, boss);
    const flying = states.filter((s) => s.boss.leapToX !== null);
    expect(flying.length).toBeGreaterThan(5);
    for (const s of flying) {
      expect(landingRing(s.boss, boss)).toEqual({ x: s.boss.leapToX, halfWidth: 200 });
    }
  });

  it('is null once the leap is over', () => {
    const boss = withAttack(pounce);
    const states = run(standAt(boss, 120), 200, () => NO_INPUT, boss);
    const last = states.map((s) => s.boss.leapToX !== null).lastIndexOf(true);
    expect(last).toBeGreaterThan(0);
    expect(states[last + 1]!.boss.leapToX).toBeNull();
    expect(landingRing(states[last + 1]!.boss, boss)).toBeNull();
  });

  it('falls back to the boss width for a reposition leap with no hits', () => {
    const boss = withAttack(hop);
    const states = run(standAt(boss, 120), 120, () => NO_INPUT, boss);
    const flying = states.filter((s) => s.boss.leapToX !== null);
    expect(flying.length).toBeGreaterThan(5);
    expect(landingRing(flying[0]!.boss, boss)).toEqual({
      x: flying[0]!.boss.leapToX,
      halfWidth: boss.width,
    });
  });
});

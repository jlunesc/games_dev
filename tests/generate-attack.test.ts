import { describe, expect, it } from 'vitest';
import { generateAttack } from '../src/bosses/generate/attack';
import { GEN } from '../src/bosses/generate/tuning';
import { parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';

/**
 * A minimal valid boss shell around one generated attack, the same shape as `QUIET_BOSS` in
 * `tests/helpers.ts` but built directly (not derived from a real boss file) so a single
 * generated attack can be run through `parseBoss` on its own.
 */
function wrapBoss(attack: AttackDef): unknown {
  const counterWindow = Math.min(12, attack.windup);
  return {
    id: 'gen-test',
    name: 'Gen Test',
    width: 80,
    height: 150,
    startX: 960,
    maxHp: 10,
    spacing: { min: 200, max: 320 },
    approachTimeout: 45,
    predictability: 0.25,
    counter: { window: counterWindow, range: 200, staggerTicks: 90, damageMultiplier: 2 },
    transitionTicks: 60,
    attacks: [attack],
    phases: [
      {
        name: 'Phase 1',
        startsAtHpFraction: 1,
        attacks: [{ id: attack.id, weight: 1 }],
        gap: 70,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 190,
        retreatSpeed: 150,
      },
    ],
  };
}

function isFastMoveOrLeap(a: AttackDef): boolean {
  if (a.leap !== undefined) return true;
  if (a.move !== undefined && a.move.speed >= GEN.moveFastSpeed) return true;
  return false;
}

describe('generateAttack', () => {
  it('always produces an attack that parses, with windup at or above the readability floor', () => {
    for (const counterable of [true, false]) {
      for (let seed = 1; seed <= 2000; seed++) {
        const { value: attack } = generateAttack(seed, `attack-${seed}`, counterable);
        const boss = wrapBoss(attack) as BossDef;
        expect(() => parseBoss(boss)).not.toThrow();
        expect(attack.windup).toBeGreaterThanOrEqual(GEN.windupMin);
        if (isFastMoveOrLeap(attack)) {
          expect(attack.windup).toBeGreaterThanOrEqual(GEN.leapWindupMin);
        }
      }
    }
  });

  it('sets class from the counterable argument, and a counterable attack parses with a fitting counter window', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const trueDraw = generateAttack(seed, `attack-${seed}`, true);
      expect(trueDraw.value.class).toBe('counterable');
      const falseDraw = generateAttack(seed, `attack-${seed}`, false);
      expect(falseDraw.value.class).toBe('mustDodge');

      const window = Math.min(12, trueDraw.value.windup);
      const boss = wrapBoss(trueDraw.value) as BossDef;
      (boss as unknown as { counter: { window: number } }).counter.window = window;
      expect(() => parseBoss(boss)).not.toThrow();
    }
  });

  it('builds exactly the pieces the design lists for each effect kind', () => {
    for (const counterable of [true, false]) {
      for (let seed = 1; seed <= 2000; seed++) {
        const { value: attack } = generateAttack(seed, `attack-${seed}`, counterable);

        if (attack.leap === undefined && attack.move === undefined) {
          // hit kind
          expect(attack.hits.length).toBeGreaterThan(0);
        } else if (attack.leap === undefined) {
          // move kind
          expect(attack.move).toBeDefined();
          expect(attack.hits.length).toBe(1);
          expect(attack.move!.to).toBeGreaterThan(attack.move!.from);
          expect(attack.move!.to).toBeLessThanOrEqual(attack.windup + attack.active);
        } else {
          // leap kind
          expect(attack.pose).toBe('crouch');
          expect(attack.leap.to).toBeLessThanOrEqual(attack.windup + attack.active);
          expect(attack.hits.length).toBe(1);
          expect(attack.hits[0]!.from).toBeGreaterThanOrEqual(attack.leap.to);
        }
      }
    }
  });

  it('is deterministic: the same starting state reproduces the same attack and returned state', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = generateAttack(seed, 'attack-a', true);
      const b = generateAttack(seed, 'attack-a', true);
      expect(b.value).toEqual(a.value);
      expect(b.state).toBe(a.state);
    }
  });

  it('is not deterministic across different starting states (differs somewhere over 50 pairs)', () => {
    let differed = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const a = generateAttack(seed, 'attack', true);
      const b = generateAttack(seed + 1, 'attack', true);
      if (JSON.stringify(a.value) !== JSON.stringify(b.value)) differed++;
    }
    expect(differed).toBeGreaterThan(0);
  });

  it('always returns a valid uint32 state, threaded across a long chain of calls', () => {
    let state = 1;
    for (let i = 0; i < 500; i++) {
      const draw = generateAttack(state, `attack-${i}`, i % 2 === 0);
      state = draw.state;
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(2 ** 32);
    }
  });
});

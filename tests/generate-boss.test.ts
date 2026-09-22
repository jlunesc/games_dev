import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { generateBoss } from '../src/bosses/generate/boss';
import { GEN } from '../src/bosses/generate/tuning';
import { parseBoss } from '../src/bosses/parse';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';

describe('generateBoss', () => {
  it('never throws, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const boss = generateBoss(seed);
      expect(boss.id).toBe('generated');
    }
  });

  it('is deterministic for the same seed, and usually differs across seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = generateBoss(seed);
      const b = generateBoss(seed);
      expect(b).toEqual(a);
    }

    let differed = 0;
    const pairs = 100;
    for (let i = 1; i <= pairs; i++) {
      const seedA = i * 7 + 1;
      const seedB = seedA + 1;
      const a = generateBoss(seedA);
      const b = generateBoss(seedB);
      if (
        a.attacks.length !== b.attacks.length ||
        a.maxHp !== b.maxHp ||
        a.attacks[0]!.windup !== b.attacks[0]!.windup
      ) {
        differed++;
      }
    }
    expect(differed / pairs).toBeGreaterThanOrEqual(0.9);
  });

  it('has exactly one counterable attack, the rest mustDodge, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const boss = generateBoss(seed);
      const counterable = boss.attacks.filter((a) => a.class === 'counterable');
      const mustDodge = boss.attacks.filter((a) => a.class === 'mustDodge');
      expect(counterable.length).toBe(1);
      expect(mustDodge.length).toBe(boss.attacks.length - 1);
    }
  });

  it('has one phase whose attack list has one entry per generated attack, each weight 1', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const boss = generateBoss(seed);
      expect(boss.phases.length).toBe(1);
      const phase = boss.phases[0]!;
      expect(phase.attacks.length).toBe(boss.attacks.length);
      const ids = new Set(boss.attacks.map((a) => a.id));
      for (const entry of phase.attacks) {
        expect(ids.has(entry.id)).toBe(true);
        expect(entry.weight).toBe(1);
      }
    }
  });

  it('never advances a gameplay rng: generateBoss mixes into its own stream', () => {
    for (const seed of [1, 2, 3, 42, 12345]) {
      const withoutGen = step(createInitialState(EMBER_DUELIST, seed), NO_INPUT, EMBER_DUELIST);

      generateBoss(seed); // discard the result: must not touch any shared/global stream

      const withGenDiscarded = step(createInitialState(EMBER_DUELIST, seed), NO_INPUT, EMBER_DUELIST);

      expect(withGenDiscarded.rng).toBe(withoutGen.rng);
    }
  });

  it('draws every tuned field inside its configured range, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const boss = generateBoss(seed);

      expect(boss.width).toBeGreaterThanOrEqual(GEN.bodyMin);
      expect(boss.width).toBeLessThanOrEqual(GEN.bodyMax);
      expect(boss.height).toBeGreaterThanOrEqual(GEN.bodyMin);
      expect(boss.height).toBeLessThanOrEqual(GEN.bodyMax);

      expect(boss.maxHp).toBeGreaterThanOrEqual(GEN.maxHpMin);
      expect(boss.maxHp).toBeLessThanOrEqual(GEN.maxHpMax);
      expect(Number.isInteger(boss.maxHp)).toBe(true);

      expect(boss.spacing.min).toBeGreaterThanOrEqual(GEN.spacingMinMin);
      expect(boss.spacing.min).toBeLessThanOrEqual(GEN.spacingMinMax);
      expect(boss.spacing.max).toBe(boss.spacing.min + GEN.spacingSpan);

      const phase = boss.phases[0]!;
      expect(phase.walkSpeed).toBeGreaterThanOrEqual(GEN.walkSpeedMin);
      expect(phase.walkSpeed).toBeLessThanOrEqual(GEN.walkSpeedMax);
      expect(phase.retreatSpeed).toBeGreaterThanOrEqual(GEN.walkSpeedMin);
      expect(phase.retreatSpeed).toBeLessThanOrEqual(GEN.walkSpeedMax);
      expect(phase.gap).toBeGreaterThanOrEqual(GEN.gapMin);
      expect(phase.gap).toBeLessThanOrEqual(GEN.gapMax);
      expect(phase.maxChain).toBeGreaterThanOrEqual(GEN.maxChainMin);
      expect(phase.maxChain).toBeLessThanOrEqual(GEN.maxChainMax);
      expect(phase.chainChance).toBeGreaterThanOrEqual(0);
      expect(phase.chainChance).toBeLessThanOrEqual(GEN.chainChanceMax);

      expect(boss.approachTimeout).toBeGreaterThanOrEqual(GEN.approachTimeoutMin);
      expect(boss.approachTimeout).toBeLessThanOrEqual(GEN.approachTimeoutMax);
      expect(boss.predictability).toBeGreaterThanOrEqual(GEN.predictabilityMin);
      expect(boss.predictability).toBeLessThanOrEqual(GEN.predictabilityMax);

      expect(boss.attacks.length).toBeGreaterThanOrEqual(GEN.attackCountMin);
      expect(boss.attacks.length).toBeLessThanOrEqual(GEN.attackCountMax);

      expect(boss.counter.range).toBeGreaterThanOrEqual(GEN.counterRangeMin);
      expect(boss.counter.range).toBeLessThanOrEqual(GEN.counterRangeMax);
      expect(boss.counter.staggerTicks).toBeGreaterThanOrEqual(GEN.staggerTicksMin);
      expect(boss.counter.staggerTicks).toBeLessThanOrEqual(GEN.staggerTicksMax);
      expect(boss.counter.damageMultiplier).toBe(2);
      expect(boss.counter.window).toBeLessThanOrEqual(GEN.counterWindowMax);

      expect(() => parseBoss(boss)).not.toThrow();
    }
  });
});

describe("a generated boss's arena", () => {
  it('sometimes has one and sometimes does not, over a sweep of seeds', () => {
    let withArena = 0;
    const total = 300;
    for (let seed = 1; seed <= total; seed++) {
      if (generateBoss(seed).arena !== undefined) withArena++;
    }
    expect(withArena).toBeGreaterThan(0);
    expect(withArena).toBeLessThan(total);
  });
});

describe('the tallest-piece hit-box guarantee', () => {
  /** The tallest attack hit (by `top`), matching how `generateBoss` picks the one it boosts. */
  function tallestHit(boss: ReturnType<typeof generateBoss>) {
    let best = boss.attacks[0]!.hits[0]!;
    let bestAttack = boss.attacks[0]!;
    for (const a of boss.attacks) {
      for (const h of a.hits) {
        if (h.top > best.top) {
          best = h;
          bestAttack = a;
        }
      }
    }
    return { hit: best, attack: bestAttack };
  }

  it("reaches the tallest piece's height, and its own attack's full trigger range, for a sweep of seeds", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const boss = generateBoss(seed);
      const pieces = [...(boss.arena?.platforms ?? []), ...(boss.arena?.covers ?? [])];
      if (pieces.length === 0) continue;
      const tallestPiece = Math.max(...pieces.map((p) => p.height));
      if (tallestPiece <= 0) continue;
      const { hit, attack } = tallestHit(boss);
      expect(hit.top).toBeGreaterThan(tallestPiece);
      // The boss can trigger this attack from anywhere up to range.max away (a camping player is
      // stationary), so the hit box's far edge must reach at least that far.
      expect(hit.x1).toBeGreaterThanOrEqual(attack.range.max);
    }
  });

  it('regression: example A from the diagnosis (generateBoss(1831565817)) now reaches its ' +
    'platform both vertically and horizontally', () => {
    // Before the fix, this seed's tallest-qualifying hit (attack-0, top ~162.8 vs. the platform's
    // ~146.7) had x1 ~85.7 while its own range.max was ~279 — about 55-80 units short of the
    // platform at x~297.7, exactly the shortfall the diagnosis measured tick-by-tick.
    const boss = generateBoss(1831565817);
    const pieces = [...(boss.arena?.platforms ?? []), ...(boss.arena?.covers ?? [])];
    expect(pieces.length).toBeGreaterThan(0);
    const tallestPiece = Math.max(...pieces.map((p) => p.height));
    const { hit, attack } = tallestHit(boss);
    expect(hit.top).toBeGreaterThan(tallestPiece);
    expect(hit.x1).toBeGreaterThanOrEqual(attack.range.max + 60);
  });
});

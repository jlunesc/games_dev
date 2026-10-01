import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import { generateBoss } from '../src/bosses/generate/boss';
import { GEN } from '../src/bosses/generate/tuning';
import type { AttackDef, BossDef } from '../src/bosses/schema';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

/** What the second phase added to the boss: the twist attack, or null when it is a combo or a plain faster phase. */
function twistAttack(boss: BossDef): AttackDef | null {
  const first = new Set(boss.phases[0]!.attacks.map((a) => a.id));
  return boss.attacks.find((a) => !first.has(a.id)) ?? null;
}

/** The first-phase attack the twist is a copy of: the one with the same pose and class that matches it on the most numbers. */
function original(boss: BossDef, twist: AttackDef): AttackDef {
  const first = new Set(boss.phases[0]!.attacks.map((a) => a.id));
  const candidates = boss.attacks.filter((a) => first.has(a.id) && a.pose === twist.pose && a.class === twist.class);
  expect(candidates.length).toBeGreaterThan(0);
  return candidates.find((a) => a.recovery === twist.recovery && a.active === twist.active) ?? candidates[0]!;
}

describe('the generated boss has a second phase', () => {
  it('has two phases for every seed, and the whole boss parses', () => {
    for (const seed of SEEDS) {
      const boss = generateBoss(seed);
      expect(boss.phases).toHaveLength(2);
      expect(() => parseBoss(JSON.parse(JSON.stringify(boss)))).not.toThrow();
    }
  });

  it('is the same boss for the same seed', () => {
    for (const seed of [1, 7, 99, 12345]) expect(generateBoss(seed)).toEqual(generateBoss(seed));
  });

  it('begins at half health, with a shorter gap, longer chains and a faster walk', () => {
    for (const seed of SEEDS) {
      const [one, two] = generateBoss(seed).phases as [BossDef['phases'][0], BossDef['phases'][0]];
      expect(two.startsAtHpFraction).toBe(GEN.phase2Start);
      expect(two.gap).toBeLessThan(one.gap);
      expect(two.gap).toBeGreaterThanOrEqual(GEN.phase2GapMin);
      expect(two.maxChain).toBeGreaterThanOrEqual(GEN.phase2ChainMin);
      expect(two.maxChain).toBeGreaterThanOrEqual(one.maxChain);
      expect(two.chainChance).toBeGreaterThanOrEqual(GEN.phase2ChainChanceMin);
      expect(two.walkSpeed).toBeGreaterThan(one.walkSpeed);
      expect(two.retreatSpeed).toBeGreaterThan(one.retreatSpeed);
    }
  });

  it('keeps every first-phase attack in the second phase, with the same weight but the twist', () => {
    for (const seed of SEEDS) {
      const boss = generateBoss(seed);
      const [one, two] = boss.phases as [BossDef['phases'][0], BossDef['phases'][0]];
      for (const entry of one.attacks) {
        const kept = two.attacks.find((a) => a.id === entry.id);
        expect(kept, `${seed}: ${entry.id}`).toBeDefined();
        expect(kept!.weight).toBeGreaterThanOrEqual(entry.weight);
      }
    }
  });

  it('never twists the counterable attack', () => {
    for (const seed of SEEDS) {
      const boss = generateBoss(seed);
      const twist = twistAttack(boss);
      if (twist !== null) expect(twist.class).toBe('mustDodge');
      const combos = boss.phases[1]!.combos ?? [];
      for (const combo of combos) expect(boss.attacks.find((a) => a.id === combo[0])!.class).toBe('mustDodge');
    }
  });

  it('uses every kind of twist somewhere in the sweep, and every boss has one', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const boss = generateBoss(seed);
      const two = boss.phases[1]!;
      const twist = twistAttack(boss);
      if (twist === null) {
        kinds.add(two.combos === undefined ? 'none' : 'followUp');
        continue;
      }
      const base = original(boss, twist);
      if (twist.hold !== undefined) kinds.add('delay');
      else if (twist.windup < base.windup) kinds.add('snap');
      else kinds.add('reach');
    }
    expect([...kinds].sort()).toEqual(['delay', 'followUp', 'reach', 'snap']);
  });
});

describe('each kind of twist', () => {
  const twisted = SEEDS.map((seed) => ({ seed, boss: generateBoss(seed) })).filter(({ boss }) => twistAttack(boss) !== null);

  it('opens the second phase with the twist, which is drawn more often than the others', () => {
    for (const { boss } of twisted) {
      const two = boss.phases[1]!;
      const twist = twistAttack(boss)!;
      expect(two.opening).toBe(twist.id);
      expect(two.attacks.find((a) => a.id === twist.id)!.weight).toBe(GEN.twistWeight);
    }
  });

  it('snap: a much shorter warning, never under the readability floor, with every later time moved up by the same amount', () => {
    let seen = 0;
    for (const { boss } of twisted) {
      const twist = twistAttack(boss)!;
      const base = original(boss, twist);
      if (twist.windup >= base.windup || twist.hold !== undefined) continue;
      if (twist.range.max !== base.range.max) continue;
      seen += 1;
      const cut = base.windup - twist.windup;
      expect(cut).toBeGreaterThanOrEqual(GEN.snapMinCut);
      const fast = base.leap !== undefined || (base.move !== undefined && base.move.speed >= GEN.moveFastSpeed);
      expect(twist.windup).toBeGreaterThanOrEqual(fast ? GEN.leapWindupMin : GEN.windupMin);
      expect(twist.pose).toBe(base.pose);
      expect(twist.active).toBe(base.active);
      expect(twist.recovery).toBe(base.recovery);
      expect(twist.hits.map((h) => h.from + cut)).toEqual(base.hits.map((h) => h.from));
      expect(twist.hits.map((h) => h.to + cut)).toEqual(base.hits.map((h) => h.to));
      if (base.move !== undefined) expect(twist.move!.from + cut).toBe(base.move.from);
      if (base.leap !== undefined) expect(twist.leap!.from + cut).toBe(base.leap.from);
      for (let i = 0; i < (base.shots ?? []).length; i++) expect(twist.shots![i]!.at + cut).toBe(base.shots![i]!.at);
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('reach: the same timing, a wider hit box or bigger shots, and it starts from further away', () => {
    let seen = 0;
    for (const { boss } of twisted) {
      const twist = twistAttack(boss)!;
      const base = original(boss, twist);
      if (twist.range.max === base.range.max) continue;
      seen += 1;
      expect(twist.windup).toBe(base.windup);
      expect(twist.range.max).toBeGreaterThan(base.range.max);
      for (let i = 0; i < base.hits.length; i++) expect(twist.hits[i]!.x1).toBeGreaterThan(base.hits[i]!.x1);
      for (let i = 0; i < (base.shots ?? []).length; i++) {
        const a = base.shots![i]!;
        const b = twist.shots![i]!;
        if (a.kind === 'bolt' && b.kind === 'bolt') expect(b.size).toBeGreaterThanOrEqual(a.size);
        if (a.kind === 'arc' && b.kind === 'arc') expect(b.radius).toBeGreaterThanOrEqual(a.radius);
        if (a.kind === 'eruption' && b.kind === 'eruption') expect(b.width).toBeGreaterThanOrEqual(a.width);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('delay: the strike is held back by a few updates, on an attack that can be held', () => {
    let seen = 0;
    for (const { boss } of twisted) {
      const twist = twistAttack(boss)!;
      if (twist.hold === undefined) continue;
      seen += 1;
      expect(twist.hold).toBeGreaterThanOrEqual(GEN.holdMin);
      expect(twist.hold).toBeLessThanOrEqual(GEN.holdMax);
      expect(twist.class).toBe('mustDodge');
      expect(twist.shots).toBeUndefined();
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('follow-up: adds no attack, a combo of two must-dodge attacks starting at the favoured one', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const boss = generateBoss(seed);
      const two = boss.phases[1]!;
      if (twistAttack(boss) !== null || two.combos === undefined) continue;
      seen += 1;
      expect(two.combos).toHaveLength(1);
      const [first, second] = two.combos[0]!;
      expect(first).not.toBe(second);
      expect(two.attacks.find((a) => a.id === first)!.weight).toBe(GEN.twistWeight);
      expect(boss.attacks.find((a) => a.id === second)!.class).toBe('mustDodge');
      expect(two.opening).toBeUndefined();
    }
    expect(seen).toBeGreaterThan(5);
  });
});

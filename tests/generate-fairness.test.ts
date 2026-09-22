import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, TRAINEE } from '../src/bosses';
import { checkFairness } from '../src/bosses/generate/fairness';
import type { BossDef } from '../src/bosses/schema';

/** A minimal, otherwise-valid boss to build fixtures from: one phase, one attack, no arena. */
function baseBoss(overrides: Partial<BossDef> = {}): BossDef {
  return {
    id: 'fixture',
    name: 'Fixture Boss',
    width: 80,
    height: 100,
    startX: 960,
    maxHp: 10,
    spacing: { min: 150, max: 250 },
    approachTimeout: 45,
    predictability: 0.2,
    counter: { window: 10, range: 200, staggerTicks: 80, damageMultiplier: 2 },
    transitionTicks: 60,
    attacks: [
      {
        id: 'poke',
        name: 'Poke',
        pose: 'sideways',
        class: 'mustDodge',
        damage: 1,
        windup: 24,
        active: 8,
        recovery: 24,
        range: { min: 110, max: 200 },
        hits: [{ from: 24, to: 32, x0: 0, x1: 250, bottom: 0, top: 100 }],
      },
    ],
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: [{ id: 'poke', weight: 1 }],
        gap: 40,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 300,
        retreatSpeed: 260,
      },
    ],
    ...overrides,
  };
}

describe('checkFairness', () => {
  it('passes the real Ember Duelist, with no reasons', () => {
    const result = checkFairness(EMBER_DUELIST);
    expect(result.reasons).toEqual([]);
    expect(result.fair).toBe(true);
  });

  it('passes the real Ashen Hound, with no reasons', () => {
    const result = checkFairness(ASHEN_HOUND);
    expect(result.reasons).toEqual([]);
    expect(result.fair).toBe(true);
  });

  it('passes the real Trainee, with no reasons', () => {
    const result = checkFairness(TRAINEE);
    expect(result.reasons).toEqual([]);
    expect(result.fair).toBe(true);
  });

  it('is fast enough on the real Ember Duelist (smoke check, not a strict budget)', () => {
    const start = performance.now();
    checkFairness(EMBER_DUELIST);
    const elapsed = performance.now() - start;
    console.log(`checkFairness(EMBER_DUELIST) took ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(2000);
  });

  it('does not mutate the boss it is given', () => {
    const before = JSON.parse(JSON.stringify(EMBER_DUELIST));
    checkFairness(EMBER_DUELIST);
    expect(EMBER_DUELIST).toEqual(before);
  });

  it('fails a boss whose only attack can never reach an idle player (never stalls-into-a-loss)', () => {
    // The hit window sits right at the boss's own centre (x0 0, x1 1) while the attack only
    // triggers from far away (range.min 220): the window can never overlap an idle player.
    const boss = baseBoss({
      attacks: [
        {
          id: 'poke',
          name: 'Poke',
          pose: 'sideways',
          class: 'mustDodge',
          damage: 1,
          windup: 24,
          active: 8,
          recovery: 24,
          range: { min: 220, max: 320 },
          hits: [{ from: 24, to: 32, x0: 0, x1: 1, bottom: 0, top: 100 }],
        },
      ],
    });
    const result = checkFairness(boss);
    expect(result.fair).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('idle'))).toBe(true);
  });

  it('fails a boss that is unbeatable inside the cap (absurd maxHp)', () => {
    const boss = baseBoss({ maxHp: 100_000 });
    const result = checkFairness(boss);
    expect(result.fair).toBe(false);
    expect(result.reasons.some((r) => /skilled|cap/i.test(r))).toBe(true);
  });

  it('fails a boss whose attack is unreadable (a hit window wider and longer than a dash can escape)', () => {
    // A hit box that reaches 400 units either side of the boss (farther than a full dash, ~266
    // units, can carry the player) and stays active for 40 updates (far longer than the dash's
    // 11-update invulnerability): no dash timing can escape or outlast it.
    const boss = baseBoss({
      attacks: [
        {
          id: 'sweep',
          name: 'Low sweep',
          pose: 'sideways',
          class: 'mustDodge',
          damage: 1,
          windup: 5,
          active: 40,
          recovery: 24,
          range: { min: 110, max: 200 },
          hits: [{ from: 5, to: 45, x0: -400, x1: 400, bottom: 0, top: 150 }],
        },
      ],
      phases: [
        {
          name: 'Only phase',
          startsAtHpFraction: 1,
          attacks: [{ id: 'sweep', weight: 1 }],
          gap: 40,
          maxChain: 1,
          chainChance: 0,
          walkSpeed: 300,
          retreatSpeed: 260,
        },
      ],
    });
    const result = checkFairness(boss);
    expect(result.fair).toBe(false);
  });
});

describe('the camp-safety check', () => {
  it("fails a boss whose platform sits above every attack's reach", () => {
    const boss = baseBoss({
      arena: { platforms: [{ x: 900, width: 200, height: 220 }], covers: [] },
    });
    // The fixture's one attack has hit window top: 100 — well under 220, so nothing on the
    // platform can ever be hit.
    const result = checkFairness(boss);
    expect(result.fair).toBe(false);
    expect(result.reasons.some((r) => r.includes('camping'))).toBe(true);
  });

  it("passes a boss whose platform stays inside the attack's reach", () => {
    const boss = baseBoss({
      arena: { platforms: [{ x: 900, width: 200, height: 60 }], covers: [] },
    });
    // Height 60 is under the fixture's hit window top of 100, so the platform is reachable.
    expect(checkFairness(boss).fair).toBe(true);
  });

  it('is unaffected by a boss with no arena', () => {
    expect(checkFairness(EMBER_DUELIST).fair).toBe(true);
  });

  it('the Ashen Hound passes the camp-safety check on its own shipped arena', () => {
    expect(checkFairness(ASHEN_HOUND).fair).toBe(true);
  });
});

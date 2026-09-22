import { describe, expect, it } from 'vitest';
import { generateArena } from '../src/bosses/generate/arena';
import { GEN } from '../src/bosses/generate/tuning';
import { parseBoss } from '../src/bosses/parse';
import type { ArenaDef, BossDef } from '../src/bosses/schema';

/** A minimal, otherwise-valid boss to hang a generated arena off, so `parseBoss` can check it. */
function baseBoss(arena: ArenaDef | undefined): BossDef {
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
        walkSpeed: 200,
        retreatSpeed: 150,
      },
    ],
    ...(arena === undefined ? {} : { arena }),
  };
}

describe('generateArena', () => {
  it('never throws, and every result parses as part of a whole boss, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      expect(() => parseBoss(baseBoss(arena))).not.toThrow();
    }
  });

  it('is deterministic for the same seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(generateArena(seed)).toEqual(generateArena(seed));
    }
  });

  it('is bare roughly GEN.arenaBareChance of the time, over a large sweep', () => {
    let bare = 0;
    const total = 500;
    for (let seed = 1; seed <= total; seed++) {
      if (generateArena(seed).value === undefined) bare++;
    }
    const rate = bare / total;
    expect(rate).toBeGreaterThan(GEN.arenaBareChance - 0.1);
    expect(rate).toBeLessThan(GEN.arenaBareChance + 0.1);
  });

  it('has 1 to 3 pieces total when not bare, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      const total = arena.platforms.length + arena.covers.length;
      expect(total).toBeGreaterThanOrEqual(GEN.arenaPieceCountMin);
      expect(total).toBeLessThanOrEqual(GEN.arenaPieceCountMax);
    }
  });

  it('never puts cover over the player start (x = 320)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      for (const c of arena.covers) {
        const overStart = c.x - c.width / 2 <= 320 && 320 < c.x + c.width / 2;
        expect(overStart).toBe(false);
      }
    }
  });

  it('keeps every pair of pieces at least GEN.arenaMinHeightGap apart in height', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      const heights = [...arena.platforms, ...arena.covers].map((p) => p.height);
      for (let i = 0; i < heights.length; i++) {
        for (let j = i + 1; j < heights.length; j++) {
          expect(Math.abs(heights[i]! - heights[j]!)).toBeGreaterThanOrEqual(GEN.arenaMinHeightGap);
        }
      }
    }
  });

  it('caps generated cover below the jumpable height (GEN.arenaCoverHeightMax)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      for (const c of arena.covers) expect(c.height).toBeLessThanOrEqual(GEN.arenaCoverHeightMax);
    }
  });
});

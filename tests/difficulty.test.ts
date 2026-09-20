import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import {
  DIALS,
  NORMAL_DIALS,
  PRESETS,
  applyDials,
  changedDials,
  clampDial,
  dialsEqual,
  type Dials,
} from '../src/game/difficulty';
import { nextRandom } from '../src/game/rng';
import { DUELIST } from './helpers';

const only = (over: Partial<Dials>): Dials => ({ ...NORMAL_DIALS, ...over });

function randomDials(seed: number): Dials {
  let state = seed;
  const out: Record<string, number> = {};
  for (const dial of DIALS) {
    const next = nextRandom(state);
    state = next.state;
    out[dial.id] = clampDial(dial.id, dial.min + next.value * (dial.max - dial.min));
  }
  return out as Dials;
}

describe('the dial definitions', () => {
  it('cover exactly the seven dials the owner asked for, each containing 1 in its range', () => {
    expect(DIALS.map((d) => d.id)).toEqual([
      'speed',
      'frequency',
      'readability',
      'health',
      'damage',
      'range',
      'variety',
    ]);
    for (const d of DIALS) {
      expect(d.min).toBeLessThanOrEqual(1);
      expect(d.max).toBeGreaterThanOrEqual(1);
      expect(d.step).toBeGreaterThan(0);
    }
    expect(NORMAL_DIALS).toEqual(Object.fromEntries(DIALS.map((d) => [d.id, 1])));
  });

  it('have three presets, and every preset value lies inside its dial range', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['easy', 'normal', 'hard']);
    expect(PRESETS[1]!.dials).toEqual(NORMAL_DIALS);
    for (const preset of PRESETS) {
      for (const d of DIALS) {
        expect(preset.dials[d.id]).toBeGreaterThanOrEqual(d.min);
        expect(preset.dials[d.id]).toBeLessThanOrEqual(d.max);
      }
    }
  });
});

describe('clampDial, dialsEqual and changedDials', () => {
  it('clamps to the range and snaps to the step', () => {
    expect(clampDial('speed', 5)).toBe(1.4);
    expect(clampDial('speed', 0)).toBe(0.7);
    expect(clampDial('speed', 1.234)).toBe(1.25);
    expect(clampDial('damage', 2.4)).toBe(2);
    expect(clampDial('frequency', 1.04)).toBe(1);
  });

  it('compares dial sets and lists what changed', () => {
    expect(dialsEqual(NORMAL_DIALS, { ...NORMAL_DIALS })).toBe(true);
    expect(dialsEqual(NORMAL_DIALS, only({ health: 1.1 }))).toBe(false);
    expect(changedDials(NORMAL_DIALS, only({ health: 1.1, damage: 2 }))).toEqual(['health', 'damage']);
    expect(changedDials(NORMAL_DIALS, NORMAL_DIALS)).toEqual([]);
  });
});

describe('applyDials', () => {
  it('changes nothing at the Normal dials', () => {
    expect(applyDials(DUELIST, NORMAL_DIALS)).toEqual(DUELIST);
  });

  it('never modifies the boss it is given', () => {
    const before = JSON.stringify(DUELIST);
    applyDials(DUELIST, PRESETS[2]!.dials);
    expect(JSON.stringify(DUELIST)).toBe(before);
  });

  it.each(PRESETS)('gives a valid boss for the $label preset', ({ dials }) => {
    expect(() => applyDials(DUELIST, dials)).not.toThrow();
  });

  it('gives a valid boss at both ends of every dial, together, and for many random mixes', () => {
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(() => applyDials(DUELIST, only({ [dial.id]: value }))).not.toThrow();
      }
    }
    const lows = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highs = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(DUELIST, lows)).not.toThrow();
    expect(() => applyDials(DUELIST, highs)).not.toThrow();
    for (let seed = 1; seed <= 200; seed++) {
      expect(() => applyDials(DUELIST, randomDials(seed))).not.toThrow();
    }
  });

  it('speed scales walking and moves and shortens recovery', () => {
    const fast = applyDials(DUELIST, only({ speed: 1.2 }));
    DUELIST.phases.forEach((p, i) => {
      expect(fast.phases[i]!.walkSpeed).toBeCloseTo(p.walkSpeed * 1.2, 6);
      expect(fast.phases[i]!.retreatSpeed).toBeCloseTo(p.retreatSpeed * 1.2, 6);
    });
    DUELIST.attacks.forEach((a, i) => {
      expect(fast.attacks[i]!.recovery).toBe(Math.round(a.recovery / 1.2));
      if (a.move) expect(fast.attacks[i]!.move!.speed).toBeCloseTo(a.move.speed * 1.2, 6);
    });
  });

  it('frequency divides the pause between attacks', () => {
    const often = applyDials(DUELIST, only({ frequency: 2 }));
    DUELIST.phases.forEach((p, i) => expect(often.phases[i]!.gap).toBe(Math.round(p.gap / 2)));
  });

  it('readability scales every warning and shifts hit windows and moves with it', () => {
    const easier = applyDials(DUELIST, only({ readability: 1.5 }));
    DUELIST.attacks.forEach((a, i) => {
      const b = easier.attacks[i]!;
      const windup = Math.round(a.windup * 1.5);
      const shift = windup - a.windup;
      expect(b.windup).toBe(windup);
      expect(b.active).toBe(a.active);
      b.hits.forEach((hit, j) => {
        expect(hit.from).toBe(a.hits[j]!.from + shift);
        expect(hit.to).toBe(a.hits[j]!.to + shift);
      });
      if (a.move) {
        expect(b.move!.from).toBe(a.move.from + shift);
        expect(b.move!.to).toBe(a.move.to + shift);
      }
    });
  });

  it('readability never shortens a counterable warning below the counter window', () => {
    const wide: BossDef = { ...DUELIST, counter: { ...DUELIST.counter, window: 25 } };
    const hard = applyDials(wide, only({ readability: 0.7 }));
    expect(hard.attacks.find((a) => a.id === 'slam')!.windup).toBe(25);
    expect(hard.attacks.find((a) => a.id === 'sweep')!.windup).toBe(
      Math.round(DUELIST.attacks.find((a) => a.id === 'sweep')!.windup * 0.7),
    );
  });

  it('health scales the boss health, rounded, never below 1', () => {
    expect(applyDials(DUELIST, only({ health: 1.4 })).maxHp).toBe(Math.round(DUELIST.maxHp * 1.4));
    expect(applyDials(DUELIST, only({ health: 0.5 })).maxHp).toBe(Math.round(DUELIST.maxHp * 0.5));
  });

  it('damage scales what every attack costs, at least 1', () => {
    expect(applyDials(DUELIST, only({ damage: 2 })).attacks.every((a) => a.damage === 2)).toBe(true);
    expect(applyDials(DUELIST, only({ damage: 3 })).attacks.every((a) => a.damage === 3)).toBe(true);
  });

  it('range scales the reach of the hit windows and the distance attacks start from, keeping the burst continuous', () => {
    const far = applyDials(DUELIST, only({ range: 1.2 }));
    DUELIST.attacks.forEach((a, i) => {
      const b = far.attacks[i]!;
      expect(b.range.min).toBeCloseTo(a.range.min * 1.2, 6);
      expect(b.range.max).toBeCloseTo(a.range.max * 1.2, 6);
      b.hits.forEach((hit, j) => {
        expect(hit.x0).toBeCloseTo(a.hits[j]!.x0 * 1.2, 6);
        expect(hit.x1).toBeCloseTo(a.hits[j]!.x1 * 1.2, 6);
      });
    });
    const burst = far.attacks.find((a) => a.id === 'burst')!;
    for (let i = 1; i < burst.hits.length; i++) {
      expect(burst.hits[i]!.x0).toBeCloseTo(burst.hits[i - 1]!.x1, 6);
    }
  });

  it('variety keeps the most frequent attacks of each phase, at least one', () => {
    const fewer = applyDials(DUELIST, only({ variety: 0.65 }));
    DUELIST.phases.forEach((p, i) => {
      const kept = fewer.phases[i]!.attacks;
      expect(kept).toHaveLength(Math.max(1, Math.round(p.attacks.length * 0.65)));
      const removed = p.attacks.filter((a) => !kept.some((k) => k.id === a.id));
      const lowestKept = Math.min(...kept.map((k) => k.weight));
      for (const r of removed) expect(r.weight).toBeLessThanOrEqual(lowestKept);
      // The kept attacks stay in their original order.
      const order = p.attacks.map((a) => a.id).filter((id) => kept.some((k) => k.id === id));
      expect(kept.map((k) => k.id)).toEqual(order);
    });
    const minimal = applyDials(DUELIST, only({ variety: 0.5 }));
    expect(minimal.phases.every((p) => p.attacks.length >= 1)).toBe(true);
  });
});

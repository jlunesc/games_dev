import { describe, expect, it } from 'vitest';
import { DIALS, NORMAL_DIALS, clampDial, presetDials, redoDials, type DialId, type Dials } from '../src/game/difficulty';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

const differing = (a: Dials, b: Dials): DialId[] => DIALS.filter((d) => a[d.id] !== b[d.id]).map((d) => d.id);

/** The dial values at their hardest, except the ones named, which stay at Normal. */
function hardestExcept(open: readonly DialId[]): Dials {
  const dials = { ...NORMAL_DIALS };
  const harderIsUp: Record<DialId, boolean> = {
    speed: true,
    frequency: true,
    readability: false,
    health: true,
    damage: true,
    range: true,
    variety: true,
  };
  for (const d of DIALS) {
    if (d.id === 'damage' || open.includes(d.id)) continue;
    dials[d.id] = harderIsUp[d.id] ? d.max : d.min;
  }
  return dials;
}

describe('redoDials', () => {
  it('changes exactly one dial by one step after a win, in the harder direction', () => {
    for (const seed of SEEDS) {
      const redo = redoDials(NORMAL_DIALS, true, seed);
      expect(redo.change).not.toBeNull();
      const change = redo.change!;
      expect(differing(NORMAL_DIALS, redo.dials)).toEqual([change.dial]);
      const step = DIALS.find((d) => d.id === change.dial)!.step;
      expect(Math.abs(change.to - change.from)).toBeCloseTo(step, 9);
      expect(change.harder).toBe(true);
      expect(redo.dials[change.dial]).toBe(change.to);
      // Warning length is the one dial where less means harder.
      const wentUp = change.to > change.from;
      expect(wentUp).toBe(change.dial !== 'readability');
    }
  });

  it('changes one dial one step in the easier direction after a loss', () => {
    for (const seed of SEEDS) {
      const redo = redoDials(NORMAL_DIALS, false, seed);
      const change = redo.change!;
      expect(change.harder).toBe(false);
      expect(differing(NORMAL_DIALS, redo.dials)).toEqual([change.dial]);
      const wentUp = change.to > change.from;
      expect(wentUp).toBe(change.dial === 'readability');
    }
  });

  it('never picks damage, and always sets damage to 1', () => {
    const hard = presetDials('hard');
    expect(hard.damage).toBe(2);
    for (const seed of SEEDS) {
      for (const won of [true, false]) {
        const redo = redoDials(hard, won, seed);
        expect(redo.dials.damage).toBe(1);
        expect(redo.change?.dial).not.toBe('damage');
      }
    }
  });

  it('can pick every dial except damage', () => {
    const roomToMove = { ...NORMAL_DIALS, variety: 0.8 };
    const picked = new Set(SEEDS.map((seed) => redoDials(roomToMove, true, seed).change!.dial));
    expect([...picked].sort()).toEqual(
      DIALS.map((d) => d.id)
        .filter((id) => id !== 'damage')
        .sort(),
    );
  });

  it('is the same for the same seed', () => {
    expect(redoDials(NORMAL_DIALS, true, 12345)).toEqual(redoDials(NORMAL_DIALS, true, 12345));
  });

  it('keeps every dial inside its range and on its step', () => {
    for (const seed of SEEDS) {
      const redo = redoDials(presetDials('easy'), true, seed);
      for (const d of DIALS) expect(redo.dials[d.id]).toBe(clampDial(d.id, redo.dials[d.id]));
    }
  });

  it('skips a dial that cannot go further in that direction', () => {
    const dials = hardestExcept(['health']);
    for (const seed of SEEDS) {
      expect(redoDials(dials, true, seed).change?.dial).toBe('health');
    }
  });

  it('changes nothing, but still sets damage to 1, when no dial can move', () => {
    const dials = hardestExcept([]);
    dials.damage = 3;
    const redo = redoDials(dials, true, 99);
    expect(redo.change).toBeNull();
    expect(redo.dials).toEqual({ ...dials, damage: 1 });
  });

  it('does not change the dials it was given', () => {
    const dials = { ...NORMAL_DIALS };
    redoDials(dials, true, 5);
    expect(dials).toEqual(NORMAL_DIALS);
  });
});

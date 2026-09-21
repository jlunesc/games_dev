import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import type { AttackDef, BossDef } from '../src/bosses/schema';
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
    const beforeMoving = JSON.stringify(MOVING);
    for (const preset of PRESETS) {
      applyDials(DUELIST, preset.dials);
      applyDials(MOVING, preset.dials);
    }
    expect(JSON.stringify(DUELIST)).toBe(before);
    expect(JSON.stringify(MOVING)).toBe(beforeMoving);
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

/** Moving attacks: leaps of every target, a forward and a back slip and a plain attack, next to the Duelist's own. */
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
  leap: { from: 30, to: 52, height: 200, target: 'forward', distance: 300 },
  hits: [{ from: 52, to: 58, x0: 0, x1: 200, bottom: 0, top: 60 }],
};
const seek: AttackDef = { ...pounce, id: 'seek', leap: { from: 30, to: 52, height: 200, target: 'player' } };
const backHop: AttackDef = {
  ...pounce,
  id: 'backHop',
  leap: { from: 30, to: 52, height: 200, target: 'back', distance: 300 },
  hits: [],
};
const slip: AttackDef = {
  id: 'slip',
  name: 'Slip',
  pose: 'crouch',
  class: 'mustDodge',
  damage: 1,
  windup: 18,
  active: 10,
  recovery: 14,
  range: { min: 0, max: 1e9 },
  move: { from: 18, to: 28, speed: 1400 },
  hits: [],
};
const slipBack: AttackDef = { ...slip, id: 'slipBack', move: { from: 18, to: 28, speed: 1400, dir: 'back' } };
const movers = [pounce, seek, backHop, slip, slipBack];
const MOVING: BossDef = { ...DUELIST, attacks: [...DUELIST.attacks, ...movers] };

const attackOf = (boss: BossDef, id: string): AttackDef => boss.attacks.find((a) => a.id === id)!;

function extremeDials(): Dials[] {
  const list: Dials[] = [];
  for (const dial of DIALS) for (const value of [dial.min, dial.max]) list.push(only({ [dial.id]: value }));
  list.push(Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials);
  list.push(Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials);
  for (const preset of PRESETS) list.push(preset.dials);
  for (let seed = 1; seed <= 200; seed++) list.push(randomDials(seed));
  return list;
}

describe('applyDials with an arena', () => {
  it('keeps the arena exactly, at Normal and at every dial extreme', () => {
    expect(ASHEN_HOUND.arena).toBeDefined();
    expect(DUELIST.arena).toBeUndefined();
    expect(applyDials(ASHEN_HOUND, NORMAL_DIALS).arena).toEqual(ASHEN_HOUND.arena);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(applyDials(ASHEN_HOUND, only({ [dial.id]: value })).arena).toEqual(ASHEN_HOUND.arena);
      }
    }
    expect(applyDials(DUELIST, NORMAL_DIALS)).not.toHaveProperty('arena');
  });
});

describe('applyDials with leaps and move directions', () => {
  it('leaves the moving attacks exactly as written at the Normal dials', () => {
    const adjusted = applyDials(MOVING, NORMAL_DIALS);
    for (const attack of movers) expect(attackOf(adjusted, attack.id)).toEqual(attack);
    expect(adjusted).toEqual(MOVING);
  });

  it('keeps the direction of a move under every preset and dial extreme', () => {
    for (const dials of extremeDials()) {
      const adjusted = applyDials(MOVING, dials);
      expect(attackOf(adjusted, 'slipBack').move!.dir).toBe('back');
      expect('dir' in attackOf(adjusted, 'slip').move!).toBe(false);
    }
  });

  it('shifts a leap by exactly the windup change and keeps its flight length', () => {
    for (const readability of [0.7, 1.6]) {
      const adjusted = applyDials(MOVING, only({ readability }));
      for (const original of [pounce, seek, backHop]) {
        const b = attackOf(adjusted, original.id);
        const shift = b.windup - original.windup;
        expect(shift).not.toBe(0);
        expect(b.windup).toBe(Math.round(original.windup * readability));
        expect(b.leap!.from).toBe(original.leap!.from + shift);
        expect(b.leap!.to).toBe(original.leap!.to + shift);
        expect(b.leap!.to - b.leap!.from).toBe(original.leap!.to - original.leap!.from);
        expect(b.leap!.target).toBe(original.leap!.target);
      }
    }
  });

  it('shifts the times of a counterable leap by the ACTUAL windup change when the warning hits its floor', () => {
    const window = DUELIST.counter.window;
    const counterPounce: AttackDef = {
      ...pounce,
      id: 'counterPounce',
      class: 'counterable',
      windup: window + 4,
      active: 30,
      leap: { from: window + 4, to: window + 26, height: 200, target: 'forward', distance: 300 },
      hits: [{ from: window + 26, to: window + 32, x0: 0, x1: 200, bottom: 0, top: 60 }],
    };
    const boss: BossDef = { ...DUELIST, attacks: [...DUELIST.attacks, counterPounce] };
    // 0.7 would take the warning below the counter window, so it stops at the window.
    expect(Math.round(counterPounce.windup * 0.7)).toBeLessThan(window);
    const b = attackOf(applyDials(boss, only({ readability: 0.7 })), 'counterPounce');
    const shift = window - counterPounce.windup;
    expect(b.windup).toBe(window);
    expect(shift).not.toBe(Math.round(counterPounce.windup * 0.7) - counterPounce.windup);
    expect(b.leap!.from).toBe(counterPounce.leap!.from + shift);
    expect(b.leap!.to).toBe(counterPounce.leap!.to + shift);
    expect(b.hits[0]!.from).toBe(counterPounce.hits[0]!.from + shift);
    expect(b.leap!.from).toBe(b.windup);
  });

  it('never takes a leap distance below the parser minimum of 1', () => {
    const tiny: AttackDef = { ...pounce, id: 'tiny', leap: { from: 30, to: 52, height: 200, target: 'forward', distance: 1 } };
    const boss: BossDef = { ...DUELIST, attacks: [...DUELIST.attacks, tiny] };
    let adjusted: BossDef | undefined;
    expect(() => {
      adjusted = applyDials(boss, only({ range: 0.8 }));
    }).not.toThrow();
    expect(attackOf(adjusted!, 'tiny').leap!.distance).toBe(1);
  });

  it('scales the leap distance with the range dial and leaves the height and flight length alone', () => {
    for (const range of [0.8, 1.2]) {
      const adjusted = applyDials(MOVING, only({ range }));
      for (const original of [pounce, backHop]) {
        const b = attackOf(adjusted, original.id);
        expect(b.leap!.distance).toBeCloseTo(original.leap!.distance! * range, 6);
        expect(b.leap!.height).toBe(original.leap!.height);
        expect(b.leap!.from).toBe(original.leap!.from);
        expect(b.leap!.to).toBe(original.leap!.to);
      }
      const b = attackOf(adjusted, 'seek');
      expect(b.leap!.distance).toBeUndefined();
      expect(b.leap!.height).toBe(200);
    }
  });

  it('leaves the flight length and height alone under every dial, and keeps leaps inside the active updates', () => {
    for (const dials of extremeDials()) {
      const adjusted = applyDials(MOVING, dials);
      for (const original of [pounce, seek, backHop]) {
        const b = attackOf(adjusted, original.id);
        expect(b.leap!.to - b.leap!.from).toBe(original.leap!.to - original.leap!.from);
        expect(b.leap!.height).toBe(original.leap!.height);
        expect(b.leap!.from).toBeGreaterThanOrEqual(b.windup);
        expect(b.leap!.to).toBeLessThanOrEqual(b.windup + b.active);
      }
    }
  });

  it('keeps a reposition-only attack valid at every dial setting', () => {
    for (const dials of extremeDials()) {
      const adjusted = applyDials(MOVING, dials);
      for (const id of ['backHop', 'slip', 'slipBack']) expect(attackOf(adjusted, id).hits).toEqual([]);
    }
  });
});

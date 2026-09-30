import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength, beginTransition } from '../src/game/boss';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { attackIds, customBoss, melee, windupUpdates } from './boss-helpers';
import { advance, run } from './helpers';

const attacks = [melee('a'), melee('b'), melee('c'), melee('x')];

/** Only `a` is in the phase list; `b` and `c` can only ever be reached through the combo. */
const comboBoss = (): BossDef =>
  customBoss(attacks, { attacks: [{ id: 'a', weight: 1 }], combos: [['a', 'b', 'c']] });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

describe('combos: parsing', () => {
  it('accepts a combo and per-phase spacing', () => {
    const data = clone(comboBoss());
    data.phases[0].spacing = { min: 100, max: 200 };
    const boss = parseBoss(data);
    expect(boss.phases[0]!.combos).toEqual([['a', 'b', 'c']]);
    expect(boss.phases[0]!.spacing).toEqual({ min: 100, max: 200 });
  });

  it('rejects a bad combo', () => {
    const tooShort = clone(comboBoss());
    tooShort.phases[0].combos = [['a']];
    expect(() => parseBoss(tooShort)).toThrow(/combos\[0\]/);
    const tooLong = clone(comboBoss());
    tooLong.phases[0].combos = [['a', 'b', 'c', 'b', 'c']];
    expect(() => parseBoss(tooLong)).toThrow(/combos\[0\]/);
    const unknown = clone(comboBoss());
    unknown.phases[0].combos = [['a', 'nope']];
    expect(() => parseBoss(unknown)).toThrow(/unknown attack "nope"/);
    const firstNotInPhase = clone(comboBoss());
    firstNotInPhase.phases[0].combos = [['b', 'c']];
    expect(() => parseBoss(firstNotInPhase)).toThrow(/first step/);
    const sameFirst = clone(comboBoss());
    sameFirst.phases[0].combos = [['a', 'b'], ['a', 'c']];
    expect(() => parseBoss(sameFirst)).toThrow(/same attack/);
  });

  it('treats an empty combo list as no combos and rejects spacing whose max is not above its min', () => {
    const empty = clone(comboBoss());
    empty.phases[0].combos = [];
    expect('combos' in parseBoss(empty).phases[0]!).toBe(false);
    const bad = clone(comboBoss());
    bad.phases[0].spacing = { min: 300, max: 300 };
    expect(() => parseBoss(bad)).toThrow(/spacing/);
  });
});

describe('combos: playing', () => {
  it('runs the steps one straight after another, then waits again', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 3);
    s.player.health = 1e9;
    const states = run(s, 200, () => NO_INPUT, boss);
    const ids = attackIds(states);
    expect(ids.slice(0, 6)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    const winds = windupUpdates(states);
    const length = attackLength(attacks[0]!);
    expect(winds[1]! - winds[0]!).toBe(length + 1);
    expect(winds[2]! - winds[1]!).toBe(length + 1);
    expect(winds[3]! - winds[2]!).toBeGreaterThan(length + 1);
  });

  it('starts no combo during the study', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 3, 1);
    s.player.health = 1e9;
    const states = run(s, 120, () => NO_INPUT, boss);
    const studied = states.filter((x) => x.study.active);
    expect(studied.length).toBeGreaterThan(0);
    expect(studied.every((x) => x.boss.comboQueue.length === 0)).toBe(true);
  });

  it('forgets the rest of a combo when the boss changes phase', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 1);
    s.boss.comboQueue = ['b', 'c'];
    beginTransition(s, boss);
    expect(s.boss.comboQueue).toEqual([]);
  });
});

describe('combos: difficulty dials', () => {
  it('keeps a combo only while its first step is still in the phase', () => {
    const boss = customBoss(
      attacks,
      {
        attacks: [
          { id: 'a', weight: 1 },
          { id: 'x', weight: 5 },
        ],
        combos: [
          ['a', 'b'],
          ['x', 'c'],
        ],
      },
    );
    const full = applyDials(boss, NORMAL_DIALS);
    expect(full.phases[0]!.combos).toEqual([['a', 'b'], ['x', 'c']]);
    const fewer = applyDials(boss, { ...NORMAL_DIALS, variety: 0.5 });
    expect(fewer.phases[0]!.attacks.map((e) => e.id)).toEqual(['x']);
    expect(fewer.phases[0]!.combos).toEqual([['x', 'c']]);
  });
});

describe('per-phase spacing', () => {
  const stand = (phaseSpacing: { min: number; max: number } | undefined): number => {
    const boss = customBoss(
      [melee('a')],
      {
        attacks: [{ id: 'a', weight: 1 }],
        gap: 1e6,
        retreatSpeed: 600,
        ...(phaseSpacing === undefined ? {} : { spacing: phaseSpacing }),
      },
    );
    const s = createInitialState(boss, 1);
    s.boss.x = 700;
    s.player.x = 600;
    s.player.prevX = 600;
    const end = advance(s, 60, NO_INPUT, boss);
    return Math.abs(end.boss.x - end.player.x);
  };

  it('backs the boss off to the phase distance, and leaves it alone without one', () => {
    expect(stand({ min: 300, max: 400 })).toBeGreaterThanOrEqual(290);
    expect(stand(undefined)).toBeLessThan(110);
  });
});

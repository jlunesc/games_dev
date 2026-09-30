import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { temperLevel } from '../src/game/boss';
import { TEMPER } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { isWindup, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, run, withInput } from './helpers';

const FULL = TEMPER.start + TEMPER.ramp;

const strike = (id: string): AttackDef => ({
  id,
  name: id,
  pose: 'sideways',
  class: 'mustDodge',
  damage: 1,
  windup: 6,
  active: 4,
  recovery: 4,
  range: { min: 0, max: 1e9 },
  hits: [{ from: 6, to: 10, x0: 0, x1: 50, bottom: 0, top: 50 }],
});

/** A boss with a light and a heavy attack of equal weight that never walks and never chains. */
function tempered(strength: number | undefined, gap = 1): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    predictability: 0,
    ...(strength === undefined ? {} : { temper: strength }),
    attacks: [strike('light'), strike('heavy')],
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: [
          { id: 'light', weight: 1 },
          { id: 'heavy', weight: 1, heavy: true },
        ],
        gap,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 100,
        retreatSpeed: 100,
      },
    ],
  };
}

/** The share of picks that are the heavy attack when the boss's temper is held at `temper` for the whole run. */
const heavyShare = (boss: BossDef, temper: number): number => {
  let s = createInitialState(boss, 7);
  s.player.health = 1e9;
  const ids: string[] = [];
  for (let n = 0; n < 4000; n++) {
    s.boss.temper = temper;
    s = step(s, NO_INPUT, boss);
    if (s.events.some(isWindup)) ids.push(s.boss.attackId ?? '');
  }
  return ids.filter((id) => id === 'heavy').length / ids.length;
};

describe('temper: parsing', () => {
  const base = JSON.parse(JSON.stringify(DUELIST)) as Record<string, unknown>;

  it('accepts a temper strength and a heavy flag', () => {
    const data = JSON.parse(JSON.stringify(base)) as { temper?: number; phases: { attacks: { heavy?: boolean }[] }[] };
    data.temper = 0.5;
    data.phases[0]!.attacks[0]!.heavy = true;
    const boss = parseBoss(data);
    expect(boss.temper).toBe(0.5);
    expect(boss.phases[0]!.attacks[0]!.heavy).toBe(true);
  });

  it('rejects a strength outside 0 to 1 and a heavy flag that is not true or false', () => {
    const tooBig = JSON.parse(JSON.stringify(base)) as { temper?: number };
    tooBig.temper = 2;
    expect(() => parseBoss(tooBig)).toThrow(/boss\.temper/);
    const badFlag = JSON.parse(JSON.stringify(base)) as { phases: { attacks: { heavy?: unknown }[] }[] };
    badFlag.phases[0]!.attacks[0]!.heavy = 'yes';
    expect(() => parseBoss(badFlag)).toThrow(/heavy/);
  });

  it('leaves a boss without the fields exactly as it was', () => {
    const boss = parseBoss(base);
    expect('temper' in boss).toBe(false);
    expect(boss.phases[0]!.attacks.every((a) => !('heavy' in a))).toBe(true);
  });
});

describe('temper: counting', () => {
  it('counts every update of a fight, stops at the cap, and does not count during the study', () => {
    const boss = tempered(1);
    const fight = run(createInitialState(boss, 1), 30, () => NO_INPUT, boss);
    expect(fight[29]!.boss.temper).toBe(30);
    const long = run(createInitialState(boss, 1), FULL + 50, () => NO_INPUT, boss);
    expect(long[long.length - 1]!.boss.temper).toBe(FULL);
    const studying = run(createInitialState(boss, 1, 1), 5, () => NO_INPUT, boss);
    expect(studying[4]!.boss.temper).toBe(0);
  });

  it('a hit lowers it by the relief amount', () => {
    const s = createInitialState(QUIET_BOSS, 1);
    s.boss.temper = 300;
    s.player.x = s.boss.x - 60;
    s.player.prevX = s.player.x;
    let state = s;
    let updates = 0;
    while (!state.events.includes('bossHit') && updates < 30) {
      state = step(state, withInput({ attackPressed: true }), QUIET_BOSS);
      updates += 1;
    }
    expect(state.events).toContain('bossHit');
    expect(state.boss.temper).toBe(300 + updates - TEMPER.relief);
  });
});

describe('temper: effect', () => {
  it('has no level without a strength, in the study, or in a pair fight', () => {
    const s = createInitialState(tempered(1), 1);
    s.boss.temper = FULL;
    expect(temperLevel(s, tempered(1), s.boss)).toBe(1);
    expect(temperLevel(s, tempered(undefined), s.boss)).toBe(0);
    expect(temperLevel({ ...s, study: { ...s.study, active: true } }, tempered(1), s.boss)).toBe(0);
    expect(temperLevel({ ...s, partners: [s.boss] }, tempered(1), s.boss)).toBe(0);
  });

  it('makes the heavy attack clearly more likely when it is high, and changes nothing without a strength', () => {
    const calm = heavyShare(tempered(1), 0);
    const angry = heavyShare(tempered(1), FULL);
    const none = heavyShare(tempered(undefined), FULL);
    expect(angry).toBeGreaterThan(calm + 0.08);
    expect(Math.abs(none - calm)).toBeLessThan(0.05);
  });

  it('shortens the pause between attacks when it is high', () => {
    const boss = tempered(1, 100);
    const calm = createInitialState(boss, 1);
    const angry = createInitialState(boss, 1);
    angry.boss.temper = FULL;
    const first = (s: typeof calm): number => windupUpdates(run(s, 200, () => NO_INPUT, boss))[0]!;
    expect(first(angry)).toBeLessThan(first(calm) - 20);
  });
});

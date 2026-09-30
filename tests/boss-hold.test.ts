import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { analyzeRun } from '../src/stats/analyze';
import { attackStarted } from '../src/ui/sound/cues';
import { customBoss, melee, updatesWith, windupUpdates } from './boss-helpers';
import { run } from './helpers';

const holder = (hold: number | undefined, over: Partial<BossDef> = {}): BossDef =>
  customBoss(
    [melee('slam', { windup: 8, hits: [{ from: 8, to: 12, x0: 0, x1: 60, bottom: 0, top: 60 }], ...(hold === undefined ? {} : { hold }) })],
    { attacks: [{ id: 'slam', weight: 1 }] },
    over,
  );

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** For each attack: the update its wind-up began and the update the boss's attack tick first reached the strike. */
function windupToStrike(boss: BossDef, seed: number, count = 600): number[] {
  const s = createInitialState(boss, seed);
  s.player.health = 1e9;
  const states = run(s, count, () => NO_INPUT, boss);
  const starts = windupUpdates(states);
  const strikes = states.flatMap((x, i) => (x.boss.mode === 'attack' && x.boss.attackTick === 8 && (i === 0 || states[i - 1]!.boss.attackTick !== 8) ? [i + 1] : []));
  return strikes.map((strike, i) => strike - starts[i]!);
}

describe('hold: parsing', () => {
  it('accepts hold on a must-dodge attack', () => {
    expect(parseBoss(clone(holder(10))).attacks[0]!.hold).toBe(10);
  });

  it('rejects hold on a counterable attack, with shots, with a 1-update wind-up, or out of range', () => {
    const counterable = clone(holder(10));
    counterable.attacks[0].class = 'counterable';
    expect(() => parseBoss(counterable)).toThrow(/hold/);
    const shots = clone(holder(10));
    shots.attacks[0].shots = [{ kind: 'bolt', at: 8, height: 0, size: 30, speed: 600 }];
    expect(() => parseBoss(shots)).toThrow(/hold/);
    const short = clone(holder(10));
    short.attacks[0].windup = 1;
    short.attacks[0].hits[0].from = 1;
    short.attacks[0].hits[0].to = 5;
    expect(() => parseBoss(short)).toThrow(/hold/);
    const big = clone(holder(61));
    expect(() => parseBoss(big)).toThrow(/hold/);
  });
});

describe('hold: playing', () => {
  it('waits a different extra time from one attack to the next, never more than the hold, and never without it', () => {
    const waits = windupToStrike(holder(10), 5);
    expect(waits.length).toBeGreaterThan(10);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...waits)).toBeLessThanOrEqual(8 + 10);
    expect(new Set(waits).size).toBeGreaterThan(3);
    const plain = windupToStrike(holder(undefined), 5);
    expect(new Set(plain).size).toBe(1);
  });

  it('holds nothing during the study', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 5, 1);
    s.player.health = 1e9;
    const states = run(s, 60, () => NO_INPUT, boss);
    const studied = states.filter((x) => x.study.active && x.boss.mode === 'attack');
    expect(studied.every((x) => x.boss.holdLeft === 0)).toBe(true);
  });

  it('does not delay the hit window relative to the frozen tick: the strike still comes at the attack tick the file says', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 9);
    s.player.health = 1e9;
    const states = run(s, 300, () => NO_INPUT, boss);
    const first = states.find((x) => x.boss.mode === 'attack' && x.boss.attackTick === 8);
    expect(first).toBeDefined();
    expect(updatesWith(states, 'bossWindupRed').length).toBeGreaterThan(0);
  });
});

describe('hold: what reads it', () => {
  it('a frozen attack tick does not count as the attack starting again (sound)', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 1);
    const now = { ...s.boss, mode: 'attack' as const, attackId: 'slam', attackTick: 7 };
    expect(attackStarted({ ...now }, { ...now })).toBe(false);
    expect(attackStarted({ ...now, mode: 'approach' as const }, { ...now, attackTick: 0 })).toBe(true);
  });

  it('keeps the warning length and the first danger time right when the wind-up was held (stats)', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 5);
    s.player.health = 1e9;
    const inputs = Array.from({ length: 400 }, () => NO_INPUT);
    const analysis = analyzeRun(boss, s, inputs);
    const occurrences = analysis.attacks.filter((a) => a.attackId === 'slam');
    expect(occurrences.length).toBeGreaterThan(5);
    for (const a of occurrences) {
      expect(a.windupTicks).toBeGreaterThanOrEqual(8);
      expect(a.windupTicks).toBeLessThanOrEqual(18);
      expect(a.firstDangerTick).toBe(a.startTick + a.windupTicks);
    }
  });
});

describe('hold: difficulty dials', () => {
  it('never lets the warning length dial shrink a held wind-up below 2', () => {
    const boss = holder(10);
    const changed = applyDials({ ...boss, attacks: boss.attacks.map((a) => ({ ...a, windup: 2, hits: [{ ...a.hits[0]!, from: 2, to: 6 }] })) }, { ...NORMAL_DIALS, readability: 0.7 });
    expect(changed.attacks[0]!.windup).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveFight } from '../src/bosses/resolve';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDialsToFight, NORMAL_DIALS } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRecording, analyzeRun } from '../src/stats/analyze';
import { recordUpdate, startRecording, type FightMeta } from '../src/stats/record';
import { solo, standAt, windupUpdates } from './boss-helpers';
import { dummy, pair, unit } from './duo-helpers';
import { DUELIST, withInput } from './helpers';

const named = (boss: BossDef, id: string): BossDef => ({ ...boss, id, name: id.toUpperCase() });
const idle = (count: number): InputFrame[] => Array.from({ length: count }, () => NO_INPUT);
const swingThenIdle = (idles: number): InputFrame[] => [withInput({ attackPressed: true }), ...idle(idles)];

/** A fresh fight with the player standing at `x` (the same spot on the previous and the current update). */
function stand(fight: FightDef, x: number): GameState {
  const s = createInitialState(fight);
  s.player.x = x;
  s.player.prevX = x;
  return s;
}

describe('a fight of one boss', () => {
  it('reports one boss whose numbers are the fight numbers, and every attack as the primary boss', () => {
    const boss = solo('slam');
    const a = analyzeRun(boss, standAt(boss, 120), idle(120));
    expect(a.bosses).toEqual([
      {
        id: boss.id,
        name: boss.name,
        maxHp: boss.maxHp,
        hpLeft: boss.maxHp,
        phaseReached: 1,
        phaseCount: boss.phases.length,
        damageDealt: 0,
      },
    ]);
    expect(a.bossMaxHp).toBe(boss.maxHp);
    expect(a.attacks.length).toBeGreaterThan(0);
    expect(a.attacks.every((x) => x.boss === 0)).toBe(true);
  });
});

describe('a fight of two bosses', () => {
  it('names the boss of every attack and measures the start distance to that boss', () => {
    const fight = pair(named(unit(5, 200), 'first'), named(unit(5, 1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 300), idle(500));
    const byBoss = (index: number) => a.attacks.filter((x) => x.boss === index);
    expect(byBoss(0).length).toBeGreaterThan(1);
    expect(byBoss(1).length).toBeGreaterThan(1);
    expect(byBoss(0).every((x) => x.distance === 100)).toBe(true);
    expect(byBoss(1).every((x) => x.distance === 700)).toBe(true);
  });

  it('never has two attacks going at once: each begins after the previous one ended', () => {
    const fight = pair(named(unit(5, 200), 'first'), named(unit(5, 1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 300), idle(500));
    for (let i = 1; i < a.attacks.length; i++) {
      const previous = a.attacks[i - 1]!;
      expect(a.attacks[i]!.startTick).toBeGreaterThanOrEqual(previous.startTick + previous.windupTicks);
    }
  });

  it('measures the distance bands to the nearest boss that still stands', () => {
    const fight = pair(named(dummy(200), 'first'), named(dummy(1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 900), idle(60));
    expect(a.behavior.updatesClose).toBe(60);
    expect(a.behavior.updatesFar).toBe(0);
  });

  it('sums the health of both bosses and keeps the primary boss phase numbers at the top', () => {
    const fight = pair(named(dummy(1000, 5), 'first'), named(dummy(650, 1), 'second'));
    const a = analyzeRun(fight, stand(fight, 600), swingThenIdle(30));
    expect(a.bosses.map((b) => [b.id, b.maxHp, b.hpLeft, b.damageDealt])).toEqual([
      ['first', 5, 5, 0],
      ['second', 1, 0, 1],
    ]);
    expect(a.bossMaxHp).toBe(6);
    expect(a.bossHpLeft).toBe(5);
    expect(a.damageDealt).toBe(1);
    expect(a.phaseReached).toBe(1);
    expect(a.phaseCount).toBe(fight.bosses[0]!.phases.length);
    expect(a.swings).toBe(1);
    expect(a.swingsThatHit).toBe(1);
  });

  it('counts the damage of both bosses once both are down', () => {
    const fight = pair(named(dummy(700, 1), 'first'), named(dummy(650, 1), 'second'));
    const a = analyzeRun(fight, stand(fight, 600), [...swingThenIdle(25), ...swingThenIdle(25)]);
    expect(a.bossHpLeft).toBe(0);
    expect(a.damageDealt).toBe(2);
    expect(a.bosses.map((b) => b.hpLeft)).toEqual([0, 0]);
    expect(a.swingsThatHit).toBe(2);
  });

  it('cuts short the attack of a boss that falls while its shot is still flying', () => {
    const fight = pair(named(dummy(1000, 5), 'first'), named(unit(1, 650, 1), 'second'));
    let s = stand(fight, 600);
    const inputs: InputFrame[] = [];
    for (let n = 0; n < 200; n++) {
      const partner = s.partners[0]!;
      const press = partner.mode === 'attack' && partner.attackTick === 25;
      const frame = press ? withInput({ attackPressed: true }) : NO_INPUT;
      inputs.push(frame);
      s = step(s, frame, fight);
      if (s.events.includes('bossDown')) break;
    }
    const a = analyzeRun(fight, stand(fight, 600), [...inputs, ...idle(60)]);
    expect(a.attacks).toHaveLength(1);
    expect(a.attacks[0]).toMatchObject({ boss: 1, attackId: 'shoot', outcome: 'interrupted' });
  });
});

describe('an attack of the partner countered on its first update', () => {
  it('is still credited to the partner', () => {
    const slam = solo('slam');
    const quick: BossDef = {
      ...slam,
      id: 'second',
      startX: 1000,
      attacks: slam.attacks.map((atk) =>
        atk.id === 'slam'
          ? { ...atk, windup: DUELIST.counter.window, hits: [{ ...atk.hits[0]!, from: 12, to: 18 }] }
          : atk,
      ),
    };
    const fight = pair(named(dummy(300, 5), 'first'), quick);
    let probe = stand(fight, 880);
    const states: GameState[] = [];
    for (let n = 0; n < 120; n++) {
      probe = step(probe, NO_INPUT, fight);
      states.push(probe);
    }
    const first = windupUpdates(states)[0]!;
    const inputs = Array.from({ length: first + 5 }, (_, i) =>
      i + 1 === first ? withInput({ attackPressed: true }) : NO_INPUT,
    );
    const a = analyzeRun(fight, stand(fight, 880), inputs);
    expect(a.counters).toBe(1);
    expect(a.attacks[0]).toMatchObject({ boss: 1, attackId: 'slam', startTick: first, outcome: 'countered' });
  });
});

describe('analysing a stored fight of the first pair', () => {
  const meta: FightMeta = {
    bossId: 'hound-and-sage',
    presetId: 'normal',
    dials: { ...NORMAL_DIALS },
    seed: 7,
    study: 0,
    playedAt: '2026-09-29T10:00:00.000Z',
  };
  const recording = (() => {
    let rec = startRecording(meta);
    for (let n = 0; n < 600; n++) rec = recordUpdate(rec, NO_INPUT);
    return rec;
  })();

  it('measures both bosses, with the health the fight really started with', () => {
    const a = analyzeRecording(recording);
    const fight = applyDialsToFight(resolveFight(meta.bossId, meta.seed).fight, meta.dials);
    expect(a.bosses.map((b) => b.id)).toEqual(fight.bosses.map((b) => b.id));
    expect(a.bosses.map((b) => b.maxHp)).toEqual(fight.bosses.map((b) => b.maxHp));
    expect(a.bossMaxHp).toBe(fight.bosses.reduce((total, b) => total + b.maxHp, 0));
    expect(a.attacks.length).toBeGreaterThan(0);
    expect(a.attacks.every((x) => x.boss === 0 || x.boss === 1)).toBe(true);
  });

  it('is the same on every run and survives JSON', () => {
    const a = analyzeRecording(recording);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(analyzeRecording(recording)).toEqual(a);
  });
});

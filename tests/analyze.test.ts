import { describe, expect, it } from 'vitest';
import { bossById } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { summarize } from '../src/game/summary';
import { advanceFlow, startFlow } from '../src/ui/fight-flow';
import { presetDials } from '../src/ui/prefs';
import { analyzeFight, analyzeRun, POSITION_EVERY } from '../src/stats/analyze';
import { decodeInputs } from '../src/stats/input-log';
import { buildRecord, recordUpdate, startRecording, type FightMeta } from '../src/stats/record';
import { solo, standAt, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, run, withInput } from './helpers';

/** `count` idle updates with `at` (update numbers start at 1) overriding some of them. */
const frames = (count: number, at: Record<number, Partial<InputFrame>> = {}): InputFrame[] =>
  Array.from({ length: count }, (_, i) => withInput(at[i + 1] ?? {}));

/** The update (1-based) on which the boss's first attack warning begins when the player stands still. */
const firstWindup = (boss: BossDef, distance: number): number =>
  windupUpdates(run(standAt(boss, distance), 80, () => NO_INPUT, boss))[0]!;

const slamBoss = solo('slam');
const sweepBoss = solo('sweep');
const slamFirst = firstWindup(slamBoss, 120);
const sweepFirst = firstWindup(sweepBoss, 120);

// The sweep lasts 24 + 8 + 24 = 56 updates; an attack only gets its outcome once it is over (until then it is
// 'interrupted'), so the dodge scenarios below run first + 60 updates, not first + 45.
describe('attack outcomes', () => {
  it('a hit: an idle player is hit by the slam', () => {
    const first = slamFirst;
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(first + 40));
    expect(a.attacks[0]).toMatchObject({
      attackId: 'slam',
      phase: 1,
      startTick: first,
      windupTicks: 30,
      firstDangerTick: first + 30,
      distance: 120,
      outcome: 'hit',
      evasion: null,
      reactionTicks: null,
      marginTicks: null,
      damageTaken: 1,
      playerActionWhenHit: 'idle',
    });
    expect(a.hitsTaken).toBe(1);
    expect(a.damageTaken).toBe(1);
    expect(a.playerHitTicks).toEqual([first + 30]);
    expect(a.swings).toBe(0);
    expect(a.accuracy).toBeNull();
  });

  it('a counter: a swing in the first update of the counter window', () => {
    const first = slamFirst;
    const at = first + 30 - DUELIST.counter.window;
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(first + 40, { [at]: { attackPressed: true } }));
    expect(a.attacks[0]!.outcome).toBe('countered');
    expect(a.attacks[0]!.evasion).toBeNull();
    expect(a.counters).toBe(1);
    expect(a.swings).toBe(1);
    expect(a.hitsTaken).toBe(0);
  });

  it('a dodge by dash', () => {
    const first = sweepFirst;
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 60, { [first + 22]: { dashPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({
      outcome: 'dodged',
      evasion: 'dash',
      reactionTicks: 22,
      reactionMs: 366.7,
      marginTicks: 2,
      marginMs: 33.3,
      damageTaken: 0,
    });
    expect(a.dashes).toBe(1);
    expect(a.hitsTaken).toBe(0);
  });

  it('a dodge by jump', () => {
    const first = sweepFirst;
    const at: Record<number, Partial<InputFrame>> = { [first + 10]: { jumpPressed: true, jumpHeld: true } };
    for (let n = first + 11; n <= first + 40; n++) at[n] = { jumpHeld: true };
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(first + 60, at));
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'jump', reactionTicks: 10, marginTicks: 14 });
    expect(a.jumps).toBe(1);
  });

  it('too late: a dash after the dangerous moment does not save the player', () => {
    const first = sweepFirst;
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 60, { [first + 30]: { dashPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', reactionTicks: null, marginTicks: -6 });
  });

  it('out of reach: the attack cannot reach a far player', () => {
    const far: BossDef = {
      ...sweepBoss,
      attacks: sweepBoss.attacks.map((atk) =>
        atk.id === 'sweep' ? { ...atk, range: { min: 0, max: 1e9 } } : atk,
      ),
    };
    const first = firstWindup(far, 600);
    const a = analyzeRun(far, standAt(far, 600), frames(first + 60));
    expect(a.attacks[0]).toMatchObject({
      outcome: 'dodged',
      evasion: 'distance',
      reactionTicks: null,
      marginTicks: null,
    });
  });

  it('interrupted: the run ends while the attack is still going', () => {
    const first = slamFirst;
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(first + 10));
    expect(a.attacks[0]!.outcome).toBe('interrupted');
  });
});

describe('an attack cut off during its recovery', () => {
  it('stays interrupted: the outcome is decided when the attack ends', () => {
    // The dash beat the sweep's danger (updates 24 to 31 of the attack) but the run stops at update 45 of 56,
    // in recovery, so the attack is reported as interrupted (its reaction time is still measured).
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(sweepFirst + 45, { [sweepFirst + 22]: { dashPressed: true } }));
    expect(a.attacks[0]).toMatchObject({ outcome: 'interrupted', reactionTicks: 22, marginTicks: null });
  });
});

describe('punish windows', () => {
  it('counts a window the player used', () => {
    const first = slamFirst;
    const a = analyzeRun(
      slamBoss,
      standAt(slamBoss, 120),
      frames(first + 70, { [first + 40]: { attackPressed: true } }),
    );
    const p = a.behavior.punish;
    expect(p.opened).toBeGreaterThanOrEqual(1);
    expect(p.taken).toBe(1);
    expect(p.opened).toBe(p.taken + p.missed);
    expect(a.swingsThatHit).toBe(1);
    expect(a.accuracy).toBe(1);
    expect(a.bossHitTicks.length).toBe(1);
  });

  it('counts a window the player let pass', () => {
    const first = slamFirst;
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(first + 70));
    const p = a.behavior.punish;
    expect(p.taken).toBe(0);
    expect(p.opened).toBeGreaterThanOrEqual(1);
    expect(p.missed).toBe(p.opened);
  });
});

describe('behavior totals', () => {
  const cases: Array<{ name: string; a: ReturnType<typeof analyzeRun> }> = [
    { name: 'a hit', a: analyzeRun(slamBoss, standAt(slamBoss, 120), frames(slamFirst + 40)) },
    {
      name: 'a runner',
      a: analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(200, Object.fromEntries(
        Array.from({ length: 150 }, (_, i) => [i + 1, { moveX: i < 75 ? -1 : 1 }]),
      ))),
    },
  ];

  it.each(cases)('the bands add up and positions are sampled and inside the world: $name', ({ a }) => {
    const b = a.behavior;
    expect(b.updatesClose + b.updatesMid + b.updatesFar).toBe(a.ticks);
    expect(b.positions.length).toBe(Math.floor(a.ticks / POSITION_EVERY));
    for (const x of b.positions) {
      expect(x).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThanOrEqual(1256);
    }
  });

  it('a player standing next to a boss that does not move is close all the time', () => {
    const a = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 120), frames(300));
    expect(a.behavior.updatesClose).toBe(a.ticks);
    expect(a.ticks).toBe(300);
  });
});

/** The scripted player of the record tests: runs at the boss, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

describe('agreement with the fight summary', () => {
  const check = (boss: BossDef, seed: number, inputFor: (n: number) => InputFrame) => {
    let state = createInitialState(boss, seed);
    let flow = startFlow();
    const inputs: InputFrame[] = [];
    for (let n = 1; n <= 1500; n++) {
      const frame = inputFor(n);
      inputs.push(frame);
      const before = state;
      state = step(before, frame, boss);
      flow = advanceFlow(flow, before, state, boss).flow;
      if (flow.ended !== null) break;
    }
    const summary = summarize(flow.tracker, state, boss, flow.ended?.result ?? 'left');
    const a = analyzeRun(boss, createInitialState(boss, seed), inputs);
    expect(a.ticks).toBe(summary.ticks);
    expect(a.phaseReached).toBe(summary.phaseReached);
    expect(a.hitsTaken).toBe(summary.hitsTaken);
    expect(a.bossHpLeft).toBe(summary.bossHpLeft);
    expect(a.attacks.filter((x) => x.outcome === 'hit').length).toBe(summary.hitsTaken);
    return { summary, analysis: a };
  };

  it('agrees on a Normal fight with the scripted player', () => {
    const { summary, analysis } = check(applyDials(DUELIST, NORMAL_DIALS), 7, scripted);
    expect(summary.hitsTaken).toBeGreaterThan(0);
    expect(analysis.attacks.length).toBeGreaterThan(5);
  });

  it('agrees on a fight that ends with the player defeated', () => {
    const boss = applyDials(DUELIST, { ...presetDials('hard'), damage: 3 });
    const { summary, analysis } = check(boss, 99, () => NO_INPUT);
    expect(summary.result).toBe('defeat');
    expect(summary.ticks).toBeLessThan(1500);
    expect(analysis.hitsTaken).toBeGreaterThan(0);
  });
});

describe('the replay path', () => {
  const meta: FightMeta = {
    bossId: 'ember-duelist',
    presetId: 'hard',
    dials: presetDials('hard'),
    seed: 5,
    playedAt: '2026-09-20T10:00:00.000Z',
  };
  const record = (() => {
    let rec = startRecording(meta);
    for (let n = 1; n <= 900; n++) rec = recordUpdate(rec, scripted(n));
    return buildRecord(rec, 'left', 1, null);
  })();

  it('equals analyzing the rebuilt boss and the decoded input', () => {
    const boss = applyDials(bossById(record.bossId), record.dials);
    expect(analyzeFight(record)).toEqual(
      analyzeRun(boss, createInitialState(boss, record.seed), decodeInputs(record.input)),
    );
  });

  it('is deterministic and survives JSON', () => {
    const a = analyzeFight(record);
    expect(JSON.stringify(analyzeFight(record))).toBe(JSON.stringify(a));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.ticks).toBe(900);
  });
});

describe('speed', () => {
  const input = Array.from({ length: 18000 }, (_, i) => scripted(i + 1));

  it('analyzes five minutes against a boss that never attacks in well under five seconds', () => {
    const start = performance.now();
    const a = analyzeRun(QUIET_BOSS, createInitialState(QUIET_BOSS, 3), input);
    const ms = performance.now() - start;
    console.log(`analyzeRun over 18000 updates (QUIET_BOSS): ${ms.toFixed(0)} ms`);
    expect(a.ticks).toBe(18000);
    expect(ms).toBeLessThan(5000);
  });

  it('analyzes five minutes against the real Duelist (a player who cannot lose) in well under five seconds', () => {
    const state: GameState = createInitialState(DUELIST, 3);
    state.player.health = 1e9;
    const start = performance.now();
    const a = analyzeRun(DUELIST, state, input);
    const ms = performance.now() - start;
    console.log(`analyzeRun over 18000 updates (DUELIST): ${ms.toFixed(0)} ms, ${a.attacks.length} attacks`);
    expect(a.ticks).toBe(18000);
    expect(a.attacks.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(5000);
  });
});

import { describe, expect, it } from 'vitest';
import { bossById } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS, presetDials } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { summarize } from '../src/game/summary';
import { advanceFlow, startFlow } from '../src/ui/fight-flow';
import { actionOf, analyzeFight, analyzeRecording, analyzeRun, CLOSE_BELOW, MID_UP_TO, POSITION_EVERY } from '../src/stats/analyze';
import { decodeInputs } from '../src/stats/input-log';
import { buildRecord, recordUpdate, startRecording, type FightMeta } from '../src/stats/record';
import { WORLD } from '../src/game/params';
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

// The sweep lasts 24 + 8 + 24 = 56 updates. An attack is 'dodged' (or 'hit' or 'countered') once its dangerous
// window has finished; a run that ends before that leaves it 'interrupted'. The dodge scenarios below run
// first + 60 updates so that the whole sweep is over.
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

describe('when an attack counts as dodged or interrupted', () => {
  // The sweep's dangerous updates are attack time 24 to 31 (hits resolve for t in [24, 32)).
  const dashAt20 = { [sweepFirst + 20]: { dashPressed: true } };

  it('is dodged as soon as the last dangerous update has passed without a hit', () => {
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(sweepFirst + 31, dashAt20));
    expect(a.attacks[0]).toMatchObject({
      outcome: 'dodged',
      evasion: 'dash',
      reactionTicks: 20,
      marginTicks: 4,
    });
  });

  it('is interrupted one update earlier, while a dangerous update is still to come', () => {
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(sweepFirst + 30, dashAt20));
    expect(a.attacks[0]).toMatchObject({ outcome: 'interrupted', evasion: null, reactionTicks: 20 });
  });

  it('is dodged when the run ends in the recovery after a survived danger window', () => {
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(sweepFirst + 45, { [sweepFirst + 22]: { dashPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({
      outcome: 'dodged',
      evasion: 'dash',
      reactionTicks: 22,
      marginTicks: 2,
    });
  });

  it('is interrupted when a phase change cancels it before its dangerous window', () => {
    // 20 hp is just above the phase 2 threshold (0.66 * 30 = 19.8): an early swing that hits (not a counter,
    // the counter window opens at attack time 18) takes it below, and the boss drops the slam to power up.
    const state = standAt(slamBoss, 120);
    state.boss.hp = 20;
    const a = analyzeRun(slamBoss, state, frames(slamFirst + 20, { [slamFirst + 5]: { attackPressed: true } }));
    expect(a.phaseReached).toBe(2);
    expect(a.counters).toBe(0);
    expect(a.attacks[0]).toMatchObject({ attackId: 'slam', outcome: 'interrupted', evasion: null });
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

  it('does not count a window that was cut short before the player could use it', () => {
    // Attack time 36 is the first update of the slam's recovery: the run ends there.
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(slamFirst + 36));
    const p = a.behavior.punish;
    expect(p).toEqual({ opened: 0, taken: 0, missed: 0 });
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

describe('distance', () => {
  it('is rounded to 0.1 world units', () => {
    const at = (distance: number) =>
      analyzeRun(slamBoss, standAt(slamBoss, distance), frames(slamFirst + 5)).attacks[0]!.distance;
    expect(at(120.07)).toBe(120.1);
    expect(at(120.04)).toBe(120);
    expect(at(120)).toBe(120);
  });
});

describe('distance bands', () => {
  // Close is below CLOSE_BELOW, mid is CLOSE_BELOW up to and including MID_UP_TO, far is beyond.
  it.each([
    { distance: CLOSE_BELOW - 1, band: 'updatesClose' },
    { distance: CLOSE_BELOW, band: 'updatesMid' },
    { distance: MID_UP_TO, band: 'updatesMid' },
    { distance: MID_UP_TO + 1, band: 'updatesFar' },
  ] as const)('a player standing $distance units away is counted in $band', ({ distance, band }) => {
    const a = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, distance), frames(30));
    expect(a.behavior[band]).toBe(30);
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

describe('evasion is caused by the attack', () => {
  const burst = solo('burst');
  const burstAnywhere: BossDef = {
    ...burst,
    attacks: burst.attacks.map((atk) => (atk.id === 'burst' ? { ...atk, range: { min: 0, max: 1e9 } } : atk)),
  };

  it('a dash that only happens while the player is out of reach is distance, not dash', () => {
    // Dashing away from the boss: a dash toward it would carry the player through the outer wave, and that
    // would rightly count as a dash.
    const first = firstWindup(burstAnywhere, 600);
    const a = analyzeRun(
      burstAnywhere,
      standAt(burstAnywhere, 600),
      frames(first + 70, { [first + 45]: { dashPressed: true, moveX: -1 } }),
    );
    expect(a.dashes).toBe(1);
    expect(a.attacks[0]).toMatchObject({ attackId: 'burst', outcome: 'dodged', evasion: 'distance', marginTicks: null });
  });

  it('a jump over the low waves the player really stood in is a jump', () => {
    // At 200 units the second wave (attack time 34 to 37, 50 high) sweeps over the player's spot.
    const first = firstWindup(burst, 200);
    const at: Record<number, Partial<InputFrame>> = { [first + 10]: { jumpPressed: true, jumpHeld: true } };
    for (let n = first + 11; n <= first + 40; n++) at[n] = { jumpHeld: true };
    const a = analyzeRun(burst, standAt(burst, 200), frames(first + 60, at));
    expect(a.attacks[0]).toMatchObject({
      attackId: 'burst',
      outcome: 'dodged',
      evasion: 'jump',
      reactionTicks: 10,
      marginTicks: 20,
    });
  });

  it('the same player standing still is hit, at the wave that reaches them', () => {
    const first = firstWindup(burst, 200);
    const a = analyzeRun(burst, standAt(burst, 200), frames(first + 60));
    // firstDangerTick is the start of the first wave (30); the wave that reaches the player is the second (34).
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', firstDangerTick: first + 30, marginTicks: null });
    expect(a.playerHitTicks).toEqual([first + 34]);
  });

  it('a burst survived from far away is decided only after its last wave (attack time 49)', () => {
    const first = firstWindup(burstAnywhere, 600);
    const during = analyzeRun(burstAnywhere, standAt(burstAnywhere, 600), frames(first + 48));
    const after = analyzeRun(burstAnywhere, standAt(burstAnywhere, 600), frames(first + 49));
    expect(during.attacks[0]!.outcome).toBe('interrupted');
    expect(after.attacks[0]!.outcome).toBe('dodged');
  });
});

describe('frames after the end of a fight', () => {
  it('are ignored, so the analysis matches the truncated run', () => {
    const boss = applyDials(DUELIST, { ...presetDials('hard'), damage: 3 });
    let s = createInitialState(boss, 99);
    let n = 0;
    while (s.phase === 'fight') {
      s = step(s, NO_INPUT, boss);
      n += 1;
    }
    expect(n).toBeLessThan(1500);
    const truncated = analyzeRun(boss, createInitialState(boss, 99), frames(n));
    const padded = analyzeRun(boss, createInitialState(boss, 99), frames(n + 300));
    expect(padded).toEqual(truncated);
    expect(padded.ticks).toBe(n);
    expect(padded.behavior.positions.length).toBe(Math.floor(n / POSITION_EVERY));
  });
});

describe('a dodge on the very update the attack starts', () => {
  it('has a reaction time of 0', () => {
    // From 190 units, so that the dash toward the boss leaves the player inside the sweep's range.
    const first = firstWindup(sweepBoss, 190);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 190),
      frames(first + 60, { [first]: { dashPressed: true } }),
    );
    // The dash carries the player past the boss, so the sweep (which faces the other way) never reaches
    // them: it is dodged by distance, with no margin, but the reaction time is measured.
    expect(a.attacks[0]).toMatchObject({
      startTick: first,
      outcome: 'dodged',
      evasion: 'distance',
      reactionTicks: 0,
      reactionMs: 0,
      marginTicks: null,
    });
  });
});

describe('an attack cancelled on its first update', () => {
  it('still appears, and counters match the countered occurrences', () => {
    // A slam whose warning is exactly the counter window: a swing on its first update counters it at once.
    const quick: BossDef = {
      ...slamBoss,
      attacks: slamBoss.attacks.map((atk) =>
        atk.id === 'slam'
          ? { ...atk, windup: DUELIST.counter.window, hits: [{ ...atk.hits[0]!, from: 12, to: 18 }] }
          : atk,
      ),
    };
    const first = firstWindup(quick, 120);
    const a = analyzeRun(quick, standAt(quick, 120), frames(first + 5, { [first]: { attackPressed: true } }));
    expect(a.counters).toBe(1);
    expect(a.attacks.filter((x) => x.outcome === 'countered').length).toBe(a.counters);
    expect(a.attacks[0]).toMatchObject({ attackId: 'slam', startTick: first, outcome: 'countered' });
  });
});

describe('chains, damage and what the player was doing', () => {
  it('lists every attack of a chain, one attack length apart, where a boss without chains waits', () => {
    const length = 30 + 6 + 30; // the slam: windup + active + recovery
    const withChain = (maxChain: number, chainChance: number): BossDef => ({
      ...slamBoss,
      phases: slamBoss.phases.map((p) => ({ ...p, gap: 40, maxChain, chainChance })),
    });
    const startsOf = (boss: BossDef): number[] =>
      analyzeRun(boss, standAt(boss, 120), frames(700)).attacks.map((x) => x.startTick);
    const gapsOf = (starts: number[]): number[] => starts.slice(1).map((t, i) => t - starts[i]!);

    const chained = gapsOf(startsOf(withChain(3, 1)));
    const single = gapsOf(startsOf(withChain(1, 0)));
    expect(chained.length).toBeGreaterThanOrEqual(3);
    // Inside a chain the next attack starts as soon as the last one is over (one update to line up).
    expect(chained[0]).toBe(length + 1);
    expect(chained[1]).toBe(length + 1);
    // After the chain the boss waits its gap; and a boss without chains always waits.
    expect(chained[2]).toBe(length + 40 + 1);
    for (const g of single) expect(g).toBe(length + 40 + 1);
  });

  it('counts the damage of a heavy attack on the attack and the fight', () => {
    const heavy: BossDef = {
      ...slamBoss,
      attacks: slamBoss.attacks.map((atk) => (atk.id === 'slam' ? { ...atk, damage: 2 } : atk)),
    };
    const a = analyzeRun(heavy, standAt(heavy, 120), frames(slamFirst + 40));
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', damageTaken: 2 });
    expect(a.damageTaken).toBe(2);
    expect(a.hitsTaken).toBe(1);
  });

  it.each([
    { name: 'attacking', at: { [slamFirst + 30]: { attackPressed: true } } },
    {
      name: 'airborne',
      at: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
          slamFirst + 15 + i,
          i === 0 ? { jumpPressed: true, jumpHeld: true } : { jumpHeld: true },
        ]),
      ),
    },
    {
      name: 'running',
      at: { [slamFirst + 28]: { moveX: 1 }, [slamFirst + 29]: { moveX: 1 }, [slamFirst + 30]: { moveX: 1 } },
    },
  ])('records that the player was $name when hit', ({ name, at }) => {
    const a = analyzeRun(slamBoss, standAt(slamBoss, 120), frames(slamFirst + 40, at));
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', playerActionWhenHit: name });
  });

  it('records what the player was doing when the warning began', () => {
    // Slam from 200 units: the boss walks in first, so the warning begins on update 21 whatever the player does.
    const first = firstWindup(slamBoss, 200);
    const action = (at: Record<number, Partial<InputFrame>>) =>
      analyzeRun(slamBoss, standAt(slamBoss, 200), frames(first + 5, at)).attacks[0]!.playerActionAtStart;
    expect(action({})).toBe('idle');
    expect(action({ [first]: { moveX: 1 } })).toBe('running');
    expect(action({ [first - 2]: { attackPressed: true } })).toBe('attacking');
    expect(action({ [first - 10]: { jumpPressed: true, jumpHeld: true } })).toBe('airborne');
  });

  it('actionOf ranks dashing over attacking over airborne over running over idle', () => {
    const p = createInitialState(QUIET_BOSS, 1).player;
    expect(actionOf(p, withInput({}))).toBe('idle');
    expect(actionOf(p, withInput({ moveX: -1 }))).toBe('running');
    expect(actionOf({ ...p, onGround: false }, withInput({ moveX: 1 }))).toBe('airborne');
    expect(actionOf({ ...p, onGround: false, attackTick: 2 }, withInput({}))).toBe('attacking');
    expect(actionOf({ ...p, attackTick: 2, dashTick: 0 }, withInput({}))).toBe('dashing');
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
    let flow = startFlow({
      bossId: boss.id,
      presetId: 'normal',
      dials: NORMAL_DIALS,
      seed,
      study: 0,
      playedAt: '2026-09-20T10:00:00.000Z',
    });
    const inputs: InputFrame[] = [];
    for (let n = 1; n <= 1500; n++) {
      const frame = inputFor(n);
      inputs.push(frame);
      const before = state;
      state = step(before, frame, boss);
      flow = advanceFlow(flow, before, state, boss, frame).flow;
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
    study: 0,
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

describe('the study', () => {
  const boss = applyDials(DUELIST, NORMAL_DIALS);
  const standing = (): InputFrame => NO_INPUT;

  /** Plays a study fight like the app does (state + flow), returning the states, the inputs and the summary. */
  function play(seed: number, rounds: 0 | 1 | 2, inputFor: (n: number) => InputFrame, count = 2500) {
    let state = createInitialState(boss, seed, rounds);
    const initial = state;
    let flow = startFlow({
      bossId: boss.id,
      presetId: 'normal',
      dials: NORMAL_DIALS,
      seed,
      study: rounds,
      playedAt: '2026-09-20T10:00:00.000Z',
    });
    const inputs: InputFrame[] = [];
    const states: GameState[] = [];
    for (let n = 1; n <= count; n++) {
      const frame = inputFor(n);
      inputs.push(frame);
      const before = state;
      state = step(before, frame, boss);
      states.push(state);
      flow = advanceFlow(flow, before, state, boss, frame).flow;
      if (flow.ended !== null) break;
    }
    const summary = summarize(flow.tracker, state, boss, flow.ended?.result ?? 'left');
    return { initial, states, inputs, summary, final: state };
  }

  const studyEvents = (states: GameState[], name: 'studyHit' | 'studyEnd'): number =>
    states.filter((s) => s.events.includes(name)).length;

  it('reports the study block and flags the study occurrences (study 1, standing player)', () => {
    const { initial, states, inputs, summary } = play(3, 1, standing);
    const a = analyzeRun(boss, initial, inputs, 1);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    const hits = studyEvents(states, 'studyHit');
    expect(hits).toBeGreaterThan(0);
    expect(a.study).toEqual({ rounds: 1, ticks: endTick, attacks: 3, hits });

    const queue = initial.study.queue;
    expect(queue).toHaveLength(3);
    const studyOnes = a.attacks.filter((x) => x.study);
    expect(studyOnes.map((x) => x.attackId)).toEqual(queue);
    // The real fight follows: nothing after the study is flagged, and it started after the study ended.
    const real = a.attacks.filter((x) => !x.study);
    expect(real.length).toBeGreaterThan(0);
    expect(real.every((x) => x.startTick > endTick)).toBe(true);
    expect(a.attacks.slice(0, 3).every((x) => x.study)).toBe(true);

    // Fight-level numbers count real hits only, and agree with the fight summary.
    expect(a.ticks).toBe(summary.ticks);
    expect(a.hitsTaken).toBe(summary.hitsTaken);
    expect(a.phaseReached).toBe(summary.phaseReached);
    expect(a.hitsTaken).toBe(real.filter((x) => x.outcome === 'hit').length);
    expect(a.playerHitTicks.length).toBe(a.hitsTaken);
    expect(a.playerHitTicks.every((t) => t > endTick)).toBe(true);
    expect(a.damageTaken).toBe(real.reduce((sum, x) => sum + x.damageTaken, 0));
    // The time of the fight itself leaves the study out, like the summary; `seconds` is the whole session.
    expect(a.fightSeconds).toBe(summary.seconds);
    expect(a.fightSeconds).toBe((a.ticks - endTick) / 60);
    expect(a.seconds).toBe(a.ticks / 60);
    expect(a.attacks.filter((x) => x.outcome === 'hit').length).toBe(a.hitsTaken + studyOnes.filter((x) => x.outcome === 'hit').length);
  });

  it('a study occurrence hit by a demonstration has outcome hit and no damage', () => {
    const { initial, inputs } = play(3, 1, standing);
    const a = analyzeRun(boss, initial, inputs, 1);
    const hit = a.attacks.filter((x) => x.study && x.outcome === 'hit');
    expect(hit.length).toBeGreaterThan(0);
    for (const x of hit) {
      expect(x.damageTaken).toBe(0);
      expect(x.playerActionWhenHit).toBe('idle');
    }
  });

  it('opens no punish window for a study attack', () => {
    const { initial, inputs } = play(3, 1, standing);
    const a = analyzeRun(boss, initial, inputs, 1);
    // With a standing player nothing is ever taken; every counted window comes from a real attack that ended.
    const real = a.attacks.filter((x) => !x.study);
    expect(a.behavior.punish.opened).toBe(a.behavior.punish.taken + a.behavior.punish.missed);
    expect(a.behavior.punish.taken).toBe(0);
    expect(a.behavior.punish.opened).toBeLessThanOrEqual(real.length);
    // The same fight analysed without the study attacks' flag would count more windows: compare with study 0 of the same length of study.
    const studyOnly = analyzeRun(boss, initial, inputs.slice(0, a.study.ticks), 1);
    expect(studyOnly.behavior.punish).toEqual({ opened: 0, taken: 0, missed: 0 });
  });

  it('study 2 has two rounds of demonstrations', () => {
    const { initial, states, inputs } = play(8, 2, standing);
    const a = analyzeRun(boss, initial, inputs, 2);
    expect(a.study.rounds).toBe(2);
    expect(a.study.attacks).toBe(6);
    expect(a.attacks.filter((x) => x.study).map((x) => x.attackId)).toEqual(initial.study.queue);
    expect(a.study.ticks).toBe(states.find((s) => s.events.includes('studyEnd'))!.tick);
  });

  it('an attack that starts in the study and ends after the study ended keeps study true', () => {
    // The last demonstration finishes on the studyEnd update, so its occurrence is flagged from where it started.
    const { initial, inputs } = play(3, 1, standing);
    const a = analyzeRun(boss, initial, inputs, 1);
    const last = a.attacks.filter((x) => x.study).at(-1)!;
    expect(last.study).toBe(true);
    expect(a.attacks[3]!.study).toBe(false);
  });

  it('a study 0 fight has an empty study block and no flagged occurrence', () => {
    const { initial, inputs } = play(3, 0, standing);
    const a = analyzeRun(boss, initial, inputs);
    expect(a.study).toEqual({ rounds: 0, ticks: 0, attacks: 0, hits: 0 });
    expect(a.attacks.length).toBeGreaterThan(0);
    expect(a.attacks.every((x) => !x.study)).toBe(true);
  });

  it('a run that ends during the study reports the updates played so far as its length', () => {
    const { initial, inputs } = play(3, 2, standing, 100);
    const a = analyzeRun(boss, initial, inputs, 2);
    expect(a.ticks).toBe(100);
    expect(a.study.rounds).toBe(2);
    expect(a.study.ticks).toBe(100);
    expect(a.hitsTaken).toBe(0);
    expect(a.damageTaken).toBe(0);
  });

  it('counts swings, dashes and jumps over the whole session, the study included', () => {
    const inputFor = (n: number): InputFrame =>
      withInput({ attackPressed: n % 20 === 0, dashPressed: n % 50 === 0 });
    const { initial, inputs, states } = play(3, 1, inputFor, 900);
    const a = analyzeRun(boss, initial, inputs, 1);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    expect(endTick).toBeLessThan(900);
    expect(a.ticks).toBe(inputs.length);
    // Swings and dashes fire on fixed beats from the first update, so the study's beats are counted too.
    expect(a.swings).toBeGreaterThanOrEqual(Math.floor(endTick / 20));
    expect(a.dashes).toBeGreaterThanOrEqual(Math.floor(endTick / 50));
    expect(a.study.hits).toBe(studyEvents(states, 'studyHit'));
  });

  it('splits the distance bands: study bands plus real bands add up to the whole session', () => {
    const inputFor = (n: number): InputFrame => withInput({ moveX: n % 300 < 150 ? 1 : -1 });
    const { initial, inputs } = play(3, 1, inputFor, 900);
    const a = analyzeRun(boss, initial, inputs, 1);
    const b = a.behavior;
    // The study updates are exactly the study's length, and each band's study share is part of its whole-session count.
    expect(b.studyUpdatesClose + b.studyUpdatesMid + b.studyUpdatesFar).toBe(a.study.ticks);
    expect(b.studyUpdatesClose).toBeLessThanOrEqual(b.updatesClose);
    expect(b.studyUpdatesMid).toBeLessThanOrEqual(b.updatesMid);
    expect(b.studyUpdatesFar).toBeLessThanOrEqual(b.updatesFar);
    const realClose = b.updatesClose - b.studyUpdatesClose;
    const realMid = b.updatesMid - b.studyUpdatesMid;
    const realFar = b.updatesFar - b.studyUpdatesFar;
    expect(realClose + realMid + realFar).toBe(a.ticks - a.study.ticks);
    // The whole-session bands are unchanged and still add up to the ticks.
    expect(b.updatesClose + b.updatesMid + b.updatesFar).toBe(a.ticks);
    // The moving player really used more than one band during the study.
    expect([b.studyUpdatesClose, b.studyUpdatesMid, b.studyUpdatesFar].filter((n) => n > 0).length).toBeGreaterThan(1);
  });

  it('a study 0 fight has zero study bands and the fight time is the whole session', () => {
    const { initial, inputs, summary } = play(3, 0, standing, 600);
    const a = analyzeRun(boss, initial, inputs);
    expect(a.behavior.studyUpdatesClose).toBe(0);
    expect(a.behavior.studyUpdatesMid).toBe(0);
    expect(a.behavior.studyUpdatesFar).toBe(0);
    expect(a.fightSeconds).toBe(a.seconds);
    expect(a.fightSeconds).toBe(summary.seconds);
  });

  it('a run that ends during the study has no fight time and all bands in the study', () => {
    const { initial, inputs, summary } = play(3, 2, standing, 100);
    const a = analyzeRun(boss, initial, inputs, 2);
    expect(a.fightSeconds).toBe(0);
    expect(a.fightSeconds).toBe(summary.seconds);
    const b = a.behavior;
    expect(b.studyUpdatesClose).toBe(b.updatesClose);
    expect(b.studyUpdatesMid).toBe(b.updatesMid);
    expect(b.studyUpdatesFar).toBe(b.updatesFar);
  });

  it('analyzeFight uses the recorded study, and a record without it (version 1) analyses as study 0', () => {
    const { inputs } = play(3, 1, standing);
    let rec = startRecording({
      bossId: boss.id,
      presetId: 'normal',
      dials: NORMAL_DIALS,
      seed: 3,
      study: 1,
      playedAt: '2026-09-20T10:00:00.000Z',
    });
    for (const frame of inputs) rec = recordUpdate(rec, frame);
    const record = buildRecord(rec, 'left', 1, null);
    const a = analyzeFight(record);
    expect(a.study.rounds).toBe(1);
    expect(a.study.attacks).toBe(3);
    expect(analyzeFight(JSON.parse(JSON.stringify(record)) as typeof record)).toEqual(a);

    // A version-1 record: no study field, replayed as study 0.
    const { study: _study, ...old } = record;
    const b = analyzeFight(old);
    const plain = analyzeRun(boss, createInitialState(boss, 3), decodeInputs(record.input));
    expect(b).toEqual(plain);
    expect(b.study).toEqual({ rounds: 0, ticks: 0, attacks: 0, hits: 0 });
  });
});

describe('analyzeRecording', () => {
  const meta: FightMeta = {
    bossId: DUELIST.id,
    presetId: 'normal',
    dials: { ...NORMAL_DIALS },
    seed: 3,
    study: 1,
    playedAt: '2026-09-20T10:00:00.000Z',
  };
  const boss = applyDials(DUELIST, NORMAL_DIALS);
  const player = (n: number): InputFrame =>
    n <= 60
      ? withInput({ moveX: 1 })
      : withInput({ attackPressed: n % 40 === 0, dashPressed: n % 90 === 0, jumpPressed: n % 130 === 0 });

  /** A real study-1 fight, recorded update by update as the app does. */
  function record() {
    let state = createInitialState(boss, meta.seed, meta.study);
    let rec = startRecording(meta);
    const inputs: InputFrame[] = [];
    for (let n = 1; n <= 1500; n++) {
      const frame = player(n);
      inputs.push(frame);
      state = step(state, frame, boss);
      rec = recordUpdate(rec, frame);
      if (state.phase !== 'fight') break;
    }
    return { rec, inputs };
  }

  it('replays the study from the recording meta and matches driving the run with the study state', () => {
    const { rec, inputs } = record();
    const expected = analyzeRun(boss, createInitialState(boss, meta.seed, 1), inputs, 1);
    const a = analyzeRecording(rec);
    expect(a).toEqual(expected);
    expect(a.study.rounds).toBe(1);
    expect(a.study.attacks).toBe(3);
    expect(a.attacks.slice(0, 3).every((x) => x.study)).toBe(true);
  });

  it('would differ if the study were left out (the old call shape)', () => {
    const { rec } = record();
    const without = analyzeFight({
      bossId: rec.meta.bossId,
      dials: rec.meta.dials,
      seed: rec.meta.seed,
      input: rec.runs,
    });
    expect(without).not.toEqual(analyzeRecording(rec));
  });
});

describe('evasion by platform and cover', () => {
  // The Duelist's sweep (attack time 24 to 31, 250 long, 100 high) from the boss at x 960, in an arena.
  const platformBoss: BossDef = { ...sweepBoss, arena: { platforms: [{ x: 780, width: 100, height: 130 }], covers: [] } };
  const coverBoss = (height: number): BossDef => ({
    ...sweepBoss,
    arena: { platforms: [], covers: [{ x: 830, width: 40, height }] },
  });

  /** A fresh fight with the player standing on the floor or on a surface `height` high, `distance` left of the boss. */
  function standOn(boss: BossDef, distance: number, height = 0) {
    const s = standAt(boss, distance);
    s.player.y = WORLD.floorY - height;
    s.player.prevY = s.player.y;
    return s;
  }

  // `at` is given the first warning update so that a scenario can time its inputs.
  const scenario = (
    boss: BossDef,
    distance: number,
    height: number,
    at: (first: number) => Record<number, Partial<InputFrame>> = () => ({}),
  ) => {
    const start = standOn(boss, distance, height);
    const first = windupUpdates(run(start, 80, () => NO_INPUT, boss))[0]!;
    return { first, a: analyzeRun(boss, start, frames(first + 60, at(first))) };
  };

  it('a player standing on a platform higher than the sweep dodges it, and the evasion is the platform', () => {
    const { a } = scenario(platformBoss, 180, 130);
    expect(a.attacks[0]).toMatchObject({
      attackId: 'sweep',
      outcome: 'dodged',
      evasion: 'platform',
      damageTaken: 0,
      reactionTicks: null,
      marginTicks: null,
    });
    expect(a.hitsTaken).toBe(0);
  });

  it('the same player on the floor is hit', () => {
    const { a } = scenario(platformBoss, 180, 0);
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', evasion: null });
    expect(a.hitsTaken).toBe(1);
  });

  it('a platform lower than the sweep does not save the player', () => {
    const low: BossDef = { ...sweepBoss, arena: { platforms: [{ x: 780, width: 100, height: 60 }], covers: [] } };
    const { a } = scenario(low, 180, 60);
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', evasion: null });
  });

  it('a player behind a cover as tall as the sweep dodges it, and the evasion is the cover', () => {
    const { a } = scenario(coverBoss(120), 190, 0);
    expect(a.attacks[0]).toMatchObject({ attackId: 'sweep', outcome: 'dodged', evasion: 'cover', damageTaken: 0 });
    expect(a.hitsTaken).toBe(0);
  });

  it('a cover exactly as tall as the sweep still blocks it', () => {
    const { a } = scenario(coverBoss(100), 190, 0);
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'cover' });
  });

  it('a player behind a cover that is too short is hit', () => {
    const { a } = scenario(coverBoss(90), 190, 0);
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', evasion: null });
  });

  it('a player in front of the cover (between it and the boss) gets no credit from it', () => {
    const { a } = scenario(coverBoss(120), 70, 0);
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', evasion: null });
  });

  it('a player who jumps over the sweep with a cover behind them is a jump, not a cover', () => {
    const boss = coverBoss(120);
    const { a } = scenario(boss, 70, 0, (first) => {
      const at: Record<number, Partial<InputFrame>> = { [first + 10]: { jumpPressed: true, jumpHeld: true } };
      for (let n = first + 11; n <= first + 40; n++) at[n] = { jumpHeld: true };
      return at;
    });
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'jump', reactionTicks: 10 });
  });

  it('a player who dashes and also stands behind a cover: the dash has priority', () => {
    // Two windows: a low one (top 100) the cover blocks, then a tall one (top 200) it does not. The player
    // waits behind the cover for the first and dashes through the second.
    const two: BossDef = {
      ...coverBoss(120),
      attacks: coverBoss(120).attacks.map((atk) =>
        atk.id === 'sweep'
          ? {
              ...atk,
              active: 16,
              hits: [
                { from: 24, to: 32, x0: 0, x1: 250, bottom: 0, top: 100 },
                { from: 34, to: 40, x0: 0, x1: 250, bottom: 0, top: 200 },
              ],
            }
          : atk,
      ),
    };
    const { a } = scenario(two, 190, 0, (first) => ({ [first + 34]: { dashPressed: true, moveX: 1 } }));
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'dash', damageTaken: 0 });
    // Without the dash the same player is hit by the tall window.
    const still = scenario(two, 190, 0);
    expect(still.a.attacks[0]).toMatchObject({ outcome: 'hit', evasion: null });
  });

  it('a dash behind the cover does not count as a dash: the cover protected the player', () => {
    const { a } = scenario(coverBoss(120), 190, 0, (first) => ({ [first + 22]: { dashPressed: true, moveX: -1 } }));
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'cover' });
    expect(a.dashes).toBe(1);
  });

  it('a player on a platform higher than the sweep AND behind a shorter cover: the evasion is the platform, not distance', () => {
    // Platform x 690 to 790 (130 high), cover x 810 to 850 (120 high): the cut sweep only reaches x 850 to 960.
    const both: BossDef = {
      ...sweepBoss,
      arena: { platforms: [{ x: 740, width: 100, height: 130 }], covers: [{ x: 830, width: 40, height: 120 }] },
    };
    const { a } = scenario(both, 190, 130);
    expect(a.attacks[0]).toMatchObject({ attackId: 'sweep', outcome: 'dodged', evasion: 'platform', damageTaken: 0 });
  });

  it('a player standing on a cover top higher than the sweep: the evasion is the platform', () => {
    const { a } = scenario(coverBoss(130), 130, 130);
    expect(a.behavior.updatesOnPlatform).toBeGreaterThan(0);
    expect(a.attacks[0]).toMatchObject({ attackId: 'sweep', outcome: 'dodged', evasion: 'platform', damageTaken: 0 });
  });

  it('a player who jumps over the sweep while behind a cover is credited with the jump (the bare attack would have reached the floor)', () => {
    const jumpAt = (first: number): Record<number, Partial<InputFrame>> => {
      const at: Record<number, Partial<InputFrame>> = { [first + 8]: { jumpPressed: true, jumpHeld: true } };
      for (let n = first + 9; n <= first + 40; n++) at[n] = { jumpHeld: true };
      return at;
    };
    const behind = scenario(coverBoss(120), 190, 0, jumpAt);
    expect(behind.a.jumps).toBe(1);
    expect(behind.a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'jump' });
    // A shorter sweep (x 810 to 960) does not reach the player even in a bare arena: the same jump saved nothing.
    const base = coverBoss(120);
    const short: BossDef = {
      ...base,
      attacks: base.attacks.map((atk) =>
        atk.id === 'sweep' ? { ...atk, hits: atk.hits.map((h) => ({ ...h, x1: 150 })) } : atk,
      ),
    };
    const far = scenario(short, 190, 0, jumpAt);
    expect(far.a.jumps).toBe(1);
    expect(far.a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'distance' });
  });

  it('a jump that is over before the sweep is dangerous does not hide the cover', () => {
    const early = scenario(coverBoss(120), 190, 0, (first) => ({ [first + 1]: { jumpPressed: true, jumpHeld: true } }));
    expect(early.a.jumps).toBe(1);
    expect(early.a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'cover' });
  });

  it('a flat arena never produces platform or cover, over a whole fight with dodged attacks', () => {
    const boss = DUELIST;
    let dodgedTotal = 0;
    for (const seed of [1, 2, 3]) {
      const start = createInitialState(boss, seed);
      const a = analyzeRun(boss, start, Array.from({ length: 3000 }, (_, i) => scripted(i + 1)));
      const dodged = a.attacks.filter((x) => x.outcome === 'dodged');
      dodgedTotal += dodged.length;
      expect(a.attacks.length).toBeGreaterThan(5);
      for (const x of a.attacks) expect(['platform', 'cover']).not.toContain(x.evasion);
      expect(a.behavior.updatesOnPlatform).toBe(0);
    }
    expect(dodgedTotal).toBeGreaterThan(4);
    const far = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(sweepFirst + 60, { [sweepFirst + 22]: { dashPressed: true } }));
    expect(far.attacks[0]).toMatchObject({ evasion: 'dash' });
  });

  it('updatesOnPlatform counts the updates the player stood on a raised surface (checked against the live states)', () => {
    // Run right and jump onto the platform (x 730 to 830, 130 high), stand, then walk off it.
    const inputAt = (n: number): InputFrame =>
      n === 1
        ? withInput({ moveX: 1, jumpPressed: true, jumpHeld: true })
        : n <= 12
          ? withInput({ moveX: 1, jumpHeld: true })
          : n <= 24
            ? withInput({ jumpHeld: true })
            : n <= 100
              ? NO_INPUT
              : withInput({ moveX: -1 });
    const start = standAt(platformBoss, 260);
    const states = run(start, 140, inputAt, platformBoss);
    const live = states.filter((s) => s.player.onGround && s.player.y < WORLD.floorY - 1).length;
    expect(live).toBeGreaterThan(40);
    expect(live).toBeLessThan(140);
    const a = analyzeRun(platformBoss, start, Array.from({ length: 140 }, (_, i) => inputAt(i + 1)));
    expect(a.behavior.updatesOnPlatform).toBe(live);
  });

  it('updatesOnPlatform is 0 for a flat fight and counts the whole session, the study included', () => {
    const start = createInitialState(DUELIST, 3, 1);
    const a = analyzeRun(DUELIST, start, frames(400), 1);
    expect(a.behavior.updatesOnPlatform).toBe(0);
    // A study run on a platform: the count covers the study updates too.
    const s = standOn(platformBoss, 180, 130);
    const withStudy = createInitialState(platformBoss, 3, 1);
    withStudy.player.x = s.player.x;
    withStudy.player.y = s.player.y;
    withStudy.player.prevX = s.player.x;
    withStudy.player.prevY = s.player.y;
    const b = analyzeRun(platformBoss, withStudy, frames(200), 1);
    expect(b.study.ticks).toBeGreaterThan(0);
    expect(b.behavior.updatesOnPlatform).toBe(b.ticks);
  });
});

import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { GAME, PLAYER } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import type { FightSummary } from '../src/game/summary';
import { decodeInputs } from '../src/stats/input-log';
import { buildRecord, replayFinalState, type FightMeta } from '../src/stats/record';
import {
  advanceFlow,
  leaveRecording,
  leaveSummary,
  startFlow,
  type FightFlow,
  type FinishedFight,
} from '../src/ui/fight-flow';
import { solo, standAt } from './boss-helpers';
import { DUELIST, QUIET_BOSS, withInput } from './helpers';

const META: FightMeta = {
  bossId: DUELIST.id,
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 1,
  playedAt: '2026-09-20T10:00:00.000Z',
};

interface Played {
  flow: FightFlow;
  states: GameState[];
  /** The frame fed on each update (index 0 is update 1), and the updates on which `finished` was set. */
  frames: InputFrame[];
  finishes: Array<{ update: number; finished: FinishedFight }>;
  /** The recording length after each update. */
  recordedTicks: number[];
  /** The updates (1-based) on which the flow asked to show the summary, with what it showed. */
  shows: Array<{ update: number; summary: FightSummary }>;
}

/** Drives the real `step` and the flow together, the way the app does, for up to `count` updates (it stops when the summary is shown). */
function play(
  start: GameState,
  count: number,
  boss: BossDef,
  inputFor: (n: number) => InputFrame = () => NO_INPUT,
): Played {
  let flow = startFlow(META);
  let state = start;
  const states: GameState[] = [];
  const frames: InputFrame[] = [];
  const finishes: Played['finishes'] = [];
  const recordedTicks: number[] = [];
  const shows: Played['shows'] = [];
  for (let n = 1; n <= count; n++) {
    const before = state;
    const frame = inputFor(n);
    state = step(state, frame, boss);
    states.push(state);
    frames.push(frame);
    const result = advanceFlow(flow, before, state, boss, frame);
    flow = result.flow;
    recordedTicks.push(flow.recording.ticks);
    if (result.finished !== null) finishes.push({ update: n, finished: result.finished });
    if (result.show !== null) {
      shows.push({ update: n, summary: result.show });
      break; // The app leaves the fight here.
    }
  }
  return { flow, states, frames, finishes, recordedTicks, shows };
}

const costing = (id: string, damage: number): BossDef => {
  const boss = solo(id);
  return { ...boss, attacks: boss.attacks.map((a) => (a.id === id ? { ...a, damage } : a)) };
};

/** The player swings on update 1: with the boss at 1 health in reach, that swing wins the fight. */
const winning = (): GameState => {
  const s = standAt(QUIET_BOSS, 120);
  s.boss.hp = 1;
  return s;
};
const swing = (n: number): InputFrame => withInput({ attackPressed: n === 1 });
const WIN_UPDATE = PLAYER.attack.startup + 1;

describe('a new flow', () => {
  it('has a fresh tracker and no ended fight', () => {
    const flow = startFlow(META);
    expect(flow.ended).toBeNull();
    expect(flow.tracker.hitsTaken).toBe(0);
    expect(flow.tracker.phaseReached).toBe(1);
  });

  it('does not carry the previous fight over', () => {
    const won = play(winning(), WIN_UPDATE + GAME.defeatRestartTicks, QUIET_BOSS, swing);
    expect(won.flow.ended).not.toBeNull();
    expect(startFlow(META).ended).toBeNull();
    expect(startFlow(META)).not.toBe(won.flow);
  });
});

describe('a win', () => {
  const start = winning();
  const played = play(start, WIN_UPDATE + GAME.defeatRestartTicks + 5, QUIET_BOSS, swing);

  it('asks to show the summary only when the game restarts the fight', () => {
    expect(played.states[WIN_UPDATE - 1]!.phase).toBe('victory');
    expect(played.shows.map((s) => s.update)).toEqual([WIN_UPDATE + GAME.defeatRestartTicks]);
    expect(played.states[WIN_UPDATE + GAME.defeatRestartTicks - 1]!.phase).toBe('fight');
  });

  it('reports a victory timed to the update the fight ended, not the restart', () => {
    const summary = played.shows[0]!.summary;
    expect(summary.result).toBe('victory');
    expect(summary.ticks).toBe(WIN_UPDATE);
    expect(summary.seconds).toBe(WIN_UPDATE / 60);
    expect(summary.bossHpLeft).toBe(0);
  });

  it('notes the end while the end pause runs, without showing yet', () => {
    const during = play(start, WIN_UPDATE + 10, QUIET_BOSS, swing);
    expect(during.shows).toEqual([]);
    expect(during.flow.ended?.result).toBe('victory');
  });
});

describe('a loss', () => {
  const boss = costing('slam', PLAYER.maxHealth + 4);
  const played = play(standAt(boss, 120), 400, boss);
  const lostAt = played.states.findIndex((s) => s.phase === 'defeated') + 1;

  it('shows the summary at the restart, as a defeat timed to the update it ended', () => {
    expect(lostAt).toBeGreaterThan(0);
    expect(played.shows.map((s) => s.update)).toEqual([lostAt + GAME.defeatRestartTicks]);
    const summary = played.shows[0]!.summary;
    expect(summary.result).toBe('defeat');
    expect(summary.ticks).toBe(lostAt);
    expect(summary.seconds).toBe(lostAt / 60);
  });

  it('counts the final hit in the hits taken', () => {
    expect(played.shows[0]!.summary.hitsTaken).toBe(1);
    expect(played.shows[0]!.summary.mostDangerousAttack?.id).toBe('slam');
  });

  it('counts every hit when there are several before the last', () => {
    const start = standAt(solo('slam'), 120);
    start.player.health = 2;
    const two = play(start, 600, solo('slam'));
    expect(two.shows[0]!.summary.result).toBe('defeat');
    expect(two.shows[0]!.summary.hitsTaken).toBe(2);
  });
});

describe('leaving', () => {
  it('in the middle of a fight gives "left" with the time so far', () => {
    const played = play(standAt(DUELIST, 300), 45, DUELIST);
    expect(played.flow.ended).toBeNull();
    const summary = leaveSummary(played.flow, played.states[44]!, DUELIST);
    expect(summary.result).toBe('left');
    expect(summary.ticks).toBe(45);
    expect(summary.seconds).toBe(0.75);
  });

  it('during the end pause gives the real result', () => {
    const won = play(winning(), WIN_UPDATE + 10, QUIET_BOSS, swing);
    const winSummary = leaveSummary(won.flow, won.states.at(-1)!, QUIET_BOSS);
    expect(winSummary.result).toBe('victory');
    expect(winSummary.ticks).toBe(WIN_UPDATE);

    const boss = costing('slam', PLAYER.maxHealth + 4);
    const lost = play(standAt(boss, 120), 400, boss);
    const lostAt = lost.states.findIndex((s) => s.phase === 'defeated') + 1;
    const early = play(standAt(boss, 120), lostAt + 5, boss);
    expect(leaveSummary(early.flow, early.states.at(-1)!, boss).result).toBe('defeat');
  });

  it('a fight that never ran gives "left" with no time', () => {
    const summary = leaveSummary(startFlow(META), createInitialState(DUELIST), DUELIST);
    expect(summary.result).toBe('left');
    expect(summary.ticks).toBe(0);
  });
});

describe('advanceFlow', () => {
  it('does not change the flow or the states it is given', () => {
    const played = play(winning(), WIN_UPDATE, QUIET_BOSS, swing);
    const flow = played.flow;
    const before = played.states[WIN_UPDATE - 2]!;
    const after = played.states[WIN_UPDATE - 1]!;
    const frame = swing(1);
    const copies = structuredClone({ flow, before, after, frame });
    advanceFlow(flow, before, after, QUIET_BOSS, swing(1));
    advanceFlow(startFlow(META), before, after, QUIET_BOSS, swing(1));
    expect({ flow, before, after, frame }).toEqual(copies);
  });

  it('returns a new flow, and a new tracker whenever it tracks', () => {
    const start = createInitialState(DUELIST);
    const next = step(start, NO_INPUT, DUELIST);
    const flow = startFlow(META);
    const result = advanceFlow(flow, start, next, DUELIST, NO_INPUT);
    expect(result.flow).not.toBe(flow);
    expect(result.show).toBeNull();
  });

  it('does not track the restart update, and keeps the finished fight as it was', () => {
    const played = play(winning(), WIN_UPDATE + GAME.defeatRestartTicks, QUIET_BOSS, swing);
    expect(played.shows).toHaveLength(1);
    expect(played.flow.ended).toBe(played.shows[0]!.summary);
    expect(played.flow.tracker.hitsTaken).toBe(0);
  });
});

describe('recording', () => {
  const won = play(winning(), WIN_UPDATE + GAME.defeatRestartTicks + 5, QUIET_BOSS, swing);

  it('holds the frames fed up to and including the ending update', () => {
    const finished = won.finishes[0]!.finished;
    const ended = won.flow.ended!;
    const decoded = decodeInputs(finished.recording.runs);
    expect(decoded).toHaveLength(ended.ticks);
    expect(finished.recording.ticks).toBe(ended.ticks);
    expect(decoded).toEqual(
      won.frames.slice(0, ended.ticks).map((f) => ({ ...f, moveY: 0, confirm: false, alt: false })),
    );
    expect(finished.recording.meta).toBe(META);
  });

  it('hands out finished exactly once, on the ending update, with the matching result', () => {
    expect(won.finishes.map((f) => f.update)).toEqual([WIN_UPDATE]);
    expect(won.finishes[0]!.finished.result).toBe('victory');

    const boss = costing('slam', PLAYER.maxHealth + 4);
    const lost = play(standAt(boss, 120), 400, boss);
    expect(lost.finishes).toHaveLength(1);
    expect(lost.finishes[0]!.finished.result).toBe('defeat');
    expect(lost.flow.ended!.result).toBe('defeat');
    expect(lost.finishes[0]!.update).toBe(lost.states.findIndex((s) => s.phase === 'defeated') + 1);
  });

  it('does not record the end pause or the restart update', () => {
    expect(won.recordedTicks[WIN_UPDATE - 1]).toBe(WIN_UPDATE);
    // The end pause and the restart update leave the recording as it was at the ending update.
    expect(new Set(won.recordedTicks.slice(WIN_UPDATE - 1))).toEqual(new Set([WIN_UPDATE]));
    expect(won.shows).toHaveLength(1);
  });

  it('leaving mid-fight gives the recording so far as "left"', () => {
    const played = play(standAt(DUELIST, 300), 45, DUELIST, (n) => withInput({ moveX: n % 2 }));
    const left = leaveRecording(played.flow);
    expect(left?.result).toBe('left');
    expect(left?.recording.ticks).toBe(45);
    expect(decodeInputs(left!.recording.runs)).toHaveLength(45);
  });

  it('leaving gives nothing before any update, and nothing once the fight ended', () => {
    expect(leaveRecording(startFlow(META))).toBeNull();
    expect(leaveRecording(won.flow)).toBeNull();
    const during = play(winning(), WIN_UPDATE + 10, QUIET_BOSS, swing);
    expect(during.flow.ended).not.toBeNull();
    expect(leaveRecording(during.flow)).toBeNull();
  });

  it('replays to the very state the live fight ended in', () => {
    // A real boss with the preset dials, as a saved fight is replayed from its record.
    const boss = applyDials(DUELIST, META.dials);
    const inputFor = (n: number): InputFrame =>
      withInput({ moveX: Math.floor(n / 40) % 3 - 1, attackPressed: n % 17 === 0, jumpPressed: n % 53 === 0, jumpHeld: n % 53 < 20 });
    let flow = startFlow(META);
    let state = createInitialState(boss, META.seed);
    let finished: FinishedFight | null = null;
    let endState: GameState | null = null;
    for (let n = 1; n <= 20000 && finished === null; n++) {
      const before = state;
      const frame = inputFor(n);
      state = step(state, frame, boss);
      const advanced = advanceFlow(flow, before, state, boss, frame);
      flow = advanced.flow;
      finished = advanced.finished;
      if (finished !== null) endState = state;
    }
    expect(finished).not.toBeNull();
    const record = buildRecord(finished!.recording, finished!.result, 1, null);
    expect(replayFinalState(record)).toEqual(endState);
  });

  it('does not change what it is given, and starts each flow with its own recording', () => {
    const a = startFlow(META);
    const b = startFlow(META);
    expect(a.recording).not.toBe(b.recording);
    expect(a.recording.runs).not.toBe(b.recording.runs);
    const start = createInitialState(DUELIST);
    const next = step(start, swing(1), DUELIST);
    const frame = swing(1);
    const copies = structuredClone({ a, start, next, frame });
    const result = advanceFlow(a, start, next, DUELIST, frame);
    expect({ a, start, next, frame }).toEqual(copies);
    expect(result.flow.recording).not.toBe(a.recording);
    expect(a.recording.ticks).toBe(0);
    expect(b.recording.ticks).toBe(0);
  });
});

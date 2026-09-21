import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, NO_PRESSES, addPresses, applyPresses, type InputFrame } from '../src/engine/input-frame';
import { planUpdates } from '../src/engine/loop';
import { applyDials, presetDials, type Dials, type PresetId } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import type { FightResult, FightSummary } from '../src/game/summary';
import { analyzeFight } from '../src/stats/analyze';
import { buildRecord, replayFinalState, type FightRecord } from '../src/stats/record';
import { freezeFor } from '../src/ui/feedback';
import { advanceFlow, leaveRecording, leaveSummary, startFlow } from '../src/ui/fight-flow';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { withInput } from './helpers';

/**
 * A permanent test of the app's real update loop. `playLikeTheApp` does what `runFight` in src/ui/app.ts does
 * for one fight, frame by frame: it asks the real `planUpdates` how many updates a frame owes, applies the
 * remembered presses to the first update of a frame only, skips updates during a hit-stop, and feeds the same
 * frame the update ran with to `advanceFlow`. Then the stored record must replay to the same final state and
 * the analyzer must agree with the fight summary.
 */

/** Frame times that mix 60 Hz frames, 120 Hz frames, slow frames and now and then a long stall. */
function messyDeltas(seed: number): () => number {
  let s = seed >>> 0;
  const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  return () => {
    const r = next();
    if (r < 0.5) return 16.7;
    if (r < 0.8) return 8.3;
    if (r < 0.95) return 33.4;
    return 70 + next() * 60;
  };
}

/** Every frame is 50 ms long: exactly three updates, so a fight can end in the middle of a frame. */
const threeUpdatesPerFrame = (): number => 50;

/** What the pad reports on frame `f` (presses are true only on the frame the button went down). */
function pad(f: number): InputFrame {
  if (f < 40) return withInput({ moveX: 1 });
  return withInput({
    moveX: f % 50 < 6 ? 1 : f % 50 > 44 ? -1 : 0,
    attackPressed: f % 17 === 0,
    dashPressed: f % 41 === 0,
    jumpPressed: f % 67 === 0,
    jumpHeld: f % 67 < 8,
  });
}

/** A player who stands still and does nothing. */
const passive = (): InputFrame => NO_INPUT;

interface PlayOptions {
  presetId: PresetId;
  dials: Dials;
  seed: number;
  deltas: () => number;
  player?: (frame: number) => InputFrame;
  /** Leave the fight (as the hold on the top button does) after this many frames, if it is still going. */
  leaveAfterFrames?: number;
  maxFrames?: number;
}

interface Played {
  boss: BossDef;
  /** The state after the last recorded update (the ending update, or the last update before leaving). */
  finalState: GameState;
  result: FightResult;
  summary: FightSummary;
  record: FightRecord;
  /** True when the ending update was not the last update of its frame. */
  endedMidFrame: boolean;
  frames: number;
  framesWithoutUpdate: number;
  mostUpdatesInAFrame: number;
  updatesSkippedByHitStop: number;
}

function playLikeTheApp(options: PlayOptions): Played {
  const { presetId, dials, seed, deltas } = options;
  const player = options.player ?? pad;
  const boss = applyDials(EMBER_DUELIST, dials);
  let state = createInitialState(boss, seed);
  let flow = startFlow({ bossId: boss.id, presetId, dials, seed, playedAt: '2026-09-20T10:00:00.000Z' });
  let pending = NO_PRESSES;
  let leftoverMs = 0;
  let freezeLeft = 0;

  let finalState: GameState | null = null;
  let finishedRecording: { recording: typeof flow.recording; result: 'victory' | 'defeat' } | null = null;
  let endedMidFrame = false;
  let framesWithoutUpdate = 0;
  let mostUpdatesInAFrame = 0;
  let updatesSkippedByHitStop = 0;
  let frames = 0;
  let shown = false;

  const maxFrames = options.maxFrames ?? 6000;
  for (let f = 1; f <= maxFrames && !shown; f++) {
    frames = f;
    if (options.leaveAfterFrames !== undefined && f > options.leaveAfterFrames && flow.ended === null) break;
    const input = player(f);
    // As in runFight: presses are remembered until an update uses them.
    pending = addPresses(pending, input);
    const plan = planUpdates(leftoverMs, deltas());
    leftoverMs = plan.leftoverMs;
    mostUpdatesInAFrame = Math.max(mostUpdatesInAFrame, plan.updates);
    if (plan.updates === 0) framesWithoutUpdate += 1;

    for (let i = 0; i < plan.updates; i++) {
      if (freezeLeft > 0) {
        freezeLeft -= 1;
        updatesSkippedByHitStop += 1;
        continue;
      }
      const before = state;
      const frameInput = applyPresses(input, pending);
      state = step(state, frameInput, boss);
      pending = NO_PRESSES;
      const advanced = advanceFlow(flow, before, state, boss, frameInput);
      flow = advanced.flow;
      if (advanced.finished !== null) {
        finishedRecording = advanced.finished;
        finalState = state;
        endedMidFrame = i < plan.updates - 1;
      }
      if (advanced.show !== null) {
        shown = true;
        break;
      }
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events, DEFAULT_SETTINGS));
    }
  }

  let recording: typeof flow.recording;
  let result: FightResult;
  if (finishedRecording !== null && finalState !== null) {
    recording = finishedRecording.recording;
    result = finishedRecording.result;
  } else {
    const leaving = leaveRecording(flow);
    if (leaving === null) throw new Error('the fight neither ended nor recorded anything');
    recording = leaving.recording;
    result = leaving.result;
    finalState = state;
  }
  const summary = leaveSummary(flow, finalState, boss);
  return {
    boss,
    finalState,
    result,
    summary,
    record: buildRecord(recording, result, 1, null),
    endedMidFrame,
    frames,
    framesWithoutUpdate,
    mostUpdatesInAFrame,
    updatesSkippedByHitStop,
  };
}

/** The checks that must hold for every fight: replay equality, and the analyzer against the M3a summary. */
function expectFaithful(played: Played): void {
  const { record, finalState, summary } = played;
  const stored = JSON.parse(JSON.stringify(record)) as FightRecord;
  expect(stored).toEqual(record);
  expect(record.ticks).toBe(finalState.tick);
  expect(replayFinalState(stored)).toEqual(finalState);

  const analysis = analyzeFight(stored);
  expect(analysis.ticks).toBe(summary.ticks);
  expect(analysis.hitsTaken).toBe(summary.hitsTaken);
  expect(analysis.bossHpLeft).toBe(summary.bossHpLeft);
  expect(analysis.phaseReached).toBe(summary.phaseReached);
  expect(analysis.attacks.filter((a) => a.outcome === 'hit').length).toBe(summary.hitsTaken);
  expect(summary.result).toBe(record.result);
}

const CASES: Array<{ name: string; presetId: PresetId; dials: Dials }> = [
  { name: 'Normal', presetId: 'normal', dials: presetDials('normal') },
  { name: 'Easy', presetId: 'easy', dials: presetDials('easy') },
  { name: 'Hard', presetId: 'hard', dials: presetDials('hard') },
  { name: 'Hard with speed 1 (custom dials)', presetId: 'hard', dials: { ...presetDials('hard'), speed: 1 } },
];

describe('the update loop of the app, replayed', () => {
  it.each(CASES)('$name: a long fight with messy frame times replays and analyzes faithfully', (c) => {
    const played = playLikeTheApp({ ...c, seed: 21, deltas: messyDeltas(5), leaveAfterFrames: 2400 });
    // The loop really was messy: frames with no update, several updates, and hit-stops that skipped updates.
    expect(played.framesWithoutUpdate).toBeGreaterThan(0);
    expect(played.mostUpdatesInAFrame).toBeGreaterThanOrEqual(2);
    expect(played.updatesSkippedByHitStop).toBeGreaterThan(0);
    expect(played.record.ticks).toBeGreaterThan(300);
    expectFaithful(played);
  });

  it.each(CASES)('$name: holds for several seeds and frame patterns', (c) => {
    for (const seed of [1, 2, 3]) {
      expectFaithful(playLikeTheApp({ ...c, seed, deltas: messyDeltas(seed * 7), leaveAfterFrames: 1500 }));
    }
  });

  it('a fight that ends by defeat: the record stops at the ending update', () => {
    const dials: Dials = { ...presetDials('hard'), damage: 3 };
    const played = playLikeTheApp({
      presetId: 'hard',
      dials,
      seed: 99,
      deltas: messyDeltas(3),
      player: passive,
    });
    expect(played.result).toBe('defeat');
    expect(played.finalState.phase).toBe('defeated');
    expect(played.summary.hitsTaken).toBeGreaterThan(0);
    expectFaithful(played);
  });

  it('a fight left half-way through leaveRecording is saved as left', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 7,
      deltas: messyDeltas(11),
      leaveAfterFrames: 400,
    });
    expect(played.result).toBe('left');
    expect(played.summary.result).toBe('left');
    expect(played.finalState.phase).toBe('fight');
    expect(played.record.ticks).toBeGreaterThan(100);
    expectFaithful(played);
  });

  it('a fight that ends in the middle of a frame of several updates', () => {
    const dials: Dials = { ...presetDials('hard'), damage: 3 };
    let found: Played | null = null;
    // Which update of its frame is the last one of the fight depends on the seed; take the first that is not the last.
    for (let seed = 1; seed <= 30 && found === null; seed++) {
      const played = playLikeTheApp({
        presetId: 'hard',
        dials,
        seed,
        deltas: threeUpdatesPerFrame,
        player: passive,
      });
      if (played.endedMidFrame) found = played;
    }
    expect(found).not.toBeNull();
    const played = found!;
    expect(played.mostUpdatesInAFrame).toBe(3);
    expect(played.result).toBe('defeat');
    // The updates that ran after the ending update in the same frame are not part of the record.
    expect(played.record.ticks).toBe(played.finalState.tick);
    expectFaithful(played);
  });
});

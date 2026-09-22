import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST } from '../src/bosses';
import { resolveBoss } from '../src/bosses/resolve';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, NO_PRESSES, addPresses, applyPresses, type InputFrame } from '../src/engine/input-frame';
import { planUpdates } from '../src/engine/loop';
import { applyDials, presetDials, type Dials, type PresetId } from '../src/game/difficulty';
import { WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import type { FightResult, FightSummary } from '../src/game/summary';
import { analyzeFight, analyzeRecording } from '../src/stats/analyze';
import { buildRecord, replayFinalState, type FightRecord, type Recording } from '../src/stats/record';
import { freezeFor } from '../src/ui/feedback';
import { advanceFlow, leaveRecording, leaveSummary, startFlow } from '../src/ui/fight-flow';
import { NO_EFFECTS, spawnEffects, stepEffects, type EffectsState } from '../src/ui/look/effects';
import { LOOK } from '../src/ui/look/tuning';
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
  /** Study rounds before the fight; none when left out. */
  study?: 0 | 1 | 2;
  deltas: () => number;
  player?: (frame: number) => InputFrame;
  /** The boss to fight; the Ember Duelist when left out. */
  bossDef?: BossDef;
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
  recording: Recording;
  /** The looks' particles and rings, threaded through the same as app.ts, at the end of the emulated loop. */
  fx: EffectsState;
  /** True when the ending update was not the last update of its frame. */
  endedMidFrame: boolean;
  frames: number;
  framesWithoutUpdate: number;
  mostUpdatesInAFrame: number;
  updatesSkippedByHitStop: number;
  /** What the emulated loop saw of the study on the recorded updates, counted from the live states. */
  live: {
    studyHits: number;
    studyEnds: number;
    studyUpdates: number;
    studyAttackStarts: number;
    /** Recorded updates on which the player stood on a raised surface. */
    platformUpdates: number;
  };
}

function playLikeTheApp(options: PlayOptions): Played {
  const { presetId, dials, seed, deltas } = options;
  const study = options.study ?? 0;
  const player = options.player ?? pad;
  const boss = applyDials(options.bossDef ?? EMBER_DUELIST, dials);
  let state = createInitialState(boss, seed, study);
  let flow = startFlow({ bossId: boss.id, presetId, dials, seed, study, playedAt: '2026-09-20T10:00:00.000Z' });
  let pending = NO_PRESSES;
  let leftoverMs = 0;
  let freezeLeft = 0;
  // Threaded exactly as in app.ts, so a change to where stepEffects/spawnEffects run relative to the freeze
  // check or the update would be caught here, even though this test never draws anything.
  let fx: EffectsState = NO_EFFECTS;

  let finalState: GameState | null = null;
  let finishedRecording: { recording: typeof flow.recording; result: 'victory' | 'defeat' } | null = null;
  let endedMidFrame = false;
  let framesWithoutUpdate = 0;
  let mostUpdatesInAFrame = 0;
  let updatesSkippedByHitStop = 0;
  let frames = 0;
  let shown = false;
  const live = { studyHits: 0, studyEnds: 0, studyUpdates: 0, studyAttackStarts: 0, platformUpdates: 0 };

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
      fx = stepEffects(fx);
      if (freezeLeft > 0) {
        freezeLeft -= 1;
        updatesSkippedByHitStop += 1;
        continue;
      }
      const before = state;
      const frameInput = applyPresses(input, pending);
      state = step(state, frameInput, boss);
      pending = NO_PRESSES;
      // Only the recorded updates count: the ones up to and including the ending update, not the end pause.
      if (flow.ended === null) {
        if (before.study.active) live.studyUpdates += 1;
        if (state.player.onGround && state.player.y < WORLD.floorY - 1) live.platformUpdates += 1;
        live.studyHits += state.events.filter((e) => e === 'studyHit').length;
        live.studyEnds += state.events.filter((e) => e === 'studyEnd').length;
        if (state.study.active && state.events.some((e) => e === 'bossWindupGold' || e === 'bossWindupRed')) {
          live.studyAttackStarts += 1;
        }
      }
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
      fx = spawnEffects(fx, before, state, boss, DEFAULT_SETTINGS.effects);
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
    recording,
    fx,
    endedMidFrame,
    frames,
    framesWithoutUpdate,
    mostUpdatesInAFrame,
    updatesSkippedByHitStop,
    live,
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
  expect(analysis.attacks.filter((a) => !a.study && a.outcome === 'hit').length).toBe(summary.hitsTaken);
  expect(summary.result).toBe(record.result);
  // The study block against what the loop itself saw on the live states.
  const { live } = played;
  expect(analysis.study.hits).toBe(live.studyHits);
  expect(analysis.study.ticks).toBe(live.studyUpdates);
  expect(analysis.study.attacks).toBe(live.studyAttackStarts);
  expect(analysis.attacks.filter((a) => a.study).length).toBe(live.studyAttackStarts);
  expect(analysis.behavior.updatesOnPlatform).toBe(live.platformUpdates);
  expect(live.studyEnds).toBe(record.study > 0 && !finalState.study.active ? 1 : 0);
  // The fight time leaves the study out, like the summary's.
  expect(analysis.fightSeconds).toBe(summary.seconds);
  expect(analysis.behavior.studyUpdatesClose + analysis.behavior.studyUpdatesMid + analysis.behavior.studyUpdatesFar).toBe(
    live.studyUpdates,
  );
  // The effects bookkeeping never grows past what the looks are capped at, same as the real app.
  expect(played.fx.particles.length).toBeLessThanOrEqual(LOOK.maxParticles);
  expect(played.fx.rings.length).toBeLessThanOrEqual(LOOK.maxRings);
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

  it.each(CASES)('the Ashen Hound at $name: a long fight through the app loop replays and analyzes faithfully', (c) => {
    for (const seed of [21, 22]) {
      const played = playLikeTheApp({
        ...c,
        seed,
        deltas: messyDeltas(seed),
        bossDef: ASHEN_HOUND,
        leaveAfterFrames: 2400,
      });
      expect(played.boss.id).toBe('ashen-hound');
      expect(played.record.bossId).toBe('ashen-hound');
      expect(played.framesWithoutUpdate).toBeGreaterThan(0);
      // (200 and not 300: the cover no longer stops the bite, so the scripted pad is beaten sooner at Hard.)
      expect(played.record.ticks).toBeGreaterThan(200);
      // The Hound really attacked, and the analysis saw its leaps and dashes.
      const ids = new Set(analyzeFight(played.record).attacks.map((a) => a.attackId));
      expect(ids.size).toBeGreaterThan(1);
      expectFaithful(played);
    }
  });

  it('a Generated boss: a long fight through the app loop replays and analyzes faithfully', () => {
    const seed = 30;
    const generated = resolveBoss('generated', seed).boss;
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed,
      deltas: messyDeltas(seed),
      bossDef: generated,
      leaveAfterFrames: 2400,
    });
    expect(played.boss.id).toBe('generated');
    expect(played.record.bossId).toBe('generated');
    expectFaithful(played);
  });

  it('a Generated boss with an arena: a long fight through the app loop replays and analyzes faithfully', () => {
    const seed = 5; // resolveBoss('generated', seed) at this seed has an arena (found by sweeping seeds 1-30)
    const generated = resolveBoss('generated', seed).boss;
    expect(generated.arena).toBeDefined();
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed,
      deltas: messyDeltas(seed),
      bossDef: generated,
      leaveAfterFrames: 2400,
    });
    expect(played.boss.id).toBe('generated');
    expect(played.record.bossId).toBe('generated');
    expectFaithful(played);
  });

  it('the Ashen Hound: a fight that ends by defeat replays and analyzes faithfully', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 4,
      deltas: messyDeltas(9),
      bossDef: ASHEN_HOUND,
      player: passive,
    });
    expect(played.result).toBe('defeat');
    expect(played.summary.hitsTaken).toBeGreaterThan(0);
    expectFaithful(played);
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

describe('the update loop of the app with a study, replayed', () => {
  const STUDY_CASES: Array<{
    name: string;
    presetId: PresetId;
    bossDef: BossDef;
    study: 1 | 2;
    seed: number;
  }> = [
    { name: 'the Ember Duelist, study 1 at Normal', presetId: 'normal', bossDef: EMBER_DUELIST, study: 1, seed: 21 },
    { name: 'the Ashen Hound, study 2 at Hard', presetId: 'hard', bossDef: ASHEN_HOUND, study: 2, seed: 22 },
  ];

  it.each(STUDY_CASES)('$name: replays and analyzes faithfully through a messy loop', (c) => {
    const played = playLikeTheApp({
      presetId: c.presetId,
      dials: presetDials(c.presetId),
      seed: c.seed,
      study: c.study,
      bossDef: c.bossDef,
      deltas: messyDeltas(c.seed),
      leaveAfterFrames: 2400,
    });
    expect(played.framesWithoutUpdate).toBeGreaterThan(0);
    expect(played.record.study).toBe(c.study);
    expectFaithful(played);
    // The path saveFight uses (from the recording) gives the same analysis as the stored record's.
    expect(analyzeRecording(played.recording)).toEqual(analyzeFight(played.record));

    // The study really ran and ended before the fight was left.
    expect(played.finalState.study.active).toBe(false);
    const analysis = analyzeFight(played.record);
    const phaseOne = played.boss.phases[0]!.attacks.length;
    expect(analysis.study).toEqual({
      rounds: c.study,
      ticks: played.finalState.study.endTick,
      attacks: phaseOne * c.study,
      hits: analysis.study.hits,
    });
    expect(analysis.study.ticks).toBeGreaterThan(0);
    // The study occurrences come first, then the real fight; the summary time leaves the study out.
    const flags = analysis.attacks.map((a) => a.study);
    expect(flags.slice(0, analysis.study.attacks).every(Boolean)).toBe(true);
    expect(flags.slice(analysis.study.attacks).some(Boolean)).toBe(false);
    expect(played.summary.studySeconds).toBe(analysis.study.ticks / 60);
    expect(played.summary.seconds).toBe((played.summary.ticks - analysis.study.ticks) / 60);
  });

  it('a fight left during the study replays, is saved as left and has no real time', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 5,
      study: 2,
      deltas: messyDeltas(3),
      leaveAfterFrames: 60,
    });
    expect(played.result).toBe('left');
    expect(played.finalState.study.active).toBe(true);
    expect(played.summary.seconds).toBe(0);
    expect(played.summary.studySeconds).toBeGreaterThan(0);
    expectFaithful(played);
    const analysis = analyzeFight(played.record);
    expect(analysis.study.rounds).toBe(2);
    expect(analysis.study.ticks).toBe(played.record.ticks);
    expect(analysis.hitsTaken).toBe(0);
  });

  it('a passive player is never hurt during the study, and a study hit is not a hit taken', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 4,
      study: 1,
      deltas: messyDeltas(9),
      player: passive,
    });
    expect(played.result).toBe('defeat');
    expectFaithful(played);
    const analysis = analyzeFight(played.record);
    expect(analysis.study.hits).toBeGreaterThan(0);
    for (const t of analysis.playerHitTicks) expect(t).toBeGreaterThan(analysis.study.ticks);
  });
});

describe('the update loop of the app in an arena, replayed', () => {
  /** A player who runs right, jumps a lot (onto the cover and the platform) and swings and dashes now and then. */
  const climber = (f: number): InputFrame =>
    withInput({
      moveX: f % 90 < 45 ? 1 : f % 90 < 60 ? 0 : -1,
      jumpPressed: f % 23 === 0,
      jumpHeld: f % 23 < 12,
      attackPressed: f % 31 === 0,
      dashPressed: f % 53 === 0,
    });

  it.each(CASES)('$name: a long fight against a Hound with an arena replays and analyzes faithfully', (c) => {
    for (const seed of [21, 22]) {
      const played = playLikeTheApp({
        ...c,
        seed,
        deltas: messyDeltas(seed),
        bossDef: ASHEN_HOUND,
        player: climber,
        leaveAfterFrames: 2400,
      });
      expect(played.record.bossId).toBe('ashen-hound');
      expect(played.boss.arena).toBeDefined();
      expect(played.framesWithoutUpdate).toBeGreaterThan(0);
      expect(played.record.ticks).toBeGreaterThan(300);
      // The player really used the arena, and the analysis saw it on the same updates the live loop did.
      expect(played.live.platformUpdates).toBeGreaterThan(0);
      expectFaithful(played);
    }
  });

  it('an arena fight with a study replays and analyzes faithfully', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 8,
      study: 1,
      deltas: messyDeltas(8),
      bossDef: ASHEN_HOUND,
      player: climber,
      leaveAfterFrames: 2400,
    });
    expect(played.record.study).toBe(1);
    expectFaithful(played);
    expect(analyzeRecording(played.recording)).toEqual(analyzeFight(played.record));
  });

  it('a passive player in the arena is defeated and the record replays', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 4,
      deltas: messyDeltas(9),
      bossDef: ASHEN_HOUND,
      player: passive,
    });
    expect(played.result).toBe('defeat');
    expectFaithful(played);
  });
});

describe('records made before the arena', () => {
  it('a version 2 record (a Duelist fight, no arena effects) still replays and analyzes', () => {
    const played = playLikeTheApp({
      presetId: 'normal',
      dials: presetDials('normal'),
      seed: 21,
      deltas: messyDeltas(5),
      leaveAfterFrames: 1200,
    });
    // As stored by game 0.3.0: the older version numbers, and an analysis without the new field.
    const old = JSON.parse(JSON.stringify({ ...played.record, schemaVersion: 2, gameVersion: '0.3.0' })) as FightRecord;
    expect(replayFinalState(old)).toEqual(played.finalState);
    const analysis = analyzeFight(old);
    expect(analysis.ticks).toBe(played.summary.ticks);
    expect(analysis.hitsTaken).toBe(played.summary.hitsTaken);
    expect(analysis.behavior.updatesOnPlatform).toBe(0);
  });
});

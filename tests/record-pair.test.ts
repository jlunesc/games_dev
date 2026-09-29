import { describe, expect, it } from 'vitest';
import { bossById } from '../src/bosses';
import { resolveFight } from '../src/bosses/resolve';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import {
  buildRecord,
  recordUpdate,
  replayFinalState,
  startRecording,
  STATS_SCHEMA_VERSION,
  type FightMeta,
  type Recording,
} from '../src/stats/record';
import { withInput } from './helpers';

const metaOf = (over: Partial<FightMeta> = {}): FightMeta => ({
  bossId: 'hound-and-sage',
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 7,
  study: 0,
  playedAt: '2026-09-29T10:00:00.000Z',
  ...over,
});

/** A deterministic player: runs at the bosses, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
    moveX: n % 200 < 100 ? 1 : -1,
  });
}

/** Plays a fight live through the fight functions (the way the app does), recording every update. */
function playLiveFight(
  meta: FightMeta,
  updates: number,
  inputFor: (n: number) => InputFrame,
): { state: GameState; rec: Recording } {
  const fight = applyDialsToFight(resolveFight(meta.bossId, meta.seed).fight, meta.dials);
  let state = createInitialState(fight, meta.seed, meta.study);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = inputFor(n);
    state = step(state, frame, fight);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  return { state, rec };
}

/** Plays a one-boss fight the old way (one boss, no fight object), so it does not depend on the new code. */
function playLiveSolo(
  meta: FightMeta,
  updates: number,
  inputFor: (n: number) => InputFrame,
): { state: GameState; rec: Recording } {
  const boss = applyDials(bossById(meta.bossId), meta.dials);
  let state = createInitialState(boss, meta.seed, meta.study);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = inputFor(n);
    state = step(state, frame, boss);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  return { state, rec };
}

describe('the schema version', () => {
  it('is 6, and a record of a pair carries the pair id as its boss id', () => {
    expect(STATS_SCHEMA_VERSION).toBe(6);
    const record = buildRecord(startRecording(metaOf()), 'left', 1, null);
    expect(record.schemaVersion).toBe(6);
    expect(record.bossId).toBe('hound-and-sage');
    expect(record.study).toBe(0);
  });
});

describe('replaying a pair fight', () => {
  it('reaches the identical final state (Normal)', () => {
    const { state, rec } = playLiveFight(metaOf(), 1500, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(record.ticks).toBeGreaterThan(300);
    expect(state.partners).toHaveLength(1);
    expect(replayFinalState(record)).toEqual(state);
  });

  it('reaches the identical final state (Hard, another seed, through JSON)', () => {
    const meta = metaOf({ presetId: 'hard', dials: presetDials('hard'), seed: 123456 });
    const { state, rec } = playLiveFight(meta, 1500, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    const copy = JSON.parse(JSON.stringify(record)) as typeof record;
    expect(replayFinalState(copy)).toEqual(state);
  });

  it('replays a pair fight that ends with the player defeated', () => {
    const meta = metaOf({ presetId: 'hard', dials: { ...presetDials('hard'), damage: 3 }, seed: 99 });
    const { state, rec } = playLiveFight(meta, 3000, () => NO_INPUT);
    expect(state.phase).toBe('defeated');
    const replayed = replayFinalState(buildRecord(rec, 'defeat', 1, null));
    expect(replayed).toEqual(state);
  });

  it('is really two bosses: the replay has a partner, and it is not the Hound alone', () => {
    const { rec } = playLiveFight(metaOf(), 600, scripted);
    const replayed = replayFinalState(buildRecord(rec, 'left', 1, null));
    expect(replayed.partners).toHaveLength(1);
    const solo = replayFinalState({ ...buildRecord(rec, 'left', 1, null), bossId: 'ashen-hound' });
    expect(solo.partners).toHaveLength(0);
  });

  it('ignores a study value: a fight with partners has no study', () => {
    const { state, rec } = playLiveFight(metaOf(), 900, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(replayFinalState({ ...record, study: 2 })).toEqual(state);
    expect(replayFinalState({ ...record, study: 1 })).toEqual(state);
  });
});

describe('older records still replay', () => {
  it.each(['ember-duelist', 'ashen-hound', 'vesper-sage'])('a version-5 record of %s replays to the same final state', (bossId) => {
    const meta = metaOf({ bossId, presetId: 'hard', dials: presetDials('hard'), seed: 5, study: 1 });
    const { state, rec } = playLiveSolo(meta, 1500, scripted);
    const record = { ...buildRecord(rec, 'left', 1, null), schemaVersion: 5 };
    expect(replayFinalState(record)).toEqual(state);
  });

  it('a record with no study field (version 1) replays as study 0', () => {
    const meta = metaOf({ bossId: 'ember-duelist', study: 0 });
    const { state, rec } = playLiveSolo(meta, 900, scripted);
    const { study: _study, ...oldRecord } = buildRecord(rec, 'left', 1, null);
    expect(replayFinalState(oldRecord)).toEqual(state);
  });
});

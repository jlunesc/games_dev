import { describe, expect, it } from 'vitest';
import { bossById } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, changedDials, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { PLAYER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import {
  buildRecord,
  GAME_VERSION,
  recordUpdate,
  replayFinalState,
  startRecording,
  STATS_SCHEMA_VERSION,
  type FightMeta,
  type Recording,
} from '../src/stats/record';
import { countUpdates } from '../src/stats/input-log';
import { withInput } from './helpers';

const BOSS_ID = 'ember-duelist';

const metaOf = (over: Partial<FightMeta> = {}): FightMeta => ({
  bossId: BOSS_ID,
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 7,
  playedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

/** A deterministic player: runs at the boss, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

/** Plays the real game with `inputFor`, recording every update, and stops early once the fight is over. */
function playLive(
  meta: FightMeta,
  updates: number,
  inputFor: (n: number) => InputFrame,
): { state: GameState; rec: Recording } {
  const boss = applyDials(bossById(meta.bossId), meta.dials);
  let state = createInitialState(boss, meta.seed);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = inputFor(n);
    state = step(state, frame, boss);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  return { state, rec };
}

describe('recording', () => {
  it('starts empty, counts updates and merges repeated frames without touching its input', () => {
    const start = startRecording(metaOf());
    expect(start.ticks).toBe(0);
    expect(start.runs).toEqual([]);

    const frame = withInput({ moveX: 1 });
    const frozen = structuredClone(frame);
    const one = recordUpdate(start, frame);
    const two = recordUpdate(one, frame);
    const three = recordUpdate(two, NO_INPUT);
    expect(frame).toEqual(frozen);
    expect(three.ticks).toBe(3);
    expect(three.runs).toEqual([
      [2, 2],
      [1, 1],
    ]);
    // Earlier recordings are untouched.
    expect(start.ticks).toBe(0);
    expect(start.runs).toEqual([]);
    expect(one.ticks).toBe(1);
    expect(one.runs).toEqual([[2, 1]]);
  });
});

describe('buildRecord', () => {
  it('fills every field', () => {
    let rec = startRecording(metaOf());
    for (let n = 1; n <= 5; n++) rec = recordUpdate(rec, scripted(n));
    const record = buildRecord(rec, 'victory', 3, { note: 'x' });
    expect(countUpdates(rec.runs)).toBe(record.ticks);
    expect(record).toEqual({
      schemaVersion: STATS_SCHEMA_VERSION,
      gameVersion: GAME_VERSION,
      id: '2026-09-20T10:00:00.000Z#7',
      playedAt: '2026-09-20T10:00:00.000Z',
      attempt: 3,
      bossId: BOSS_ID,
      presetId: 'normal',
      dials: NORMAL_DIALS,
      changedDials: [],
      seed: 7,
      result: 'victory',
      ticks: 5,
      input: rec.runs,
      analysis: { note: 'x' },
    });
  });

  it('writes the seed in hex in the id', () => {
    const rec = startRecording(metaOf({ seed: 255 }));
    expect(buildRecord(rec, 'left', 1, null).id).toBe('2026-09-20T10:00:00.000Z#ff');
  });

  it('uses the seed as an unsigned number in the id', () => {
    const rec = startRecording(metaOf({ seed: -1 }));
    expect(buildRecord(rec, 'left', 1, null).id).toBe('2026-09-20T10:00:00.000Z#ffffffff');
  });

  it('copies the dials, so changing them later cannot change a stored record', () => {
    const meta = metaOf({ dials: { ...NORMAL_DIALS } });
    const record = buildRecord(startRecording(meta), 'left', 1, null);
    meta.dials.speed = 1.4;
    expect(record.dials).toEqual(NORMAL_DIALS);
    expect(record.dials).not.toBe(meta.dials);
  });

  it('lists the dials that differ from the preset it began from', () => {
    const dials: Dials = { ...presetDials('hard'), speed: 1 };
    const rec = startRecording(metaOf({ presetId: 'hard', dials }));
    const record = buildRecord(rec, 'defeat', 1, null);
    expect(record.changedDials).toEqual(changedDials(presetDials('hard'), dials));
    expect(record.changedDials).toContain('speed');
    expect(record.changedDials).not.toContain('health');
  });
});

/** True when the fight really happened: updates ran and someone lost health. */
const didSomething = (state: GameState, bossMaxHp: number): boolean =>
  state.tick > 0 && (state.boss.hp < bossMaxHp || state.player.health < PLAYER.maxHealth);

describe('replay guarantee', () => {
  it('replays a Normal fight to the identical final state', () => {
    const { state, rec } = playLive(metaOf(), 1200, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(didSomething(state, applyDials(bossById(BOSS_ID), NORMAL_DIALS).maxHp)).toBe(true);
    expect(replayFinalState(record)).toEqual(state);
  });

  it('replays a Hard fight with another seed to the identical final state', () => {
    const meta = metaOf({ presetId: 'hard', dials: presetDials('hard'), seed: 123456 });
    const { state, rec } = playLive(meta, 1200, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(record.ticks).toBeGreaterThan(0);
    expect(didSomething(state, applyDials(bossById(BOSS_ID), presetDials('hard')).maxHp)).toBe(true);
    expect(replayFinalState(record)).toEqual(state);
  });

  it('replays a fight that ends early with the player defeated', () => {
    const meta = metaOf({ presetId: 'hard', dials: { ...presetDials('hard'), damage: 3 }, seed: 99 });
    const { state, rec } = playLive(meta, 1200, () => NO_INPUT);
    expect(state.phase).toBe('defeated');
    expect(rec.ticks).toBeLessThan(1200);
    const record = buildRecord(rec, 'defeat', 1, null);
    const replayed = replayFinalState(record);
    expect(replayed.phase).toBe('defeated');
    expect(replayed).toEqual(state);
  });

  it('survives a trip through JSON', () => {
    const meta = metaOf({ presetId: 'hard', dials: presetDials('hard'), seed: 5 });
    const { state, rec } = playLive(meta, 1200, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    const copy = JSON.parse(JSON.stringify(record)) as typeof record;
    expect(copy).toEqual(record);
    expect(replayFinalState(copy)).toEqual(state);
  });

  it('really uses the seed', () => {
    const a = playLive(metaOf({ seed: 1 }), 600, scripted);
    const b = playLive(metaOf({ seed: 2 }), 600, scripted);
    const recordA = buildRecord(a.rec, 'left', 1, null);
    const recordB = buildRecord(b.rec, 'left', 1, null);
    expect(replayFinalState(recordA).boss).not.toEqual(replayFinalState(recordB).boss);
  });
});

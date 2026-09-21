import { bossById } from '../bosses';
import type { InputFrame } from '../engine/input-frame';
import {
  applyDials,
  changedDials,
  presetDials,
  type DialId,
  type Dials,
  type PresetId,
} from '../game/difficulty';
import { createInitialState, type GameState } from '../game/state';
import { step } from '../game/step';
import type { FightResult } from '../game/summary';
import { decodeInputs, pushFrame, type InputRun } from './input-log';

export const STATS_SCHEMA_VERSION = 2;

/** Bump when a change to the game numbers or a boss file changes how a recorded fight replays. */
export const GAME_VERSION = '0.3.0';

/** What is fixed before the first update of a fight. */
export interface FightMeta {
  bossId: string;
  presetId: PresetId;
  dials: Dials;
  seed: number;
  /** Rounds of the study before the fight (0 = none). */
  study: 0 | 1 | 2;
  /** ISO time the fight began. */
  playedAt: string;
}

/** A fight being recorded: its setup plus every update's input so far. */
export interface Recording {
  meta: FightMeta;
  runs: InputRun[];
  ticks: number;
}

export function startRecording(meta: FightMeta): Recording {
  return { meta, runs: [], ticks: 0 };
}

/** Adds one update's input. Returns a new recording; the old one is untouched. */
export function recordUpdate(rec: Recording, frame: InputFrame): Recording {
  return { meta: rec.meta, runs: pushFrame(rec.runs, frame), ticks: rec.ticks + 1 };
}

/** One finished fight as stored and exported. `analysis` is filled in by the analyzer. */
export interface FightRecord<A = unknown> {
  schemaVersion: number;
  gameVersion: string;
  id: string;
  playedAt: string;
  /** The number of fights saved on this device when this one was saved, plus one (all bosses and presets; restarts after 'Delete all fights'). */
  attempt: number;
  bossId: string;
  presetId: PresetId;
  dials: Dials;
  /** The dials that differ from the preset the fight began from. */
  changedDials: DialId[];
  seed: number;
  /** Rounds of the study before the fight (0 = none). Records of schema version 1 have no such field and mean 0. */
  study: 0 | 1 | 2;
  result: FightResult;
  ticks: number;
  input: InputRun[];
  analysis: A;
}

export function buildRecord<A>(
  rec: Recording,
  result: FightResult,
  attempt: number,
  analysis: A,
): FightRecord<A> {
  const { meta } = rec;
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    id: `${meta.playedAt}#${(meta.seed >>> 0).toString(16)}`,
    playedAt: meta.playedAt,
    attempt,
    bossId: meta.bossId,
    presetId: meta.presetId,
    dials: { ...meta.dials },
    changedDials: changedDials(presetDials(meta.presetId), meta.dials),
    seed: meta.seed,
    study: meta.study,
    result,
    ticks: rec.ticks,
    input: rec.runs,
    analysis,
  };
}

/** Replays the recorded input through the real game and returns the state after the last update. */
export function replayFinalState(record: {
  bossId: string;
  dials: Dials;
  seed: number;
  /** Missing in records of schema version 1: replayed as 0. */
  study?: 0 | 1 | 2;
  input: readonly InputRun[];
}): GameState {
  const boss = applyDials(bossById(record.bossId), record.dials);
  let state = createInitialState(boss, record.seed, record.study ?? 0);
  for (const frame of decodeInputs(record.input)) state = step(state, frame, boss);
  return state;
}

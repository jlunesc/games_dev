import { bossById } from '../bosses';
import type { InputFrame } from '../engine/input-frame';
import { applyDials, changedDials, type DialId, type Dials, type PresetId } from '../game/difficulty';
import { createInitialState, type GameState } from '../game/state';
import { step } from '../game/step';
import type { FightResult } from '../game/summary';
import { presetDials } from '../ui/prefs';
import { decodeInputs, pushFrame, type InputRun } from './input-log';

export const STATS_SCHEMA_VERSION = 1;

/** Bump when a change to the game numbers or a boss file changes how a recorded fight replays. */
export const GAME_VERSION = '0.3.0';

/** What is fixed before the first update of a fight. */
export interface FightMeta {
  bossId: string;
  presetId: PresetId;
  dials: Dials;
  seed: number;
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
  /** Which try this was at that boss and preset in the session. */
  attempt: number;
  bossId: string;
  presetId: PresetId;
  dials: Dials;
  /** The dials that differ from the preset the fight began from. */
  changedDials: DialId[];
  seed: number;
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
    id: `${meta.playedAt}#${meta.seed.toString(16)}`,
    playedAt: meta.playedAt,
    attempt,
    bossId: meta.bossId,
    presetId: meta.presetId,
    dials: meta.dials,
    changedDials: changedDials(presetDials(meta.presetId), meta.dials),
    seed: meta.seed,
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
  input: readonly InputRun[];
}): GameState {
  const boss = applyDials(bossById(record.bossId), record.dials);
  let state = createInitialState(boss, record.seed);
  for (const frame of decodeInputs(record.input)) state = step(state, frame, boss);
  return state;
}

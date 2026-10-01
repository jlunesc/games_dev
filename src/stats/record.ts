import { resolveFight } from '../bosses/resolve';
import type { InputFrame } from '../engine/input-frame';
import {
  applyDialsToFight,
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

export const STATS_SCHEMA_VERSION = 8;

/**
 * Bump when a change to the game numbers or a boss file changes how a recorded fight replays.
 * 0.4.0: arenas (platforms and cover). Giving the Ashen Hound an arena changes how Hound fights replay, so
 * records made by 0.3.0 no longer replay exactly for the Hound; Ember Duelist records (no arena) still do.
 * 0.5.0: generated arenas (M6a). Drawing an arena is one more random choice the generator makes, so it
 * reorders the whole random stream: a "generated" record made by 0.4.0 no longer reproduces the same boss
 * (arena included) from its seed. Named-boss records (Ember Duelist, Ashen Hound) are unaffected.
 * 0.5.1: the Vesper Sage lost its middle cover (it kept the player on one side), so Sage records made by
 * 0.5.0 no longer replay exactly. Every other boss is unchanged.
 * 0.6.0: the Quill Warden, Cinder Golem, Veil Dancer, Gale Reaver and Brass Sentinel gained new attacks
 * (hovering leaps, strikes on both sides, back and aimed bolts) and bolt heights are now measured above the
 * boss's feet, so records of those bosses made by 0.5.1 no longer replay exactly. Other bosses are unchanged.
 * 0.6.1: the Ashen Hound lost its platforms and cover (flat arena), so Hound records made by 0.6.0 or earlier no
 * longer replay exactly. Every other boss is unchanged.
 * 0.7.0: the player can swing up (up held, on the ground or in the air) and down (down held, in the air), so the
 * recorded input now carries the vertical aim. Records made by 0.6.1 or earlier have no aim and replay exactly as before.
 * 0.7.1: a downward swing that hits the boss bounces the player up (the pogo), so records made by 0.7.0 with a
 * downward hit no longer replay exactly. Records without a downward hit replay as before.
 * 0.8.0: generated bosses now draw shot and eruption attacks too, so the same seed makes a different boss and
 * records of generated bosses made by 0.7.1 or earlier no longer replay exactly. Hand-built bosses are unchanged.
 * 0.9.0: Round 1 of the boss identity work (docs/superpowers/specs/2026-09-29-boss-identity-design.md) changed the
 * attack lists and numbers of nine hand-built bosses (everyone except the Ember Duelist), so their records made by
 * 0.8.0 or earlier no longer replay exactly. The Ember Duelist and generated bosses are unchanged.
 * 0.10.0: Rounds 2 and 3 of the boss identity work (temper, reactions, the Sentinel's shield, new attacks).
 * 0.11.0: every boss except the Trainee has a second phase from half health (the same attacks plus one twist), so
 * records of those bosses made by 0.10.0 or earlier no longer replay exactly once the boss passes half health. A
 * generated boss draws three more random values, so the same seed makes a different boss. The Trainee is unchanged.
 */
export const GAME_VERSION = '0.11.0';

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

/**
 * Replays the recorded input through the real game and returns the state after the last update.
 * A pair id as bossId replays both bosses; a fight with partners has no study, so a study value is ignored for it.
 */
export function replayFinalState(record: {
  bossId: string;
  dials: Dials;
  seed: number;
  /** Missing in records of schema version 1: replayed as 0. */
  study?: 0 | 1 | 2;
  input: readonly InputRun[];
}): GameState {
  const fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials);
  let state = createInitialState(fight, record.seed, record.study ?? 0);
  for (const frame of decodeInputs(record.input)) state = step(state, frame, fight);
  return state;
}

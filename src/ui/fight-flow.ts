import type { BossDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import type { GameState } from '../game/state';
import { createTracker, summarize, trackUpdate, type FightSummary, type SummaryTracker } from '../game/summary';
import { recordUpdate, startRecording, type FightMeta, type Recording } from '../stats/record';

/** What the app remembers about a fight in progress: the summary tracker, the recorded input, and the result once the fight has ended. */
export interface FightFlow {
  tracker: SummaryTracker;
  /** Set when the fight ends (win or loss); it is shown once the end pause is over. */
  ended: FightSummary | null;
  /** Every update's input from the first one to the ending update (none after it). */
  recording: Recording;
}

/** A fight that ended by itself (a win or a loss), ready to be saved. */
export interface FinishedFight {
  recording: Recording;
  result: 'victory' | 'defeat';
}

export const startFlow = (meta: FightMeta): FightFlow => ({
  tracker: createTracker(),
  ended: null,
  recording: startRecording(meta),
});

/**
 * Feeds one update. `show` is set when the engine restarts the fight after a win or loss: that is the moment
 * the summary screen replaces the fight. `finished` is set only on the update where the fight ends, with the
 * recording of the fight up to and including that update. `frame` is the input the update ran with.
 * Pure: the given flow, states and frame are never changed.
 */
export function advanceFlow(
  flow: FightFlow,
  before: GameState,
  after: GameState,
  boss: BossDef,
  frame: InputFrame,
): { flow: FightFlow; show: FightSummary | null; finished: FinishedFight | null } {
  // After a win or a loss the game shows its message, then starts a new fight: that new fight is not tracked.
  if (flow.ended !== null && after.phase === 'fight') return { flow, show: flow.ended, finished: null };
  // The ending update is recorded too; the updates after it (the end pause) are not.
  const recording = flow.ended === null ? recordUpdate(flow.recording, frame) : flow.recording;
  const tracker = trackUpdate(flow.tracker, after, before);
  let ended = flow.ended;
  let finished: FinishedFight | null = null;
  if (ended === null && after.phase !== 'fight') {
    const result = after.phase === 'victory' ? 'victory' : 'defeat';
    ended = summarize(tracker, after, boss, result);
    finished = { recording, result };
  }
  return { flow: { tracker, ended, recording }, show: null, finished };
}

/** The summary for leaving now: the real result if the fight already ended (leaving during the end pause), otherwise "left". */
export function leaveSummary(flow: FightFlow, state: GameState, boss: BossDef): FightSummary {
  return flow.ended ?? summarize(flow.tracker, state, boss, 'left');
}

/**
 * The recording to save when the player leaves: what was played so far, as "left". Null when the fight already
 * ended (it was handed out as `finished`) or when no update ran.
 */
export function leaveRecording(flow: FightFlow): { recording: Recording; result: 'left' } | null {
  if (flow.ended !== null || flow.recording.ticks === 0) return null;
  return { recording: flow.recording, result: 'left' };
}

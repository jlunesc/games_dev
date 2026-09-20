import type { BossDef } from '../bosses/schema';
import type { GameState } from '../game/state';
import { createTracker, summarize, trackUpdate, type FightSummary, type SummaryTracker } from '../game/summary';

/** What the app remembers about a fight in progress: the summary tracker, and the result once the fight has ended. */
export interface FightFlow {
  tracker: SummaryTracker;
  /** Set when the fight ends (win or loss); it is shown once the end pause is over. */
  ended: FightSummary | null;
}

export const startFlow = (): FightFlow => ({ tracker: createTracker(), ended: null });

/**
 * Feeds one update. `show` is set when the engine restarts the fight after a win or loss: that is the moment
 * the summary screen replaces the fight. Pure: the given flow and states are never changed.
 */
export function advanceFlow(
  flow: FightFlow,
  before: GameState,
  after: GameState,
  boss: BossDef,
): { flow: FightFlow; show: FightSummary | null } {
  // After a win or a loss the game shows its message, then starts a new fight: that new fight is not tracked.
  if (flow.ended !== null && after.phase === 'fight') return { flow, show: flow.ended };
  const tracker = trackUpdate(flow.tracker, after, before);
  let ended = flow.ended;
  if (ended === null && after.phase !== 'fight') {
    ended = summarize(tracker, after, boss, after.phase === 'victory' ? 'victory' : 'defeat');
  }
  return { flow: { tracker, ended }, show: null };
}

/** The summary for leaving now: the real result if the fight already ended (leaving during the end pause), otherwise "left". */
export function leaveSummary(flow: FightFlow, state: GameState, boss: BossDef): FightSummary {
  return flow.ended ?? summarize(flow.tracker, state, boss, 'left');
}

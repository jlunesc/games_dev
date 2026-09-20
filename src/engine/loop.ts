import { TICK_MS } from './time';

/** After a long stall (a hidden tab, a slow frame) at most this many updates run at once; the rest of the backlog is dropped. */
export const MAX_UPDATES_PER_FRAME = 5;

export interface UpdatePlan {
  /** Whole updates to run for this frame. */
  updates: number;
  /** Time carried over to the next frame. */
  leftoverMs: number;
  /** How far the picture is between the last update and the next one, from 0 up to just under 1. */
  alpha: number;
}

/** Turns real elapsed time into a number of fixed updates. Pure, so it can be tested without a clock. */
export function planUpdates(leftoverMs: number, frameMs: number): UpdatePlan {
  const total = leftoverMs + Math.max(0, frameMs);
  const due = Math.floor(total / TICK_MS + 1e-9);
  if (due > MAX_UPDATES_PER_FRAME) {
    return { updates: MAX_UPDATES_PER_FRAME, leftoverMs: 0, alpha: 0 };
  }
  const left = Math.max(0, total - due * TICK_MS);
  return { updates: due, leftoverMs: left, alpha: left / TICK_MS };
}

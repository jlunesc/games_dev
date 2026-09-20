import { FEEDBACK } from '../game/params';
import type { GameEvent } from '../game/state';

/** Effect timers that only exist for the eyes: they never feed back into the simulation. */
export interface FeedbackState {
  shakeTicks: number;
  bossFlashTicks: number;
  playerFlashTicks: number;
}

export const NO_FEEDBACK: FeedbackState = { shakeTicks: 0, bossFlashTicks: 0, playerFlashTicks: 0 };

/** How many updates the loop should hold still after these events (the longest one wins). */
export function freezeFor(events: readonly GameEvent[]): number {
  let freeze = 0;
  for (const event of events) {
    if (event === 'bossHit') freeze = Math.max(freeze, FEEDBACK.freezeOnBossHit);
    if (event === 'playerHit') freeze = Math.max(freeze, FEEDBACK.freezeOnPlayerHit);
  }
  return freeze;
}

export function applyEvents(fb: FeedbackState, events: readonly GameEvent[]): FeedbackState {
  const next = { ...fb };
  for (const event of events) {
    if (event === 'bossHit') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.bossFlashTicks = FEEDBACK.bossFlashTicks;
    }
    if (event === 'playerHit') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.playerFlashTicks = FEEDBACK.playerFlashTicks;
    }
  }
  return next;
}

/** Called once per real 60th of a second, including during a freeze, so effects fade in real time. */
export function advanceFeedback(fb: FeedbackState): FeedbackState {
  return {
    shakeTicks: Math.max(0, fb.shakeTicks - 1),
    bossFlashTicks: Math.max(0, fb.bossFlashTicks - 1),
    playerFlashTicks: Math.max(0, fb.playerFlashTicks - 1),
  };
}

/** Sideways screen offset in world units: alternates sides every update and fades out. */
export function shakeOffset(fb: FeedbackState): number {
  if (fb.shakeTicks <= 0) return 0;
  const strength = fb.shakeTicks / FEEDBACK.shakeTicks;
  return (fb.shakeTicks % 2 === 0 ? 1 : -1) * FEEDBACK.shakeAmplitude * strength;
}

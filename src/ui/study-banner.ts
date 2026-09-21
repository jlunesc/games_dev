import type { StudyState } from '../game/state';

/** How many updates "The fight begins!" stays up after the study ends (2 seconds at 60 updates a second). */
const BEGINS_TICKS = 120;

/** The line shown over the fight for the study phase, or null when there is nothing to say. */
export function studyBanner(study: StudyState, tick: number): string | null {
  if (study.active) return 'Study: watch what it can do. Nothing can hurt you.';
  if (study.endTick > 0 && tick - study.endTick < BEGINS_TICKS) return 'The fight begins!';
  return null;
}

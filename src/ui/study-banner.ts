import type { StudyState } from '../game/state';

/** How many updates the study text stays up at the start of the study (1 second at 60 updates a second). */
const STUDY_TEXT_TICKS = 60;

/** How many updates "The fight begins!" stays up after the study ends (1 second at 60 updates a second). */
const BEGINS_TICKS = 60;

/** The short note shown over the fight for the study phase, or null when there is nothing to say. */
export function studyBanner(study: StudyState, tick: number): string | null {
  if (study.active && tick < STUDY_TEXT_TICKS) return 'Study: watch what it can do. Nothing can hurt you.';
  if (study.endTick > 0 && tick - study.endTick < BEGINS_TICKS) return 'The fight begins!';
  return null;
}

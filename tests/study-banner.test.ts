import { describe, expect, it } from 'vitest';
import type { StudyState } from '../src/game/state';
import { studyBanner } from '../src/ui/study-banner';

const active: StudyState = { active: true, queue: ['a'], endTick: 0 };
const ended = (endTick: number): StudyState => ({ active: false, queue: [], endTick });

describe('studyBanner', () => {
  it('tells the player nothing can hurt them while the study runs', () => {
    expect(studyBanner(active, 0)).toBe('Study: watch what it can do. Nothing can hurt you.');
    expect(studyBanner(active, 500)).toBe('Study: watch what it can do. Nothing can hurt you.');
  });

  it('says the fight begins for 120 updates after the study ends', () => {
    expect(studyBanner(ended(300), 300)).toBe('The fight begins!');
    expect(studyBanner(ended(300), 419)).toBe('The fight begins!');
    expect(studyBanner(ended(300), 420)).toBeNull();
  });

  it('shows nothing when there was no study or it was off', () => {
    expect(studyBanner(ended(0), 0)).toBeNull();
    expect(studyBanner(ended(0), 1000)).toBeNull();
    expect(studyBanner({ active: false, queue: [], endTick: 0 }, 5)).toBeNull();
  });
});

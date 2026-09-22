import { describe, expect, it } from 'vitest';
import type { StudyState } from '../src/game/state';
import { studyBanner } from '../src/ui/study-banner';

const active: StudyState = { active: true, queue: ['a'], endTick: 0 };
const ended = (endTick: number): StudyState => ({ active: false, queue: [], endTick });

describe('studyBanner', () => {
  it('shows the study text for the first 60 updates of the study only', () => {
    expect(studyBanner(active, 0, false)).toBe('Study: watch what it can do. Nothing can hurt you.');
    expect(studyBanner(active, 59, false)).toBe('Study: watch what it can do. Nothing can hurt you.');
    expect(studyBanner(active, 60, false)).toBeNull();
    expect(studyBanner(active, 500, false)).toBeNull();
  });

  it('says the fight begins for 60 updates after the study ends', () => {
    expect(studyBanner(ended(300), 300, false)).toBe('The fight begins!');
    expect(studyBanner(ended(300), 359, false)).toBe('The fight begins!');
    expect(studyBanner(ended(300), 360, false)).toBeNull();
  });

  it('shows nothing when there was no study or it was off', () => {
    expect(studyBanner(ended(0), 0, false)).toBeNull();
    expect(studyBanner(ended(0), 1000, false)).toBeNull();
    expect(studyBanner({ active: false, queue: [], endTick: 0 }, 5, false)).toBeNull();
  });
});

describe('the unfair banner', () => {
  it('shows for 2 seconds once the real fight starts, with no study', () => {
    const noStudy: StudyState = { active: false, queue: [], endTick: 0 };
    expect(studyBanner(noStudy, 0, true)).toBe("This generated boss couldn't be checked as fair. Good luck!");
    expect(studyBanner(noStudy, 119, true)).toBe("This generated boss couldn't be checked as fair. Good luck!");
    expect(studyBanner(noStudy, 120, true)).toBeNull();
  });

  it('shows nothing when the boss is not marked unfair', () => {
    const noStudy: StudyState = { active: false, queue: [], endTick: 0 };
    expect(studyBanner(noStudy, 0, false)).toBeNull();
  });

  it('waits until "The fight begins!" finishes, after a study', () => {
    const afterStudy: StudyState = { active: false, queue: [], endTick: 300 };
    expect(studyBanner(afterStudy, 359, true)).toBe('The fight begins!'); // begins-banner still showing
    expect(studyBanner(afterStudy, 360, true)).toBe("This generated boss couldn't be checked as fair. Good luck!");
    expect(studyBanner(afterStudy, 419, true)).toBe("This generated boss couldn't be checked as fair. Good luck!");
    expect(studyBanner(afterStudy, 420, true)).toBeNull();
  });
});

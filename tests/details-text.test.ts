import { describe, expect, it } from 'vitest';
import { percent, recommendationText, seconds } from '../src/ui/details-text';

describe('details text', () => {
  it('writes shares as whole percents and no share as a dash', () => {
    expect(percent(0.375)).toBe('38%');
    expect(percent(1)).toBe('100%');
    expect(percent(null)).toBe('–');
  });

  it('writes updates as seconds', () => {
    expect(seconds(30)).toBe('0.5 s');
    expect(seconds(75)).toBe('1.25 s');
    expect(seconds(0)).toBe('0 s');
  });

  it('gives each recommendation with the counts it rests on', () => {
    const name = (id: string): string => (id === 'slam' ? 'Slam' : id);
    expect(recommendationText({ kind: 'hurt', attackId: 'slam', hits: 4, resolved: 7 }, name)).toBe(
      'Work on: Slam. It hit you 4 times of the 7 times it came.',
    );
    expect(recommendationText({ kind: 'hurt', attackId: 'slam', hits: 2, resolved: 5 }, name)).toBe(
      'Work on: Slam. It hit you twice of the 5 times it came.',
    );
    expect(recommendationText({ kind: 'hurt', attackId: 'slam', hits: 1, resolved: 1 }, name)).toBe('Work on: Slam. It came once and hit you.');
    expect(recommendationText({ kind: 'unanswered', attackId: 'slam', missed: 3, answerable: 6 }, name)).toBe(
      'Work on: replying to Slam. No attack hit you, but you did not reply to 3 of its 6 openings.',
    );
    expect(recommendationText({ kind: 'none' }, name)).toContain('Nothing stands out');
    expect(recommendationText({ kind: 'few' }, name)).toContain('did not attack');
  });
});

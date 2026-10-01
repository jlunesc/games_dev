import { describe, expect, it } from 'vitest';
import { binLabels, dodgeBinLabels, percent, recommendationText, replyBinLabels, seconds } from '../src/ui/details-text';

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

  it('labels bins from their edges, one more label than edges', () => {
    expect(binLabels([15, 30, 60])).toEqual(['under 0.25', '0.25–0.5', '0.5–1', '1+']);
    expect(replyBinLabels()).toHaveLength(6);
    expect(dodgeBinLabels()[0]).toBe('too late');
    expect(dodgeBinLabels()).toHaveLength(6);
  });

  it('gives each recommendation with the counts it rests on and the target', () => {
    expect(recommendationText({ kind: 'avoid', avoided: 3, total: 8 })).toBe(
      'Work on: avoiding attacks. You avoided 3 of 8 attacks (38%); the target is 70%.',
    );
    expect(recommendationText({ kind: 'aim', hits: 1, swings: 10 })).toBe(
      'Work on: your swings. 1 of 10 swings hit the boss (10%); the target is 50%.',
    );
    expect(recommendationText({ kind: 'reply', replied: 2, answerable: 8 })).toBe(
      'Work on: replying to attacks. You replied to 2 of 8 (25%); the target is 60%.',
    );
    expect(recommendationText({ kind: 'speed', medianTicks: 78 })).toBe(
      "Work on: replying faster. When you replied, it took a median of 1.3 s after the boss's attack ended; the target is 0.5 s.",
    );
    expect(recommendationText({ kind: 'none' })).toContain('Nothing stands out');
    expect(recommendationText({ kind: 'few' })).toContain('Too few');
  });
});

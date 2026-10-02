import { describe, expect, it } from 'vitest';
import { binLabels, clockTime, dodgeBinLabels, numberBlocks, percent, recommendationText, replyBinLabels, seconds } from '../src/ui/details-text';
import type { Numbers } from '../src/stats/details';

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

describe('the table of numbers', () => {
  const numbers: Numbers = {
    seconds: 60,
    you: { swings: 30, landed: 12, taken: 2, counters: 1, dashes: 20, jumps: 10 },
    boss: {
      started: 15,
      perAttack: [
        { attackId: 'slam', started: 10, hit: 2, dodged: 7, countered: 1, interrupted: 0 },
        { attackId: 'sweep', started: 5, hit: 0, dodged: 5, countered: 0, interrupted: 0 },
      ],
    },
    movement: { left: 1280, right: 2560, toward: 2000, away: 1840, leftTicks: 600, rightTicks: 1200, stillTicks: 1800, turns: 14, wallTicks: 360, airTicks: 180 },
    clock: { ticks: 3600, phaseTicks: [[2400, 1200]], attackingTicks: 1800, longestQuietTicks: 210 },
  };
  const names = (id: string): string => (id === 'slam' ? 'Slam' : 'Sweep');
  const rows = (title: string) => Object.fromEntries(numberBlocks(numbers, names).find((b) => b.title === title)!.rows);

  it('gives your actions with their rate per minute', () => {
    expect(rows('What you did')).toMatchObject({ Swings: '30 (30 a minute)', 'Swings that hit the boss': '12', 'Hits you took': '2', Counters: '1', Jumps: '10 (10 a minute)' });
  });

  it('lists the boss attacks by name with how each ended, leaving out zeros', () => {
    expect(rows('What the boss did')).toEqual({
      'Attacks started': '15 (15 a minute)',
      Slam: '10: 2 hit you, 7 dodged, 1 countered',
      Sweep: '5: 5 dodged',
    });
  });

  it('gives the distance in arena widths and the time as seconds with a share', () => {
    expect(rows('How you moved')).toMatchObject({
      'Travelled left': '1 arena width',
      'Travelled right': '2 arena widths',
      'Holding left': '10 s (17%)',
      'Changed direction': '14 times',
      'Next to a wall': '6 s (10%)',
    });
  });

  it('gives each phase and the time the boss attacked', () => {
    expect(rows('The clock')).toMatchObject({
      'Fight length': '1:00',
      'phase 1': '40 s (67%)',
      'phase 2': '20 s (33%)',
      'A boss attacking': '30 s (50%)',
      'Longest stretch with no attack': '3.5 s',
    });
  });

  it('leaves out the movement and clock blocks when they were not measured', () => {
    const titles = numberBlocks({ ...numbers, movement: null, clock: null }, names).map((b) => b.title);
    expect(titles).toEqual(['What you did', 'What the boss did']);
  });

  it('writes a time as minutes and seconds', () => {
    expect(clockTime(65 * 60)).toBe('1:05');
  });
});

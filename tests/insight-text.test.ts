import { describe, expect, it } from 'vitest';
import { asFight } from '../src/game/fight';
import type { Insight } from '../src/stats/insights';
import { attackNamer, insightText, workOnLines } from '../src/ui/insight-text';
import { DUELIST } from './helpers';

const nameOf = (id: string): string => ({ slam: 'Ember slam', sweep: 'Low sweep', lunge: 'Lunge', burst: 'Burst' })[id] ?? id;

const late = (hits: number, attackIds = ['slam']): Insight => ({ skill: 'dodge-late', cost: 0.4, attackIds, hits });

describe('attackNamer', () => {
  it('turns an attack id into its name, and keeps an unknown id as it is', () => {
    const name = attackNamer(asFight(DUELIST));
    expect(name('slam')).toBe('Ember slam');
    expect(name('nope')).toBe('nope');
  });
});

describe('insightText', () => {
  it('one sentence for each skill, with the evidence', () => {
    const all: Insight[] = [
      late(3, ['slam', 'sweep']),
      { skill: 'dodge-early', cost: 0.4, attackIds: ['lunge'], hits: 2 },
      { skill: 'dodge-other', cost: 0.4, attackIds: ['burst'], hits: 2 },
      { skill: 'no-dodge', cost: 0.4, attackIds: ['slam'], hits: 2 },
      { skill: 'greedy-swing', cost: 0.4, attackIds: ['sweep'], swings: 4, hurt: 2 },
      { skill: 'openings', cost: 0.1, attackIds: ['slam'], opened: 10, taken: 1, closeButMissed: 5 },
      { skill: 'approach', cost: 0.1, attackIds: ['slam'], opened: 10, tooFar: 4, meanDistance: 312.4, inReachPercent: 12 },
    ];
    expect(all.map((i) => insightText(i, nameOf))).toEqual([
      'Dodging too late: 3 hits came after a dodge that began too late or only just in time (Ember slam, Low sweep).',
      'Dodging too early: 2 hits landed after a dodge that began very early in the warning, so it may have ended before the attack arrived (Lunge).',
      'Dodging at the wrong moment: 2 hits came even though you dashed or jumped (Burst).',
      'Not dodging: 2 hits came with no dash or jump (Ember slam).',
      'Swinging at the wrong time: 4 swings were still going when an attack became dangerous, and 2 of those attacks hurt you (Low sweep).',
      'Openings: you hit the boss in 1 of 10 openings after its attacks, and 5 times you could have reached the boss but did not land a hit (Ember slam).',
      'Closing in: 4 openings closed before you could reach the boss (Ember slam). You were in swing range 12% of the time and 312 units away on average.',
    ]);
  });

  it('uses the singular for one', () => {
    expect(insightText(late(1), nameOf)).toBe(
      'Dodging too late: 1 hit came after a dodge that began too late or only just in time (Ember slam).',
    );
    expect(
      insightText({ skill: 'greedy-swing', cost: 0.2, attackIds: ['sweep'], swings: 1, hurt: 1 }, nameOf),
    ).toBe('Swinging at the wrong time: 1 swing was still going when an attack became dangerous, and 1 of those attacks hurt you (Low sweep).');
  });

  it('names at most three attacks', () => {
    const text = insightText(late(4, ['slam', 'sweep', 'lunge', 'burst']), nameOf);
    expect(text).toContain('(Ember slam, Low sweep, Lunge)');
    expect(text).not.toContain('Burst');
  });

  it('contains no HTML', () => {
    expect(insightText(late(2, ['<b>x</b>']), (id) => id)).toContain('<b>x</b>'); // names are data; the screen writes them with textContent
  });
});

describe('workOnLines', () => {
  it('heads the lines with "Work on:"', () => {
    expect(workOnLines([late(2)], nameOf)).toEqual([
      'Work on:',
      'Dodging too late: 2 hits came after a dodge that began too late or only just in time (Ember slam).',
    ]);
  });

  it('says nothing stands out when there is nothing to work on', () => {
    expect(workOnLines([], nameOf)).toEqual(['Nothing stands out this fight.']);
  });
});

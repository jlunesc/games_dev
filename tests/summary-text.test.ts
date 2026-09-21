import { describe, expect, it } from 'vitest';
import type { FightSummary } from '../src/game/summary';
import { formatTime, summaryLines } from '../src/ui/summary-text';

const base: FightSummary = {
  result: 'victory',
  ticks: 4344,
  seconds: 72.4,
  studySeconds: 0,
  phaseReached: 2,
  phaseCount: 2,
  hitsTaken: 3,
  bossHpLeft: 0,
  bossMaxHp: 30,
  mostDangerousAttack: { id: 'slam', name: 'Ember slam', hits: 2 },
};

describe('formatTime', () => {
  it('shows minutes and two-digit seconds, rounding down', () => {
    expect(formatTime(72.4)).toBe('1:12');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(59.99)).toBe('0:59');
  });
});

describe('summaryLines', () => {
  it('has a title for each result', () => {
    expect(summaryLines(base).title).toBe('Victory!');
    expect(summaryLines({ ...base, result: 'defeat' }).title).toBe('Defeated');
    expect(summaryLines({ ...base, result: 'left' }).title).toBe('You left the fight');
  });

  it('lists time, phase, hits, boss health and the attack that hurt most', () => {
    expect(summaryLines(base).lines).toEqual([
      'Time: 1:12',
      'Phase reached: 2 of 2',
      'Hits taken: 3',
      'Boss health left: 0 of 30',
      'Hurt you most: Ember slam (2 hits)',
    ]);
  });

  it('says so when nothing hurt the player, and uses the singular for one hit', () => {
    expect(summaryLines({ ...base, hitsTaken: 0, mostDangerousAttack: null }).lines.at(-1)).toBe(
      'You were never hit.',
    );
    expect(
      summaryLines({ ...base, mostDangerousAttack: { id: 'slam', name: 'Ember slam', hits: 1 } }).lines.at(-1),
    ).toBe('Hurt you most: Ember slam (1 hit)');
  });

  it('adds the study time after the time when there was a study', () => {
    expect(summaryLines({ ...base, studySeconds: 65.2 }).lines).toEqual([
      'Time: 1:12',
      'Study time: 1:05',
      'Phase reached: 2 of 2',
      'Hits taken: 3',
      'Boss health left: 0 of 30',
      'Hurt you most: Ember slam (2 hits)',
    ]);
  });

  it('says when the fight was left during the study, keeping the title', () => {
    const left: FightSummary = {
      ...base,
      result: 'left',
      seconds: 0,
      studySeconds: 12.5,
      phaseReached: 1,
      hitsTaken: 0,
      bossHpLeft: 30,
      mostDangerousAttack: null,
    };
    const text = summaryLines(left);
    expect(text.title).toBe('You left the fight');
    expect(text.lines).toEqual([
      'You left during the study.',
      'Time: 0:00',
      'Study time: 0:12',
      'Phase reached: 1 of 2',
      'Hits taken: 0',
      'Boss health left: 30 of 30',
      'You were never hit.',
    ]);
  });

  it('does not say it for a fight left after the study, or for a fight that ended', () => {
    expect(summaryLines({ ...base, result: 'left', seconds: 40, studySeconds: 12 }).lines[0]).toBe('Time: 0:40');
    expect(summaryLines({ ...base, studySeconds: 12 }).lines).not.toContain('You left during the study.');
  });
});

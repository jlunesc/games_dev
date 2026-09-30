import { describe, expect, it } from 'vitest';
import {
  ASHEN_HOUND,
  BOSSES,
  BRASS_SENTINEL,
  CINDER_GOLEM,
  EMBER_DUELIST,
  GALE_REAVER,
  QUILL_WARDEN,
  VEIL_DANCER,
  TREMOR_BRUTE,
  STORM_KITE,
  VESPER_SAGE,
  BOSS_CHOICES,
  bossById,
  bossChoiceDescription,
  bossChoiceName,
} from '../src/bosses';
import { PAIRS } from '../src/bosses/pairs';

describe('the boss list', () => {
  it('lists every shipped boss, the Duelist and the Hound first, in menu order', () => {
    expect(BOSSES).toEqual([EMBER_DUELIST, ASHEN_HOUND, QUILL_WARDEN, CINDER_GOLEM, VEIL_DANCER, GALE_REAVER, BRASS_SENTINEL, VESPER_SAGE, TREMOR_BRUTE, STORM_KITE]);
    expect(BOSSES.map((b) => b.id)).toEqual([
      'ember-duelist',
      'ashen-hound',
      'quill-warden',
      'cinder-golem',
      'veil-dancer',
      'gale-reaver',
      'brass-sentinel',
      'vesper-sage',
      'tremor-brute',
      'storm-kite',
    ]);
  });

  it('finds a boss by id and falls back to the Duelist for an unknown id', () => {
    expect(bossById('ember-duelist')).toBe(EMBER_DUELIST);
    expect(bossById('ashen-hound')).toBe(ASHEN_HOUND);
    expect(bossById('nobody')).toBe(EMBER_DUELIST);
  });
});

describe('the Boss row choices', () => {
  it('are the named bosses, then each pair, then Generated', () => {
    expect(BOSS_CHOICES.map((c) => c.id)).toEqual([
      ...BOSSES.map((b) => b.id),
      ...PAIRS.map((p) => p.id),
      'generated',
    ]);
    expect(BOSS_CHOICES.map((c) => c.id)).toContain('hound-and-sage');
    expect(BOSS_CHOICES[BOSS_CHOICES.length - 1]).toEqual({ id: 'generated', name: 'Generated' });
    expect(BOSS_CHOICES[BOSSES.length]).toEqual({ id: 'hound-and-sage', name: 'Hound and Sage' });
  });

  it('never repeat an id', () => {
    const ids = BOSS_CHOICES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('give the name of a boss, a pair and Generated, and the Duelist name for an unknown id', () => {
    expect(bossChoiceName('ashen-hound')).toBe('Ashen Hound');
    expect(bossChoiceName('hound-and-sage')).toBe('Hound and Sage');
    expect(bossChoiceName('generated')).toBe('Generated');
    expect(bossChoiceName('a-pair-that-was-removed')).toBe(EMBER_DUELIST.name);
  });
});

describe('boss descriptions', () => {
  it('every named boss has one, so the menu never shows an empty line for a single boss', () => {
    for (const boss of BOSSES) {
      expect(boss.description, boss.id).toBeTruthy();
      expect(boss.description!.length, boss.id).toBeLessThanOrEqual(140);
    }
  });

  it('are found by choice id for a named boss, and are absent for a pair, Generated or an unknown id', () => {
    expect(bossChoiceDescription('ashen-hound')).toBe(bossById('ashen-hound').description);
    expect(bossChoiceDescription('hound-and-sage')).toBeUndefined();
    expect(bossChoiceDescription('generated')).toBeUndefined();
    expect(bossChoiceDescription('nobody')).toBeUndefined();
  });
});

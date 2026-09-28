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
  VESPER_SAGE,
  bossById,
} from '../src/bosses';

describe('the boss list', () => {
  it('lists every shipped boss, the Duelist and the Hound first, in menu order', () => {
    expect(BOSSES).toEqual([EMBER_DUELIST, ASHEN_HOUND, QUILL_WARDEN, CINDER_GOLEM, VEIL_DANCER, GALE_REAVER, BRASS_SENTINEL, VESPER_SAGE, TREMOR_BRUTE]);
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
    ]);
  });

  it('finds a boss by id and falls back to the Duelist for an unknown id', () => {
    expect(bossById('ember-duelist')).toBe(EMBER_DUELIST);
    expect(bossById('ashen-hound')).toBe(ASHEN_HOUND);
    expect(bossById('nobody')).toBe(EMBER_DUELIST);
  });
});

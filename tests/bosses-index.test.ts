import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSSES, EMBER_DUELIST, bossById } from '../src/bosses';

describe('the boss list', () => {
  it('lists the Ember Duelist first and then the Ashen Hound', () => {
    expect(BOSSES).toEqual([EMBER_DUELIST, ASHEN_HOUND]);
    expect(BOSSES.map((b) => b.id)).toEqual(['ember-duelist', 'ashen-hound']);
  });

  it('finds a boss by id and falls back to the Duelist for an unknown id', () => {
    expect(bossById('ember-duelist')).toBe(EMBER_DUELIST);
    expect(bossById('ashen-hound')).toBe(ASHEN_HOUND);
    expect(bossById('nobody')).toBe(EMBER_DUELIST);
  });
});

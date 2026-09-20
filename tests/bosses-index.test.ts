import { describe, expect, it } from 'vitest';
import { BOSSES, EMBER_DUELIST, bossById } from '../src/bosses';

describe('the boss list', () => {
  it('lists the Ember Duelist', () => {
    expect(BOSSES).toContain(EMBER_DUELIST);
    expect(BOSSES.map((b) => b.id)).toEqual(['ember-duelist']);
  });

  it('finds a boss by id and falls back to the first boss for an unknown id', () => {
    expect(bossById('ember-duelist')).toBe(EMBER_DUELIST);
    expect(bossById('nobody')).toBe(BOSSES[0]);
  });
});

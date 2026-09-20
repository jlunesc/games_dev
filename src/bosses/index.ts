import raw from './ember-duelist.json';
import { parseBoss } from './parse';
import type { BossDef } from './schema';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);

/** Every boss the menu offers, in menu order. */
export const BOSSES: readonly BossDef[] = [EMBER_DUELIST];

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}

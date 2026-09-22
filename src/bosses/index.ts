import ashenHoundRaw from './ashen-hound.json';
import raw from './ember-duelist.json';
import { parseBoss } from './parse';
import type { BossDef } from './schema';
import rawTrainee from './trainee.json';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);

/** The Ashen Hound: a low, fast beast that dashes and leaps. Checked at load like the Duelist. */
export const ASHEN_HOUND = parseBoss(ashenHoundRaw);

/**
 * The Trainee: a plain, generous, hand-built boss (two `mustDodge` attacks, no leap, no counter,
 * no arena). Checked at load like the Duelist and the Hound. Not part of `BOSSES` and not offered
 * in the menu's Boss row on its own — it exists only as the generator's fallback (see
 * `src/bosses/generate`), used when a generated candidate keeps failing the fairness check.
 */
export const TRAINEE = parseBoss(rawTrainee);

/** Every boss the menu offers, in menu order. */
export const BOSSES: readonly BossDef[] = [EMBER_DUELIST, ASHEN_HOUND];

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}

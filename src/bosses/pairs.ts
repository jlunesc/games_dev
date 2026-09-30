import golemAndKiteRaw from './golem-and-kite.json';
import houndAndSageRaw from './hound-and-sage.json';
import { parsePair, type PairDef } from './pair';
import { BOSSES } from './roster';
import type { BossDef } from './schema';

const knownBoss = (id: string): BossDef | undefined => BOSSES.find((boss) => boss.id === id);

/** The Ashen Hound and the Vesper Sage together. Checked at load like a boss file: a broken file fails here with a message naming the exact place. */
export const HOUND_AND_SAGE = parsePair(houndAndSageRaw, knownBoss);

/** The Cinder Golem and the Storm Kite together. */
export const GOLEM_AND_KITE = parsePair(golemAndKiteRaw, knownBoss);

/** Every pair the menu offers, in menu order. */
export const PAIRS: readonly PairDef[] = [HOUND_AND_SAGE, GOLEM_AND_KITE];

/** The pair with this id, or `undefined` (a boss id, `'generated'` and any unknown id are not pairs). */
export function pairById(id: string): PairDef | undefined {
  return PAIRS.find((pair) => pair.id === id);
}

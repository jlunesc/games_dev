import bruteAndDancerRaw from './brute-and-dancer.json';
import golemAndKiteRaw from './golem-and-kite.json';
import houndAndSageRaw from './hound-and-sage.json';
import wardenAndBruteRaw from './warden-and-brute.json';
import { parsePair, type PairDef } from './pair';
import { BOSSES } from './roster';
import type { BossDef } from './schema';

const knownBoss = (id: string): BossDef | undefined => BOSSES.find((boss) => boss.id === id);

/** The Ashen Hound and the Vesper Sage together. Checked at load like a boss file: a broken file fails here with a message naming the exact place. */
export const HOUND_AND_SAGE = parsePair(houndAndSageRaw, knownBoss);

/** The Cinder Golem and the Storm Kite together. */
export const GOLEM_AND_KITE = parsePair(golemAndKiteRaw, knownBoss);

/** The Tremor Brute and the Veil Dancer together. */
export const BRUTE_AND_DANCER = parsePair(bruteAndDancerRaw, knownBoss);

/** The Quill Warden and the Tremor Brute together. */
export const WARDEN_AND_BRUTE = parsePair(wardenAndBruteRaw, knownBoss);

/** Every pair the menu offers, in menu order. */
export const PAIRS: readonly PairDef[] = [HOUND_AND_SAGE, GOLEM_AND_KITE, BRUTE_AND_DANCER, WARDEN_AND_BRUTE];

/** The pair with this id, or `undefined` (a boss id, `'generated'` and any unknown id are not pairs). */
export function pairById(id: string): PairDef | undefined {
  return PAIRS.find((pair) => pair.id === id);
}

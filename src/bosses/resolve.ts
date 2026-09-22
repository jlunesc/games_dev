import { generateBoss } from './generate/boss';
import { checkFairness as realCheckFairness } from './generate/fairness';
import { bossById, TRAINEE } from './index';
import { nextRandom } from '../game/rng';
import type { BossDef } from './schema';

/**
 * Resolves an id (and, for `'generated'`, a seed) to the boss to fight. A known named id is
 * identical to `bossById`. `'generated'` tries up to three seeded candidates — `seed`, then
 * `seed` advanced once, then advanced twice — returning the first that passes `checkFairness`;
 * if none of the three pass, it falls back to `TRAINEE`, so a fight is never unfair.
 *
 * `checkFairness` is only ever overridden by tests (to inject an always-fail or always-pass
 * checker and prove the retry/fallback logic deterministically); every real call site uses the
 * default. Pure: never mutates `BOSSES` or `TRAINEE`.
 */
export function resolveBoss(
  id: string,
  seed: number,
  checkFairness: typeof realCheckFairness = realCheckFairness,
): BossDef {
  if (id !== 'generated') return bossById(id);

  const first = generateBoss(seed);
  if (checkFairness(first).fair) return first;

  const second = generateBoss(nextRandom(seed).state);
  if (checkFairness(second).fair) return second;

  const third = generateBoss(nextRandom(nextRandom(seed).state).state);
  if (checkFairness(third).fair) return third;

  return TRAINEE;
}

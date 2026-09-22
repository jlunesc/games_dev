import { generateBoss } from './generate/boss';
import { checkFairness as realCheckFairness } from './generate/fairness';
import { bossById } from './index';
import { nextRandom } from '../game/rng';
import type { BossDef } from './schema';

export interface ResolvedBoss {
  boss: BossDef;
  /** True only for `'generated'`, when none of the three tries passed `checkFairness` — the first
   * candidate is used anyway (never a fallback boss) and the UI shows a banner warning the player. */
  unfair: boolean;
}

/**
 * Resolves an id (and, for `'generated'`, a seed) to the boss to fight. A known named id is
 * identical to `bossById`. `'generated'` tries up to three seeded candidates — `seed`, then
 * `seed` advanced once, then advanced twice — returning the first that passes `checkFairness`;
 * if none of the three pass, the first candidate is used anyway (`unfair: true`) rather than
 * falling back to a hand-built boss, and the UI shows the player a short banner instead.
 *
 * `checkFairness` is only ever overridden by tests (to inject an always-fail or always-pass
 * checker and prove the retry/fallback logic deterministically); every real call site uses the
 * default. Pure: never mutates `BOSSES` or `TRAINEE`.
 */
export function resolveBoss(
  id: string,
  seed: number,
  checkFairness: typeof realCheckFairness = realCheckFairness,
): ResolvedBoss {
  if (id !== 'generated') return { boss: bossById(id), unfair: false };

  const first = generateBoss(seed);
  if (checkFairness(first).fair) return { boss: first, unfair: false };

  const second = generateBoss(nextRandom(seed).state);
  if (checkFairness(second).fair) return { boss: second, unfair: false };

  const third = generateBoss(nextRandom(nextRandom(seed).state).state);
  if (checkFairness(third).fair) return { boss: third, unfair: false };

  return { boss: first, unfair: true };
}

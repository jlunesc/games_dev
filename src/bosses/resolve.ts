import { generateBoss } from './generate/boss';
import { checkFairness as realCheckFairness } from './generate/fairness';
import { makeFight, type FightDef } from '../game/fight';
import { nextRandom } from '../game/rng';
import { bossById } from './index';
import { pairById } from './pairs';
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

export interface ResolvedFight {
  fight: FightDef;
  /** Same meaning as `ResolvedBoss.unfair`; a pair is never unfair. */
  unfair: boolean;
}

/** A copy of the boss with its health scaled for a pair (rounded, at least 1). The dials apply on top later. */
function scaleHealth(boss: BossDef, scale: number): BossDef {
  return { ...boss, maxHp: Math.max(1, Math.round(boss.maxHp * scale)) };
}

/**
 * Resolves an id to the fight to play. A pair id gives its two bosses (health scaled) and its enrage.
 * Any other id (a boss id, `'generated'`, or an unknown one) gives a fight of the one boss `resolveBoss`
 * gives, so a solo fight is exactly what it was before pairs existed. `checkFairness` is only overridden by tests.
 */
export function resolveFight(
  id: string,
  seed: number,
  checkFairness: typeof realCheckFairness = realCheckFairness,
): ResolvedFight {
  const pair = pairById(id);
  if (pair === undefined) {
    const { boss, unfair } = resolveBoss(id, seed, checkFairness);
    return { fight: makeFight([boss]), unfair };
  }
  const bosses = pair.bosses.map((member) => scaleHealth(bossById(member.boss), member.healthScale));
  return { fight: makeFight(bosses, pair.enrage), unfair: false };
}

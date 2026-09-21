import type { BossDef } from '../bosses/schema';
import { TICK_RATE } from '../engine/time';
import type { GameState } from './state';

export type FightResult = 'victory' | 'defeat' | 'left';

/** What the summary needs to remember while a fight is played. Plain data, updated without mutation. */
export interface SummaryTracker {
  hitsByAttack: Record<string, number>;
  hitsTaken: number;
  /** 1-based: the highest boss phase seen. */
  phaseReached: number;
}

export const createTracker = (): SummaryTracker => ({
  hitsByAttack: {},
  hitsTaken: 0,
  phaseReached: 1,
});

/** Feeds one update (the state after it and the state before it) to the tracker and returns the new tracker. */
export function trackUpdate(
  tracker: SummaryTracker,
  state: GameState,
  previous: GameState,
): SummaryTracker {
  let hitsByAttack = tracker.hitsByAttack;
  let hitsTaken = tracker.hitsTaken;
  for (const event of state.events) {
    if (event !== 'playerHit') continue;
    // The attack may end on the very update that hits, so fall back to the previous state.
    const id = state.boss.attackId ?? previous.boss.attackId ?? 'unknown';
    hitsByAttack = { ...hitsByAttack, [id]: (hitsByAttack[id] ?? 0) + 1 };
    hitsTaken += 1;
  }
  return {
    hitsByAttack,
    hitsTaken,
    phaseReached: Math.max(tracker.phaseReached, state.boss.phase + 1),
  };
}

export interface FightSummary {
  result: FightResult;
  /** Updates played. */
  ticks: number;
  /** Time in the fight itself, without the study (0 while the study is still on). */
  seconds: number;
  /** Time the study took (the time played so far if it is still on); 0 when there was none. */
  studySeconds: number;
  /** True when the study was still on at this state (a fight left during the study). */
  studyActive: boolean;
  phaseReached: number;
  phaseCount: number;
  hitsTaken: number;
  bossHpLeft: number;
  bossMaxHp: number;
  mostDangerousAttack: { id: string; name: string; hits: number } | null;
}

/** The summary of a fight from its tracker and its final state. */
export function summarize(
  tracker: SummaryTracker,
  state: GameState,
  boss: BossDef,
  result: FightResult,
): FightSummary {
  let worst: { id: string; name: string; hits: number } | null = null;
  // Strict ">" keeps the attack listed first in the boss file on a tie.
  for (const attack of boss.attacks) {
    const hits = tracker.hitsByAttack[attack.id] ?? 0;
    if (hits > (worst?.hits ?? 0)) worst = { id: attack.id, name: attack.name, hits };
  }
  const studyTicks = state.study.active ? state.tick : state.study.endTick;
  return {
    result,
    ticks: state.tick,
    seconds: (state.tick - studyTicks) / TICK_RATE,
    studySeconds: studyTicks / TICK_RATE,
    studyActive: state.study.active,
    phaseReached: tracker.phaseReached,
    phaseCount: boss.phases.length,
    hitsTaken: tracker.hitsTaken,
    bossHpLeft: state.boss.hp,
    bossMaxHp: boss.maxHp,
    mostDangerousAttack: worst,
  };
}

import type { BossDef } from '../bosses/schema';
import { TICK_RATE } from '../engine/time';
import { asFight, type FightDef } from './fight';
import { bossAt, bossCount, type GameState } from './state';

export type FightResult = 'victory' | 'defeat' | 'left';

/** What the summary needs to remember while a fight is played. Plain data, updated without mutation. */
export interface SummaryTracker {
  hitsByAttack: Record<string, number>;
  hitsTaken: number;
  /** 1-based: the highest boss phase seen. */
  phaseReached: number;
}

/** Hits by the primary boss's attacks are counted under the attack id; a partner's under `<index>:<id>`. */
const attackKey = (index: number, id: string): string => (index === 0 ? id : `${index}:${id}`);

/**
 * The attack that is hurting the player: the one going on now or, when it ended on the very update that hit, on the
 * update before. Only one boss attacks at a time.
 */
function hurtingAttack(state: GameState, previous: GameState): string {
  for (let index = 0; index < bossCount(state); index++) {
    const id = bossAt(state, index).attackId ?? bossAt(previous, index).attackId;
    if (id !== null) return attackKey(index, id);
  }
  return 'unknown';
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
    const id = hurtingAttack(state, previous);
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
  /** The primary boss's phase reached and phase count. */
  phaseReached: number;
  phaseCount: number;
  hitsTaken: number;
  /** Summed over every boss of the fight. */
  bossHpLeft: number;
  bossMaxHp: number;
  /** One entry per boss, in fight order (the primary boss first). */
  bosses: { name: string; hpLeft: number; maxHp: number }[];
  mostDangerousAttack: { id: string; name: string; hits: number } | null;
}

/** The summary of a fight from its tracker and its final state. */
export function summarize(
  tracker: SummaryTracker,
  state: GameState,
  source: BossDef | FightDef,
  result: FightResult,
): FightSummary {
  const fight = asFight(source);
  let worst: { id: string; name: string; hits: number } | null = null;
  // Strict ">" keeps the attack listed first (the primary boss's before its partner's) on a tie.
  for (const [index, boss] of fight.bosses.entries()) {
    for (const attack of boss.attacks) {
      const hits = tracker.hitsByAttack[attackKey(index, attack.id)] ?? 0;
      if (hits <= (worst?.hits ?? 0)) continue;
      const name = fight.bosses.length > 1 ? `${boss.name}'s ${attack.name}` : attack.name;
      worst = { id: attack.id, name, hits };
    }
  }
  const bosses = fight.bosses.map((boss, index) => ({
    name: boss.name,
    hpLeft: bossAt(state, index).hp,
    maxHp: boss.maxHp,
  }));
  const studyTicks = state.study.active ? state.tick : state.study.endTick;
  return {
    result,
    ticks: state.tick,
    seconds: (state.tick - studyTicks) / TICK_RATE,
    studySeconds: studyTicks / TICK_RATE,
    studyActive: state.study.active,
    phaseReached: tracker.phaseReached,
    phaseCount: fight.bosses[0]!.phases.length,
    hitsTaken: tracker.hitsTaken,
    bossHpLeft: bosses.reduce((total, b) => total + b.hpLeft, 0),
    bossMaxHp: bosses.reduce((total, b) => total + b.maxHp, 0),
    bosses,
    mostDangerousAttack: worst,
  };
}

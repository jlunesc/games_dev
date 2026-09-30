import { PLAYER } from '../game/params';
import type { Analysis, AttackOccurrence } from './analyze';
import { INSIGHT_TUNING as T } from './insights-tuning';

/** How one hit came about, from the dodge timing data already in the analysis. */
export type HitKind = 'late' | 'early' | 'other' | 'greedy' | 'no-dodge';

/**
 * Each hit goes in one class. With a dodge action (a dash or jump before or during the attack): late (began in
 * the last `lateShare` of the warning, or after the danger began), else early (began in the first `earlyShare`),
 * else other. Without one: greedy when a swing was going at the danger, else no dodge.
 */
export function classifyHit(hit: AttackOccurrence): HitKind {
  const warning = hit.firstDangerTick - hit.startTick;
  if (hit.marginTicks !== null && warning > 0) {
    if (hit.marginTicks / warning <= T.lateShare) return 'late';
    if (hit.reactionTicks !== null && hit.reactionTicks / warning <= T.earlyShare) return 'early';
    return 'other';
  }
  return hit.swingAtDanger ? 'greedy' : 'no-dodge';
}

interface InsightBase {
  /** A share of a whole fight (health lost over the player's health, or damage missed over the bosses' health), so different problems can be ranked together. */
  cost: number;
  /** The attacks that show it, each once, in the order they first appear. */
  attackIds: string[];
}

export type Insight =
  | (InsightBase & { skill: 'dodge-late' | 'dodge-early' | 'dodge-other' | 'no-dodge'; hits: number })
  | (InsightBase & { skill: 'greedy-swing'; swings: number; hurt: number })
  | (InsightBase & { skill: 'openings'; opened: number; taken: number; closeButMissed: number })
  | (InsightBase & { skill: 'approach'; opened: number; tooFar: number; meanDistance: number; inReachPercent: number });

type Skill = Insight['skill'];

/** The order that breaks a tie in cost. */
const ORDER: readonly Skill[] = ['dodge-late', 'dodge-early', 'dodge-other', 'no-dodge', 'greedy-swing', 'openings', 'approach'];

const unique = (ids: string[]): string[] => [...new Set(ids)];
const healthCost = (hits: AttackOccurrence[]): number =>
  hits.reduce((total, h) => total + h.damageTaken, 0) / PLAYER.maxHealth;

const HIT_SKILL = { late: 'dodge-late', early: 'dodge-early', other: 'dodge-other', 'no-dodge': 'no-dodge' } as const;

function hitInsights(analysis: Analysis): Insight[] {
  const hits = analysis.attacks.filter((x) => !x.study && x.outcome === 'hit');
  const found: Insight[] = [];
  for (const kind of ['late', 'early', 'other', 'no-dodge'] as const) {
    const list = hits.filter((h) => classifyHit(h) === kind);
    if (list.length < T.minHitsForPattern) continue;
    found.push({
      skill: HIT_SKILL[kind],
      cost: healthCost(list),
      attackIds: unique(list.map((h) => h.attackId)),
      hits: list.length,
    });
  }
  const greedy = hits.filter((h) => classifyHit(h) === 'greedy');
  if (analysis.behavior.greedySwings >= T.minGreedySwings && greedy.length > 0) {
    found.push({
      skill: 'greedy-swing',
      cost: healthCost(greedy),
      attackIds: unique(greedy.map((h) => h.attackId)),
      swings: analysis.behavior.greedySwings,
      hurt: analysis.behavior.greedyHits,
    });
  }
  return found;
}

function openingInsights(analysis: Analysis): Insight[] {
  const p = analysis.behavior.punish;
  if (p.opened < T.minOpenings || analysis.bossMaxHp <= 0) return [];
  const missed = p.windows.filter((w) => !w.hit);
  const tooFar = missed.filter((w) => !w.reachable);
  const close = missed.filter((w) => w.reachable);
  // What one missed opening would have been worth: the player's own damage per landed hit, or 1 when they never landed one.
  const perHit = analysis.swingsThatHit > 0 ? analysis.damageDealt / analysis.swingsThatHit : 1;
  const share = (n: number): number => Math.min(1, (n * perHit) / analysis.bossMaxHp);
  const found: Insight[] = [];
  if (close.length >= T.minMissedOpenings) {
    found.push({
      skill: 'openings',
      cost: share(close.length),
      attackIds: unique(close.map((w) => w.attackId)),
      opened: p.opened,
      taken: p.taken,
      closeButMissed: close.length,
    });
  }
  if (tooFar.length >= T.minMissedOpenings) {
    const realUpdates = analysis.ticks - analysis.study.ticks;
    found.push({
      skill: 'approach',
      cost: share(tooFar.length),
      attackIds: unique(tooFar.map((w) => w.attackId)),
      opened: p.opened,
      tooFar: tooFar.length,
      meanDistance: analysis.behavior.realMeanDistance,
      inReachPercent: realUpdates > 0 ? Math.round((100 * analysis.behavior.realUpdatesInReach) / realUpdates) : 0,
    });
  }
  return found;
}

/**
 * What to work on after one fight: the problems with a cost above 0, highest cost first, at most
 * `INSIGHT_TUNING.maxLines`. Pure: it reads only the analysis. An analysis from before schema version 7 has no
 * swing, opening or distance numbers, so the skills that need them are left out.
 */
export function insightsFor(analysis: Analysis): Insight[] {
  const hasVersion7 = analysis.dashUse !== undefined;
  const found = hasVersion7
    ? [...hitInsights(analysis), ...openingInsights(analysis)]
    : hitInsights({ ...analysis, behavior: { ...analysis.behavior, greedySwings: 0 } }).filter(
        (i) => i.skill !== 'no-dodge' && i.skill !== 'greedy-swing',
      );
  return found
    .filter((i) => i.cost > 0)
    .sort((a, b) => b.cost - a.cost || ORDER.indexOf(a.skill) - ORDER.indexOf(b.skill))
    .slice(0, T.maxLines);
}

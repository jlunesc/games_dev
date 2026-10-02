import type { Analysis } from './analyze';
import { DETAILS_TUNING as T } from './details-tuning';
import type { DodgeRating } from './dodges';
import type { ReplayMeasures } from './meter';

/** The numbers behind the plots of the fight details screen, for the real fight only (the study is left out). */
export interface FightDetails {
  avoided: {
    /** Attacks dodged or countered, attacks that hit, and the two added (an attack cut short by the end of the fight is not counted). */
    avoided: number;
    hit: number;
    total: number;
    share: number | null;
    /**
     * How the attacks that were avoided were avoided. `saved` and `unneeded` are the dodges (a dash or jump during the attack)
     * that, replayed without the dodge, would have hit or would not have; `outOfReach` never threatened the player; `unrated` is
     * a dodge nobody replayed (no ratings were given).
     */
    methods: { saved: number; unneeded: number; platform: number; cover: number; outOfReach: number; countered: number; unrated: number };
  };
  hitRate: { swings: number; hits: number; share: number | null };
  perMinute: { swings: number; dashes: number; jumps: number };
  reply: {
    /** Attacks the player could answer: countered ones, and openings long enough to swing in (`T.minReplyWindowTicks`). */
    answerable: number;
    /** Of those, the countered ones and the openings in which the player began a swing. */
    replied: number;
    share: number | null;
    /** Median updates from the opening to the swing, over the openings with a swing; null when there was none. */
    medianTicks: number | null;
    /** Reply times in bins (`T.replyBinEdges`), telling a swing that hit from one that did not. */
    bins: { hit: number; missed: number }[];
    perAttack: { attackId: string; answerable: number; replied: number; medianTicks: number | null }[];
  };
  /** Updates of the real fight close to, a middling way from, and far from the boss. */
  distance: { close: number; mid: number; far: number };
  /** Updates into the real fight: its length and when the player's swings, hits landed and hits taken happened. */
  timeline: { length: number; landed: number[]; taken: number[]; swings: number[] };
  /** The player's dashes and jumps, in updates into the real fight. */
  moves: { dashes: number[]; jumps: number[] };
  /** Every real attack of the boss as a stretch of the same count: the warning from `start`, danger from `dangerStart`, over at `end`. */
  attackBands: AttackBand[];
  /** The dashes and jumps made during attacks, replayed without them (see `rateDodges`); null when no ratings were given. `slackBins`: of the saved ones, how much later they could have begun (`T.slackBinEdges`). */
  dodges: { saved: number; unneeded: number; hitAnyway: number; slackBins: number[] } | null;
  numbers: Numbers;
  recommendation: Recommendation;
}

export interface AttackBand {
  attackId: string;
  boss: number;
  start: number;
  dangerStart: number;
  end: number;
  outcome: Analysis['attacks'][number]['outcome'];
}

/** One attack of the boss, counted over the real fight by how it ended. */
export interface AttackCount {
  attackId: string;
  started: number;
  hit: number;
  dodged: number;
  countered: number;
  /** Cut short by the end of the fight or a phase change. */
  interrupted: number;
}

/** The counts behind the attack bars and the movement plots, for the real fight only. `movement` and `clock` need the replay's meter, so they are null without it. */
export interface Numbers {
  boss: { started: number; perAttack: AttackCount[] };
  movement: ReplayMeasures['movement'] | null;
  clock: ReplayMeasures['clock'] | null;
}

/** One sentence of advice, from ranking the attacks within the one fight: there is no target or cut-off to reach. */
export type Recommendation =
  /** The attack that hit the player most (`resolved` is how many times it came and was settled: hit, dodged or countered). */
  | { kind: 'hurt'; attackId: string; hits: number; resolved: number }
  /** Nothing hit the player; the attack whose openings were left unanswered most often. */
  | { kind: 'unanswered'; attackId: string; missed: number; answerable: number }
  /** No attack hit the player and every opening was answered. */
  | { kind: 'none' }
  /** The boss never attacked in the real fight. */
  | { kind: 'few' };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The index of the first bin whose upper edge is above the value; the last bin when none is. */
const binOf = (value: number, edges: readonly number[]): number => {
  const i = edges.findIndex((edge) => value < edge);
  return i === -1 ? edges.length : i;
};

const share = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

/** The first of equal candidates wins; `better(a, b)` is true when `a` should replace `b`. */
function best<T>(items: T[], better: (a: T, b: T) => boolean): T | undefined {
  return items.reduce<T | undefined>((top, item) => (top === undefined || better(item, top) ? item : top), undefined);
}

/**
 * The attack that hit the player most, ties going to the one that hit the larger share of its appearances. When nothing
 * hit, the attack with the most openings left unanswered, ties likewise. Counts only, so no number can be "good enough".
 */
function recommend(d: Omit<FightDetails, 'recommendation'>): Recommendation {
  if (d.numbers.boss.started === 0) return { kind: 'few' };
  const hurt = d.numbers.boss.perAttack
    .filter((a) => a.hit > 0)
    .map((a) => ({ attackId: a.attackId, hits: a.hit, resolved: a.hit + a.dodged + a.countered }));
  const worst = best(hurt, (a, b) => a.hits > b.hits || (a.hits === b.hits && a.hits / a.resolved > b.hits / b.resolved));
  if (worst !== undefined) return { kind: 'hurt', ...worst };
  const open = d.reply.perAttack
    .map((a) => ({ attackId: a.attackId, missed: a.answerable - a.replied, answerable: a.answerable }))
    .filter((a) => a.missed > 0);
  const neglected = best(open, (a, b) => a.missed > b.missed || (a.missed === b.missed && a.missed / a.answerable > b.missed / b.answerable));
  if (neglected !== undefined) return { kind: 'unanswered', ...neglected };
  return { kind: 'none' };
}

/**
 * The measured numbers for the details screen, from one fight's analysis. Pure. Every figure is a count or a
 * share of something the game measured; none says why. The recommendation is the one number furthest below its
 * target, given with the counts it comes from, or "none" / "few".
 */
export function fightDetails(analysis: Analysis, measures?: ReplayMeasures, ratings?: DodgeRating[]): FightDetails {
  const studyTicks = analysis.study.ticks;
  const realAttacks = analysis.attacks.filter((a) => !a.study);
  const hits = realAttacks.filter((a) => a.outcome === 'hit').length;
  const countered = realAttacks.filter((a) => a.outcome === 'countered').length;
  const dodged = realAttacks.filter((a) => a.outcome === 'dodged');
  const avoidedCount = dodged.length + countered;
  const ratingOf = (a: Analysis['attacks'][number]): DodgeRating | undefined =>
    ratings?.find((r) => r.boss === a.boss && r.attackId === a.attackId && Math.abs(r.start - (a.startTick - studyTicks)) <= 1);
  const methods = { saved: 0, unneeded: 0, platform: 0, cover: 0, outOfReach: 0, countered, unrated: 0 };
  for (const a of dodged) {
    const verdict = ratingOf(a)?.verdict;
    if (verdict === 'saved' || verdict === 'unneeded') methods[verdict] += 1;
    else if (a.evasion === 'platform' || a.evasion === 'cover') methods[a.evasion] += 1;
    else if (a.evasion === 'distance') methods.outOfReach += 1;
    else methods.unrated += 1;
  }

  const realTicks = (ticks: number[]): number[] => ticks.filter((t) => t > studyTicks).map((t) => t - studyTicks);
  const swings = realTicks(analysis.swingTicks);
  const landed = realTicks(analysis.bossHitTicks);
  const minutes = analysis.fightSeconds / 60;
  const perMinute = (n: number): number => (minutes > 0 ? n / minutes : 0);

  const windows = analysis.behavior.punish.windows.filter((w) => w.ticks >= T.minReplyWindowTicks);
  const replies = windows.filter((w) => w.replyTicks !== null);
  const replyTimes = replies.map((w) => w.replyTicks!);
  const answerable = countered + windows.length;
  const replied = countered + replies.length;
  const replyBins = Array.from({ length: T.replyBinEdges.length + 1 }, () => ({ hit: 0, missed: 0 }));
  for (const w of replies) replyBins[binOf(w.replyTicks!, T.replyBinEdges)]![w.hit ? 'hit' : 'missed'] += 1;
  const ids = [...new Set([...windows.map((w) => w.attackId), ...realAttacks.filter((a) => a.outcome === 'countered').map((a) => a.attackId)])];

  const dodges =
    ratings === undefined
      ? null
      : {
          saved: ratings.filter((r) => r.verdict === 'saved').length,
          unneeded: ratings.filter((r) => r.verdict === 'unneeded').length,
          hitAnyway: ratings.filter((r) => r.verdict === 'hitAnyway').length,
          slackBins: ratings.reduce(
            (bins, r) => {
              if (r.slackTicks !== null) bins[binOf(r.slackTicks, T.slackBinEdges)]! += 1;
              return bins;
            },
            Array.from({ length: T.slackBinEdges.length + 1 }, () => 0),
          ),
        };

  const perAttack: AttackCount[] = [];
  for (const a of realAttacks) {
    let entry = perAttack.find((x) => x.attackId === a.attackId);
    if (entry === undefined) {
      entry = { attackId: a.attackId, started: 0, hit: 0, dodged: 0, countered: 0, interrupted: 0 };
      perAttack.push(entry);
    }
    entry.started += 1;
    entry[a.outcome] += 1;
  }

  const b = analysis.behavior;
  const details: Omit<FightDetails, 'recommendation'> = {
    avoided: { avoided: avoidedCount, hit: hits, total: avoidedCount + hits, share: share(avoidedCount, avoidedCount + hits), methods },
    hitRate: { swings: swings.length, hits: landed.length, share: share(landed.length, swings.length) },
    perMinute: {
      swings: perMinute(swings.length),
      dashes: perMinute(realTicks(analysis.dashTicks).length),
      jumps: perMinute(realTicks(analysis.jumpTicks).length),
    },
    reply: {
      answerable,
      replied,
      share: share(replied, answerable),
      medianTicks: median(replyTimes),
      bins: replyBins,
      perAttack: ids.map((id) => {
        const own = windows.filter((w) => w.attackId === id);
        const times = own.filter((w) => w.replyTicks !== null).map((w) => w.replyTicks!);
        const counters = realAttacks.filter((a) => a.attackId === id && a.outcome === 'countered').length;
        return { attackId: id, answerable: own.length + counters, replied: times.length + counters, medianTicks: median(times) };
      }),
    },
    distance: {
      close: b.updatesClose - b.studyUpdatesClose,
      mid: b.updatesMid - b.studyUpdatesMid,
      far: b.updatesFar - b.studyUpdatesFar,
    },
    timeline: {
      length: analysis.ticks - studyTicks,
      landed,
      taken: realTicks(analysis.playerHitTicks),
      swings,
    },
    moves: { dashes: realTicks(analysis.dashTicks), jumps: realTicks(analysis.jumpTicks) },
    attackBands: realAttacks.map((a): AttackBand => {
      const start = a.startTick - studyTicks;
      const dangerStart = Math.max(start, a.firstDangerTick - studyTicks);
      const found = measures?.clock.bands.find((x) => x.boss === a.boss && Math.abs(x.start - start) <= 1);
      return { attackId: a.attackId, boss: a.boss, start, dangerStart, end: Math.max(dangerStart + 1, found?.end ?? dangerStart + 1), outcome: a.outcome };
    }),
    dodges,
    numbers: {
      boss: { started: realAttacks.length, perAttack },
      movement: measures?.movement ?? null,
      clock: measures?.clock ?? null,
    },
  };
  return { ...details, recommendation: analysis.fightSeconds > 0 ? recommend(details) : { kind: 'few' } };
}

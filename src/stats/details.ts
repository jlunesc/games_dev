import type { Analysis } from './analyze';
import { DETAILS_TUNING as T } from './details-tuning';

/** The numbers behind the plots of the fight details screen, for the real fight only (the study is left out). */
export interface FightDetails {
  avoided: {
    /** Attacks dodged or countered, attacks that hit, and the two added (an attack cut short by the end of the fight is not counted). */
    avoided: number;
    hit: number;
    total: number;
    share: number | null;
    /** How the attacks that were avoided were avoided. */
    methods: { dash: number; jump: number; platform: number; cover: number; distance: number; countered: number };
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
  /** How early dodges began, in bins (`T.dodgeBinEdges`; the first is a dodge that began after the danger did). */
  dodgeTiming: { dodged: number; hit: number }[];
  recommendation: Recommendation;
}

export type Recommendation =
  | { kind: 'avoid'; avoided: number; total: number }
  | { kind: 'aim'; hits: number; swings: number }
  | { kind: 'reply'; replied: number; answerable: number }
  | { kind: 'speed'; medianTicks: number }
  /** Every number that could be judged reaches its target. */
  | { kind: 'none' }
  /** No number rests on enough cases to be judged. */
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

function recommend(d: Omit<FightDetails, 'recommendation'>): Recommendation {
  const options: { shortfall: number; pick: Recommendation }[] = [];
  const { targets } = T;
  if (d.avoided.total >= T.minAttacks && d.avoided.share !== null) {
    options.push({
      shortfall: (targets.avoided - d.avoided.share) / targets.avoided,
      pick: { kind: 'avoid', avoided: d.avoided.avoided, total: d.avoided.total },
    });
  }
  if (d.hitRate.swings >= T.minSwings && d.hitRate.share !== null) {
    options.push({
      shortfall: (targets.hitRate - d.hitRate.share) / targets.hitRate,
      pick: { kind: 'aim', hits: d.hitRate.hits, swings: d.hitRate.swings },
    });
  }
  if (d.reply.answerable >= T.minAnswerable && d.reply.share !== null) {
    options.push({
      shortfall: (targets.answered - d.reply.share) / targets.answered,
      pick: { kind: 'reply', replied: d.reply.replied, answerable: d.reply.answerable },
    });
  }
  const replyTimes = d.reply.bins.reduce((n, b) => n + b.hit + b.missed, 0);
  if (replyTimes >= T.minReplies && d.reply.medianTicks !== null) {
    options.push({
      shortfall: Math.min(1, (d.reply.medianTicks - targets.replyTicks) / targets.replyTicks),
      pick: { kind: 'speed', medianTicks: d.reply.medianTicks },
    });
  }
  if (options.length === 0) return { kind: 'few' };
  // The first of equal shortfalls wins: the options are in the order avoid, aim, reply, speed.
  const worst = options.reduce((best, o) => (o.shortfall > best.shortfall ? o : best));
  return worst.shortfall > 0 ? worst.pick : { kind: 'none' };
}

/**
 * The measured numbers for the details screen, from one fight's analysis. Pure. Every figure is a count or a
 * share of something the game measured; none says why. The recommendation is the one number furthest below its
 * target, given with the counts it comes from, or "none" / "few".
 */
export function fightDetails(analysis: Analysis): FightDetails {
  const studyTicks = analysis.study.ticks;
  const realAttacks = analysis.attacks.filter((a) => !a.study);
  const hits = realAttacks.filter((a) => a.outcome === 'hit').length;
  const countered = realAttacks.filter((a) => a.outcome === 'countered').length;
  const dodged = realAttacks.filter((a) => a.outcome === 'dodged');
  const avoidedCount = dodged.length + countered;
  const methods = { dash: 0, jump: 0, platform: 0, cover: 0, distance: 0, countered };
  for (const a of dodged) if (a.evasion !== null) methods[a.evasion] += 1;

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

  const dodgeBins = Array.from({ length: T.dodgeBinEdges.length + 1 }, () => ({ dodged: 0, hit: 0 }));
  for (const a of realAttacks) {
    if (a.marginTicks === null) continue;
    if (a.outcome === 'hit') dodgeBins[binOf(a.marginTicks, T.dodgeBinEdges)]!.hit += 1;
    else if (a.outcome === 'dodged') dodgeBins[binOf(a.marginTicks, T.dodgeBinEdges)]!.dodged += 1;
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
    dodgeTiming: dodgeBins,
  };
  return { ...details, recommendation: analysis.fightSeconds > 0 ? recommend(details) : { kind: 'few' } };
}

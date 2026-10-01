import type { FightDef } from '../game/fight';
import { TICK_RATE } from '../engine/time';
import { DETAILS_TUNING as T } from '../stats/details-tuning';
import type { Recommendation } from '../stats/details';

/** Attack id to the name the player knows it by, over every boss of the fight; an unknown id stays as it is. */
export function attackNamer(fight: FightDef): (attackId: string) => string {
  const names = new Map<string, string>();
  for (const boss of fight.bosses) {
    for (const attack of boss.attacks) if (!names.has(attack.id)) names.set(attack.id, attack.name);
  }
  return (id) => names.get(id) ?? id;
}

/** A share from 0 to 1 as a whole percent, or a dash when there is nothing to measure. */
export const percent = (share: number | null): string => (share === null ? '–' : `${Math.round(share * 100)}%`);

/** Updates as seconds with at most two decimals ("0.5 s", "1.25 s"). */
export const seconds = (ticks: number): string => `${Math.round((ticks / TICK_RATE) * 100) / 100} s`;

/** Seconds without the unit, for a range label. */
const sec = (ticks: number): string => `${Math.round((ticks / TICK_RATE) * 100) / 100}`;

/** Labels for bins cut by `edges` (in updates): "under 0.25 s", "0.25 to 0.5 s", ..., "1.5 s or more". */
export function binLabels(edges: readonly number[], first?: string): string[] {
  const labels = edges.map((edge, i) => {
    if (i === 0) return first ?? `under ${sec(edge)}`;
    return `${sec(edges[i - 1]!)}–${sec(edge)}`;
  });
  return [...labels, `${sec(edges[edges.length - 1]!)}+`];
}

export const replyBinLabels = (): string[] => binLabels(T.replyBinEdges);
/** The first dodge bin is a dodge that began after the danger did. */
export const dodgeBinLabels = (): string[] => binLabels(T.dodgeBinEdges, 'too late');

/** The one-line recommendation: what to work on, with the counts it rests on and the target. Plain text. */
export function recommendationText(rec: Recommendation): string {
  switch (rec.kind) {
    case 'avoid':
      return `Work on: avoiding attacks. You avoided ${rec.avoided} of ${rec.total} attacks (${percent(rec.avoided / rec.total)}); the target is ${percent(T.targets.avoided)}.`;
    case 'aim':
      return `Work on: your swings. ${rec.hits} of ${rec.swings} swings hit the boss (${percent(rec.hits / rec.swings)}); the target is ${percent(T.targets.hitRate)}.`;
    case 'reply':
      return `Work on: replying to attacks. You replied to ${rec.replied} of ${rec.answerable} (${percent(rec.replied / rec.answerable)}); the target is ${percent(T.targets.answered)}.`;
    case 'speed':
      return `Work on: replying faster. When you replied, it took a median of ${seconds(rec.medianTicks)} after the boss's attack ended; the target is ${seconds(T.targets.replyTicks)}.`;
    case 'none':
      return 'Nothing stands out: every number is at its target.';
    case 'few':
      return 'Too few attacks in this fight to tell what to work on.';
  }
}

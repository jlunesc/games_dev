import type { FightDef } from '../game/fight';
import { TICK_RATE } from '../engine/time';
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

/** "once", "twice", "3 times". */
const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** The one-line advice: the attack that hurt most or was answered least, with the counts it rests on. Plain text. */
export function recommendationText(rec: Recommendation, nameOf: (attackId: string) => string): string {
  switch (rec.kind) {
    case 'hurt':
      return rec.resolved === 1
        ? `Work on: ${nameOf(rec.attackId)}. It came once and hit you.`
        : `Work on: ${nameOf(rec.attackId)}. It hit you ${times(rec.hits)} of the ${rec.resolved} times it came.`;
    case 'unanswered':
      return `Work on: replying to ${nameOf(rec.attackId)}. No attack hit you, but you did not reply to ${rec.missed} of its ${rec.answerable} openings.`;
    case 'none':
      return 'Nothing stands out: no attack hit you and you replied to every opening you had.';
    case 'few':
      return 'The boss did not attack in this fight, so there is nothing to work on.';
  }
}

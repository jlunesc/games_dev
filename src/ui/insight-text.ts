import type { FightDef } from '../game/fight';
import type { Insight } from '../stats/insights';

/** Attack id to the name the player knows it by, over every boss of the fight; an unknown id stays as it is. */
export function attackNamer(fight: FightDef): (attackId: string) => string {
  const names = new Map<string, string>();
  for (const boss of fight.bosses) {
    for (const attack of boss.attacks) if (!names.has(attack.id)) names.set(attack.id, attack.name);
  }
  return (id) => names.get(id) ?? id;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The evidence: up to three attack names in brackets, or nothing. */
function evidence(ids: string[], nameOf: (id: string) => string): string {
  return ids.length === 0 ? '' : ` (${ids.slice(0, 3).map(nameOf).join(', ')})`;
}

/** One plain-language sentence for one insight. Pure text: the screen writes it with `textContent`. */
export function insightText(insight: Insight, nameOf: (id: string) => string): string {
  const seen = evidence(insight.attackIds, nameOf);
  switch (insight.skill) {
    case 'dodge-late':
      return `Dodging too late: ${count(insight.hits, 'hit', 'hits')} came after a dodge that began in the last moments of the warning${seen}.`;
    case 'dodge-early':
      return `Dodging too early: ${count(insight.hits, 'hit', 'hits')} landed after a dodge that began so soon it was over before the attack arrived${seen}.`;
    case 'dodge-other':
      return `Dodging at the wrong moment: ${count(insight.hits, 'hit', 'hits')} came even though you dashed or jumped${seen}.`;
    case 'no-dodge':
      return `Not dodging: ${count(insight.hits, 'hit', 'hits')} came with no dash or jump${seen}.`;
    case 'greedy-swing':
      return `Swinging at the wrong time: ${count(insight.swings, 'swing was', 'swings were')} still going when an attack landed, and ${insight.hurt} hurt you${seen}.`;
    case 'openings':
      return `Openings: you hit the boss in ${insight.taken} of ${count(insight.opened, 'opening', 'openings')} after its attacks, and ${count(insight.closeButMissed, 'time', 'times')} you were close enough but did not land a hit${seen}.`;
    case 'approach':
      return `Closing in: ${count(insight.tooFar, 'opening closed', 'openings closed')} before you could reach the boss. You were in swing range ${insight.inReachPercent}% of the time and ${Math.round(insight.meanDistance)} units away on average${seen}.`;
  }
}

/** The block for the summary screen: a heading and one line per insight, or one line when nothing stands out. */
export function workOnLines(insights: Insight[], nameOf: (id: string) => string): string[] {
  if (insights.length === 0) return ['Nothing stands out this fight.'];
  return ['Work on:', ...insights.map((insight) => insightText(insight, nameOf))];
}

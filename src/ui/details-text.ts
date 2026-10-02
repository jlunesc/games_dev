import type { FightDef } from '../game/fight';
import { TICK_RATE } from '../engine/time';
import { DETAILS_TUNING as T } from '../stats/details-tuning';
import type { Numbers, Recommendation } from '../stats/details';
import { WORLD } from '../game/params';

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

/** Updates as minutes and seconds ("1:05"). */
export const clockTime = (ticks: number): string => {
  const total = Math.round(ticks / TICK_RATE);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export interface NumberBlock {
  title: string;
  /** Rows of a label and its value, all plain text. */
  rows: [label: string, value: string][];
}

/** `n` over the fight's length as "n a minute" (nothing when the fight has no length). */
const perMinute = (n: number, seconds: number): string => (seconds > 0 ? ` (${Math.round((n / seconds) * 60)} a minute)` : '');

const timeAndShare = (ticks: number, whole: number): string =>
  `${seconds(ticks)}${whole > 0 ? ` (${percent(ticks / whole)})` : ''}`;

/** Distance as the number of arena widths ("2.4 arena widths"), a unit that means something on the screen. */
const arenaWidths = (units: number): string => {
  const widths = Math.round((units / WORLD.width) * 10) / 10;
  return `${widths} arena ${widths === 1 ? 'width' : 'widths'}`;
};

/** The plain-count table of the fight details, in four blocks. The movement and clock blocks are left out when they were not measured. */
export function numberBlocks(numbers: Numbers, nameOf: (attackId: string) => string): NumberBlock[] {
  const { you, boss, movement, clock, seconds: length } = numbers;
  const blocks: NumberBlock[] = [
    {
      title: 'What you did',
      rows: [
        ['Swings', `${you.swings}${perMinute(you.swings, length)}`],
        ['Swings that hit the boss', String(you.landed)],
        ['Hits you took', String(you.taken)],
        ['Counters', String(you.counters)],
        ['Dashes', `${you.dashes}${perMinute(you.dashes, length)}`],
        ['Jumps', `${you.jumps}${perMinute(you.jumps, length)}`],
      ],
    },
    {
      title: 'What the boss did',
      rows: [
        ['Attacks started', `${boss.started}${perMinute(boss.started, length)}`],
        ...boss.perAttack.map((a): [string, string] => {
          const parts = [
            a.hit > 0 ? `${a.hit} hit you` : null,
            a.dodged > 0 ? `${a.dodged} dodged` : null,
            a.countered > 0 ? `${a.countered} countered` : null,
            a.interrupted > 0 ? `${a.interrupted} cut short` : null,
          ].filter((x) => x !== null);
          return [nameOf(a.attackId), `${a.started}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`];
        }),
      ],
    },
  ];
  if (movement !== null) {
    const held = movement.leftTicks + movement.rightTicks + movement.stillTicks;
    blocks.push({
      title: 'How you moved',
      rows: [
        ['Travelled left', arenaWidths(movement.left)],
        ['Travelled right', arenaWidths(movement.right)],
        ['Towards the boss', arenaWidths(movement.toward)],
        ['Away from the boss', arenaWidths(movement.away)],
        ['Holding left', timeAndShare(movement.leftTicks, held)],
        ['Holding right', timeAndShare(movement.rightTicks, held)],
        ['Holding neither', timeAndShare(movement.stillTicks, held)],
        ['Changed direction', `${movement.turns} times`],
        ['Next to a wall', timeAndShare(movement.wallTicks, held)],
        ['In the air', timeAndShare(movement.airTicks, held)],
      ],
    });
  }
  if (clock !== null) {
    const rows: [string, string][] = [['Fight length', clockTime(clock.ticks)]];
    clock.phaseTicks.forEach((phases, boss) => {
      const label = clock.phaseTicks.length > 1 ? `Boss ${boss + 1}, ` : '';
      phases.forEach((ticks, phase) => rows.push([`${label}phase ${phase + 1}`, timeAndShare(ticks, clock.ticks)]));
    });
    rows.push(
      ['A boss attacking', timeAndShare(clock.attackingTicks, clock.ticks)],
      ['No boss attacking', timeAndShare(clock.ticks - clock.attackingTicks, clock.ticks)],
      ['Longest stretch with no attack', seconds(clock.longestQuietTicks)],
    );
    blocks.push({ title: 'The clock', rows });
  }
  return blocks;
}

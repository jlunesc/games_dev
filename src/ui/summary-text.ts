import type { FightSummary } from '../game/summary';

/** Minutes and two-digit seconds, rounding down: 72.4 becomes 1:12. */
export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

const TITLES = {
  victory: 'Victory!',
  defeat: 'Defeated',
  left: 'You left the fight',
} as const;

/** Health lines: one for the boss of a normal fight, one per boss for a pair. */
function healthLines(summary: FightSummary): string[] {
  if (summary.bosses.length < 2) return [`Boss health left: ${summary.bossHpLeft} of ${summary.bossMaxHp}`];
  return summary.bosses.map((b) => `${b.name} health left: ${b.hpLeft} of ${b.maxHp}`);
}

/** The words of the summary screen. */
export function summaryLines(summary: FightSummary): { title: string; lines: string[] } {
  const worst = summary.mostDangerousAttack;
  // The fight was left while the boss was still demonstrating: no fight time has passed yet.
  const leftInStudy = summary.result === 'left' && summary.studyActive;
  return {
    title: TITLES[summary.result],
    lines: [
      ...(leftInStudy ? ['You left during the study.'] : []),
      `Time: ${formatTime(summary.seconds)}`,
      ...(summary.studySeconds > 0 ? [`Study time: ${formatTime(summary.studySeconds)}`] : []),
      // The phase reached follows the primary boss only, so it is left out for a pair.
      ...(summary.bosses.length < 2 ? [`Phase reached: ${summary.phaseReached} of ${summary.phaseCount}`] : []),
      `Hits taken: ${summary.hitsTaken}`,
      ...healthLines(summary),
      worst === null
        ? 'You were never hit.'
        : `Hurt you most: ${worst.name} (${worst.hits} hit${worst.hits === 1 ? '' : 's'})`,
    ],
  };
}

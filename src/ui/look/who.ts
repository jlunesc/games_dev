import { bossAt, bossCount, type GameState } from '../../game/state';

/**
 * Which boss of a fight an update happened to, worked out from the two states around it (the events do not say). Look-only
 * helpers: each falls back to the primary boss (0) when nothing matches, so a fight of one always answers 0.
 */

function firstBoss(after: GameState, test: (index: number) => boolean): number {
  for (let index = 0; index < bossCount(after); index++) {
    if (test(index)) return index;
  }
  return 0;
}

/** The boss the sword just hurt or staggered: its health dropped, or it entered the stagger. */
export function struckBoss(before: GameState, after: GameState): number {
  return firstBoss(after, (index) => {
    const was = bossAt(before, index);
    const now = bossAt(after, index);
    return now.hp < was.hp || (now.mode === 'stagger' && was.mode !== 'stagger');
  });
}

/** Every boss that reached zero health in this update. */
export function fellBosses(before: GameState, after: GameState): number[] {
  const fell: number[] = [];
  for (let index = 0; index < bossCount(after); index++) {
    if (bossAt(before, index).hp > 0 && bossAt(after, index).hp <= 0) fell.push(index);
  }
  return fell;
}

/** The boss that moved on to a later phase in this update. */
export function phasedBoss(before: GameState, after: GameState): number {
  return firstBoss(after, (index) => bossAt(after, index).phase > bossAt(before, index).phase);
}

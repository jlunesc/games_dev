import type { BossDef } from '../bosses/schema';
import type { FightDef } from './fight';
import { allBosses, bossAt, bossCount, isDowned, type GameState } from './state';

/**
 * A boss holds the turn while it walks into range of a chosen attack, attacks (a chain never lets go), or owns a shot or
 * eruption that is still on the field. A boss that is staggered or powering up holds nothing unless it owns shots.
 */
export function holdsTurn(s: GameState, index: number): boolean {
  const b = bossAt(s, index);
  if (!isDowned(s, index) && (b.mode === 'approach' || b.mode === 'attack')) return true;
  return s.shots.some((shot) => (shot.owner ?? 0) === index);
}

/** A boss of a fight with an enrage is enraged once any partner is down. */
export function isEnraged(s: GameState, fight: FightDef, index: number): boolean {
  if (fight.enrage === null) return false;
  return allBosses(s).some((_, other) => other !== index && isDowned(s, other));
}

/** The numbers boss `index` fights with right now: its own, or its boosted copy once it is enraged. */
export function bossDefFor(s: GameState, fight: FightDef, index: number): BossDef {
  const def = (isEnraged(s, fight, index) ? fight.enraged : fight.bosses)[index];
  if (def === undefined) throw new Error(`The fight has no boss ${index}`);
  return def;
}

/**
 * How many updates past its commit moment boss `index` will be once this update's `modeTick += 1` has happened,
 * or null when it will not be at a commit moment: the end of its wait (with attacks to choose from), or the end of a
 * phase change when the new phase has an opening attack.
 */
function readyWait(s: GameState, fight: FightDef, index: number): number | null {
  if (isDowned(s, index)) return null;
  const b = bossAt(s, index);
  const def = bossDefFor(s, fight, index);
  const phase = def.phases[b.phase];
  if (phase === undefined) return null;
  if (b.mode === 'gap' && phase.attacks.length > 0) {
    const wait = b.modeTick + 1 - phase.gap;
    return wait >= 0 ? wait : null;
  }
  if (b.mode === 'transition' && phase.opening !== undefined) {
    const wait = b.modeTick + 1 - def.transitionTicks;
    return wait >= 0 ? wait : null;
  }
  return null;
}

/**
 * The boss allowed to start an attack on this update, or null. Among the bosses at a commit moment the one that has
 * waited longest wins (the first-listed on a tie); it goes ahead only when no other boss holds the turn. Nobody else
 * jumps the queue while it is held back.
 */
export function pickCommitter(s: GameState, fight: FightDef): number | null {
  let winner: number | null = null;
  let longest = -1;
  for (let i = 0; i < bossCount(s); i++) {
    const wait = readyWait(s, fight, i);
    if (wait !== null && wait > longest) {
      winner = i;
      longest = wait;
    }
  }
  if (winner === null) return null;
  for (let other = 0; other < bossCount(s); other++) {
    if (other !== winner && holdsTurn(s, other)) return null;
  }
  return winner;
}

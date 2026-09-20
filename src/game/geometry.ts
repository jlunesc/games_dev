import type { BossDef } from '../bosses/schema';
import { PLAYER, WORLD } from './params';
import type { BossState, PlayerState } from './state';

/** Top-left corner plus size, in world units (y grows downward). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function playerBox(p: PlayerState): Box {
  return { x: p.x - PLAYER.width / 2, y: p.y - PLAYER.height, w: PLAYER.width, h: PLAYER.height };
}

export function bossBox(b: BossState, boss: BossDef): Box {
  return {
    x: b.x - boss.width / 2,
    y: WORLD.floorY - boss.height,
    w: boss.width,
    h: boss.height,
  };
}

/** The area the player's swing hits: in front of the player, centred vertically on the body. */
export function attackBox(p: PlayerState): Box {
  const { reach, height } = PLAYER.attack;
  const x = p.facing === 1 ? p.x + PLAYER.width / 2 : p.x - PLAYER.width / 2 - reach;
  return { x, y: p.y - PLAYER.height / 2 - height / 2, w: reach, h: height };
}

/** True only during the swing's active updates (after start-up, before recovery). */
export function attackActive(p: PlayerState): boolean {
  const { startup, active } = PLAYER.attack;
  return p.attackTick >= startup && p.attackTick < startup + active;
}

/** Untouchable after a hit, and for the whole dash. */
export function isInvulnerable(p: PlayerState): boolean {
  return p.invulnerableTicks > 0 || p.dashTick >= 0;
}

/** The boxes that hurt the player right now: the active hit windows of the attack the boss is performing. */
export function activeHitBoxes(b: BossState, boss: BossDef): Box[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const attack = boss.attacks.find((a) => a.id === b.attackId);
  if (attack === undefined) return [];
  return attack.hits
    .filter((hit) => b.attackTick >= hit.from && b.attackTick < hit.to)
    .map((hit) => ({
      x: b.facing === 1 ? b.x + hit.x0 : b.x - hit.x1,
      y: WORLD.floorY - hit.top,
      w: hit.x1 - hit.x0,
      h: hit.top - hit.bottom,
    }));
}

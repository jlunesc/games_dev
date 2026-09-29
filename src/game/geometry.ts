import type { ArenaDef, BossDef } from '../bosses/schema';
import { ERUPTION, PLAYER, SHOT, WORLD } from './params';
import type { BossState, PlayerState, ShotState } from './state';

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
    y: WORLD.floorY - boss.height - b.lift,
    w: boss.width,
    h: boss.height,
  };
}

/** The area the player's swing hits: in front of the player (centred on the body), straight above the head, or straight below the feet. */
export function attackBox(p: PlayerState): Box {
  const { reach, height, upDownReach, upDownWidth } = PLAYER.attack;
  if (p.attackAim === 'up') {
    return { x: p.x - upDownWidth / 2, y: p.y - PLAYER.height - upDownReach, w: upDownWidth, h: upDownReach };
  }
  if (p.attackAim === 'down') {
    return { x: p.x - upDownWidth / 2, y: p.y, w: upDownWidth, h: upDownReach };
  }
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

/**
 * The boxes that hurt the player right now: the active hit windows of the attack the boss is performing.
 * Cover in the arena blocks them: a cover in front of the boss, at least as tall as the window's top,
 * cuts the window at its near edge (the vertical extent never changes) and a window with no width left
 * is dropped. A cover the boss stands inside, or that lies behind it, blocks nothing. `ignoreCover`
 * returns the uncut windows (what the attack would cover in a bare arena).
 */
export function activeHitBoxes(b: BossState, boss: BossDef, options: { ignoreCover?: boolean } = {}): Box[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const attack = boss.attacks.find((a) => a.id === b.attackId);
  if (attack === undefined) return [];
  const covers = options.ignoreCover === true ? [] : (boss.arena?.covers ?? []);
  const boxes: Box[] = [];
  for (const hit of attack.hits) {
    if (b.attackTick < hit.from || b.attackTick >= hit.to) continue;
    // A window with `both` also covers the mirrored side behind the boss; each side is cut by its own covers.
    const sides: (1 | -1)[] = hit.both === true ? [b.facing, b.facing === 1 ? -1 : 1] : [b.facing];
    for (const side of sides) {
      let x = side === 1 ? b.x + hit.x0 : b.x - hit.x1;
      // Uncut windows keep the width written in the boss file, so a bare arena gives exactly the old numbers.
      let w = hit.x1 - hit.x0;
      for (const cover of covers) {
        if (cover.height < hit.top) continue;
        const coverLeft = cover.x - cover.width / 2;
        const coverRight = cover.x + cover.width / 2;
        if (side === 1 && coverLeft > b.x && coverLeft < x + w) {
          w = coverLeft - x;
        } else if (side === -1 && coverRight < b.x && coverRight > x) {
          w = x + w - coverRight;
          x = coverRight;
        }
      }
      // A window with no width left was cut away by a cover and is dropped. Without covers every window is kept as
      // written, even a zero-width one, so the bare arena gives exactly the old boxes.
      if (covers.length === 0 || w > 0) boxes.push({ x, y: WORLD.floorY - hit.top, w, h: hit.top - hit.bottom });
    }
  }
  return boxes;
}

/** The box of a shot that can hurt right now: a bolt's square, an arc's landing burst or an eruption's blast; null before those. */
export function shotBox(shot: ShotState): Box | null {
  if (shot.kind === 'bolt') {
    return { x: shot.x - shot.size / 2, y: WORLD.floorY - shot.lift - shot.size, w: shot.size, h: shot.size };
  }
  if (shot.kind === 'eruption') {
    if (shot.age < shot.delay) return null;
    return { x: shot.x - shot.width / 2, y: WORLD.floorY - ERUPTION.height, w: shot.width, h: ERUPTION.height };
  }
  if (shot.age < shot.flight) return null;
  return {
    x: shot.toX - shot.radius,
    y: WORLD.floorY - SHOT.arcBurstHeight,
    w: shot.radius * 2,
    h: SHOT.arcBurstHeight,
  };
}

/** A top surface the player can stand on: `y` is the world y of its top (WORLD.floorY - height). */
export interface Surface {
  left: number;
  right: number;
  y: number;
  kind: 'platform' | 'cover';
}

/** The surfaces of an arena: platforms first, then covers. Empty for a flat arena. */
export function arenaSurfaces(boss: { arena?: ArenaDef }): Surface[] {
  const { arena } = boss;
  if (arena === undefined) return [];
  const make = (kind: Surface['kind']) => (piece: { x: number; width: number; height: number }): Surface => ({
    left: piece.x - piece.width / 2,
    right: piece.x + piece.width / 2,
    y: WORLD.floorY - piece.height,
    kind,
  });
  return [...arena.platforms.map(make('platform')), ...arena.covers.map(make('cover'))];
}

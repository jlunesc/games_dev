import { DUMMY, PLAYER, WORLD } from './params';
import type { DummyState, PlayerState } from './state';

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

export function dummyBox(d: DummyState): Box {
  return {
    x: d.x - DUMMY.width / 2,
    y: WORLD.floorY - DUMMY.height,
    w: DUMMY.width,
    h: DUMMY.height,
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

/** The area the dummy's sweep hurts: low, on the side the dummy faces, so it can be jumped over. */
export function sweepBox(d: DummyState): Box {
  const { reach, height } = DUMMY.sweep;
  const x = d.facing === 1 ? d.x + DUMMY.width / 2 : d.x - DUMMY.width / 2 - reach;
  return { x, y: WORLD.floorY - height, w: reach, h: height };
}

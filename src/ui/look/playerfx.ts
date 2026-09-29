/**
 * The look of the player's swing: a sword that cocks back, sweeps through the hit box (forward, up or down) and lowers again, and a
 * bright crescent that sweeps through the real hit box and fades. Purely cosmetic and pure: nothing here touches the
 * canvas (`drawPrimitives` draws the shapes) and the crescent always lies inside the box that can hit.
 */
import { attackBox, attackActive, type Box } from '../../game/geometry';
import { PLAYER } from '../../game/params';
import type { AttackAim, GameState } from '../../game/state';
import type { Primitive } from './figures';
import { LOOK } from './tuning';

type Point = [number, number];

export interface PlayerSwing {
  /** The sword, in front of the body. */
  blade: Primitive[];
  /** The crescent (empty before the sweep starts and after it has faded), and how opaque to draw it. */
  slash: Primitive[];
  slashAlpha: number;
  /** The real hit box, only while it can hit. */
  box: Box | null;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const RAD = Math.PI / 180;

/** How far through the top-to-bottom sweep the swing is at this tick (0 before it, 1 once the box is done). */
function sweepProgress(tick: number): number {
  const { startup, active } = PLAYER.attack;
  if (tick < startup) return 0;
  return clamp01((tick - startup + 1) / active);
}

/** The crescent for the box, swept through `progress` of its height, the head thick and the tail thin. */
function crescent(box: Box, aim: AttackAim, side: 1 | -1, progress: number): Primitive[] {
  if (progress <= 0 || box.w <= 0 || box.h <= 0) return [];
  const s = LOOK.playerSlash;
  const steps = Math.max(2, Math.ceil(s.steps * progress));
  const aNow = -Math.PI / 2 + Math.PI * progress;
  // `u` runs outward from the body (0 to 1) and `v` across the sweep (0 to 1); an up or down swing sweeps back to front.
  const pt = (depth: number, a: number): Point => {
    const u = depth * Math.cos(a);
    const v = 0.5 + 0.5 * Math.sin(a);
    if (aim === 'up') return [box.x + (side === 1 ? v : 1 - v) * box.w, box.y + (1 - u) * box.h];
    if (aim === 'down') return [box.x + (side === 1 ? v : 1 - v) * box.w, box.y + u * box.h];
    return [side === 1 ? box.x + u * box.w : box.x + (1 - u) * box.w, box.y + v * box.h];
  };
  const band = (outer: number, thin: number): Point[] => {
    const outerEdge: Point[] = [];
    const innerEdge: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const q = i / steps;
      const a = -Math.PI / 2 + (aNow + Math.PI / 2) * q;
      outerEdge.push(pt(outer, a));
      innerEdge.push(pt(outer * (1 - (1 - thin) * Math.pow(q, 0.7)), a));
    }
    return [...outerEdge, ...innerEdge.reverse()];
  };
  return [
    { kind: 'poly', color: s.edge, points: band(1, s.inner) },
    { kind: 'poly', color: s.core, points: band(0.92, Math.min(0.95, s.inner + 0.25)) },
  ];
}

/** The sword's angle (degrees) at a tick of the swing. */
function bladeAngle(aim: AttackAim, tick: number): number {
  const { startup, active } = PLAYER.attack;
  const b = aim === 'forward' ? LOOK.playerBlade : LOOK.playerBlade[aim];
  if (tick < startup) return lerp(b.windupDeg[0], b.windupDeg[1], clamp01(tick / Math.max(1, startup)));
  if (tick < startup + active) return lerp(b.activeDeg[0], b.activeDeg[1], sweepProgress(tick));
  const recovery = Math.max(1, PLAYER.attack.recovery);
  return lerp(b.recoverDeg[0], b.recoverDeg[1], clamp01((tick - startup - active) / recovery));
}

function blade(x: number, y: number, aim: AttackAim, side: 1 | -1, tick: number): Primitive[] {
  const b = LOOK.playerBlade;
  const angle = bladeAngle(aim, tick) * RAD;
  const dx = side * Math.cos(angle);
  const dy = Math.sin(angle);
  const px = x + side * 8;
  const py = y - PLAYER.height + 2 * LOOK.headRadius + 6;
  const nx = -dy;
  const ny = dx;
  const half = b.width / 2;
  const gripLength = 12;
  // A straight blade with a pointed tip; `grow` pushes the tip out so the outline shows all round.
  const shape = (w: number, grow: number): Point[] => {
    const shoulder = b.length * 0.86;
    return [
      [px + nx * w, py + ny * w],
      [px + dx * shoulder + nx * w, py + dy * shoulder + ny * w],
      [px + dx * (b.length + grow), py + dy * (b.length + grow)],
      [px + dx * shoulder - nx * w, py + dy * shoulder - ny * w],
      [px - nx * w, py - ny * w],
    ];
  };
  return [
    {
      kind: 'poly',
      color: b.grip,
      points: [
        [px - dx * gripLength + nx * 2, py - dy * gripLength + ny * 2],
        [px + nx * 2, py + ny * 2],
        [px - nx * 2, py - ny * 2],
        [px - dx * gripLength - nx * 2, py - dy * gripLength - ny * 2],
      ],
    },
    { kind: 'poly', color: b.outline, points: shape(half + 2, 1.5) },
    { kind: 'poly', color: b.steel, points: shape(half, 0) },
  ];
}

/** The player's swing at this moment, with the feet at (`x`, `y`); null when the player is not swinging. */
export function playerSwing(state: GameState, x: number, y: number): PlayerSwing | null {
  const p = state.player;
  if (p.attackTick < 0) return null;
  const { startup, active } = PLAYER.attack;
  const side = p.facing;
  const box = attackBox({ ...p, x, y });
  const faded = p.attackTick - startup - active;
  const slashAlpha = faded < 0 ? LOOK.playerSlash.alpha : LOOK.playerSlash.alpha * (1 - faded / LOOK.playerSlash.fadeTicks);
  return {
    blade: blade(x, y, p.attackAim, side, p.attackTick),
    slash: slashAlpha > 0 ? crescent(box, p.attackAim, side, sweepProgress(p.attackTick)) : [],
    slashAlpha: Math.max(0, slashAlpha),
    box: attackActive(p) ? box : null,
  };
}

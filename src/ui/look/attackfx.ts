/**
 * The look of a boss's strike: instead of a plain rectangle, each live hit box is drawn as a shape that suits it (spikes
 * out of the floor for a low box, a spear point for a long thin one, a crescent for a tall one). The shape always lies
 * inside the real hit box, so what is drawn never reaches farther than what can hurt. Also the trail of a bolt, which
 * follows the way the bolt flies. Purely cosmetic and pure: no canvas here (`drawPrimitives` draws the shapes).
 */
import type { Box } from '../../game/geometry';
import { WORLD } from '../../game/params';
import type { Primitive } from './figures';
import { LOOK } from './tuning';

export interface AttackPalette {
  edge: string;
  core: string;
  halo: string;
}

/** The colours of a boss's attacks: its own set in `LOOK.palette`, or the default one. */
export function attackPalette(bossId: string): AttackPalette {
  return LOOK.palette[bossId] ?? LOOK.palette['default']!;
}

export type SlashKind = 'spikes' | 'spear' | 'crescent';

/** Which shape a live hit box gets: low boxes on the floor are spikes, long thin ones a spear, the rest a crescent. */
export function slashKind(box: Box): SlashKind {
  const s = LOOK.slash;
  if (box.h <= s.lowHeight && box.y + box.h >= WORLD.floorY - 0.5) return 'spikes';
  if (box.w >= box.h * s.spearRatio) return 'spear';
  return 'crescent';
}

type Point = [number, number];

/** The near edge of the box is the one towards the boss: `side` is 1 when the box lies to the right of the boss. */
function toWorld(box: Box, side: 1 | -1, u: number, v: number): Point {
  // u runs from the near edge (0) to the far edge (1) of the box, v from its top (0) to its bottom (1).
  return [side === 1 ? box.x + u * box.w : box.x + (1 - u) * box.w, box.y + v * box.h];
}

/** The bright shape and its hot core for one live hit box, in world coordinates, inside the box. */
export function slashShape(box: Box, side: 1 | -1, palette: AttackPalette = attackPalette('')): Primitive[] {
  if (box.w <= 0 || box.h <= 0) return [];
  const s = { ...LOOK.slash, ...palette };
  const kind = slashKind(box);
  const out: Primitive[] = [];
  const pt = (u: number, v: number): Point => toWorld(box, side, u, v);
  if (kind === 'spikes') {
    const n = Math.max(2, Math.round(box.w / s.spikeWidth));
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const apex = i % 2 === 0 ? 0 : 1 - s.spikeShort;
      out.push({ kind: 'poly', color: s.edge, points: [pt(u0, 1), pt((u0 + u1) / 2, apex), pt(u1, 1)] });
      out.push({
        kind: 'poly',
        color: s.core,
        points: [pt(u0 + (u1 - u0) * 0.3, 1), pt((u0 + u1) / 2, apex + (1 - apex) * 0.45), pt(u1 - (u1 - u0) * 0.3, 1)],
      });
    }
    return out;
  }
  if (kind === 'spear') {
    out.push({ kind: 'poly', color: s.edge, points: [pt(0, 0.5 - s.spearBody / 2), pt(1, 0.5), pt(0, 0.5 + s.spearBody / 2)] });
    out.push({ kind: 'poly', color: s.core, points: [pt(0.05, 0.5 - s.spearBody / 5), pt(0.95, 0.5), pt(0.05, 0.5 + s.spearBody / 5)] });
    return out;
  }
  // A crescent: the outer edge is a half ellipse bulging away from the boss, the inner one a shallower half ellipse.
  const steps = 8;
  const ring = (depth: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      pts.push(pt(depth * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
    }
    return pts;
  };
  out.push({ kind: 'poly', color: s.edge, points: [...ring(1), ...ring(s.crescentInner).reverse()] });
  out.push({
    kind: 'poly',
    color: s.core,
    points: [...ring(0.92).map(([x, y]): Point => [x, y]), ...ring(Math.min(0.95, s.crescentInner + 0.2)).reverse()],
  });
  return out;
}

/**
 * A bolt's trail as one slanted bar behind it, following the bolt's way: `speed` along the ground (the way `dir` points)
 * and `climb` upwards, both per second. With `climb` 0 it is the plain flat trail.
 */
export function boltTrail(x: number, cy: number, dir: 1 | -1, speed: number, climb: number, size: number, color: string): Primitive {
  const length = size * LOOK.shot.trailLength;
  const back = length / Math.max(1, speed);
  const ex = x - dir * speed * back;
  const ey = cy + climb * back;
  const len = Math.hypot(ex - x, ey - cy) || 1;
  const half = (size / 2) * 0.5;
  const nx = (-(ey - cy) / len) * half;
  const ny = ((ex - x) / len) * half;
  return {
    kind: 'poly',
    color,
    points: [
      [x + nx, cy + ny],
      [ex + nx, ey + ny],
      [ex - nx, ey - ny],
      [x - nx, cy - ny],
    ],
  };
}

/** The pure pose helpers shared by the game screen and the figures. Kept apart from render.ts so the figures can use them without an import cycle. */
import type { BossDef, Pose } from '../../bosses/schema';
import { WORLD } from '../../game/params';
import type { BossState } from '../../game/state';
import type { Primitive } from './figures';
import { moodFor } from './moods';
import { LOOK } from './tuning';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ARM_LENGTH = 90;
const ARM_THICKNESS = 16;

/** The boss's arm for a pose, as a rectangle hanging from the shoulder point. The pose tells the player which attack is coming. */
export function armRect(pose: Pose, facing: 1 | -1, shoulderX: number, shoulderY: number): Rect {
  const t = ARM_THICKNESS;
  const l = ARM_LENGTH;
  switch (pose) {
    case 'raised':
      return { x: shoulderX - t / 2, y: shoulderY - l, w: t, h: l };
    case 'down':
      return { x: shoulderX + facing * 30 - t / 2, y: shoulderY, w: t, h: l };
    case 'sideways':
      return { x: facing === 1 ? shoulderX : shoulderX - l, y: shoulderY - t / 2, w: l, h: t };
    case 'back':
      return { x: facing === 1 ? shoulderX - l : shoulderX, y: shoulderY - t / 2, w: l, h: t };
    case 'crouch':
      // Hangs low in front of the boss, shorter than the 'down' arm, as if the boss is gathering itself to spring.
      return { x: shoulderX + facing * 20 - t / 2, y: shoulderY + 30, w: t, h: l * 0.6 };
  }
}

export const BOSS_COLORS = {
  ember: LOOK.bossBodyEmber,
  stagger: LOOK.bossStaggerBody,
  power: LOOK.bossPowerGlow,
  gold: LOOK.bossCounterGlow,
  red: LOOK.bossDodgeGlow,
};

export interface BossLook {
  body: string;
  /** The colour of the glow around the boss, or null for none. */
  glow: string | null;
}

/**
 * How the boss looks right now: gold glow while a counterable attack winds up or is active, red for a
 * must-dodge one, blue when staggered, white while powering up between phases.
 */
export function bossLook(b: BossState, boss: BossDef, base: string = moodFor(boss.id).bodyColor): BossLook {
  if (b.mode === 'transition') return { body: base, glow: BOSS_COLORS.power };
  if (b.mode === 'stagger') return { body: BOSS_COLORS.stagger, glow: null };
  if (b.mode === 'attack' && b.attackId !== null) {
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    if (attack !== undefined && b.attackTick < attack.windup + attack.active) {
      return {
        body: base,
        glow: attack.class === 'counterable' ? BOSS_COLORS.gold : BOSS_COLORS.red,
      };
    }
  }
  return { body: base, glow: null };
}

/**
 * The boss body's vertical extent. A boss crouching to spring (a crouch-pose attack still winding up on the floor)
 * is 25% shorter; otherwise it is drawn `lift` units above the floor.
 */
export function bossDrawBox(b: BossState, boss: BossDef): { top: number; height: number; crouching: boolean } {
  const attack =
    b.mode === 'attack' && b.attackId !== null ? boss.attacks.find((a) => a.id === b.attackId) : undefined;
  const crouching =
    attack !== undefined && attack.pose === 'crouch' && b.lift === 0 && b.attackTick < attack.windup;
  const height = crouching ? boss.height * 0.75 : boss.height;
  return { top: WORLD.floorY - height - b.lift, height, crouching };
}

/** What every boss style needs to know about the boss right now, worked out once. */
export interface BossPose {
  /** Centre x, the facing (1 right, -1 left), and the current tick. */
  cx: number;
  f: 1 | -1;
  t: number;
  /** The drawn box: top, height (crouch already applied) and the feet line, lift already applied. */
  top: number;
  h: number;
  feet: number;
  /** The width the figure is built on. */
  w: number;
  /** Boss is off the floor (a leap). */
  airborne: boolean;
  /** Body lean into the coming attack, world units, positive forward (negative while staggered). */
  lean: number;
  /** 0 to 1 over the windup of the running attack (0 when none). */
  windP: number;
  attackPose: Pose | null;
  /** True while the walking gait plays (the boss walks in `gap` and `approach`). */
  walking: boolean;
  /** Upward offset of the upper body from breathing or walking bob, 0 or more. */
  rise: number;
  headR: number;
  /** Progress of the running attack in ticks and the attack definition's windup/active. */
  attackTick: number;
  windup: number;
  active: number;
  /** The running attack is in its windup or active part (not its recovery). */
  posing: boolean;
  /** How strongly the attack's pose shows, 0.4 at the start of the attack up to 1 when it is active. */
  poseAmount: number;
  /** A crouch-pose attack is still winding up on the floor (the drawn box is shorter). */
  crouching: boolean;
  /** The running attack's dive, when it has one: the ticks it runs between and its shape. */
  dive: { from: number; to: number; shape: 'plunge' | 'swoop' } | null;
  /** What the running attack will do beyond its pose: hovering, striking both sides, and the shots it fires. */
  marks: AttackMarks | null;
}

/** The style of the running attack as the figure shows it while it winds up and is active. */
export interface AttackMarks {
  hover: boolean;
  both: boolean;
  shots: { kind: 'bolt' | 'arc' | 'eruption'; aimed: boolean; back: boolean }[];
}

/** A rectangle given by a forward span `dx0..dx1` from the centre (forward is the way the boss faces), mirrored with the facing. */
export function forwardRect(bp: BossPose, dx0: number, dx1: number, y: number, h: number, color: string): Primitive {
  const a = bp.cx + bp.f * dx0;
  const b = bp.cx + bp.f * dx1;
  return { kind: 'rect', x: Math.min(a, b), y, w: Math.abs(b - a), h, color };
}

/** A polygon given in forward coordinates (dx from the centre, forward the way the boss faces, and world y). */
export function forwardPoly(bp: BossPose, points: [number, number][], color: string): Primitive {
  return { kind: 'poly', color, points: points.map(([dx, y]): [number, number] => [bp.cx + bp.f * dx, y]) };
}

/**
 * The boss's weapon arm: the rectangle `armRect` gives for the running attack's pose (or hanging at the side when it
 * waits), cut off at the floor, and optionally a tapered blade continuing along the arm from the hand.
 */
export function weaponArm(bp: BossPose, arm: string, blade: string | null): Primitive[] {
  const shoulderX = bp.cx + bp.f * bp.lean * 0.8;
  const shoulderY = bp.top + bp.h * 0.3 - bp.rise;
  const raw: Rect =
    bp.attackPose !== null
      ? armRect(bp.attackPose, bp.f, shoulderX, shoulderY)
      : { x: shoulderX + bp.f * 18 - 8, y: shoulderY, w: 16, h: 50 };
  // Never below the floor: an arm stabbing down stops at it.
  const r: Rect = { ...raw, h: Math.max(0, Math.min(raw.h, WORLD.floorY - raw.y)) };
  if (r.h <= 0) return [];
  const out: Primitive[] = [{ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, color: arm }];
  if (blade === null) return out;

  // The hand is the end of the arm farther from the shoulder; the blade points on from there.
  const horizontal = r.w > r.h;
  const ends: [number, number][] = horizontal
    ? [
        [r.x, r.y + r.h / 2],
        [r.x + r.w, r.y + r.h / 2],
      ]
    : [
        [r.x + r.w / 2, r.y],
        [r.x + r.w / 2, r.y + r.h],
      ];
  const dist = (e: [number, number]): number => Math.hypot(e[0] - shoulderX, e[1] - shoulderY);
  const [near, hand] = dist(ends[0]!) >= dist(ends[1]!) ? [ends[1]!, ends[0]!] : [ends[0]!, ends[1]!];
  const along = Math.hypot(hand[0] - near[0], hand[1] - near[1]);
  const dx = (hand[0] - near[0]) / along;
  const dy = (hand[1] - near[1]) / along;
  let length: number = LOOK.bossBladeLength;
  if (dy > 0) length = Math.min(length, (WORLD.floorY - hand[1]) / dy);
  if (length <= 1) return out;
  // The blade's sides, on the same side of the arm whichever way the boss faces, so the shape mirrors exactly.
  const nx = -dy * bp.f;
  const ny = dx * bp.f;
  const at = (along_: number, side: number): [number, number] => [
    hand[0] + dx * along_ + nx * side,
    hand[1] + dy * along_ + ny * side,
  ];
  out.push({
    kind: 'poly',
    color: blade,
    points: [at(-2, 5), at(length * 0.85, 4), at(length, 0), at(length * 0.85, -4), at(-2, -5)],
  });
  return out;
}

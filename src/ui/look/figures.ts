/**
 * The looks of the player and the bosses, as lists of simple shapes (rectangles, circles, polygons) in world
 * coordinates. Nothing here touches the canvas except `drawPrimitives`; the shapes are pure functions of the game
 * state, so they can be tested without a screen. Purely cosmetic: the hit boxes are unchanged and are not drawn here.
 * Every number that sets the feel lives in `tuning.ts`.
 *
 * World y grows downward and a figure stands with its feet at the given y (the player) or on the floor, `lift` up
 * (a boss). Shapes are listed back to front: the first is drawn first.
 */
import type { BossDef, Pose } from '../../bosses/schema';
import { PLAYER, WORLD } from '../../game/params';
import type { GameState } from '../../game/state';
// The only things taken from render.ts. Task 5 moves them into `look/pose.ts` (and re-exports them from render.ts),
// so this one import block is the only line to change then, and render.ts can import this file without a cycle.
import { armRect, bossDrawBox, type Rect } from '../render';
import { LOOK } from './tuning';

export type Primitive =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'circle'; x: number; y: number; r: number; color: string }
  | { kind: 'poly'; points: [number, number][]; color: string };

const TAU = Math.PI * 2;
/** The steel colour of a boss's blade when nothing glows. */
const BLADE_STEEL = '#e6e9f2';
/** How far the Hound's head thrusts forward while a sideways-pose attack (the bite) is active, world units. */
const HOUND_LUNGE = 12;
/** How high a lifted step raises a foot, world units. */
const STEP_LIFT = 5;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A slow up-and-down between 0 and `amplitude` (upward only, so a figure never sinks through its own feet). */
const breathe = (tick: number, amplitude: number): number =>
  amplitude * (0.5 + 0.5 * Math.sin((TAU * tick) / LOOK.breatheTicks));

// ---------------------------------------------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------------------------------------------

/**
 * The player: head with a visor, a torso, two legs, a cape trailing behind. The legs alternate while running on the
 * ground and tuck in the air; the body leans forward while dashing or swinging; the cape lengthens with speed and
 * sways with the tick. Everything lies inside the `PLAYER` box widened by the cape on the trailing side and by the
 * head above. `x` is the centre and `y` the feet.
 */
export function playerFigure(
  state: GameState,
  x: number,
  y: number,
  colors: { body: string; accent: string },
): Primitive[] {
  const p = state.player;
  const t = state.tick;
  const f = p.facing;
  const dashing = p.dashTick >= 0;
  const swinging = p.attackTick >= 0;
  const airborne = !p.onGround;
  const moving = !airborne && p.vx !== 0;

  // Which way the body leans and by how much: into the dash, or forward into the swing.
  const leanDir = dashing ? p.dashDir : f;
  const lean = dashing ? LOOK.leanDash : swinging ? LOOK.leanSwing : 0;
  const lx = leanDir * lean;
  const trail = -leanDir;
  const speed = dashing ? 1 : Math.min(1, Math.abs(p.vx) / PLAYER.runSpeed);

  const stepPhase = (TAU * t) / LOOK.legCycleTicks;
  // The upper body bobs with each step when running and breathes when standing; it never dips below its rest height.
  const rise = moving
    ? Math.abs(Math.sin(stepPhase)) * LOOK.bobAmplitude
    : airborne || dashing
      ? 0
      : breathe(t, LOOK.breatheAmplitude);

  const legLength = 34;
  const hipY = y - legLength;
  const shoulderY = y - PLAYER.height + 2 * LOOK.headRadius - rise;
  const out: Primitive[] = [];

  // Cape, behind everything.
  const length = LOOK.capeLength * (0.45 + 0.55 * speed);
  const flutter = 1 - 0.06 * (0.5 + 0.5 * Math.sin((TAU * t) / 17));
  const sway = Math.sin((TAU * t) / 40) * LOOK.capeSway * (0.4 + 0.6 * speed);
  const reach = 11 + length * flutter;
  out.push({
    kind: 'poly',
    color: colors.accent,
    points: [
      [x + lx + trail * 11, shoulderY + 2],
      [x + lx + trail * reach, shoulderY + 6 + sway],
      [x + trail * (11 + (length * flutter) * 0.75), hipY + 6 + sway * 0.6],
      [x + trail * 11, hipY - 4],
    ],
  });

  // Legs.
  for (const i of [0, 1]) {
    const hx = x + f * (i === 0 ? -7 : 7);
    let fx = hx;
    let fy = y;
    if (dashing) {
      fx = hx + f * (i === 0 ? 1 : -1) * LOOK.legSwing * 0.8;
    } else if (airborne) {
      fx = hx + f * (i === 0 ? 5 : -5);
      fy = y - LOOK.legTuck;
    } else if (moving) {
      const phase = stepPhase + i * Math.PI;
      fx = hx + f * LOOK.legSwing * Math.sin(phase);
      fy = y - STEP_LIFT * Math.max(0, Math.cos(phase)) * 0.8;
    }
    out.push({
      kind: 'poly',
      color: colors.body,
      points: [
        [hx - 6 * f, hipY],
        [hx + 6 * f, hipY],
        [fx + 6 * f, fy],
        [fx - 6 * f, fy],
      ],
    });
  }

  // Torso, its top shifted by the lean.
  out.push({
    kind: 'poly',
    color: colors.body,
    points: [
      [x - 13 * f, hipY + 2],
      [x + 13 * f, hipY + 2],
      [x + 13 * f + lx, shoulderY],
      [x - 13 * f + lx, shoulderY],
    ],
  });

  // Head and visor.
  const headX = x + lx * 1.2;
  const headY = y - PLAYER.height + LOOK.headRadius - rise;
  out.push({ kind: 'circle', x: headX, y: headY, r: LOOK.headRadius, color: colors.body });
  out.push({
    kind: 'rect',
    x: f === 1 ? headX + 2 : headX - 10,
    y: headY - 4,
    w: 8,
    h: 5,
    color: colors.accent,
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The bosses
// ---------------------------------------------------------------------------------------------------------------

/** What every boss style needs to know about the boss right now, worked out once. */
interface BossPose {
  boss: BossDef;
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
}

function bossPose(state: GameState, boss: BossDef): BossPose {
  const b = state.boss;
  const box = bossDrawBox(b, boss);
  const attack =
    b.mode === 'attack' && b.attackId !== null ? boss.attacks.find((a) => a.id === b.attackId) : undefined;
  const windP = attack !== undefined ? clamp01(b.attackTick / Math.max(1, attack.windup)) : 0;
  const winding = attack !== undefined && b.attackTick < attack.windup;
  const walking = b.mode === 'gap' || b.mode === 'approach';
  const t = state.tick;
  const rise = walking
    ? Math.abs(Math.sin((TAU * t) / (LOOK.legCycleTicks / 2))) * LOOK.bossBobAmplitude
    : breathe(t, LOOK.bossBreatheAmplitude);
  const lean = b.mode === 'stagger' ? -LOOK.bossLeanWindup * 0.5 : winding ? windP * LOOK.bossLeanWindup : 0;
  return {
    boss,
    cx: b.x,
    f: b.facing,
    t,
    top: box.top,
    h: box.height,
    feet: box.top + box.height,
    w: boss.width,
    airborne: b.lift > 0,
    lean,
    windP: winding ? windP : 0,
    attackPose: attack?.pose ?? null,
    walking,
    rise,
    headR: Math.min(LOOK.bossHeadRadius, boss.width * 0.3, box.height * 0.2),
    attackTick: b.attackTick,
    windup: attack?.windup ?? 0,
    active: attack?.active ?? 0,
  };
}

/** A rectangle given by a forward span `dx0..dx1` from the centre (forward is the way the boss faces), mirrored with the facing. */
function forwardRect(bp: BossPose, dx0: number, dx1: number, y: number, h: number, color: string): Primitive {
  const a = bp.cx + bp.f * dx0;
  const b = bp.cx + bp.f * dx1;
  return { kind: 'rect', x: Math.min(a, b), y, w: Math.abs(b - a), h, color };
}

/** A polygon given in forward coordinates (dx from the centre, forward the way the boss faces, and world y). */
function forwardPoly(bp: BossPose, points: [number, number][], color: string): Primitive {
  return { kind: 'poly', color, points: points.map(([dx, y]): [number, number] => [bp.cx + bp.f * dx, y]) };
}

/**
 * The boss's weapon arm: the rectangle `armRect` gives for the running attack's pose (or hanging at the side when it
 * waits), cut off at the floor, and optionally a tapered blade continuing along the arm from the hand.
 */
function weaponArm(bp: BossPose, arm: string, blade: string | null): Primitive[] {
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

/** Leg swing of a diagonal gait: the foot's forward offset and the lift of one leg at phase `phase`. */
function gait(bp: BossPose, phase: number, swing: number): { dx: number; lift: number } {
  if (!bp.walking) return { dx: 0, lift: 0 };
  return { dx: swing * Math.sin(phase), lift: STEP_LIFT * Math.max(0, Math.cos(phase)) };
}

/** The Ember Duelist: a biped with a head, a torso, two legs and a blade in its weapon arm. */
function duelistFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const legLength = 0.32 * h;
  const hipY = feet - legLength;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;

  for (const i of [0, 1]) {
    const hipDx = (i === 0 ? -0.2 : 0.2) * w;
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing);
    const footDx = hipDx + g.dx;
    const footY = bp.airborne ? feet - 0.1 * h : feet - g.lift;
    const half = 0.11 * w;
    out.push(
      forwardPoly(
        bp,
        [
          [hipDx - half, hipY],
          [hipDx + half, hipY],
          [footDx + half, footY],
          [footDx - half, footY],
        ],
        colors.body,
      ),
    );
  }

  const torsoTop = top + headR * 1.7 - rise;
  out.push(
    forwardPoly(
      bp,
      [
        [-0.32 * w, hipY + 2],
        [0.32 * w, hipY + 2],
        [0.36 * w + lean, torsoTop],
        [-0.36 * w + lean, torsoTop],
      ],
      colors.body,
    ),
  );

  const headDx = lean * 1.2;
  const headY = top + headR - rise;
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR, color: colors.body });
  out.push(forwardRect(bp, headDx + headR * 0.2, headDx + headR * 0.7, headY - headR * 0.25, headR * 0.3, colors.glow ?? colors.accent));

  out.push(...weaponArm(bp, colors.accent, colors.glow ?? BLADE_STEEL));
  return out;
}

/** The Ashen Hound: a long, low beast on four legs with a snout, ears and a tail; the pounce's crouch lowers it. */
function houndFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise } = bp;
  const out: Primitive[] = [];
  const bodyTop = top + 0.22 * h - rise;
  const bodyBottom = top + 0.62 * h;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;
  // Legs walk while the boss walks, and after the windup of an attack that stays on the floor.
  const attacking = bp.attackPose !== null && bp.windP === 0 && bp.attackTick >= bp.windup;
  const gaiting = bp.walking || attacking;

  // Tail, behind the body, wagging.
  const wag = Math.sin((TAU * bp.t) / 30) * 6;
  const rearDx = -0.5 * w;
  const tailBase = top + 0.22 * h;
  out.push(
    forwardPoly(
      bp,
      [
        [rearDx + 2, tailBase + 4],
        [rearDx - LOOK.bossTailLength, tailBase - 10 + wag],
        [rearDx - LOOK.bossTailLength * 0.8, tailBase - 2 + wag],
        [rearDx + 2, tailBase + 14],
      ],
      colors.accent,
    ),
  );

  // Four legs, diagonal pairs moving together: hind then front.
  const hips = [-0.42 * w, -0.28 * w, 0.08 * w, 0.2 * w];
  const phases = [0, Math.PI, Math.PI, 0];
  const half = 0.055 * w;
  hips.forEach((hipDx, i) => {
    let footDx = hipDx;
    let footY = feet;
    if (bp.airborne) {
      footDx = hipDx + (i >= 2 ? 0.06 * w : -0.06 * w);
      footY = feet - 0.12 * h;
    } else if (gaiting) {
      const ph = phase + phases[i]!;
      footDx = hipDx + LOOK.bossLegSwing * 0.7 * Math.sin(ph);
      footY = feet - STEP_LIFT * Math.max(0, Math.cos(ph));
    }
    out.push(
      forwardPoly(
        bp,
        [
          [hipDx - half, bodyBottom - 2],
          [hipDx + half, bodyBottom - 2],
          [footDx + half, footY],
          [footDx - half, footY],
        ],
        colors.body,
      ),
    );
  });

  // Body.
  out.push(forwardRect(bp, rearDx, 0.25 * w, bodyTop, bodyBottom - bodyTop, colors.body));

  // Head, snout, ears and eye, thrust forward by the lean and by a biting lunge, dipped as the attack winds up.
  const biting =
    bp.attackPose === 'sideways' && bp.attackTick >= bp.windup && bp.attackTick < bp.windup + bp.active;
  const headDx = 0.25 * w + headR * 0.4 + bp.lean + (biting ? HOUND_LUNGE : 0);
  const headY = bodyTop + headR * 0.6 + bp.windP * 6;
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR, color: colors.body });
  out.push(forwardRect(bp, headDx + headR * 0.3, headDx + headR * 0.3 + LOOK.bossSnoutLength, headY - 2, headR * 0.55, colors.body));
  out.push(
    forwardPoly(
      bp,
      [
        [headDx - headR * 0.6, headY - headR + 3],
        [headDx - headR * 0.1, headY - headR - 8],
        [headDx + headR * 0.4, headY - headR + 2],
      ],
      colors.accent,
    ),
  );
  out.push(forwardRect(bp, headDx + headR * 0.25, headDx + headR * 0.7, headY - headR * 0.35, headR * 0.3, colors.glow ?? colors.accent));
  return out;
}

/** Any other boss: a body block as wide and tall as its box, a head, an eye, and the weapon arm. Sized from `width` and `height`. */
function genericFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const bodyTop = top + headR * 1.6 - rise;
  out.push({ kind: 'rect', x: bp.cx - w / 2, y: bodyTop, w, h: Math.max(1, feet - bodyTop), color: colors.body });
  const headDx = lean * 1.2;
  const headY = top + headR - rise;
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR, color: colors.body });
  out.push(forwardRect(bp, headDx + headR * 0.2, headDx + headR * 0.7, headY - headR * 0.25, headR * 0.3, colors.glow ?? colors.accent));
  out.push(...weaponArm(bp, colors.accent, null));
  return out;
}

/**
 * The boss's figure for this moment. The style comes from the boss id (`ember-duelist` a biped, `ashen-hound` a beast,
 * anything else a generic block); the animation from the tick, the boss mode, the running attack's pose, the facing and
 * the lift. It fits inside the box `bossDrawBox` reports (crouch shortening and lift included), widened for the head,
 * tail, snout, arm and blade, so what the player sees is what can hurt them.
 */
export function bossFigure(
  state: GameState,
  boss: BossDef,
  colors: { body: string; accent: string; glow: string | null },
): Primitive[] {
  const bp = bossPose(state, boss);
  switch (boss.id) {
    case 'ember-duelist':
      return duelistFigure(bp, colors);
    case 'ashen-hound':
      return houndFigure(bp, colors);
    default:
      return genericFigure(bp, colors);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

/** Fills the shapes in order at `alpha` (multiplied into the current opacity), leaving the canvas state as it was. */
export function drawPrimitives(ctx: CanvasRenderingContext2D, primitives: Primitive[], alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const p of primitives) {
    ctx.fillStyle = p.color;
    if (p.kind === 'rect') {
      ctx.fillRect(p.x, p.y, p.w, p.h);
    } else if (p.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    } else if (p.points.length > 0) {
      ctx.beginPath();
      const [first, ...rest] = p.points;
      ctx.moveTo(first![0], first![1]);
      for (const [px, py] of rest) ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

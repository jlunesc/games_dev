/**
 * The looks of the player and the bosses, as lists of simple shapes (rectangles, circles, polygons) in world
 * coordinates. Nothing here touches the canvas except `drawPrimitives`; the shapes are pure functions of the game
 * state, so they can be tested without a screen. Purely cosmetic: the hit boxes are unchanged and are not drawn here.
 * The numbers and colours that set the feel live in `tuning.ts`; the proportions of each shape are constants here.
 *
 * World y grows downward and a figure stands with its feet at the given y (the player) or on the floor, `lift` up
 * (a boss). Shapes are listed back to front: the first is drawn first.
 */
import type { AttackDef, BossDef, Pose } from '../../bosses/schema';
import { PLAYER, WORLD } from '../../game/params';
import type { GameState } from '../../game/state';
import { armRect, bossDrawBox, type Rect } from './pose';
import { LOOK } from './tuning';

export type Primitive =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'circle'; x: number; y: number; r: number; color: string }
  | { kind: 'poly'; points: [number, number][]; color: string };

const TAU = Math.PI * 2;
/** How far the Hound's head lunges forward on top of the thrust while a sideways-pose attack (the bite) is active, world units. */
const HOUND_LUNGE = 12;
/** How far the Hound's head thrusts forward at the full pose of a bite, world units. */
const HOUND_THRUST = 22;
/** The length of each jaw wedge of a biting Hound, world units. */
const HOUND_JAW_LENGTH = 28;
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
  /** What the running attack will do beyond its pose: hovering, striking both sides, and the shots it fires. */
  marks: AttackMarks | null;
}

/** The style of the running attack as the figure shows it while it winds up and is active. */
interface AttackMarks {
  hover: boolean;
  both: boolean;
  shots: { kind: 'bolt' | 'arc' | 'eruption'; aimed: boolean; back: boolean }[];
}

function bossPose(state: GameState, boss: BossDef): BossPose {
  const b = state.boss;
  const box = bossDrawBox(b, boss);
  const attack =
    b.mode === 'attack' && b.attackId !== null ? boss.attacks.find((a) => a.id === b.attackId) : undefined;
  const windP = attack !== undefined ? clamp01(b.attackTick / Math.max(1, attack.windup)) : 0;
  const winding = attack !== undefined && b.attackTick < attack.windup;
  const posing = attack !== undefined && b.attackTick < attack.windup + attack.active;
  const walking = b.mode === 'gap' || b.mode === 'approach';
  const t = state.tick;
  const rise = walking
    ? Math.abs(Math.sin((TAU * t) / (LOOK.legCycleTicks / 2))) * LOOK.bossBobAmplitude
    : breathe(t, LOOK.bossBreatheAmplitude);
  const lean = b.mode === 'stagger' ? -LOOK.bossLeanWindup * 0.5 : winding ? windP * LOOK.bossLeanWindup : 0;
  return {
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
    posing,
    poseAmount: !posing ? 0 : winding ? 0.4 + 0.6 * windP : 1,
    crouching: box.crouching,
    marks: attack !== undefined && posing ? marksOf(attack) : null,
  };
}

function marksOf(attack: AttackDef): AttackMarks | null {
  const hover = attack.leap?.hang !== undefined;
  const both = attack.hits.some((h) => h.both === true);
  const shots = (attack.shots ?? []).map((shot) => ({
    kind: shot.kind,
    aimed: shot.kind === 'bolt' && shot.aim === true,
    back: shot.kind === 'bolt' && shot.dir === 'back',
  }));
  return hover || both || shots.length > 0 ? { hover, both, shots } : null;
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

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** How far the warning has come: 0 at rest, up to 1 at the end of the wind-up and through the active part. */
const chargeOf = (bp: BossPose): number =>
  bp.posing ? (bp.attackTick < bp.windup ? bp.attackTick / Math.max(1, bp.windup) : 1) : 0;

/** A straight bar between two points given in forward coordinates, `half` wide on each side of the line. */
function bar(bp: BossPose, dx0: number, y0: number, dx1: number, y1: number, half: number, color: string): Primitive {
  const len = Math.hypot(dx1 - dx0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / len) * half;
  const ny = ((dx1 - dx0) / len) * half;
  return forwardPoly(
    bp,
    [
      [dx0 + nx, y0 + ny],
      [dx1 + nx, y1 + ny],
      [dx1 - nx, y1 - ny],
      [dx0 - nx, y0 - ny],
    ],
    color,
  );
}

/** A curved blade from `from` to `to` (forward coordinates), bowed out by `bow` on the upper side. */
function curvedBlade(bp: BossPose, from: [number, number], to: [number, number], bow: number, color: string): Primitive {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  const points: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const s = i / 6;
    const off = bow * 4 * s * (1 - s);
    points.push([from[0] + dx * s + nx * off, from[1] + dy * s + ny * off]);
  }
  return forwardPoly(bp, points, color);
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

  out.push(...weaponArm(bp, colors.accent, colors.glow ?? LOOK.bossBladeSteel));
  return out;
}

/**
 * The Ashen Hound: a long, low beast on four legs with a snout, ears and a tail. It has no arm, so during the windup
 * and the active part of an attack the pose shows through the body instead: the bite (sideways) thrusts the head out
 * with an open jaw, the rush and the slip (back) rear the front of the body up and pull the tail straight back, the
 * pounce (crouch) drops the body to the floor on folded legs, raised throws the head up and down puts it to the floor.
 */
function houndFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise } = bp;
  const out: Primitive[] = [];
  // A crouch pose only shows while the body is actually low; after the jump it is just the airborne figure.
  const pose: Pose | null = bp.posing && bp.attackPose !== null && (bp.attackPose !== 'crouch' || bp.crouching) ? bp.attackPose : null;
  const amount = pose === null ? 0 : bp.poseAmount;
  const crouched = pose === 'crouch';
  const rears = pose === 'back';
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;
  // Legs walk while the boss walks, and while it recovers from an attack that stays on the floor.
  const recovering = bp.attackPose !== null && !bp.posing;
  const gaiting = bp.walking || recovering;

  let bodyBottom = top + 0.62 * h;
  let bodyTop = top + 0.22 * h - rise;
  if (crouched) {
    bodyBottom = feet - 8;
    bodyTop = bodyBottom - 0.32 * h - rise;
  }
  // How far the front of the body is raised when the boss rears up.
  const raise = rears ? 0.26 * h * amount : 0;
  const frontTop = bodyTop - raise;
  const frontBottom = bodyBottom - raise * 0.7;

  // Tail, behind the body: wagging up when idle, pulled straight back and down when rearing or crouching.
  const wag = Math.sin((TAU * bp.t) / 30) * 6;
  const rearDx = -0.5 * w;
  const tailBase = crouched || rears ? bodyTop : top + 0.22 * h;
  const tailPoints: [number, number][] =
    crouched || rears
      ? [
          [rearDx + 2, tailBase + 4],
          [rearDx - LOOK.bossTailLength, tailBase + 16],
          [rearDx - LOOK.bossTailLength * 0.85, tailBase + 22],
          [rearDx + 2, tailBase + 14],
        ]
      : [
          [rearDx + 2, tailBase + 4],
          [rearDx - LOOK.bossTailLength, tailBase - 10 + wag],
          [rearDx - LOOK.bossTailLength * 0.8, tailBase - 2 + wag],
          [rearDx + 2, tailBase + 14],
        ];
  out.push(forwardPoly(bp, tailPoints, colors.accent));

  // Four legs, diagonal pairs moving together: hind then front.
  const hips = [-0.42 * w, -0.28 * w, 0.08 * w, 0.2 * w];
  const phases = [0, Math.PI, Math.PI, 0];
  const half = 0.055 * w;
  hips.forEach((hipDx, i) => {
    const front = i >= 2;
    const hipY = (front ? frontBottom : bodyBottom) - 2;
    let footDx = hipDx;
    let footY = feet;
    if (bp.airborne) {
      footDx = hipDx + (front ? 0.06 * w : -0.06 * w);
      footY = feet - 0.12 * h;
    } else if (crouched) {
      // Folded: the hind feet tucked under the haunches, the front paws splayed forward.
      footDx = hipDx + (front ? 12 : -8);
    } else if (rears) {
      // Hind legs planted and braced; front paws drawn up against the chest.
      if (front) {
        footDx = hipDx + 14;
        footY = Math.min(feet - 4, hipY + 18);
      } else {
        footDx = hipDx - 6 * amount;
      }
    } else if (gaiting && pose === null) {
      const ph = phase + phases[i]!;
      footDx = hipDx + LOOK.bossLegSwing * 0.7 * Math.sin(ph);
      footY = feet - STEP_LIFT * Math.max(0, Math.cos(ph));
    }
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
  });

  // Body: a level block, or a slanted one when the front is raised.
  if (raise > 0) {
    out.push(
      forwardPoly(
        bp,
        [
          [rearDx, bodyTop],
          [0.25 * w, frontTop],
          [0.25 * w, frontBottom],
          [rearDx, bodyBottom],
        ],
        colors.body,
      ),
    );
  } else {
    out.push(forwardRect(bp, rearDx, 0.25 * w, bodyTop, bodyBottom - bodyTop, colors.body));
  }

  // Where the head is: thrust forward for the bite, up for raised, to the floor for down, low when crouching.
  const idleY = frontTop + headR * 0.6 + bp.windP * 6;
  let headDx = 0.25 * w + headR * 0.4 + bp.lean;
  let headY = idleY;
  const biting = pose === 'sideways';
  if (biting) {
    const attackActive = bp.attackTick >= bp.windup;
    headDx += HOUND_THRUST * amount + (attackActive ? HOUND_LUNGE : 0);
    headY = bodyTop + headR * 0.6 + 2 * amount;
  } else if (rears) {
    headY = frontTop + headR * 0.6 - 2;
  } else if (crouched) {
    headY = bodyTop + headR * 0.6 + 4;
  } else if (pose === 'raised') {
    headY = idleY + (bodyTop + headR * 0.6 - 16 - idleY) * amount;
  } else if (pose === 'down') {
    headDx += 10 * amount;
    headY = idleY + (feet - headR - 2 - idleY) * amount;
  }

  // A neck joins the head to the body whenever the pose moves the head away from its resting place.
  if (pose !== null) {
    const neckDx = 0.25 * w - 12;
    out.push(
      forwardPoly(
        bp,
        [
          [neckDx, frontTop + 2],
          [headDx, headY - headR * 0.6],
          [headDx, headY + headR * 0.6],
          [neckDx, frontBottom - 4],
        ],
        colors.body,
      ),
    );
  }

  // Head, snout (or jaws), ears and eye.
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR, color: colors.body });
  if (biting) {
    // Two wedges with a gap between them: the jaw opens wider as the bite comes closer.
    const gap = 6 + 20 * amount;
    const x0 = headDx + headR * 0.3;
    const length = HOUND_JAW_LENGTH;
    out.push(
      forwardPoly(
        bp,
        [
          [x0 - headR * 0.3, headY - headR * 0.7],
          [x0 + length, headY - gap * 0.8],
          [x0 - headR * 0.3, headY - 1],
        ],
        colors.body,
      ),
      forwardPoly(
        bp,
        [
          [x0 - headR * 0.3, headY + 1],
          [x0 + length * 0.9, headY + gap],
          [x0 - headR * 0.3, headY + headR * 0.6],
        ],
        colors.body,
      ),
    );
  } else {
    out.push(forwardRect(bp, headDx + headR * 0.3, headDx + headR * 0.3 + LOOK.bossSnoutLength, headY - 2, headR * 0.55, colors.body));
  }
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

/**
 * The Vesper Sage: a tall hooded figure in a triangular robe with a glowing orb held out in front. The orb grows and
 * brightens during the wind-up (the cue for a shot) and moves with the pose: held out, raised over the head, pulled
 * back, or lowered to the floor.
 */
function vesperSageFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const shoulderY = top + 0.3 * h - rise;
  const hoodBase = top + headR * 2.4 - rise;

  out.push(
    forwardPoly(
      bp,
      [
        [-0.5 * w, feet],
        [0.5 * w, feet],
        [0.2 * w + lean, shoulderY],
        [-0.2 * w + lean, shoulderY],
      ],
      colors.body,
    ),
  );
  out.push(
    forwardPoly(
      bp,
      [
        [-0.24 * w + lean * 1.2, hoodBase],
        [0.24 * w + lean * 1.2, hoodBase],
        [0.04 * w + lean * 1.2, top - rise],
      ],
      colors.body,
    ),
  );
  out.push(forwardRect(bp, lean * 1.2 + 0.02 * w, lean * 1.2 + 0.2 * w, hoodBase - headR * 0.7, headR * 0.3, colors.glow ?? colors.accent));

  const amount = bp.posing ? bp.poseAmount : 0;
  const reach = 0.26 * w + 8 + lean * 0.8;
  const pull = bp.attackPose === 'back' ? -2 * amount : 0;
  const orbDx = reach * (1 + pull);
  let orbY = shoulderY + 12;
  if (bp.attackPose === 'raised') orbY -= 50 * amount;
  if (bp.attackPose === 'down') orbY += 40 * amount;
  const winding = bp.posing && bp.attackTick < bp.windup;
  const charge = winding ? bp.attackTick / Math.max(1, bp.windup) : bp.posing ? 1 : 0;
  const orbR = 7 + 9 * charge;

  out.push(forwardRect(bp, 0.1 * w, orbDx, orbY - 4, 8, colors.body));
  out.push({ kind: 'circle', x: bp.cx + bp.f * orbDx, y: orbY, r: orbR * 1.15, color: colors.glow ?? colors.accent });
  out.push({ kind: 'circle', x: bp.cx + bp.f * orbDx, y: orbY, r: orbR * 0.75, color: LOOK.shot.core });
  return out;
}

/**
 * The Tremor Brute: a hunched, wide figure with a small head, huge fists and glowing cracks across its back. The
 * cracks widen during the wind-up (the cue). The fist shows the attack: raised over the head, swung out sideways,
 * pulled back, slammed down (one fist) or both fists pounding the floor while it crouches.
 */
function tremorBruteFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const shoulderY = top + 0.3 * h - rise;
  const glow = colors.glow ?? colors.accent;

  // Hunched torso: a high hump at the back, sloping down to a lower chest at the front.
  out.push(
    forwardPoly(
      bp,
      [
        [-0.5 * w, feet],
        [-0.46 * w + lean * 0.4, top + 0.12 * h - rise],
        [-0.12 * w + lean * 0.8, top + 0.02 * h - rise],
        [0.3 * w + lean, shoulderY + 0.04 * h],
        [0.34 * w, feet],
      ],
      colors.body,
    ),
  );

  // Cracks across the back, thin at rest and wider as the attack winds up.
  const charge = bp.posing ? (bp.attackTick < bp.windup ? bp.attackTick / Math.max(1, bp.windup) : 1) : 0;
  const crack = 2 + 4 * charge;
  const cracks: [number, number][] = [
    [-0.38 * w, 0.22],
    [-0.22 * w, 0.4],
    [-0.06 * w, 0.3],
  ];
  for (const [dx, at] of cracks) {
    const y = top + at * h - rise;
    out.push(forwardPoly(bp, [[dx, y], [dx + crack, y + 0.05 * h], [dx + 0.1 * w, y + 0.32 * h], [dx + 0.1 * w - crack, y + 0.3 * h]], glow));
  }

  // Head: small, pushed forward and low between the shoulders.
  const headX = 0.24 * w + lean * 1.1;
  const headY = top + headR * 1.5 + 0.06 * h - rise;
  out.push({ kind: 'circle', x: bp.cx + bp.f * headX, y: headY, r: headR * 0.85, color: colors.body });
  out.push(forwardRect(bp, headX + headR * 0.2, headX + headR * 0.65, headY - headR * 0.2, headR * 0.25, glow));

  // Fists: where they are depends on the pose; both come down together for the crouch.
  const amount = bp.posing ? bp.poseAmount : 0;
  const fistR = 0.17 * w;
  const restDx = 0.3 * w + lean * 0.6;
  const restY = shoulderY + 0.28 * h;
  const pose = bp.attackPose;
  const fists: [number, number][] = [];
  const floorY = feet - fistR;
  if (pose === null || amount === 0) fists.push([restDx, restY]);
  else if (pose === 'raised') fists.push([restDx - 4 * amount, restY + (top - rise + fistR * 0.4 - restY) * amount]);
  else if (pose === 'sideways') fists.push([restDx + 0.08 * w * amount, restY - 0.06 * h * amount]);
  else if (pose === 'back') fists.push([restDx - 0.62 * w * amount, restY - 0.1 * h * amount]);
  else if (pose === 'down') fists.push([restDx + 0.06 * w * amount, restY + (floorY - restY) * amount]);
  else fists.push([restDx - 0.08 * w, restY + (floorY - restY) * amount], [restDx + 0.1 * w, restY + (floorY - restY) * amount]);
  for (const [dx, y] of fists) {
    const arm0 = shoulderY + 0.06 * h;
    out.push(forwardPoly(bp, [[0.18 * w, arm0 - 8], [dx, y - 10], [dx, y + 10], [0.18 * w, arm0 + 14]], colors.body));
    out.push({ kind: 'circle', x: bp.cx + bp.f * dx, y, r: fistR, color: colors.body });
  }
  return out;
}

/**
 * The Cinder Golem: a squat iron furnace on two thick legs, with a smoking chimney on its back, a slit head and a
 * hatch in its belly that glows wider as an attack winds up (the cue). Two piston arms end in block fists; the pose
 * shows in the fist: over the head, out in front, pulled back, or slammed to the floor.
 */
function cinderGolemFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, rise, lean } = bp;
  const out: Primitive[] = [];
  const glow = colors.glow ?? colors.accent;
  const legTop = feet - 0.24 * h;
  const torsoTop = top + 0.2 * h - rise;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;

  for (const i of [0, 1]) {
    const hipDx = (i === 0 ? -0.26 : 0.22) * w;
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing * 0.5);
    const footDx = hipDx + g.dx;
    const footY = bp.airborne ? feet - 0.08 * h : feet - g.lift;
    const half = 0.14 * w;
    out.push(
      forwardPoly(
        bp,
        [
          [hipDx - half, legTop],
          [hipDx + half, legTop],
          [footDx + half, footY],
          [footDx - half, footY],
        ],
        LOOK.golemIron,
      ),
    );
  }

  out.push(
    forwardPoly(
      bp,
      [
        [-0.5 * w, legTop + 2],
        [0.5 * w, legTop + 2],
        [0.4 * w + lean, torsoTop],
        [-0.4 * w + lean * 0.4, torsoTop],
      ],
      colors.body,
    ),
  );

  // The chimney on the back, with a rim, and smoke that drifts up and fades out of view as it rises.
  const chimneyTop = top + 0.03 * h - rise;
  out.push(forwardRect(bp, -0.36 * w + lean * 0.4, -0.16 * w + lean * 0.4, chimneyTop, torsoTop - chimneyTop + 2, colors.body));
  out.push(forwardRect(bp, -0.39 * w + lean * 0.4, -0.13 * w + lean * 0.4, chimneyTop, 4, colors.accent));
  for (let k = 0; k < 3; k++) {
    const age = ((bp.t + k * 14) % 42) / 42;
    out.push({
      kind: 'circle',
      x: bp.cx + bp.f * (-0.26 * w + lean * 0.4 + 5 * Math.sin(age * 5 + k)),
      y: chimneyTop - 2 - 12 * age,
      r: 2 + 2 * age,
      color: LOOK.golemSmoke,
    });
  }

  // The head: a low block with an eye slit, sitting forward on the shoulders.
  const headLeft = 0.14 * w + lean * 1.1;
  const headTop = top + 0.09 * h - rise;
  out.push(forwardRect(bp, headLeft, headLeft + 0.24 * w, headTop, torsoTop - headTop + 2, colors.body));
  out.push(forwardRect(bp, headLeft + 0.08 * w, headLeft + 0.24 * w, headTop + 0.04 * h, 0.025 * h, glow));

  // The belly hatch: a thin slit at rest, wide open at the end of the wind-up.
  const charge = bp.posing ? (bp.attackTick < bp.windup ? bp.attackTick / Math.max(1, bp.windup) : 1) : 0;
  const hatchH = 0.05 * h + 0.13 * h * charge;
  const hatchY = torsoTop + 0.3 * (legTop - torsoTop);
  out.push(forwardRect(bp, 0.02 * w + lean * 0.6, 0.34 * w + lean * 0.6, hatchY, hatchH, glow));

  // Piston arms and block fists.
  const amount = bp.posing ? bp.poseAmount : 0;
  const fist = 0.18 * w;
  const shoulderDx = 0.22 * w + lean * 0.8;
  const shoulderY = top + 0.3 * h - rise;
  const restY = shoulderY + 0.32 * h;
  const restDx = 0.34 * w + lean * 0.5;
  const floorY = feet - fist / 2;
  let fx = restDx;
  let fy = restY;
  switch (bp.attackPose) {
    case 'raised':
      fx = 0.3 * w + lean * 0.5;
      fy = restY + (top - rise + fist / 2 + 2 - restY) * amount;
      break;
    case 'sideways':
      fx = restDx + 0.14 * w * amount;
      fy = restY - 0.2 * h * amount;
      break;
    case 'back':
      fx = restDx - 0.6 * w * amount;
      fy = restY - 0.14 * h * amount;
      break;
    case 'down':
      fx = restDx + 0.06 * w * amount;
      fy = restY + (floorY - restY) * amount;
      break;
    case 'crouch':
      fy = restY + (floorY - restY) * 0.5 * amount;
      break;
    case null:
      break;
  }
  out.push(forwardPoly(bp, [[shoulderDx - 8, shoulderY], [fx - 7, fy], [fx + 7, fy], [shoulderDx + 8, shoulderY + 14]], LOOK.golemIron));
  out.push(forwardRect(bp, fx - fist / 2, fx + fist / 2, fy - fist / 2, fist, colors.accent));
  return out;
}

/**
 * The Quill Warden: a tall, thin, heron-like figure on long legs, with a mantle of quills on its back, a beak, a crest
 * of quills that fans wider during the wind-up (the cue) and a long quill-lance. The lance shows the attack: upright
 * at rest, level for the poke, low for the piercer, raised for the overextended thrust.
 */
function quillWardenFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const charge = chargeOf(bp);
  const amount = bp.posing ? bp.poseAmount : 0;
  const legTop = feet - 0.38 * h;
  const shoulderY = top + 0.27 * h - rise;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;

  for (const i of [0, 1]) {
    const hipDx = (i === 0 ? -0.08 : 0.1) * w;
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing * 0.6);
    const footDx = hipDx + g.dx;
    const footY = bp.airborne ? feet - 0.08 * h : feet - g.lift;
    out.push(bar(bp, hipDx, legTop, footDx, footY - 2, 3.5, LOOK.quillDark));
    out.push(forwardRect(bp, footDx - 3, footDx + 11, footY - 3, 3, LOOK.quillDark));
  }

  // The mantle: four quills hanging off the back.
  for (let k = 0; k < 4; k++) {
    const baseY = shoulderY + k * 0.085 * h;
    const baseDx = -0.12 * w + lean * 0.4;
    const tipDx = -0.5 * w + k * 3 + 2 * Math.sin(bp.t / 9 + k);
    out.push(forwardPoly(bp, [[baseDx, baseY], [baseDx, baseY + 0.075 * h], [tipDx, baseY + (0.1 + 0.01 * k) * h]], LOOK.quillDark));
  }

  out.push(
    forwardPoly(
      bp,
      [
        [-0.18 * w, legTop + 6],
        [0.2 * w, legTop + 6],
        [0.22 * w + lean, shoulderY],
        [-0.14 * w + lean * 0.4, shoulderY - 2],
      ],
      colors.body,
    ),
  );

  // Neck, head, beak, eye and the crest that opens with the charge.
  const headDx = 0.12 * w + lean * 1.2;
  const headY = top + headR * 1.1 - rise;
  out.push(bar(bp, headDx - 2, headY, 0.06 * w + lean * 0.6, shoulderY + 2, 4, colors.body));
  for (let k = 0; k < 4; k++) {
    const theta = (((14 + 20 * k) * (1 + 0.6 * charge)) * Math.PI) / 180;
    const len = 14 + 4 * charge + (k === 1 || k === 2 ? 4 : 0);
    out.push(
      bar(
        bp,
        headDx - 2,
        headY - headR * 0.4,
        headDx - 2 - Math.sin(theta) * len,
        headY - headR * 0.4 - Math.cos(theta) * len,
        2,
        colors.accent,
      ),
    );
  }
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR * 0.8, color: colors.body });
  out.push(forwardPoly(bp, [[headDx + headR * 0.5, headY - 4], [headDx + headR * 0.5 + 20, headY + 3], [headDx + headR * 0.5, headY + 6]], LOOK.quillDark));
  out.push({ kind: 'circle', x: bp.cx + bp.f * (headDx + headR * 0.25), y: headY - 2, r: 2.5, color: colors.glow ?? colors.accent });

  // The lance, held at the grip; its tip shows the attack.
  const grip: [number, number] = [0.16 * w + lean * 0.6, shoulderY + 0.14 * h];
  const rest: [number, number] = [0.24 * w + lean * 0.4, top - 6 - rise];
  let target = rest;
  if (bp.attackPose === 'sideways') target = [0.5 * w + 14, grip[1] - 4];
  else if (bp.attackPose === 'down') target = [0.5 * w + 6, feet - 6];
  else if (bp.attackPose === 'raised') target = [0.5 * w + 12, top - 16 - rise];
  else if (bp.attackPose === 'back') target = [-0.35 * w, top + 0.2 * h - rise];
  const tip: [number, number] = [mix(rest[0], target[0], amount), mix(rest[1], target[1], amount)];
  const along = Math.hypot(tip[0] - grip[0], tip[1] - grip[1]) || 1;
  const ux = (tip[0] - grip[0]) / along;
  const uy = (tip[1] - grip[1]) / along;
  const tail: [number, number] = [grip[0] - 0.45 * (tip[0] - grip[0]), grip[1] - 0.45 * (tip[1] - grip[1])];
  out.push(bar(bp, 0.08 * w + lean * 0.6, shoulderY + 4, grip[0], grip[1], 4, colors.body));
  out.push(bar(bp, tail[0], tail[1], tip[0] - ux * 14, tip[1] - uy * 14, 2.2, LOOK.quillDark));
  out.push(
    forwardPoly(
      bp,
      [
        [tip[0] - ux * 14 - uy * 4.5, tip[1] - uy * 14 + ux * 4.5],
        tip,
        [tip[0] - ux * 14 + uy * 4.5, tip[1] - uy * 14 - ux * 4.5],
      ],
      colors.accent,
    ),
  );
  return out;
}

/**
 * The Veil Dancer: a slim figure in a tapered gown with a pale mask and two small horns. Veils stream from its
 * shoulders and flare wide as an attack winds up (the cue), most when it pulls back to dash. A slim needle in one
 * hand shows the attack: down at the side at rest, out in front for the piercing veil, flung back for the dashes,
 * low for the slip.
 */
function veilDancerFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise, lean } = bp;
  const out: Primitive[] = [];
  const charge = chargeOf(bp);
  const amount = bp.posing ? bp.poseAmount : 0;
  const waistY = top + 0.5 * h - rise;
  const shoulderY = top + 0.24 * h - rise;
  const flare = bp.posing ? bp.poseAmount : bp.walking ? 0.55 : 0.25;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;

  // Veils streaming back from the shoulders, behind everything.
  for (let k = 0; k < 3; k++) {
    const sx = -0.06 * w + lean * 0.5;
    const sy = shoulderY + k * 0.05 * h;
    const len = 0.22 * w + 0.36 * w * flare - k * 3;
    const tipY = sy + (0.06 + 0.04 * k) * h + 4 * Math.sin(bp.t / 7 + k * 1.7);
    out.push(forwardPoly(bp, [[sx, sy], [sx, sy + 0.05 * h], [sx - len, tipY]], k % 2 === 0 ? colors.accent : colors.body));
  }

  // Gown, sash, and the slippers peeking under the hem.
  out.push(
    forwardPoly(
      bp,
      [
        [-0.34 * w, feet],
        [0.3 * w, feet],
        [0.1 * w + lean * 0.5, waistY],
        [-0.1 * w + lean * 0.3, waistY],
      ],
      colors.body,
    ),
  );
  for (const i of [0, 1]) {
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing * 0.5);
    const dx = (i === 0 ? -0.14 : 0.14) * w + g.dx;
    out.push(forwardRect(bp, dx - 5, dx + 7, feet - g.lift - 4, 4, LOOK.veilDark));
  }
  out.push(
    forwardPoly(
      bp,
      [
        [-0.1 * w + lean * 0.3, waistY],
        [0.1 * w + lean * 0.5, waistY],
        [0.1 * w + lean * 0.55, waistY - 5],
        [-0.1 * w + lean * 0.35, waistY - 5],
      ],
      colors.accent,
    ),
  );
  // Bodice.
  out.push(
    forwardPoly(
      bp,
      [
        [-0.1 * w + lean * 0.3, waistY - 5],
        [0.1 * w + lean * 0.55, waistY - 5],
        [0.14 * w + lean, shoulderY],
        [-0.1 * w + lean * 0.6, shoulderY],
      ],
      colors.body,
    ),
  );

  // Head: a pale mask with a glowing slit and two horns.
  const headDx = 0.06 * w + lean * 1.2;
  const headY = top + headR - rise;
  out.push(forwardPoly(bp, [[headDx - 3, headY - headR * 0.6], [headDx - 15, top - 10 - rise], [headDx + 2, headY - headR * 0.9]], colors.body));
  out.push(forwardPoly(bp, [[headDx + 4, headY - headR * 0.8], [headDx + 12, top - 8 - rise], [headDx + 8, headY - headR * 0.4]], colors.body));
  out.push({ kind: 'circle', x: bp.cx + bp.f * headDx, y: headY, r: headR * 0.85, color: LOOK.veilMask });
  out.push(forwardRect(bp, headDx + headR * 0.05, headDx + headR * 0.7, headY - 2, 2 + 3 * charge, colors.glow ?? colors.accent));

  // The arm and the needle.
  const shoulder: [number, number] = [0.08 * w + lean * 0.6, shoulderY + 0.04 * h];
  const restHand: [number, number] = [0.16 * w + lean * 0.5, shoulderY + 0.2 * h];
  let hand = restHand;
  let reach: [number, number] = [0, 24];
  if (bp.attackPose === 'sideways') {
    hand = [0.26 * w + lean * 0.5, shoulderY + 0.05 * h];
    reach = [28, 0];
  } else if (bp.attackPose === 'back') {
    hand = [-0.2 * w, shoulderY - 0.02 * h];
    reach = [-26, -6];
  } else if (bp.attackPose === 'crouch') {
    hand = [0.24 * w + lean * 0.5, shoulderY + 0.22 * h];
    reach = [26, 10];
  }
  const h1: [number, number] = [mix(restHand[0], hand[0], amount), mix(restHand[1], hand[1], amount)];
  const r1: [number, number] = [mix(0, reach[0], amount), mix(24, reach[1], amount)];
  out.push(bar(bp, shoulder[0], shoulder[1], h1[0], h1[1], 3.5, colors.body));
  out.push(bar(bp, h1[0], h1[1], h1[0] + r1[0], h1[1] + r1[1], 1.6, LOOK.veilMask));
  return out;
}

/**
 * The Gale Reaver: a lean runner that always tips forward, in a torn cloak that streams behind it and streams
 * harder as an attack winds up (the cue), with a hood and a curved reaping blade. The blade shows the attack: low
 * in front at rest, level for the wind-slash, thrust up for the jab, dragged behind for the rush.
 */
function galeReaverFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, headR, rise } = bp;
  const lean = bp.lean + 8;
  const out: Primitive[] = [];
  const charge = chargeOf(bp);
  const amount = bp.posing ? bp.poseAmount : 0;
  const hipY = feet - 0.36 * h;
  const shoulderY = top + 0.3 * h - rise;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;
  const flow = bp.walking ? 1 : bp.posing ? bp.poseAmount : 0.35;

  // Torn cloak streamers, behind everything.
  for (let k = 0; k < 4; k++) {
    const sx = -0.08 * w + lean * 0.6;
    const sy = shoulderY + k * 0.07 * h;
    const len = (0.28 * w + 0.3 * w * flow) * (1 - k * 0.08);
    const tipY = sy + 0.05 * h + k * 3 + 3 * Math.sin(bp.t / 5 + k * 1.3);
    out.push(forwardPoly(bp, [[sx, sy], [sx + 2, sy + 0.07 * h], [sx - len, tipY]], k === 1 ? colors.accent : LOOK.galeCloak));
  }

  // Legs: a thigh and a shin each, bent at the knee.
  for (const i of [0, 1]) {
    const hipDx = (i === 0 ? -0.08 : 0.08) * w + lean * 0.3;
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing * 1.3);
    const footDx = hipDx + g.dx * 0.8 - 2;
    const footY = bp.airborne ? feet - 0.08 * h : feet - g.lift;
    const kneeDx = (hipDx + footDx) / 2 + 7;
    const kneeY = (hipY + footY) / 2;
    out.push(bar(bp, hipDx, hipY, kneeDx, kneeY, 4, LOOK.galeDark));
    out.push(bar(bp, kneeDx, kneeY, footDx, footY - 2, 3.5, LOOK.galeDark));
    out.push(forwardRect(bp, footDx - 3, footDx + 9, footY - 3, 3, LOOK.galeDark));
  }

  out.push(
    forwardPoly(
      bp,
      [
        [-0.16 * w + lean * 0.2, hipY + 4],
        [0.14 * w + lean * 0.3, hipY + 4],
        [0.2 * w + lean, shoulderY],
        [-0.1 * w + lean * 0.7, shoulderY - 4],
      ],
      colors.body,
    ),
  );

  // Hood and face.
  const headDx = 0.16 * w + lean * 1.1;
  const headY = top + headR * 1.1 - rise;
  out.push(
    forwardPoly(
      bp,
      [
        [headDx + headR * 0.2, headY - headR],
        [headDx - headR * 2, headY + headR * 0.3],
        [headDx - headR * 0.6, headY + headR],
        [headDx + headR * 0.6, headY + headR * 0.9],
      ],
      LOOK.galeDark,
    ),
  );
  out.push(forwardRect(bp, headDx + headR * 0.1, headDx + headR * 0.7, headY - 1, 2 + 3 * charge, colors.glow ?? colors.accent));

  // The arm and the blade.
  const grip: [number, number] = [0.06 * w + lean * 0.5, shoulderY + 0.1 * h];
  const restTip: [number, number] = [grip[0] + 30, grip[1] + 26];
  let target = restTip;
  if (bp.attackPose === 'sideways') target = [0.76 * w, grip[1] - 2];
  else if (bp.attackPose === 'raised') target = [grip[0] + 16, top - 14 - rise];
  else if (bp.attackPose === 'back') target = [-0.74 * w, grip[1] - 16];
  const tip: [number, number] = [mix(restTip[0], target[0], amount), mix(restTip[1], target[1], amount)];
  out.push(bar(bp, -0.1 * w + lean * 0.6, shoulderY + 2, 0.14 * w + lean * 0.3, hipY, 3, LOOK.galeDark));
  out.push(bar(bp, 0.02 * w + lean * 0.7, shoulderY + 4, grip[0], grip[1], 3.5, colors.body));
  out.push(curvedBlade(bp, grip, tip, 10, colors.glow ?? LOOK.bossBladeSteel));
  return out;
}

/**
 * The Brass Sentinel: an armoured knight of brass plates, with a crested helm whose visor slit glows wider during the
 * wind-up (the cue), big round shoulders, a tower shield held in front and a mace in the rear hand. The mace shows the
 * attack: on the shoulder at rest, raised over the head, slammed down, swept out level, or dragged back while the
 * shield drives forward for the bash.
 */
function brassSentinelFigure(bp: BossPose, colors: { body: string; accent: string; glow: string | null }): Primitive[] {
  const { w, h, top, feet, rise, lean } = bp;
  const out: Primitive[] = [];
  const charge = chargeOf(bp);
  const amount = bp.posing ? bp.poseAmount : 0;
  const legTop = feet - 0.28 * h;
  const torsoTop = top + 0.24 * h - rise;
  const phase = (TAU * bp.t) / LOOK.legCycleTicks;

  for (const i of [0, 1]) {
    const hipDx = (i === 0 ? -0.2 : 0.16) * w;
    const g = gait(bp, phase + i * Math.PI, LOOK.bossLegSwing * 0.55);
    const footDx = hipDx + g.dx;
    const footY = bp.airborne ? feet - 0.06 * h : feet - g.lift;
    const half = 0.12 * w;
    out.push(
      forwardPoly(
        bp,
        [
          [hipDx - half, legTop],
          [hipDx + half, legTop],
          [footDx + half + 3, footY],
          [footDx - half, footY],
        ],
        LOOK.sentinelSteel,
      ),
    );
  }

  // Torso with a belt and a chest plate line.
  out.push(
    forwardPoly(
      bp,
      [
        [-0.42 * w, legTop + 2],
        [0.4 * w, legTop + 2],
        [0.36 * w + lean, torsoTop],
        [-0.36 * w + lean * 0.4, torsoTop],
      ],
      colors.body,
    ),
  );
  out.push(forwardRect(bp, -0.4 * w, 0.38 * w, legTop - 8, 8, LOOK.sentinelSteel));
  out.push(forwardRect(bp, -0.3 * w + lean * 0.3, 0.32 * w + lean * 0.8, torsoTop + 0.12 * h, 3, LOOK.sentinelSteel));

  // Shoulders.
  for (const dx of [-0.26 * w + lean * 0.4, 0.26 * w + lean * 0.9]) {
    out.push({ kind: 'circle', x: bp.cx + bp.f * dx, y: torsoTop + 0.02 * h, r: 0.13 * w + 2, color: LOOK.sentinelSteel });
    out.push({ kind: 'circle', x: bp.cx + bp.f * dx, y: torsoTop + 0.02 * h, r: 0.13 * w, color: colors.body });
  }

  // Helm with a crest and a visor slit.
  const helmL = 0.02 * w + lean * 1.1;
  const helmR = helmL + 0.34 * w;
  const helmTop = top + 0.04 * h - rise;
  const helmH = torsoTop + 2 - helmTop;
  out.push(forwardRect(bp, helmL, helmR, helmTop, helmH, colors.body));
  out.push(forwardRect(bp, helmL + 0.06 * w, helmR - 0.06 * w, top - 6 - rise, 12, colors.accent));
  out.push(forwardRect(bp, helmL + 0.08 * w, helmR, helmTop + 0.3 * helmH, 2.5 + 5 * charge, colors.glow ?? colors.accent));

  // The tower shield, in front; it drives forward for the bash.
  const shieldX0 = 0.2 * w + lean * 0.7 + (bp.attackPose === 'back' ? 0.06 * w * amount : 0);
  const shieldX1 = shieldX0 + 0.26 * w;
  const shieldY0 = torsoTop - 0.02 * h;
  const shieldY1 = feet - 0.16 * h;
  out.push(forwardRect(bp, shieldX0, shieldX1, shieldY0, shieldY1 - shieldY0, colors.accent));
  out.push(forwardRect(bp, shieldX0 + 3, shieldX1 - 3, shieldY0 + 3, shieldY1 - shieldY0 - 6, LOOK.sentinelSteel));
  out.push({ kind: 'circle', x: bp.cx + bp.f * ((shieldX0 + shieldX1) / 2), y: (shieldY0 + shieldY1) / 2, r: 0.07 * w, color: colors.accent });
  // The mace, on the rear arm: drawn over the shield so a sweep or a slam stays in view.
  const restP: [number, number] = [-0.3 * w, top + 0.12 * h - rise];
  let target = restP;
  if (bp.attackPose === 'raised') target = [0.05 * w + lean * 0.5, top - 6 - rise];
  else if (bp.attackPose === 'down') target = [0.5 * w, feet - 10];
  else if (bp.attackPose === 'sideways') target = [0.56 * w, torsoTop + 0.16 * h];
  else if (bp.attackPose === 'back') target = [-0.5 * w, torsoTop + 0.08 * h];
  const head: [number, number] = [mix(restP[0], target[0], amount), mix(restP[1], target[1], amount)];
  const shoulder: [number, number] = [-0.12 * w + lean * 0.5, torsoTop + 0.06 * h];
  const hand: [number, number] = [-0.04 * w + lean * 0.6, torsoTop + 0.16 * h];
  const headR = 0.11 * w;
  out.push(bar(bp, shoulder[0], shoulder[1], hand[0], hand[1], 5, colors.body));
  out.push(bar(bp, hand[0], hand[1], head[0], head[1], 2.5, LOOK.sentinelSteel));
  out.push({ kind: 'circle', x: bp.cx + bp.f * head[0], y: head[1], r: headR, color: colors.accent });
  out.push({ kind: 'circle', x: bp.cx + bp.f * head[0], y: head[1], r: headR * 0.5, color: LOOK.sentinelSteel });
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
 * Small signs on the figure that tell what the running attack will do: springs under the feet for a hover, a flare
 * behind the body for a strike on both sides, and a row of pips over the head for the shots (a ring round a pip for an
 * aimed bolt, behind the boss for a bolt fired backwards, a triangle for a lobbed shot, a bar for an eruption).
 * Everything stays inside the figure's box plus its margin.
 */
function attackMarks(bp: BossPose): Primitive[] {
  const m = bp.marks;
  if (m === null) return [];
  const out: Primitive[] = [];
  const t = LOOK.mark;
  if (m.hover) {
    for (const side of [-1, 1]) {
      out.push(forwardRect(bp, side * bp.w * 0.32 - 7, side * bp.w * 0.32 + 7, bp.feet - t.springHeight, t.springHeight, t.spring));
    }
  }
  if (m.both) {
    const y = bp.top + bp.h * 0.25;
    out.push(
      forwardPoly(
        bp,
        [
          [-bp.w / 2 + 2, y],
          [-bp.w / 2 - t.flareLength, y + bp.h * 0.15],
          [-bp.w / 2 + 2, y + bp.h * 0.3],
        ],
        t.flare,
      ),
    );
  }
  const shots = m.shots.slice(0, t.maxPips);
  const ahead = shots.filter((x) => !x.back);
  const behind = shots.filter((x) => x.back);
  const row = (list: typeof shots, sign: 1 | -1): void => {
    list.forEach((shot, i) => {
      const dx = sign * (bp.w * 0.18 + i * t.pipSpacing);
      const y = bp.top - t.pipLift;
      const x = bp.cx + bp.f * dx;
      if (shot.aimed) out.push({ kind: 'circle', x, y, r: t.pipRadius + 3, color: t.aimRing });
      if (shot.kind === 'arc') {
        out.push(
          forwardPoly(
            bp,
            [
              [dx - t.pipRadius - 1, y + t.pipRadius],
              [dx + t.pipRadius + 1, y + t.pipRadius],
              [dx, y - t.pipRadius - 1],
            ],
            t.pip,
          ),
        );
      } else if (shot.kind === 'eruption') {
        out.push({ kind: 'rect', x: x - t.pipRadius, y: y - t.pipRadius, w: t.pipRadius * 2, h: t.pipRadius * 2, color: t.pip });
      } else {
        out.push({ kind: 'circle', x, y, r: t.pipRadius, color: t.pip });
      }
    });
  };
  row(ahead, 1);
  row(behind, -1);
  return out;
}

/**
 * The boss's figure for this moment. The style comes from the boss id (`ember-duelist` a biped, `ashen-hound` a beast, `vesper-sage` a hooded caster, `tremor-brute` a hunched bruiser, `cinder-golem` a walking furnace, `quill-warden` a heron-like lancer, `veil-dancer` a masked dancer in a veil,
 * `gale-reaver` a forward-leaning wind-runner, `brass-sentinel` an armoured knight, anything else a generic block); the animation from the tick, the boss mode, the running attack's pose, the facing and
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
    case 'vesper-sage':
      return vesperSageFigure(bp, colors);
    case 'tremor-brute':
      return tremorBruteFigure(bp, colors);
    case 'cinder-golem':
      return [...cinderGolemFigure(bp, colors), ...attackMarks(bp)];
    case 'quill-warden':
      return [...quillWardenFigure(bp, colors), ...attackMarks(bp)];
    case 'veil-dancer':
      return [...veilDancerFigure(bp, colors), ...attackMarks(bp)];
    case 'gale-reaver':
      return [...galeReaverFigure(bp, colors), ...attackMarks(bp)];
    case 'brass-sentinel':
      return [...brassSentinelFigure(bp, colors), ...attackMarks(bp)];
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

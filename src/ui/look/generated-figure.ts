/**
 * The look of a generated boss: a body plan picked by the fight's seed, filled with mix-and-match parts (a head, an arm
 * style, a back piece and some trim). The attacks only tilt the odds (a boss of shots is likelier to be a caster), the
 * seed still decides. Look only: nothing here touches the fight, and the same seed always gives the same look.
 * Every size and count is in `LOOK.genFigure`; the proportions of each part are constants here.
 */
import type { BossDef } from '../../bosses/schema';
import { rng } from './background';
import type { Primitive } from './figures';
import { forwardPoly, forwardRect, weaponArm, type BossPose } from './pose';
import { LOOK } from './tuning';

export type Plan = 'upright' | 'beast' | 'wisp' | 'totem' | 'crawler';
export type Head = 'helm' | 'horns' | 'hood' | 'eye' | 'crown' | 'faceless';
export type ArmStyle = 'blade' | 'plain' | 'club' | 'orb';
export type Back = 'cape' | 'wings' | 'spines' | 'orbs' | 'shell' | 'none';
export type Trim = 'stripes' | 'core' | 'runes' | 'none';

export interface Recipe {
  plan: Plan;
  head: Head;
  arm: ArmStyle;
  back: Back;
  trim: Trim;
  /** 0, 1 or 2: how many spikes, stripes or runes the parts that have a count show. */
  variant: number;
}

type Hint = 'shot' | 'eruption' | 'leap' | 'dash' | 'strike';
interface Option<T> {
  id: T;
  likes: readonly Hint[];
}

const PLAN_OPTIONS: readonly Option<Plan>[] = [
  { id: 'upright', likes: ['strike'] },
  { id: 'beast', likes: ['leap', 'dash'] },
  { id: 'wisp', likes: ['shot'] },
  { id: 'totem', likes: ['eruption'] },
  { id: 'crawler', likes: ['leap'] },
];
const HEAD_OPTIONS: readonly Option<Head>[] = [
  { id: 'helm', likes: ['strike', 'dash'] },
  { id: 'horns', likes: ['strike'] },
  { id: 'hood', likes: ['shot'] },
  { id: 'eye', likes: ['shot'] },
  { id: 'crown', likes: ['eruption'] },
  { id: 'faceless', likes: [] },
];
const ARM_OPTIONS: readonly Option<ArmStyle>[] = [
  { id: 'blade', likes: ['strike'] },
  { id: 'plain', likes: ['dash'] },
  { id: 'club', likes: ['eruption'] },
  { id: 'orb', likes: ['shot'] },
];
const BACK_OPTIONS: readonly Option<Back>[] = [
  { id: 'cape', likes: ['dash'] },
  { id: 'wings', likes: ['leap'] },
  { id: 'spines', likes: ['eruption'] },
  { id: 'orbs', likes: ['shot'] },
  { id: 'shell', likes: ['strike'] },
  { id: 'none', likes: [] },
];
const TRIM_OPTIONS: readonly Option<Trim>[] = [
  { id: 'stripes', likes: [] },
  { id: 'core', likes: [] },
  { id: 'runes', likes: [] },
  { id: 'none', likes: [] },
];

export const PLANS: readonly Plan[] = PLAN_OPTIONS.map((o) => o.id);
export const HEADS: readonly Head[] = HEAD_OPTIONS.map((o) => o.id);
export const ARMS: readonly ArmStyle[] = ARM_OPTIONS.map((o) => o.id);
export const BACKS: readonly Back[] = BACK_OPTIONS.map((o) => o.id);
export const TRIMS: readonly Trim[] = TRIM_OPTIONS.map((o) => o.id);

/** The share (0 to 1) of the boss's attacks of each kind. An attack counts once, as the first kind that fits. */
function shares(boss: BossDef): Record<Hint, number> {
  const n = Math.max(1, boss.attacks.length);
  const out: Record<Hint, number> = { shot: 0, eruption: 0, leap: 0, dash: 0, strike: 0 };
  for (const a of boss.attacks) {
    const shots = a.shots ?? [];
    if (shots.some((s) => s.kind !== 'eruption')) out.shot += 1 / n;
    else if (shots.some((s) => s.kind === 'eruption')) out.eruption += 1 / n;
    else if (a.leap !== undefined) out.leap += 1 / n;
    else if (a.move !== undefined) out.dash += 1 / n;
    else out.strike += 1 / n;
  }
  return out;
}

function choose<T>(options: readonly Option<T>[], share: Record<Hint, number>, next: () => number): T {
  const weights = options.map((o) => 1 + LOOK.genFigure.hint * o.likes.reduce((sum, h) => sum + share[h], 0));
  let roll = next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return options[i]!.id;
  }
  return options[options.length - 1]!.id;
}

/** The look for a fight's seed and boss: a pure function, so a replay shows the same boss. */
export function figureRecipe(seed: number, boss: BossDef): Recipe {
  const next = rng(seed ^ 0x6f1d5eed);
  const share = shares(boss);
  const plan = choose(PLAN_OPTIONS, share, next);
  const head = choose(HEAD_OPTIONS, share, next);
  const arm = choose(ARM_OPTIONS, share, next);
  const back = choose(BACK_OPTIONS, share, next);
  const trim = choose(TRIM_OPTIONS, share, next);
  const variant = Math.min(2, Math.floor(next() * 3));
  return { plan, head, arm, back, trim, variant };
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;

interface Colors {
  body: string;
  accent: string;
  glow: string | null;
}

/** Where the parts attach, in forward coordinates (dx from the centre, forward the way the boss faces; y in the world). */
interface Anchors {
  head: { dx: number; y: number; r: number };
  /** A rectangle that lies inside the body, where the trim goes. */
  torso: { dx0: number; dx1: number; y0: number; y1: number };
  /** The back edge of the body, where back pieces are fixed. */
  back: { dx: number; y0: number; y1: number };
}

interface Built {
  shapes: Primitive[];
  anchors: Anchors;
}

const circleAt = (bp: BossPose, dx: number, y: number, r: number, color: string): Primitive => ({
  kind: 'circle',
  x: bp.cx + bp.f * dx,
  y,
  r,
  color,
});

const phaseOf = (bp: BossPose): number => (TAU * bp.t) / LOOK.legCycleTicks;
const swayOf = (bp: BossPose): number => LOOK.genFigure.sway * Math.sin((TAU * bp.t) / LOOK.genFigure.swayTicks);

/** A leg from a hip to the floor, swinging while the boss walks and tucked while it is in the air. */
function leg(bp: BossPose, hipDx: number, hipY: number, halfW: number, phase: number, color: string): Primitive {
  const G = LOOK.genFigure;
  let dx = 0;
  let lift = 0;
  if (bp.airborne) {
    lift = G.legLift * 1.5;
  } else if (bp.walking) {
    dx = G.legSwing * Math.sin(phase);
    lift = G.legLift * Math.max(0, Math.cos(phase));
  }
  const footY = bp.feet - lift;
  return forwardPoly(
    bp,
    [
      [hipDx - halfW, hipY],
      [hipDx + halfW, hipY],
      [hipDx + halfW + dx, footY],
      [hipDx - halfW + dx, footY],
    ],
    color,
  );
}

function upright(bp: BossPose, c: Colors): Built {
  const { w, h, top, feet, rise, headR, lean } = bp;
  const legH = h * 0.32;
  const hipY = feet - legH;
  const bodyTop = top + headR * 1.6 - rise;
  const p = phaseOf(bp);
  const shapes: Primitive[] = [
    leg(bp, -w * 0.2, hipY, w * 0.1, p, c.body),
    leg(bp, w * 0.2, hipY, w * 0.1, p + Math.PI, c.body),
    forwardRect(bp, -w * 0.4, w * 0.4, bodyTop, Math.max(1, hipY + 2 - bodyTop), c.body),
  ];
  return {
    shapes,
    anchors: {
      head: { dx: lean * 1.2, y: top + headR - rise, r: headR },
      torso: { dx0: -w * 0.32, dx1: w * 0.32, y0: bodyTop + 4, y1: hipY - 2 },
      back: { dx: -w * 0.4, y0: bodyTop, y1: hipY },
    },
  };
}

function beast(bp: BossPose, c: Colors): Built {
  const { w, h, top, feet, rise, headR, lean } = bp;
  const bodyTop = top + h * 0.4 - rise;
  const bodyBottom = feet - h * 0.25;
  const p = phaseOf(bp);
  const hr = headR * 1.2;
  const headDx = w * 0.38 + lean;
  const headY = top + h * 0.3 - rise;
  const tailTipY = Math.max(top - 6, top + h * 0.1 - rise);
  const shapes: Primitive[] = [
    forwardPoly(
      bp,
      [
        [-w / 2, bodyTop + 4],
        [-w / 2 - 10 + swayOf(bp), tailTipY],
        [-w / 2, bodyTop + 16],
      ],
      c.body,
    ),
    leg(bp, -w * 0.4, bodyBottom, w * 0.06, p, c.body),
    leg(bp, -w * 0.22, bodyBottom, w * 0.06, p + Math.PI, c.body),
    leg(bp, w * 0.12, bodyBottom, w * 0.06, p + Math.PI, c.body),
    leg(bp, w * 0.28, bodyBottom, w * 0.06, p, c.body),
    forwardRect(bp, -w / 2, w * 0.3, bodyTop, Math.max(1, bodyBottom - bodyTop), c.body),
    forwardPoly(
      bp,
      [
        [w * 0.1, bodyTop],
        [headDx, headY - hr * 0.7],
        [headDx, headY + hr * 0.7],
        [w * 0.3, bodyTop + h * 0.2],
      ],
      c.body,
    ),
  ];
  return {
    shapes,
    anchors: {
      head: { dx: headDx, y: headY, r: hr },
      torso: { dx0: -w * 0.42, dx1: w * 0.22, y0: bodyTop + 4, y1: bodyBottom - 4 },
      back: { dx: -w / 2, y0: bodyTop, y1: bodyBottom },
    },
  };
}

function wisp(bp: BossPose, c: Colors): Built {
  const { w, h, top, feet, rise, headR, lean } = bp;
  const r = Math.min(w / 2, h * 0.4);
  const cy = top + h * 0.42 - rise * 1.5;
  const dx = lean * 0.5;
  const sway = swayOf(bp);
  const shapes: Primitive[] = [
    forwardPoly(
      bp,
      [
        [dx - r * 0.8, cy + r * 0.3],
        [dx + r * 0.8, cy + r * 0.3],
        [dx + sway * 0.6, feet],
      ],
      c.body,
    ),
    forwardPoly(
      bp,
      [
        [dx - r * 0.6, cy - r * 0.2],
        [-w / 2, cy + r * 0.1 + sway * 0.3],
        [dx - r * 0.6, cy + r * 0.5],
      ],
      c.body,
    ),
    forwardPoly(
      bp,
      [
        [dx + r * 0.6, cy - r * 0.2],
        [w / 2, cy + r * 0.1 - sway * 0.3],
        [dx + r * 0.6, cy + r * 0.5],
      ],
      c.body,
    ),
    circleAt(bp, dx, cy, r, c.body),
  ];
  return {
    shapes,
    anchors: {
      head: { dx: dx + r * 0.35, y: cy - r * 0.45, r: Math.min(headR * 0.8, r * 0.5) },
      torso: { dx0: dx - r * 0.6, dx1: dx + r * 0.6, y0: cy - r * 0.5, y1: cy + r * 0.6 },
      back: { dx: dx - r, y0: cy - r * 0.6, y1: cy + r * 0.5 },
    },
  };
}

function totem(bp: BossPose, c: Colors): Built {
  const { w, h, feet, rise, headR, lean } = bp;
  const heights = [h * 0.27, h * 0.27, h * 0.2];
  const widths = [w * 0.9, w * 0.7, w * 0.5];
  const shapes: Primitive[] = [];
  const blocks: { dx: number; y0: number; y1: number; half: number }[] = [];
  let y = feet;
  for (let i = 0; i < 3; i++) {
    const shift = lean * (i / 2);
    const y1 = y - rise * i;
    const y0 = y1 - heights[i]!;
    blocks.push({ dx: shift, y0, y1, half: widths[i]! / 2 });
    shapes.push(forwardRect(bp, shift - widths[i]! / 2, shift + widths[i]! / 2, y0, y1 - y0, c.body));
    y = y0 - 2;
  }
  const topBlock = blocks[2]!;
  const mid = blocks[1]!;
  return {
    shapes,
    anchors: {
      head: { dx: topBlock.dx, y: topBlock.y0 + headR * 0.4, r: headR },
      torso: { dx0: mid.dx - mid.half * 0.8, dx1: mid.dx + mid.half * 0.8, y0: mid.y0 + 4, y1: mid.y1 - 4 },
      back: { dx: mid.dx - mid.half, y0: mid.y0, y1: mid.y1 },
    },
  };
}

function crawler(bp: BossPose, c: Colors): Built {
  const { w, h, top, feet, rise, headR, lean } = bp;
  const domeBottom = feet - h * 0.3;
  const domeTop = top + h * 0.12 - rise;
  const p = phaseOf(bp);
  const dome: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    dome.push([-w / 2 + (w * k) / 6, domeBottom - (domeBottom - domeTop) * Math.sin((Math.PI * k) / 6)]);
  }
  const shapes: Primitive[] = [];
  const halfW = Math.max(3, w * 0.035);
  for (let i = 0; i < 6; i++) {
    shapes.push(leg(bp, -w * 0.4 + i * w * 0.16, domeBottom - 2, halfW, p + (i % 2) * Math.PI, c.body));
  }
  shapes.push(forwardPoly(bp, dome, c.body));
  const span = domeBottom - domeTop;
  return {
    shapes,
    anchors: {
      head: { dx: w * 0.2 + lean, y: domeTop + span * 0.3, r: headR * 0.8 },
      torso: { dx0: -w * 0.3, dx1: w * 0.3, y0: domeTop + span * 0.5, y1: domeBottom - 2 },
      back: { dx: -w * 0.4, y0: domeTop + span * 0.25, y1: domeBottom },
    },
  };
}

const PLAN_DRAW: Record<Plan, (bp: BossPose, c: Colors) => Built> = { upright, beast, wisp, totem, crawler };

function headShapes(bp: BossPose, recipe: Recipe, c: Colors, a: Anchors): Primitive[] {
  const { dx, y, r } = a.head;
  const rh = Math.min(LOOK.genFigure.reach, r * 0.9);
  const out: Primitive[] = [circleAt(bp, dx, y, r, c.body)];
  switch (recipe.head) {
    case 'helm':
      out.push(forwardRect(bp, dx + r * 0.2, dx + r * 0.95, y - r * 0.2, r * 0.35, c.accent));
      out.push(forwardRect(bp, dx - r * 0.15, dx + r * 0.15, y - r - rh * 0.7, rh * 0.7 + 2, c.accent));
      break;
    case 'horns':
      for (const s of [-1, 1]) {
        out.push(
          forwardPoly(
            bp,
            [
              [dx + s * r * 0.6, y - r * 0.4],
              [dx + s * r * 1.35, y - r - rh],
              [dx + s * r * 0.2, y - r * 0.85],
            ],
            c.accent,
          ),
        );
      }
      break;
    case 'hood':
      out.push(
        forwardPoly(
          bp,
          [
            [dx - r * 1.15, y + r * 0.3],
            [dx + r * 0.1, y - r - rh],
            [dx + r * 1.15, y + r * 0.3],
          ],
          c.body,
        ),
      );
      out.push(circleAt(bp, dx + r * 0.35, y - r * 0.05, r * 0.17, c.accent));
      out.push(circleAt(bp, dx + r * 0.75, y - r * 0.05, r * 0.17, c.accent));
      break;
    case 'eye':
      out.push(circleAt(bp, dx + r * 0.3, y, r * 0.6, c.glow ?? c.accent));
      out.push(circleAt(bp, dx + r * 0.45, y, r * 0.25, c.body));
      break;
    case 'crown': {
      const n = 3 + recipe.variant;
      for (let i = 0; i < n; i++) {
        const sx = dx + (i - (n - 1) / 2) * ((r * 1.6) / (n - 1));
        out.push(
          forwardPoly(
            bp,
            [
              [sx - r * 0.25, y - r * 0.7],
              [sx, y - r - rh],
              [sx + r * 0.25, y - r * 0.7],
            ],
            c.accent,
          ),
        );
      }
      break;
    }
    case 'faceless':
      break;
  }
  return out;
}

/** The end of the arm rectangle that is farther from the shoulder: where a club or an orb is held. */
function handOf(bp: BossPose, arm: Primitive): { x: number; y: number } | null {
  if (arm.kind !== 'rect') return null;
  const shoulderX = bp.cx + bp.f * bp.lean * 0.8;
  const shoulderY = bp.top + bp.h * 0.3 - bp.rise;
  const ends: [number, number][] =
    arm.w > arm.h
      ? [
          [arm.x, arm.y + arm.h / 2],
          [arm.x + arm.w, arm.y + arm.h / 2],
        ]
      : [
          [arm.x + arm.w / 2, arm.y],
          [arm.x + arm.w / 2, arm.y + arm.h],
        ];
  const d = (e: [number, number]): number => Math.hypot(e[0] - shoulderX, e[1] - shoulderY);
  const far = d(ends[0]!) >= d(ends[1]!) ? ends[0]! : ends[1]!;
  return { x: far[0], y: far[1] };
}

function armShapes(bp: BossPose, recipe: Recipe, c: Colors): Primitive[] {
  const arm = weaponArm(bp, c.accent, recipe.arm === 'blade' ? (c.glow ?? c.accent) : null);
  if (recipe.arm === 'club' || recipe.arm === 'orb') {
    const hand = arm.length > 0 ? handOf(bp, arm[0]!) : null;
    if (hand !== null) {
      if (recipe.arm === 'club') {
        const s = bp.headR * 0.8;
        arm.push({ kind: 'rect', x: hand.x - s, y: hand.y - s, w: s * 2, h: s * 2, color: c.accent });
      } else {
        arm.push({ kind: 'circle', x: hand.x, y: hand.y, r: bp.headR * 0.7, color: c.glow ?? c.accent });
      }
    }
  }
  return arm;
}

function backShapes(bp: BossPose, recipe: Recipe, c: Colors, a: Anchors): Primitive[] {
  const { dx, y0, y1 } = a.back;
  const G = LOOK.genFigure;
  const out: Primitive[] = [];
  switch (recipe.back) {
    case 'cape': {
      const sway = swayOf(bp);
      out.push(
        forwardPoly(
          bp,
          [
            [dx + 2, y0],
            [dx - 4, y0 + 2],
            [dx - 16 - sway, y1 - (y1 - y0) * 0.05],
            [dx - 8 - sway * 0.5, y1],
            [dx + 2, y1 - (y1 - y0) * 0.15],
          ],
          c.accent,
        ),
      );
      break;
    }
    case 'wings': {
      const flap = Math.sin((TAU * bp.t) / G.flapTicks);
      const span = y1 - y0;
      const floor = bp.top - 8;
      for (const [shift, size] of [
        [0, 1],
        [8, 0.7],
      ] as const) {
        const tipY = Math.max(floor, y0 - (14 + 8 * flap) * size);
        out.push(
          forwardPoly(
            bp,
            [
              [dx + 3 + shift, y0 + span * 0.15],
              [dx - 14 + shift, tipY],
              [dx - 4 + shift, y0 + span * 0.5],
            ],
            c.accent,
          ),
        );
      }
      break;
    }
    case 'spines': {
      const n = 3 + recipe.variant;
      const step = (y1 - y0) / n;
      for (let i = 0; i < n; i++) {
        const y = y0 + (i + 0.5) * step;
        out.push(
          forwardPoly(
            bp,
            [
              [dx + 3, y - 5],
              [dx - Math.min(G.reach, 12), y - 9],
              [dx + 3, y + 5],
            ],
            c.accent,
          ),
        );
      }
      break;
    }
    case 'orbs': {
      const r = bp.headR * 0.45;
      const cy = bp.top + bp.h * 0.45 - bp.rise;
      const rx = bp.w / 2 - r;
      const ry = bp.h * 0.3;
      for (let i = 0; i < 3; i++) {
        const angle = (TAU * bp.t) / G.orbitTicks + (i * TAU) / 3;
        out.push(circleAt(bp, rx * Math.cos(angle), cy + ry * Math.sin(angle), r, c.glow ?? c.accent));
      }
      break;
    }
    case 'shell':
      out.push(
        forwardPoly(
          bp,
          [
            [dx + 6, y0 + 2],
            [dx - 8, Math.max(bp.top - 4, y0 - 4)],
            [dx - 14, (y0 + y1) / 2],
            [dx - 8, y1 - 4],
            [dx + 6, y1 - 6],
          ],
          c.accent,
        ),
      );
      break;
    case 'none':
      break;
  }
  return out;
}

function trimShapes(bp: BossPose, recipe: Recipe, c: Colors, a: Anchors): Primitive[] {
  const { dx0, dx1, y0, y1 } = a.torso;
  const out: Primitive[] = [];
  switch (recipe.trim) {
    case 'stripes': {
      const n = 2 + (recipe.variant % 2);
      for (let i = 0; i < n; i++) {
        out.push(forwardRect(bp, dx0, dx1, y0 + ((y1 - y0) * (i + 1)) / (n + 1) - 1.5, 3, c.accent));
      }
      break;
    }
    case 'core': {
      const base = Math.min(dx1 - dx0, y1 - y0) * 0.25;
      const pulse = 1 + LOOK.genFigure.corePulse * Math.sin((TAU * bp.t) / 30);
      out.push(circleAt(bp, (dx0 + dx1) / 2, (y0 + y1) / 2, base * pulse, c.glow ?? c.accent));
      break;
    }
    case 'runes': {
      const n = 3 + (recipe.variant % 2);
      for (let i = 0; i < n; i++) {
        const dx = dx0 + ((dx1 - dx0) * (i + 0.5)) / n;
        const y = y0 + (y1 - y0) * (i % 2 === 0 ? 0.3 : 0.65);
        out.push(forwardRect(bp, dx - 2, dx + 2, y - 2, 4, c.accent));
      }
      break;
    }
    case 'none':
      break;
  }
  return out;
}

/**
 * A generated boss's figure: the back piece, the body plan, the head, the arm and the trim, in that order. The arm
 * always follows the running attack's pose so a wind-up stays readable. When a figure would go over
 * `LOOK.genFigure.maxShapes` the trim goes first, then the back piece.
 */
export function generatedFigure(bp: BossPose, recipe: Recipe, colors: Colors): Primitive[] {
  const built = PLAN_DRAW[recipe.plan](bp, colors);
  const head = headShapes(bp, recipe, colors, built.anchors);
  const arm = armShapes(bp, recipe, colors);
  let back = backShapes(bp, recipe, colors, built.anchors);
  let trim = trimShapes(bp, recipe, colors, built.anchors);
  const max = LOOK.genFigure.maxShapes;
  const core = built.shapes.length + head.length + arm.length;
  if (core + back.length + trim.length > max) trim = [];
  if (core + back.length + trim.length > max) back = [];
  return [...back, ...built.shapes, ...head, ...arm, ...trim];
}

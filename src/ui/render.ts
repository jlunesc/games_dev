import type { BossDef, Pose } from '../bosses/schema';
import { activeHitBoxes, attackActive, attackBox } from '../game/geometry';
import { PLAYER, WORLD } from '../game/params';
import type { BossState, GameState } from '../game/state';
import { shakeOffset, type FeedbackState } from './feedback';

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fits the fixed 16:9 world into the canvas as large as possible and centres it, leaving bars where the screen is wider or taller. */
export function computeViewport(canvasWidth: number, canvasHeight: number): Viewport {
  const scale = Math.min(canvasWidth / WORLD.width, canvasHeight / WORLD.height);
  return {
    scale,
    offsetX: (canvasWidth - WORLD.width * scale) / 2,
    offsetY: (canvasHeight - WORLD.height * scale) / 2,
  };
}

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
  ember: '#c8642a',
  stagger: '#7fd6ff',
  power: '#ffffff',
  gold: '#f5c542',
  red: '#e0403a',
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
export function bossLook(b: BossState, boss: BossDef): BossLook {
  if (b.mode === 'transition') return { body: BOSS_COLORS.ember, glow: BOSS_COLORS.power };
  if (b.mode === 'stagger') return { body: BOSS_COLORS.stagger, glow: null };
  if (b.mode === 'attack' && b.attackId !== null) {
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    if (attack !== undefined && b.attackTick < attack.windup + attack.active) {
      return {
        body: BOSS_COLORS.ember,
        glow: attack.class === 'counterable' ? BOSS_COLORS.gold : BOSS_COLORS.red,
      };
    }
  }
  return { body: BOSS_COLORS.ember, glow: null };
}

/** Where a running leap will land and what its shockwave covers, as `landingRing` reports it. */
export interface LandingRing {
  /** The landing x. */
  x: number;
  /**
   * The nearest and farthest reach of the shockwave from the landing x, towards the way the boss faces. For a
   * harmless landing they are `-width / 2` and `width / 2`: a marker centred on the landing spot.
   */
  x0: number;
  x1: number;
  facing: 1 | -1;
  /** True when the attack has no hit windows: the landing hurts nobody and only a small marker is drawn. */
  harmless: boolean;
}

/**
 * Where the running leap will land and which side and how far its shockwave reaches. The real shockwave is
 * one-sided (the hit windows run from the landing spot towards the way the boss faces, and the boss does not turn
 * during an attack), so this reports the smallest `x0` and the largest `x1` of the attack's hit windows and the
 * facing. An attack with no hit windows is `harmless`. Null when no leap is running.
 */
export function landingRing(b: BossState, boss: BossDef): LandingRing | null {
  if (b.leapToX === null) return null;
  const attack = b.attackId === null ? undefined : boss.attacks.find((a) => a.id === b.attackId);
  if (attack === undefined || attack.hits.length === 0) {
    // Harmless: a marker centred on the landing spot and as wide as the boss.
    return { x: b.leapToX, x0: -boss.width / 2, x1: boss.width / 2, facing: b.facing, harmless: true };
  }
  return {
    x: b.leapToX,
    x0: Math.min(...attack.hits.map((h) => h.x0)),
    x1: Math.max(...attack.hits.map((h) => h.x1)),
    facing: b.facing,
    harmless: false,
  };
}

/**
 * The floor span `[left, right]` a landing ring covers: one-sided, towards the way the boss faces, for a dangerous
 * landing; centred on the landing spot for a harmless one.
 */
export function landingSpan(ring: LandingRing): { left: number; right: number } {
  if (ring.harmless) return { left: ring.x + ring.x0, right: ring.x + ring.x1 };
  return ring.facing === 1
    ? { left: ring.x + ring.x0, right: ring.x + ring.x1 }
    : { left: ring.x - ring.x1, right: ring.x - ring.x0 };
}

const COLORS = {
  bars: '#000000',
  arena: '#12121a',
  floor: '#2a2a3a',
  floorLine: '#8a8aa0',
  platformBody: '#4b4b6e',
  platformGlow: '#8fa8ff',
  coverBody: '#23232f',
  coverEdge: '#6a6a86',
  player: '#e8e8f0',
  playerDash: '#7fd6ff',
  playerHurt: '#ff3b3b',
  bossHp: '#e0403a',
  flash: '#ffffff',
  slash: '#ffffff',
  hud: '#e8e8f0',
  hudBack: '#3a3a4a',
};

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

const PLATFORM_THICKNESS = 14;

/** The arena's pieces as world rectangles: platforms are thin slabs whose top is `height` above the floor, covers stand from the floor up to their height. */
export function arenaRects(boss: BossDef): { platforms: Rect[]; covers: Rect[] } {
  const arena = boss.arena;
  if (arena === undefined) return { platforms: [], covers: [] };
  return {
    platforms: arena.platforms.map((p) => ({
      x: p.x - p.width / 2,
      y: WORLD.floorY - p.height,
      w: p.width,
      h: PLATFORM_THICKNESS,
    })),
    covers: arena.covers.map((c) => ({
      x: c.x - c.width / 2,
      y: WORLD.floorY - c.height,
      w: c.width,
      h: c.height,
    })),
  };
}

/** Draws the platforms (lighter, with a glowing top edge) and the covers (darker and solid, with a lighter top edge). */
function drawArena(ctx: CanvasRenderingContext2D, boss: BossDef): void {
  const { platforms, covers } = arenaRects(boss);
  for (const r of covers) {
    ctx.fillStyle = COLORS.coverBody;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = COLORS.coverEdge;
    ctx.fillRect(r.x, r.y, r.w, 4);
  }
  for (const r of platforms) {
    ctx.fillStyle = COLORS.platformBody;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS.platformGlow;
    ctx.fillRect(r.x - 2, r.y - 5, r.w + 4, 8);
    ctx.restore();
    ctx.fillStyle = COLORS.platformGlow;
    ctx.fillRect(r.x, r.y, r.w, 3);
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: BossDef,
  feedback: FeedbackState,
): void {
  const b = state.boss;
  const look = bossLook(b, boss);
  const pulse = 0.55 + 0.35 * Math.sin(state.tick / 6);
  const attack =
    b.mode === 'attack' && b.attackId !== null
      ? boss.attacks.find((a) => a.id === b.attackId)
      : undefined;

  // Where a leap will land: a flat bar on the floor over the side and reach of the shockwave (one-sided, like the
  // real hit), or a small dim marker when the landing hurts nobody.
  const ring = landingRing(b, boss);
  if (ring !== null) {
    const span = landingSpan(ring);
    ctx.save();
    ctx.fillStyle = BOSS_COLORS.red;
    if (ring.harmless) {
      ctx.globalAlpha = 0.3;
      ctx.fillRect(span.left, WORLD.floorY - 3, span.right - span.left, 3);
    } else {
      ctx.globalAlpha = pulse;
      ctx.fillRect(span.left, WORLD.floorY - 6, span.right - span.left, 6);
    }
    ctx.restore();
  }
  // A soft shadow on the floor shows how high the airborne boss is.
  if (b.lift > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS.bars;
    ctx.beginPath();
    const shrink = 1 - Math.min(0.5, b.lift / 600);
    ctx.ellipse(b.x, WORLD.floorY, (boss.width / 2) * shrink, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const { top, height } = bossDrawBox(b, boss);
  const left = b.x - boss.width / 2;

  ctx.fillStyle = feedback.bossFlashTicks > 0 ? COLORS.flash : look.body;
  ctx.fillRect(left, top, boss.width, height);
  if (look.glow !== null) {
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = look.glow;
    ctx.lineWidth = 8;
    ctx.strokeRect(left - 4, top - 4, boss.width + 8, height + 8);
    ctx.globalAlpha = 1;
  }

  // The arm shows the pose of the attack being performed; when waiting it hangs at the side.
  const shoulderY = top + height * 0.3;
  const arm =
    attack !== undefined
      ? armRect(attack.pose, b.facing, b.x, shoulderY)
      : { x: b.x + b.facing * 18 - 8, y: shoulderY, w: 16, h: 50 };
  ctx.fillStyle = look.glow ?? '#e8965a';
  ctx.fillRect(arm.x, arm.y, arm.w, arm.h);
  // A small notch on the side the boss faces.
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(b.x + b.facing * (boss.width / 2 - 14) - 5, top + 24, 10, 10);

  for (const box of activeHitBoxes(b, boss)) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = look.glow ?? COLORS.bossHp;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  alpha: number,
  feedback: FeedbackState,
): void {
  const p = state.player;
  const x = lerp(p.prevX, p.x, alpha);
  const y = lerp(p.prevY, p.y, alpha);
  const blinking = p.invulnerableTicks > 0 && p.dashTick < 0 && Math.floor(state.tick / 3) % 2 === 1;

  ctx.globalAlpha = blinking ? 0.35 : 1;
  ctx.fillStyle =
    feedback.playerFlashTicks > 0
      ? COLORS.playerHurt
      : p.dashTick >= 0
        ? COLORS.playerDash
        : COLORS.player;
  ctx.fillRect(x - PLAYER.width / 2, y - PLAYER.height, PLAYER.width, PLAYER.height);
  // A small notch on the side the player faces.
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(x + p.facing * (PLAYER.width / 2 - 8) - 4, y - PLAYER.height + 16, 8, 8);
  ctx.globalAlpha = 1;

  if (attackActive(p)) {
    const box = attackBox(p);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.slash;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, boss: BossDef): void {
  for (let i = 0; i < PLAYER.maxHealth; i++) {
    ctx.globalAlpha = i < state.player.health ? 1 : 0.25;
    ctx.fillStyle = COLORS.hud;
    ctx.fillRect(24 + i * 30, 24, 22, 22);
  }
  ctx.globalAlpha = 1;
  const width = 260;
  const left = WORLD.width - 24 - width;
  ctx.fillStyle = COLORS.hudBack;
  ctx.fillRect(left, 24, width, 14);
  ctx.fillStyle = COLORS.bossHp;
  ctx.fillRect(left, 24, (width * state.boss.hp) / boss.maxHp, 14);
  ctx.fillStyle = COLORS.hud;
  for (const phase of boss.phases.slice(1)) {
    ctx.fillRect(left + width * phase.startsAtHpFraction - 1, 20, 3, 22);
  }
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(state.study.active ? `STUDY  ${boss.name}` : boss.name, WORLD.width - 24, 46);
}

/** Draws one frame. `alpha` (0 to just under 1) blends the player between the last two updates. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: GameState,
  boss: BossDef,
  alpha: number,
  feedback: FeedbackState,
): void {
  const view = computeViewport(canvasWidth, canvasHeight);
  const shake = shakeOffset(feedback);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.bars;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.setTransform(
    view.scale,
    0,
    0,
    view.scale,
    view.offsetX + shake * view.scale,
    view.offsetY + shake * 0.5 * view.scale,
  );
  // Everything in the arena is clipped to the world (8 units past each edge, what the shake draws), so nothing
  // paints over the black bars on a wide screen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8, -8, WORLD.width + 16, WORLD.height + 16);
  ctx.clip();
  ctx.fillStyle = COLORS.arena;
  // Drawn 8 units past every edge so the shake never shows the black bars.
  ctx.fillRect(-8, -8, WORLD.width + 16, WORLD.height + 16);
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, WORLD.height - WORLD.floorY + 8);
  ctx.fillStyle = COLORS.floorLine;
  ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, 3);

  drawArena(ctx, boss);
  drawBoss(ctx, state, boss, feedback);
  drawPlayer(ctx, state, alpha, feedback);
  drawHud(ctx, state, boss);

  if (state.phase !== 'fight') {
    ctx.fillStyle = COLORS.hud;
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.phase === 'victory' ? 'Victory' : 'Defeated', WORLD.width / 2, WORLD.height / 2);
  }
  ctx.restore();
}

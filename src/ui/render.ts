import type { BossDef } from '../bosses/schema';
import { activeHitBoxes, attackActive, attackBox } from '../game/geometry';
import { PLAYER, WORLD } from '../game/params';
import type { BossState, GameState } from '../game/state';
import { shakeOffset, type FeedbackState } from './feedback';
import { drawBackground, type BackgroundCache } from './look/background';
import type { EffectsState } from './look/effects';
import { bossFigure, drawPrimitives, playerFigure } from './look/figures';
import { moodFor, type Mood } from './look/moods';
import { BOSS_COLORS, armRect, bossDrawBox, bossLook, type BossLook, type Rect } from './look/pose';
import { LOOK } from './look/tuning';

// The pure pose helpers live in look/pose.ts (so the figures can use them without an import cycle); they are
// re-exported here so every existing import keeps working.
export { BOSS_COLORS, armRect, bossDrawBox, bossLook } from './look/pose';
export type { BossLook, Rect } from './look/pose';

/** What the game screen passes to `drawFrame` to get the full look. Left out, the plain old drawing is used. */
export interface FrameLook {
  effects: EffectsState;
  background: BackgroundCache | null;
  /** False draws the layers still and no embers (the Effects switch off). */
  motion: boolean;
}

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
  floor: LOOK.floor,
  floorLine: LOOK.floorLine,
  platformBody: LOOK.platformBody,
  platformGlow: LOOK.platformGlow,
  coverBody: LOOK.coverBody,
  coverEdge: LOOK.coverEdge,
  player: LOOK.playerBody,
  playerDash: LOOK.playerDashBody,
  playerHurt: LOOK.playerHurtBody,
  bossHp: '#e0403a',
  flash: '#ffffff',
  slash: '#ffffff',
  hud: '#e8e8f0',
  hudBack: '#3a3a4a',
};

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

/**
 * Draws the platforms (lighter, with a glowing top edge) and the covers (darker and solid, with a lighter top edge).
 * With a mood the edges take its accent colour and every piece gets a dark outline, so they stand out from the backdrop.
 */
function drawArena(ctx: CanvasRenderingContext2D, boss: BossDef, mood: Mood | null): void {
  const { platforms, covers } = arenaRects(boss);
  const glow = mood?.accent ?? COLORS.platformGlow;
  for (const r of covers) {
    ctx.fillStyle = COLORS.coverBody;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (mood !== null) {
      ctx.strokeStyle = COLORS.coverEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 1);
    }
    ctx.fillStyle = mood?.accent ?? COLORS.coverEdge;
    ctx.fillRect(r.x, r.y, r.w, 4);
  }
  for (const r of platforms) {
    ctx.fillStyle = COLORS.platformBody;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (mood !== null) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLORS.bars;
      ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.fillRect(r.x - 2, r.y - 5, r.w + 4, 8);
    ctx.restore();
    ctx.fillStyle = glow;
    ctx.fillRect(r.x, r.y, r.w, 3);
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The colour of the boss's body: white in the flash after a hit, otherwise what `bossLook` says. */
export function bossBodyColor(look: BossLook, feedback: FeedbackState): string {
  return feedback.bossFlashTicks > 0 ? COLORS.flash : look.body;
}

/** The colour of the player's body: red after a hit, blue while dashing, otherwise the normal colour. */
export function playerBodyColor(state: GameState, feedback: FeedbackState): string {
  if (feedback.playerFlashTicks > 0) return COLORS.playerHurt;
  return state.player.dashTick >= 0 ? COLORS.playerDash : COLORS.player;
}

/** Whether the player is drawn faint right now (invulnerable after a hit and not dashing, every other 3 ticks). */
export function playerBlinking(state: GameState): boolean {
  const p = state.player;
  return p.invulnerableTicks > 0 && p.dashTick < 0 && Math.floor(state.tick / 3) % 2 === 1;
}

/**
 * The x of the faint vertical lines that suggest floor tiles, across the world and the shake margin. Built once:
 * `WORLD.width` and `LOOK.floorTileSpacing` never change while the game runs, so recomputing this every frame
 * would only waste time.
 */
export const FLOOR_TILE_XS: number[] = (() => {
  const xs: number[] = [];
  for (let x = 0; x <= WORLD.width; x += LOOK.floorTileSpacing) xs.push(x);
  return xs;
})();

function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: BossDef,
  feedback: FeedbackState,
  mood: Mood | null,
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

  const bodyColor = bossBodyColor(look, feedback);
  if (mood !== null) {
    drawPrimitives(
      ctx,
      bossFigure(state, boss, { body: bodyColor, accent: look.glow ?? mood.accent, glow: look.glow }),
    );
  } else {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left, top, boss.width, height);
  }
  if (look.glow !== null) {
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = look.glow;
    ctx.lineWidth = 8;
    ctx.strokeRect(left - 4, top - 4, boss.width + 8, height + 8);
    ctx.globalAlpha = 1;
  }

  if (mood === null) {
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
  }

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
  mood: Mood | null,
): void {
  const p = state.player;
  const x = lerp(p.prevX, p.x, alpha);
  const y = lerp(p.prevY, p.y, alpha);
  const blinking = playerBlinking(state);
  const body = playerBodyColor(state, feedback);

  if (mood !== null) {
    const accent = p.dashTick >= 0 ? LOOK.playerDashAccent : LOOK.playerAccent;
    drawPrimitives(ctx, playerFigure(state, x, y, { body, accent }), blinking ? 0.35 : 1);
  } else {
    ctx.globalAlpha = blinking ? 0.35 : 1;
    ctx.fillStyle = body;
    ctx.fillRect(x - PLAYER.width / 2, y - PLAYER.height, PLAYER.width, PLAYER.height);
    // A small notch on the side the player faces.
    ctx.fillStyle = COLORS.arena;
    ctx.fillRect(x + p.facing * (PLAYER.width / 2 - 8) - 4, y - PLAYER.height + 16, 8, 8);
    ctx.globalAlpha = 1;
  }

  if (attackActive(p)) {
    const box = attackBox(p);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.slash;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}

/** The floor: the mood's colour, a soft glow above its top edge, the bright edge line and faint tile lines. Covers everything below the layers, out to the shake margin. */
function drawFloor(ctx: CanvasRenderingContext2D, mood: Mood): void {
  const top = WORLD.floorY;
  ctx.fillStyle = mood.floor;
  ctx.fillRect(-8, top, WORLD.width + 16, WORLD.height - top + 8);
  ctx.save();
  ctx.fillStyle = mood.floorGlow;
  for (const [reach, alpha] of [[28, 0.05], [16, 0.08], [7, 0.12]] as const) {
    ctx.globalAlpha = alpha;
    ctx.fillRect(-8, top - reach, WORLD.width + 16, reach);
  }
  ctx.globalAlpha = LOOK.floorTileAlpha;
  ctx.fillStyle = COLORS.bars;
  for (const x of FLOOR_TILE_XS) ctx.fillRect(x - 1, top + 3, 2, WORLD.height - top + 5);
  ctx.fillRect(-8, top + LOOK.floorTileRow, WORLD.width + 16, 2);
  ctx.restore();
  ctx.fillStyle = mood.floorLine;
  ctx.fillRect(-8, top, WORLD.width + 16, 3);
}

/** The impact particles and rings, over the arena and under the HUD. */
function drawEffects(ctx: CanvasRenderingContext2D, fx: EffectsState): void {
  ctx.save();
  for (const r of fx.rings) {
    ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of fx.particles) {
    const fade = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = p.kind === 'trail' ? fade * LOOK.trailAlpha : fade;
    ctx.fillStyle = p.color;
    if (p.kind === 'spark') {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
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
  look?: FrameLook,
): void {
  const mood = look === undefined ? null : moodFor(boss.id);
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
  if (look !== undefined && mood !== null) {
    // Sky, layers and embers reach 8 units past every edge (what the shake shows); the floor covers the rest.
    drawBackground(ctx, mood, look.background, state.tick, look.motion);
    drawFloor(ctx, mood);
  } else {
    ctx.fillStyle = COLORS.arena;
    // Drawn 8 units past every edge so the shake never shows the black bars.
    ctx.fillRect(-8, -8, WORLD.width + 16, WORLD.height + 16);
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, WORLD.height - WORLD.floorY + 8);
    ctx.fillStyle = COLORS.floorLine;
    ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, 3);
  }

  drawArena(ctx, boss, mood);
  drawBoss(ctx, state, boss, feedback, mood);
  drawPlayer(ctx, state, alpha, feedback, mood);
  if (look !== undefined) drawEffects(ctx, look.effects);
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

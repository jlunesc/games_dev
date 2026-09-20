import type { BossDef } from '../bosses/schema';
import { attackActive, attackBox } from '../game/geometry';
import { PLAYER, WORLD } from '../game/params';
import type { GameState } from '../game/state';
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

const COLORS = {
  bars: '#000000',
  arena: '#12121a',
  floor: '#2a2a3a',
  floorLine: '#8a8aa0',
  player: '#e8e8f0',
  playerDash: '#7fd6ff',
  playerHurt: '#ff3b3b',
  boss: '#c8642a',
  bossHp: '#e0403a',
  flash: '#ffffff',
  slash: '#ffffff',
  hud: '#e8e8f0',
  hudBack: '#3a3a4a',
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: BossDef,
  feedback: FeedbackState,
): void {
  const b = state.boss;
  ctx.fillStyle = feedback.bossFlashTicks > 0 ? COLORS.flash : COLORS.boss;
  ctx.fillRect(b.x - boss.width / 2, WORLD.floorY - boss.height, boss.width, boss.height);
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
  const width = 220;
  const left = WORLD.width - 24 - width;
  ctx.fillStyle = COLORS.hudBack;
  ctx.fillRect(left, 24, width, 14);
  ctx.fillStyle = COLORS.bossHp;
  ctx.fillRect(left, 24, (width * state.boss.hp) / boss.maxHp, 14);
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
  ctx.fillStyle = COLORS.arena;
  // Drawn 8 units past every edge so the shake never shows the black bars.
  ctx.fillRect(-8, -8, WORLD.width + 16, WORLD.height + 16);
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, WORLD.height - WORLD.floorY + 8);
  ctx.fillStyle = COLORS.floorLine;
  ctx.fillRect(-8, WORLD.floorY, WORLD.width + 16, 3);

  drawBoss(ctx, state, boss, feedback);
  drawPlayer(ctx, state, alpha, feedback);
  drawHud(ctx, state, boss);

  if (state.phase === 'defeated') {
    ctx.fillStyle = COLORS.hud;
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Defeated', WORLD.width / 2, WORLD.height / 2);
  }
}

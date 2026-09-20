import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { PLAYER, WORLD } from './params';
import type { GameState, PlayerState } from './state';

/** Moves the player one update: run, jump (with an input buffer and early-release cut), gravity, walls and floor. */
export function updatePlayer(p: PlayerState, input: InputFrame): void {
  p.prevX = p.x;
  p.prevY = p.y;

  p.buffer.jump = input.jumpPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.jump - 1);

  if (input.moveX !== 0) p.facing = input.moveX > 0 ? 1 : -1;

  p.vx = input.moveX * PLAYER.runSpeed;
  p.vy = Math.min(p.vy + PLAYER.gravity * DT, PLAYER.maxFallSpeed);

  if (p.buffer.jump > 0 && p.onGround) {
    p.vy = -PLAYER.jumpSpeed;
    p.onGround = false;
    p.jumpCut = false;
    p.buffer.jump = 0;
  }
  if (!p.onGround && p.vy < 0 && !input.jumpHeld && !p.jumpCut) {
    p.vy *= PLAYER.jumpReleaseFactor;
    p.jumpCut = true;
  }

  p.x += p.vx * DT;
  p.y += p.vy * DT;

  const half = PLAYER.width / 2;
  p.x = Math.min(Math.max(p.x, half), WORLD.width - half);

  if (p.y >= WORLD.floorY) {
    p.y = WORLD.floorY;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;
  updatePlayer(s.player, input);
  return s;
}

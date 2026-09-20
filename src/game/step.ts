import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { attackActive, attackBox, dummyBox, overlaps } from './geometry';
import { DUMMY, PLAYER, WORLD } from './params';
import type { GameEvent, GameState, PlayerState } from './state';

const ATTACK_TOTAL = PLAYER.attack.startup + PLAYER.attack.active + PLAYER.attack.recovery;

/**
 * Moves the player one update: input buffers, timers, dash, attack, run, jump
 * (with an early-release cut), gravity, walls and floor.
 */
export function updatePlayer(p: PlayerState, input: InputFrame, events: GameEvent[]): void {
  p.prevX = p.x;
  p.prevY = p.y;

  p.buffer.jump = input.jumpPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.jump - 1);
  p.buffer.attack = input.attackPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.attack - 1);
  p.buffer.dash = input.dashPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.dash - 1);

  if (p.invulnerableTicks > 0) p.invulnerableTicks -= 1;
  if (p.dashCooldown > 0) p.dashCooldown -= 1;

  if (p.dashTick >= 0) {
    p.dashTick += 1;
    if (p.dashTick >= PLAYER.dash.duration) {
      p.dashTick = -1;
      p.dashCooldown = PLAYER.dash.cooldown;
    }
  }
  if (p.attackTick >= 0) {
    p.attackTick += 1;
    if (p.attackTick >= ATTACK_TOTAL) p.attackTick = -1;
  }

  // The facing direction follows the stick, except during a swing or a dash.
  if (p.attackTick < 0 && p.dashTick < 0 && input.moveX !== 0) {
    p.facing = input.moveX > 0 ? 1 : -1;
  }

  if (p.buffer.dash > 0 && p.dashTick < 0 && p.dashCooldown === 0) {
    const dir = input.moveX !== 0 ? (input.moveX > 0 ? 1 : -1) : p.facing;
    p.dashTick = 0;
    p.dashDir = dir;
    p.facing = dir;
    p.attackTick = -1;
    p.buffer.dash = 0;
    events.push('dash');
  }
  if (p.buffer.attack > 0 && p.attackTick < 0 && p.dashTick < 0) {
    p.attackTick = 0;
    p.attackConnected = false;
    p.buffer.attack = 0;
  }

  if (p.dashTick >= 0) {
    p.vx = p.dashDir * PLAYER.dash.speed;
    p.vy = 0;
  } else {
    const speedFactor = p.attackTick >= 0 ? PLAYER.attack.moveFactor : 1;
    p.vx = input.moveX * PLAYER.runSpeed * speedFactor;
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

/** The player's swing hurts the dummy once per swing. The dummy's display health refills instead of reaching zero. */
function resolveAttack(s: GameState): void {
  const { player: p, dummy: d } = s;
  if (attackActive(p) && !p.attackConnected && overlaps(attackBox(p), dummyBox(d))) {
    p.attackConnected = true;
    d.hp -= 1;
    if (d.hp <= 0) d.hp = DUMMY.maxHp;
    s.events.push('dummyHit');
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;
  updatePlayer(s.player, input, s.events);
  resolveAttack(s);
  return s;
}

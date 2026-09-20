import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import {
  attackActive,
  attackBox,
  dummyBox,
  isInvulnerable,
  overlaps,
  playerBox,
  sweepBox,
} from './geometry';
import { DUMMY, GAME, PLAYER, WORLD } from './params';
import {
  createInitialState,
  type DummyState,
  type GameEvent,
  type GameState,
  type PlayerState,
} from './state';

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

/** The dummy waits, warns (turning towards the player), sweeps, recovers, and waits again. */
function updateDummy(d: DummyState, p: PlayerState, events: GameEvent[]): void {
  const sweep = DUMMY.sweep;
  switch (d.phase) {
    case 'idle':
      d.nextSweepIn -= 1;
      if (d.nextSweepIn <= 0) {
        d.phase = 'windup';
        d.phaseTick = 0;
        d.facing = p.x < d.x ? -1 : 1;
        events.push('dummyWindup');
      }
      break;
    case 'windup':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.windup) {
        d.phase = 'sweep';
        d.phaseTick = 0;
      }
      break;
    case 'sweep':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.active) {
        d.phase = 'recovery';
        d.phaseTick = 0;
      }
      break;
    case 'recovery':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.recovery) {
        d.phase = 'idle';
        d.nextSweepIn = sweep.every - sweep.windup - sweep.active - sweep.recovery;
      }
      break;
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

/** The sweep hurts a player who is not untouchable. The last hit ends the fight. */
function resolveSweep(s: GameState): void {
  const { player: p, dummy: d } = s;
  if (d.phase !== 'sweep' || isInvulnerable(p) || !overlaps(sweepBox(d), playerBox(p))) return;
  p.health -= 1;
  p.invulnerableTicks = PLAYER.hitInvulnerability;
  s.events.push('playerHit');
  if (p.health <= 0) {
    p.health = 0;
    s.phase = 'defeated';
    s.defeatTicks = GAME.defeatRestartTicks;
    s.events.push('playerDefeated');
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;

  if (s.phase === 'defeated') {
    s.defeatTicks -= 1;
    // The player is frozen: without this the renderer would keep blending from the last move.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    return s.defeatTicks <= 0 ? createInitialState() : s;
  }

  updatePlayer(s.player, input, s.events);
  updateDummy(s.dummy, s.player, s.events);
  resolveAttack(s);
  resolveSweep(s);
  return s;
}

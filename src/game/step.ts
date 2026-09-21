import type { BossDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { attackById, beginTransition, landBoss, updateBoss } from './boss';
import {
  activeHitBoxes,
  attackActive,
  attackBox,
  bossBox,
  isInvulnerable,
  overlaps,
  playerBox,
} from './geometry';
import { GAME, PLAYER, WORLD } from './params';
import { nextRandom } from './rng';
import {
  createInitialState,
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

/** The player takes `amount` hits. The last hit ends the fight. */
export function hurtPlayer(s: GameState, amount: number): void {
  const p = s.player;
  p.health = Math.max(0, p.health - amount);
  p.invulnerableTicks = PLAYER.hitInvulnerability;
  s.events.push('playerHit');
  if (p.health <= 0) {
    s.phase = 'defeated';
    s.endTicks = GAME.defeatRestartTicks;
    s.events.push('playerDefeated');
  }
}

/**
 * A swing that starts inside the counter window of a counterable attack, close enough, staggers the boss
 * and cancels the attack. It runs before the hits are resolved, so the cancelled attack cannot hurt.
 */
function tryCounter(s: GameState, boss: BossDef): void {
  const { player: p, boss: b } = s;
  if (s.study.active) return;
  if (b.mode !== 'attack' || b.attackId === null || p.attackTick !== 0) return;
  const attack = attackById(boss, b.attackId);
  if (attack.class !== 'counterable') return;
  if (b.attackTick < attack.windup - boss.counter.window || b.attackTick >= attack.windup) return;
  if (Math.abs(p.x - b.x) > boss.counter.range) return;
  landBoss(b);
  b.mode = 'stagger';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('counter');
}

/** The player's swing hurts the boss once per swing. It ends the fight at 0 health and can start the next phase. */
function resolvePlayerAttack(s: GameState, boss: BossDef): void {
  const { player: p, boss: b } = s;
  if (s.study.active || b.mode === 'transition') return;
  if (!attackActive(p) || p.attackConnected || !overlaps(attackBox(p), bossBox(b, boss))) return;
  p.attackConnected = true;
  const damage = b.mode === 'stagger' ? boss.counter.damageMultiplier : 1;
  b.hp = Math.max(0, b.hp - damage);
  s.events.push('bossHit');
  if (b.hp <= 0) {
    s.phase = 'victory';
    s.endTicks = GAME.defeatRestartTicks;
    s.events.push('bossDefeated');
    return;
  }
  const next = boss.phases[b.phase + 1];
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) beginTransition(s);
}

/** The boss's active hit boxes hurt a player who is not untouchable, for the damage of the attack that is landing. */
function resolveBossHits(s: GameState, boss: BossDef): void {
  const p = s.player;
  if (isInvulnerable(p)) return;
  const box = playerBox(p);
  if (!activeHitBoxes(s.boss, boss).some((hit) => overlaps(hit, box))) return;
  if (s.study.active) {
    // A demonstration: it reaches the player but hurts nobody. The short untouchability makes it count once.
    p.invulnerableTicks = PLAYER.hitInvulnerability;
    s.events.push('studyHit');
    return;
  }
  const attack = boss.attacks.find((a) => a.id === s.boss.attackId);
  hurtPlayer(s, attack?.damage ?? 1);
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame, boss: BossDef): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;

  if (s.phase !== 'fight') {
    s.endTicks -= 1;
    // The player is frozen: without this the renderer would keep blending from the last move.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    // The next fight gets a new seed derived from this one, so it plays out differently but stays reproducible.
    return s.endTicks <= 0 ? createInitialState(boss, nextRandom(s.rng).state) : s;
  }

  updatePlayer(s.player, input, s.events);
  updateBoss(s, boss);
  tryCounter(s, boss);
  resolvePlayerAttack(s, boss);
  if (s.phase === 'fight') resolveBossHits(s, boss);
  // The fight is over: a boss that was mid-leap must not hang in the air for the whole end countdown.
  if (s.phase !== 'fight') landBoss(s.boss);
  return s;
}

import type { ArenaDef, BossDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { attackById, beginTransition, landBoss, updateBosses } from './boss';
import { asFight, type FightDef } from './fight';
import {
  activeHitBoxes,
  arenaSurfaces,
  attackActive,
  attackBox,
  bossBox,
  isInvulnerable,
  overlaps,
  playerBox,
  shotBox,
} from './geometry';
import { GAME, PLAYER, WORLD } from './params';
import { nextRandom } from './rng';
import { moveShots } from './shots';
import {
  allBosses,
  bossAt,
  bossCount,
  createInitialState,
  isDowned,
  type GameEvent,
  type GameState,
  type PlayerState,
} from './state';
import { bossDefFor } from './turns';

const ATTACK_TOTAL = PLAYER.attack.startup + PLAYER.attack.active + PLAYER.attack.recovery;

/**
 * Moves the player one update: input buffers, timers, dash, attack, run, jump
 * (with an early-release cut), gravity, walls, cover and landing (floor, platforms, cover tops).
 * Without an arena (or with empty lists) the floor is the only surface, exactly as before.
 */
export function updatePlayer(
  p: PlayerState,
  input: InputFrame,
  events: GameEvent[],
  arena?: ArenaDef,
): void {
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
    p.attackAim = input.moveY < 0 ? 'up' : input.moveY > 0 && !p.onGround ? 'down' : 'forward';
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

  const surfaces = arenaSurfaces({ arena });

  // Cover is a wall below its top: the previous position says which side the body came from, so even a dash
  // (about 24 units per update) cannot cross a narrow cover. A body already inside is left alone.
  for (const c of surfaces) {
    if (c.kind !== 'cover' || p.prevY <= c.y) continue;
    if (p.x + half <= c.left || p.x - half >= c.right) continue;
    if (p.prevX + half <= c.left) p.x = c.left - half;
    else if (p.prevX - half >= c.right) p.x = c.right + half;
  }

  // Landing: the highest surface the feet cross while falling (or resting). Only feet at or above the top count
  // (prevY <= top), so a hop that ends just short of a top never snaps onto it. Platforms are one-way: a rising
  // player never lands. The floor lands the player whatever its speed, as before.
  let landing: number | null = p.y >= WORLD.floorY ? WORLD.floorY : null;
  if (p.vy >= 0) {
    for (const t of surfaces) {
      if (p.x + half <= t.left || p.x - half >= t.right) continue;
      if (p.prevY > t.y || p.y < t.y) continue;
      if (landing === null || t.y < landing) landing = t.y;
    }
  }
  if (landing !== null) {
    p.y = landing;
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
 * Only one boss attacks at a time, so at most one boss can be countered by a swing.
 */
function tryCounter(s: GameState, fight: FightDef, studying: boolean): void {
  if (studying) return;
  for (let i = 0; i < bossCount(s); i++) {
    if (!isDowned(s, i) && counterBoss(s, bossDefFor(s, fight, i), i)) return;
  }
}

function counterBoss(s: GameState, boss: BossDef, index: number): boolean {
  const p = s.player;
  const b = bossAt(s, index);
  if (b.mode !== 'attack' || b.attackId === null || p.attackTick !== 0 || p.attackAim !== 'forward') return false;
  const attack = attackById(boss, b.attackId);
  if (attack.class !== 'counterable') return false;
  if (b.attackTick < attack.windup - boss.counter.window || b.attackTick >= attack.windup) return false;
  if (Math.abs(p.x - b.x) > boss.counter.range) return false;
  // With an arena, the swing must also be able to reach the boss vertically (a player high on a platform
  // above a boss on the floor cannot counter it). Only the y ranges count: x stays governed by `counter.range`.
  // A bare arena keeps the old rule (distance only), which the recorded duelist scenarios and the counter of a
  // leaping boss from the floor rely on.
  if (boss.arena !== undefined && (boss.arena.platforms.length > 0 || boss.arena.covers.length > 0)) {
    const swing = attackBox(p);
    const body = bossBox(b, boss);
    if (swing.y >= body.y + body.h || body.y >= swing.y + swing.h) return false;
  }
  landBoss(b);
  b.mode = 'stagger';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('counter');
  return true;
}

/** A boss is beaten in a fight with partners: it falls, its own shots vanish, and the fight goes on. */
function downBoss(s: GameState, index: number): void {
  const b = bossAt(s, index);
  landBoss(b);
  b.mode = 'gap';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.shots = s.shots.filter((shot) => (shot.owner ?? 0) !== index);
  s.events.push('bossDown');
}

/**
 * The player's swing hurts one boss once per swing: the nearest one it reaches (the first-listed on a tie).
 * The last boss at 0 health ends the fight; an earlier one falls and the rest go on. A hit can start the next phase.
 */
function resolvePlayerAttack(s: GameState, fight: FightDef, studying: boolean): void {
  const p = s.player;
  if (studying || !attackActive(p) || p.attackConnected) return;
  const swing = attackBox(p);
  let target = -1;
  let nearest = Infinity;
  for (let i = 0; i < bossCount(s); i++) {
    const candidate = bossAt(s, i);
    if (isDowned(s, i) || candidate.mode === 'transition') continue;
    if (!overlaps(swing, bossBox(candidate, bossDefFor(s, fight, i)))) continue;
    const distance = Math.abs(p.x - candidate.x);
    if (distance < nearest) {
      target = i;
      nearest = distance;
    }
  }
  if (target < 0) return;
  const boss = bossDefFor(s, fight, target);
  const b = bossAt(s, target);
  p.attackConnected = true;
  if (p.attackAim === 'down') {
    // The pogo: a downward hit bounces the player up, and the bounce is not cut short by letting go of jump.
    p.vy = -PLAYER.attack.pogoSpeed;
    p.onGround = false;
    p.jumpCut = true;
  }
  const damage = b.mode === 'stagger' ? boss.counter.damageMultiplier : 1;
  b.hp = Math.max(0, b.hp - damage);
  s.events.push('bossHit');
  if (b.hp <= 0) {
    if (allBosses(s).every((each) => each.hp <= 0)) {
      s.phase = 'victory';
      s.endTicks = GAME.defeatRestartTicks;
      s.events.push('bossDefeated');
    } else {
      downBoss(s, target);
    }
    return;
  }
  const next = boss.phases[b.phase + 1];
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) beginTransition(s, boss, target);
}

/** The active hit boxes of a boss hurt a player who is not untouchable, for the damage of the attack that is landing. */
function resolveBossHits(s: GameState, fight: FightDef, studying: boolean): void {
  const p = s.player;
  if (isInvulnerable(p)) return;
  const box = playerBox(p);
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    const boss = bossDefFor(s, fight, i);
    const b = bossAt(s, i);
    if (!activeHitBoxes(b, boss).some((hit) => overlaps(hit, box))) continue;
    if (studying) {
      // A demonstration: it reaches the player but hurts nobody. The short untouchability makes it count once.
      p.invulnerableTicks = PLAYER.hitInvulnerability;
      s.events.push('studyHit');
      return;
    }
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    hurtPlayer(s, attack?.damage ?? 1);
    return;
  }
}

/**
 * Shots that reach a player who is not untouchable hurt them once, for the largest damage among the shots that
 * landed, and are used up. A dash lets them pass. In the study they reach the player and hurt nobody.
 */
function resolveShotHits(s: GameState, fight: FightDef, studying: boolean): void {
  const p = s.player;
  if (isInvulnerable(p) || s.shots.length === 0) return;
  const box = playerBox(p);
  const hit = s.shots.filter((shot) => {
    const area = shotBox(shot);
    return area !== null && overlaps(area, box);
  });
  if (hit.length === 0) return;
  s.shots = s.shots.filter((shot) => !hit.includes(shot));
  s.shotHits = hit.map((shot) => ({ attackId: shot.attackId, originTick: shot.originTick }));
  if (studying) {
    p.invulnerableTicks = PLAYER.hitInvulnerability;
    s.events.push('studyHit');
    return;
  }
  const damage = Math.max(
    ...hit.map((shot) => fight.bosses[shot.owner ?? 0]?.attacks.find((a) => a.id === shot.attackId)?.damage ?? 1),
  );
  hurtPlayer(s, damage);
}


/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame, source: BossDef | FightDef): GameState {
  const fight = asFight(source);
  // The arena of a fight is the primary boss's.
  const boss = fight.bosses[0]!;
  const s = structuredClone(prev);
  s.events = [];
  s.shotHits = [];
  s.tick += 1;

  if (s.phase !== 'fight') {
    s.endTicks -= 1;
    // The player is frozen: without this the renderer would keep blending from the last move.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    // The next fight gets a new seed derived from this one, so it plays out differently but stays reproducible.
    // The restarted fight deliberately has no study (it is only offered before the first fight).
    return s.endTicks <= 0 ? createInitialState(fight, nextRandom(s.rng).state) : s;
  }

  // Whether this update is part of the study is fixed now: the update on which the last demonstration finishes
  // still counts as study (nothing hurts anyone on it), and the real fight starts on the next one.
  const studying = s.study.active;
  updatePlayer(s.player, input, s.events, boss.arena);
  // Shots already in the air move first: a shot fired on this update appears at the boss and first moves on the next.
  moveShots(s, boss);
  updateBosses(s, fight);
  tryCounter(s, fight, studying);
  resolvePlayerAttack(s, fight, studying);
  if (s.phase === 'fight') resolveBossHits(s, fight, studying);
  if (s.phase === 'fight') resolveShotHits(s, fight, studying);
  // The fight is over: a boss that was mid-leap must not hang in the air for the whole end countdown, and no shot lingers.
  if (s.phase !== 'fight') {
    for (let i = 0; i < bossCount(s); i++) landBoss(bossAt(s, i));
    s.shots = [];
  }
  return s;
}

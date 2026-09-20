import type { AttackDef, BossDef, PhaseDef } from '../bosses/schema';
import { DT } from '../engine/time';
import { WORLD } from './params';
import { nextRandom } from './rng';
import type { BossState, GameState } from './state';

export function attackById(boss: BossDef, id: string): AttackDef {
  const found = boss.attacks.find((attack) => attack.id === id);
  if (found === undefined) throw new Error(`Boss "${boss.id}" has no attack "${id}"`);
  return found;
}

/** Updates from the first update of an attack until it is over. */
export const attackLength = (attack: AttackDef): number =>
  attack.windup + attack.active + attack.recovery;

/** One draw from the fight's seeded generator. */
function draw(s: GameState): number {
  const next = nextRandom(s.rng);
  s.rng = next.state;
  return next.value;
}

function enterGap(b: BossState): void {
  b.mode = 'gap';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
}

function faceTarget(b: BossState, targetX: number): void {
  b.facing = targetX < b.x ? -1 : 1;
}

/** Moves the boss along the floor, inside the arena. Returns whether its position changed (false when it is against a wall). */
function moveBoss(b: BossState, boss: BossDef, direction: 1 | -1, speed: number): boolean {
  const half = boss.width / 2;
  const next = Math.min(Math.max(b.x + direction * speed * DT, half), WORLD.width - half);
  const moved = next !== b.x;
  b.x = next;
  return moved;
}

/**
 * Picks the next attack from the phase's list: never the same attack three times in a row, and with
 * probability `predictability` the next one in the fixed cycle, otherwise by weight. Both random numbers
 * are always drawn so the sequence does not depend on which branch is taken.
 */
function chooseAttack(s: GameState, boss: BossDef, phase: PhaseDef): string | null {
  if (phase.attacks.length === 0) return null;
  const b = s.boss;
  const followCycle = draw(s) < boss.predictability;
  const weightRoll = draw(s);

  const allowed = phase.attacks.filter(
    (entry) => !(b.lastAttacks.length >= 2 && b.lastAttacks.every((id) => id === entry.id)),
  );
  const pool = allowed.length > 0 ? allowed : phase.attacks;

  if (followCycle) {
    for (let i = 0; i < phase.attacks.length; i++) {
      const index = (b.cycleIndex + i) % phase.attacks.length;
      const entry = phase.attacks[index];
      if (entry !== undefined && pool.includes(entry)) {
        b.cycleIndex = (index + 1) % phase.attacks.length;
        return entry.id;
      }
    }
  }

  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = weightRoll * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry.id;
  }
  return pool[pool.length - 1]?.id ?? null;
}

/** How many attacks follow straight after the one about to start (none when `maxChain` is 1). */
function planChain(s: GameState, phase: PhaseDef): number {
  return draw(s) < phase.chainChance ? phase.maxChain - 1 : 0;
}

function startAttack(s: GameState, boss: BossDef, id: string): void {
  const b = s.boss;
  const attack = attackById(boss, id);
  b.mode = 'attack';
  b.modeTick = 0;
  b.attackId = id;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.lastAttacks = [...b.lastAttacks, id].slice(-2);
  s.events.push(attack.class === 'counterable' ? 'bossWindupGold' : 'bossWindupRed');
}

function updateGap(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  const p = s.player;
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
  if (b.modeTick >= phase.gap) {
    const id = chooseAttack(s, boss, phase);
    if (id !== null) {
      b.pendingAttackId = id;
      b.chainLeft = planChain(s, phase);
      b.mode = 'approach';
      b.modeTick = 0;
    }
  }
}

function updateApproach(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  const p = s.player;
  const id = b.pendingAttackId;
  if (id === null) {
    enterGap(b);
    return;
  }
  const attack = attackById(boss, id);
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const inRange = distance >= attack.range.min && distance <= attack.range.max;
  if (inRange || b.modeTick >= boss.approachTimeout) {
    startAttack(s, boss, id);
    return;
  }
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  const moved =
    distance > attack.range.max
      ? moveBoss(b, boss, toward, phase.walkSpeed)
      : moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  // Pinned against a wall it cannot make progress, so it attacks from where it stands instead of waiting.
  if (!moved) startAttack(s, boss, id);
}

/** After an attack: straight into the next one of a chain, otherwise back to waiting. */
function finishAttack(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  if (b.chainLeft > 0) {
    const id = chooseAttack(s, boss, phase);
    if (id !== null) {
      b.chainLeft -= 1;
      b.attackId = null;
      b.attackTick = 0;
      b.pendingAttackId = id;
      b.mode = 'approach';
      b.modeTick = 0;
      return;
    }
  }
  b.chainLeft = 0;
  enterGap(b);
}

function updateAttack(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  if (b.attackId === null) {
    enterGap(b);
    return;
  }
  const attack = attackById(boss, b.attackId);
  b.attackTick += 1;
  const move = attack.move;
  if (move !== undefined && b.attackTick >= move.from && b.attackTick < move.to) {
    moveBoss(b, boss, b.facing, move.speed);
  }
  if (b.attackTick >= attackLength(attack)) finishAttack(s, boss, phase);
}

/** After the powering-up pause the boss opens with the new phase's opening attack, if it has one. */
function finishTransition(s: GameState, phase: PhaseDef): void {
  const b = s.boss;
  if (phase.opening !== undefined) {
    b.pendingAttackId = phase.opening;
    b.chainLeft = planChain(s, phase);
    b.mode = 'approach';
    b.modeTick = 0;
  } else {
    enterGap(b);
  }
}

/** The boss moves on to the next phase: it drops what it was doing and powers up, unhurtable. */
export function beginTransition(s: GameState): void {
  const b = s.boss;
  b.phase += 1;
  b.mode = 'transition';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('phaseChange');
}

/** Moves the boss one update. Mutates the (already cloned) state. */
export function updateBoss(s: GameState, boss: BossDef): void {
  const b = s.boss;
  const phase = boss.phases[b.phase];
  if (phase === undefined) return;
  b.modeTick += 1;
  switch (b.mode) {
    case 'gap':
      updateGap(s, boss, phase);
      break;
    case 'approach':
      updateApproach(s, boss, phase);
      break;
    case 'attack':
      updateAttack(s, boss, phase);
      break;
    case 'stagger':
      if (b.modeTick >= boss.counter.staggerTicks) enterGap(b);
      break;
    case 'transition':
      if (b.modeTick >= boss.transitionTicks) finishTransition(s, phase);
      break;
  }
}

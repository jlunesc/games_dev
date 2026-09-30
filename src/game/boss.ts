import type { AttackDef, BossDef, DiveDef, FlightDef, LeapDef, LeapTarget, PhaseAttack, PhaseDef } from '../bosses/schema';
import { DT } from '../engine/time';
import { TEMPER, WORLD } from './params';
import { nextRandom } from './rng';
import { spawnShots } from './shots';
import type { FightDef } from './fight';
import { bossAt, bossCount, isDowned, type BossState, type GameState } from './state';
import { bossDefFor, pickCommitter } from './turns';

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

/** 0 to 1: how angry the boss is. Zero without a `temper` strength, during the study, and in a fight with partners. */
export function temperLevel(s: GameState, boss: BossDef, b: BossState): number {
  if (boss.temper === undefined || s.study.active || s.partners.length > 0) return 0;
  return Math.min(1, Math.max(0, (b.temper - TEMPER.start) / TEMPER.ramp));
}

/**
 * Puts the boss back on the floor where it is and forgets the leap. Called whenever an attack ends or is
 * cancelled (a counter, a phase change), so a cut-short leap never leaves the boss floating.
 */
export function landBoss(b: BossState): void {
  b.lift = 0;
  b.leapFromX = null;
  b.leapToX = null;
  b.diveFromLift = null;
}

/**
 * An attack ended or was cut short: forgets the leap or dive. A boss that walks is back on the floor; a boss that
 * flies keeps its height (after a plunge it is low, and climbs back on its own, see `settleLift`).
 */
function endMotion(b: BossState, boss: BossDef): void {
  const lift = b.lift;
  landBoss(b);
  if (boss.flight !== undefined) b.lift = lift;
}

/** A boss that flies climbs (or sinks) back to its resting height at its own speed. */
function settleLift(b: BossState, flight: FlightDef): void {
  const step = flight.rise * DT;
  if (b.lift < flight.height) b.lift = Math.min(flight.height, b.lift + step);
  else if (b.lift > flight.height) b.lift = Math.max(flight.height, b.lift - step);
}

function enterGap(b: BossState, boss: BossDef): void {
  endMotion(b, boss);
  b.mode = 'gap';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
}

/** The study is over: the fight proper starts clean, with no leftover untouchability from a demonstration. */
function endStudy(s: GameState): void {
  s.study.active = false;
  s.study.queue = [];
  s.study.endTick = s.tick;
  s.player.invulnerableTicks = 0;
  s.events.push('studyEnd');
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
function chooseAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): string | null {
  if (phase.attacks.length === 0) return null;
  const b = bossAt(s, index);
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

  const anger = boss.temper === undefined ? 0 : boss.temper * temperLevel(s, boss, b);
  const weightOf = (entry: PhaseAttack): number =>
    entry.heavy === true ? entry.weight * (1 + anger * TEMPER.headWeight) : entry.weight;
  const total = pool.reduce((sum, entry) => sum + weightOf(entry), 0);
  let roll = weightRoll * total;
  for (const entry of pool) {
    roll -= weightOf(entry);
    if (roll < 0) return entry.id;
  }
  return pool[pool.length - 1]?.id ?? null;
}

/** How many attacks follow straight after the one about to start (none when `maxChain` is 1). */
function planChain(s: GameState, phase: PhaseDef): number {
  return draw(s) < phase.chainChance ? phase.maxChain - 1 : 0;
}

function startAttack(s: GameState, boss: BossDef, id: string, index: number): void {
  const b = bossAt(s, index);
  const attack = attackById(boss, id);
  b.mode = 'attack';
  b.modeTick = 0;
  b.attackId = id;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.lastAttacks = [...b.lastAttacks, id].slice(-2);
  s.events.push(attack.class === 'counterable' ? 'bossWindupGold' : 'bossWindupRed');
}

function updateGap(s: GameState, boss: BossDef, phase: PhaseDef, index: number, mayCommit: boolean): void {
  const b = bossAt(s, index);
  const p = s.player;
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
  const anger = boss.temper === undefined ? 0 : boss.temper * temperLevel(s, boss, b);
  const wait = Math.round(phase.gap * (1 - TEMPER.gapCut * anger));
  if (b.modeTick >= wait && mayCommit) {
    // During the study the attacks come from the planned queue: no random draws, no chains.
    let id: string | null;
    if (s.study.active) {
      // Everything has been shown but its shots are still in the air: the study is not over yet.
      if (s.study.queue.length === 0 && s.shots.length > 0) return;
      id = s.study.queue.shift() ?? null;
      // Nothing left to show (cannot happen): end the study and let the fight go on as a normal one.
      if (id === null) endStudy(s);
    } else {
      id = chooseAttack(s, boss, phase, index);
    }
    if (id !== null) {
      b.pendingAttackId = id;
      b.chainLeft = s.study.active ? 0 : planChain(s, phase);
      b.mode = 'approach';
      b.modeTick = 0;
    }
  }
}

function updateApproach(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {
  const b = bossAt(s, index);
  const p = s.player;
  const id = b.pendingAttackId;
  if (id === null) {
    enterGap(b, boss);
    return;
  }
  const attack = attackById(boss, id);
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const inRange = distance >= attack.range.min && distance <= attack.range.max;
  if (inRange || b.modeTick >= boss.approachTimeout) {
    startAttack(s, boss, id, index);
    return;
  }
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  const moved =
    distance > attack.range.max
      ? moveBoss(b, boss, toward, phase.walkSpeed)
      : moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  // Pinned against a wall it cannot make progress, so it attacks from where it stands instead of waiting.
  if (!moved) startAttack(s, boss, id, index);
}

/** After an attack: straight into the next one of a chain, otherwise back to waiting. */
function finishAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {
  const b = bossAt(s, index);
  // Defensive: a leap that did not reach its `to` before the attack ended must not leave the boss floating.
  endMotion(b, boss);
  if (s.study.active) {
    // The last demonstration's shots may still be flying: the study lasts until they are gone (see updateGap).
    if (s.study.queue.length === 0 && s.shots.length === 0) endStudy(s);
    enterGap(b, boss);
    return;
  }
  if (b.chainLeft > 0) {
    const id = chooseAttack(s, boss, phase, index);
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
  enterGap(b, boss);
}

function updateAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {
  const b = bossAt(s, index);
  if (b.attackId === null) {
    enterGap(b, boss);
    return;
  }
  const attack = attackById(boss, b.attackId);
  b.attackTick += 1;
  const move = attack.move;
  if (move !== undefined && b.attackTick >= move.from && b.attackTick < move.to) {
    // 'back' walks away from the way the boss faces.
    const direction: 1 | -1 = move.dir === 'back' ? (b.facing === 1 ? -1 : 1) : b.facing;
    moveBoss(b, boss, direction, move.speed);
  }
  if (attack.leap !== undefined) updateLeap(s, boss, attack.leap, index);
  if (attack.dive !== undefined) updateDive(s, boss, attack.dive, index);
  spawnShots(s, boss, attack, index);
  if (b.attackTick >= attackLength(attack)) finishAttack(s, boss, phase, index);
}

/** The x a leap will land on, fixed at take-off and kept inside the arena. */
function leapLanding(
  s: GameState,
  boss: BossDef,
  leap: { target: LeapTarget; distance?: number },
  index: number,
): number {
  const b = bossAt(s, index);
  const half = boss.width / 2;
  let x = s.player.x;
  // The parser guarantees `distance` for 'forward' and 'back' (the 0 only satisfies the type).
  if (leap.target === 'forward') x = b.x + b.facing * (leap.distance ?? 0);
  if (leap.target === 'back') x = b.x - b.facing * (leap.distance ?? 0);
  return Math.min(Math.max(x, half), WORLD.width - half);
}

/**
 * The height of a hovering leap on its `k`th update (1 to `n`): it rises for `n - hang` updates split in two, stays at
 * `height` for `hang` updates, then falls. Like the plain arc it is off the floor on the first update and still up
 * on the last, and it slows towards the top and speeds up on the way down.
 */
function hoverLift(height: number, n: number, hang: number, k: number): number {
  const rise = Math.floor((n - hang) / 2);
  const fall = n - hang - rise;
  if (k <= rise) {
    const q = k / (rise + 1);
    return height * (1 - (1 - q) * (1 - q));
  }
  if (k <= rise + hang) return height;
  const q = (k - rise - hang) / (fall + 1);
  return height * (1 - q * q);
}

/**
 * Moves the boss along its leap for the current attack time. It takes off at update `from` (the landing
 * spot is fixed then, so the player can dodge by moving after take-off), flies until `to` and is on the
 * floor at the landing x from update `to` on.
 */
function updateLeap(s: GameState, boss: BossDef, leap: LeapDef, index: number): void {
  const b = bossAt(s, index);
  const t = b.attackTick;
  if (t >= leap.from && t < leap.to) {
    // Take-off is captured lazily on the first flight update. This relies on two invariants: the parser forces
    // `leap.from >= windup >= 1`, so the attack cannot start mid-flight, and every exit from an attack
    // (finish, counter, phase change, end of the fight) clears the leap points via landBoss.
    if (b.leapFromX === null || b.leapToX === null) {
      b.leapFromX = b.x;
      b.leapToX = leapLanding(s, boss, leap, index);
    }
    // The flight has n = to - from updates; using n + 1 in the divisor keeps p strictly between 0 and 1,
    // so the boss is already off the floor on the first update of the flight and still up on the last.
    const n = leap.to - leap.from;
    const p = (t - leap.from + 1) / (n + 1);
    b.x = b.leapFromX + (b.leapToX - b.leapFromX) * p;
    b.lift = leap.hang === undefined ? 4 * leap.height * p * (1 - p) : hoverLift(leap.height, n, leap.hang, t - leap.from + 1);
  } else if (t >= leap.to && b.leapToX !== null) {
    b.x = b.leapToX;
    landBoss(b);
  }
}

/**
 * The height of a dive on its `k`th update (1 to `n`), from the height `from` it took off at. A plunge falls faster and
 * faster and is still a little up on the last update. A swoop falls the same way for half of the updates that are not
 * spent low, skims the floor for `low` updates, then climbs quickly at first and is still a little below `from` on the
 * last update. From update `to` on the boss is at the end height (the floor for a plunge, `from` for a swoop).
 */
function diveLift(dive: DiveDef, from: number, n: number, k: number): number {
  if (dive.shape === 'plunge') {
    const q = k / (n + 1);
    return from * (1 - q * q);
  }
  const low = dive.low ?? 0;
  const fall = Math.floor((n - low) / 2);
  const climb = n - low - fall;
  if (k <= fall) {
    const q = k / (fall + 1);
    return from * (1 - q * q);
  }
  if (k <= fall + low) return 0;
  const q = (k - fall - low) / (climb + 1);
  return from * (1 - (1 - q) * (1 - q));
}

/**
 * Moves a flying boss along its dive for the current attack time, the way `updateLeap` moves a leaping one: the landing
 * x and the starting height are fixed at update `from`, so the player can dodge by moving after that.
 */
function updateDive(s: GameState, boss: BossDef, dive: DiveDef, index: number): void {
  const b = bossAt(s, index);
  const t = b.attackTick;
  if (t >= dive.from && t < dive.to) {
    if (b.leapFromX === null || b.leapToX === null || b.diveFromLift === null) {
      b.leapFromX = b.x;
      b.leapToX = leapLanding(s, boss, dive, index);
      b.diveFromLift = b.lift;
    }
    const n = dive.to - dive.from;
    const k = t - dive.from + 1;
    b.x = b.leapFromX + (b.leapToX - b.leapFromX) * (k / (n + 1));
    b.lift = diveLift(dive, b.diveFromLift, n, k);
  } else if (t >= dive.to && b.leapToX !== null && b.diveFromLift !== null) {
    b.x = b.leapToX;
    b.lift = dive.shape === 'plunge' ? 0 : b.diveFromLift;
    b.leapFromX = null;
    b.leapToX = null;
    b.diveFromLift = null;
  }
}

/** After the powering-up pause the boss opens with the new phase's opening attack, if it has one and it may start it. */
function finishTransition(s: GameState, boss: BossDef, phase: PhaseDef, index: number, mayCommit: boolean): void {
  const b = bossAt(s, index);
  if (phase.opening !== undefined && mayCommit) {
    b.pendingAttackId = phase.opening;
    b.chainLeft = planChain(s, phase);
    b.mode = 'approach';
    b.modeTick = 0;
  } else {
    enterGap(b, boss);
  }
}

/** The boss moves on to the next phase: it drops what it was doing and powers up, unhurtable. Its own shots vanish. */
export function beginTransition(s: GameState, boss: BossDef, index = 0): void {
  const b = bossAt(s, index);
  b.phase += 1;
  endMotion(b, boss);
  b.mode = 'transition';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.shots = s.shots.filter((shot) => (shot.owner ?? 0) !== index);
  s.events.push('phaseChange');
}

/**
 * Moves boss `index` one update. Mutates the (already cloned) state. `mayCommit` says whether the boss may start
 * choosing an attack on this update (its chance to take the turn); a blocked boss keeps waiting and draws nothing.
 */
export function updateBoss(s: GameState, boss: BossDef, index = 0, mayCommit = true): void {
  const b = bossAt(s, index);
  const phase = boss.phases[b.phase];
  if (phase === undefined) return;
  b.modeTick += 1;
  if (!s.study.active) b.temper = Math.min(b.temper + 1, TEMPER.start + TEMPER.ramp);
  if (boss.flight !== undefined && (b.mode === 'gap' || b.mode === 'approach' || b.mode === 'transition')) {
    settleLift(b, boss.flight);
  }
  switch (b.mode) {
    case 'gap':
      updateGap(s, boss, phase, index, mayCommit);
      break;
    case 'approach':
      updateApproach(s, boss, phase, index);
      break;
    case 'attack':
      updateAttack(s, boss, phase, index);
      break;
    case 'stagger':
      if (b.modeTick >= boss.counter.staggerTicks) enterGap(b, boss);
      break;
    case 'transition':
      if (b.modeTick >= boss.transitionTicks) finishTransition(s, boss, phase, index, mayCommit);
      break;
  }
}

/**
 * Moves every boss of the fight one update. With partners, only the boss that wins `pickCommitter` may start an attack
 * on this update; a lone boss always may, so a one-boss fight behaves exactly as it did before turns existed.
 */
export function updateBosses(s: GameState, fight: FightDef): void {
  const count = bossCount(s);
  const committer = count > 1 ? pickCommitter(s, fight) : 0;
  for (let i = 0; i < count; i++) {
    if (isDowned(s, i)) continue;
    updateBoss(s, bossDefFor(s, fight, i), i, i === committer);
  }
}

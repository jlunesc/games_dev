import type { InputFrame } from '../engine/input-frame';
import { WORLD } from '../game/params';
import { bossAt, bossCount, isDowned, type GameState } from '../game/state';
import { DETAILS_TUNING as T } from './details-tuning';

/** Called once per update of a replay with the state before it, the state after it and the input it used. */
export type UpdateObserver = (before: GameState, after: GameState, frame: InputFrame) => void;

/**
 * Plain counts of what the player's body did and how the clock ran, for the real fight only (the study is left out).
 * Measured while a fight is replayed (see `createMeter`), derived and never stored, so the record's schema is unchanged.
 */
export interface ReplayMeasures {
  movement: {
    /** World units travelled, by x going down (left) or up (right). Dashes count. */
    left: number;
    right: number;
    /** World units travelled towards, and away from, the nearest boss that was still standing. */
    toward: number;
    away: number;
    /** Updates holding left, holding right, and holding neither. */
    leftTicks: number;
    rightTicks: number;
    stillTicks: number;
    /** Times the held direction went from one side to the other (stopping in between does not break it). */
    turns: number;
    /** Updates within `T.wallMargin` world units of either end of the arena. */
    wallTicks: number;
    /** Updates off the ground (jumping or falling). */
    airTicks: number;
  };
  clock: {
    /** Updates of the real fight. */
    ticks: number;
    /** For each boss, the updates spent in each of its phases (index 0 is phase 1). */
    phaseTicks: number[][];
    /** Updates in which at least one boss was in an attack, from its warning to the end of its recovery. */
    attackingTicks: number;
    /** The longest run of updates with no boss attacking. */
    longestQuietTicks: number;
  };
}

function nearestSigned(s: GameState): number {
  let best = Infinity;
  let sign = 0;
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    const dx = bossAt(s, i).x - s.player.x;
    if (Math.abs(dx) < best) {
      best = Math.abs(dx);
      sign = Math.sign(dx);
    }
  }
  return sign === 0 ? Math.sign(s.boss.x - s.player.x) : sign;
}

/** Collects `ReplayMeasures` update by update: pass `observe` to the replay, then read `result()`. */
export function createMeter(): { observe: UpdateObserver; result: () => ReplayMeasures } {
  const m: ReplayMeasures = {
    movement: { left: 0, right: 0, toward: 0, away: 0, leftTicks: 0, rightTicks: 0, stillTicks: 0, turns: 0, wallTicks: 0, airTicks: 0 },
    clock: { ticks: 0, phaseTicks: [], attackingTicks: 0, longestQuietTicks: 0 },
  };
  let heldSide = 0;
  let quiet = 0;

  const observe: UpdateObserver = (before, after, frame) => {
    if (before.study.active) return;
    const { movement, clock } = m;
    clock.ticks += 1;

    const dx = after.player.x - before.player.x;
    if (dx < 0) movement.left -= dx;
    else movement.right += dx;
    // Towards the boss that stood nearest when the update began: moving the way it lay.
    const towardSign = nearestSigned(before);
    if (dx !== 0 && Math.sign(dx) === towardSign) movement.toward += Math.abs(dx);
    else movement.away += Math.abs(dx);

    const side = Math.sign(frame.moveX);
    if (side < 0) movement.leftTicks += 1;
    else if (side > 0) movement.rightTicks += 1;
    else movement.stillTicks += 1;
    if (side !== 0) {
      if (heldSide !== 0 && side !== heldSide) movement.turns += 1;
      heldSide = side;
    }
    if (after.player.x < T.wallMargin || after.player.x > WORLD.width - T.wallMargin) movement.wallTicks += 1;
    if (!after.player.onGround) movement.airTicks += 1;

    for (let i = 0; i < bossCount(after); i++) {
      const phases = (clock.phaseTicks[i] ??= []);
      const phase = bossAt(after, i).phase;
      phases[phase] = (phases[phase] ?? 0) + 1;
    }
    let attacking = false;
    for (let i = 0; i < bossCount(after); i++) if (bossAt(after, i).mode === 'attack') attacking = true;
    if (attacking) {
      clock.attackingTicks += 1;
      quiet = 0;
    } else {
      quiet += 1;
      clock.longestQuietTicks = Math.max(clock.longestQuietTicks, quiet);
    }
  };

  const result = (): ReplayMeasures => ({
    movement: { ...m.movement },
    clock: {
      ...m.clock,
      // A phase never reached has no entry: fill the gaps with zero.
      phaseTicks: m.clock.phaseTicks.map((phases) => Array.from(phases, (n) => n ?? 0)),
    },
  });
  return { observe, result };
}

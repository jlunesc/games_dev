import type { InputFrame } from '../engine/input-frame';
import { WORLD } from '../game/params';
import { bossAt, bossCount, isDowned, type GameState } from '../game/state';
import { DETAILS_TUNING as T } from './details-tuning';

/** Called once per update of a replay with the state before it, the state after it and the input it used. */
export type UpdateObserver = (before: GameState, after: GameState, frame: InputFrame) => void;

/** The player's position is sampled once every this many updates, which is plenty for a line on a small plot. */
export const PATH_STEP = 6;

/**
 * What the player's body did and how the clock ran, for the real fight only (the study is left out).
 * Measured while a fight is replayed (see `createMeter`), derived and never stored, so the record's schema is unchanged.
 */
export interface ReplayMeasures {
  movement: {
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
    /** The player's x, sampled every `PATH_STEP` updates from the first. */
    path: number[];
    /** The distance to the nearest standing boss, sampled with `path`. */
    distance: number[];
    /** Runs of updates (start, end exclusive) in which at least one boss was in an attack, from its warning to the end of its recovery. */
    attackSpans: [start: number, end: number][];
    /** Each attack of each boss from the update its warning began to the first update it was over, on the same count as the details timeline. */
    bands: { boss: number; start: number; end: number }[];
    /** Runs of updates (start, end exclusive) holding left and holding right. */
    leftRuns: [start: number, end: number][];
    rightRuns: [start: number, end: number][];
  };
}

/** The distance to the nearest boss still standing (any boss when all are down). */
function nearestDistance(s: GameState): number {
  let best = Infinity;
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    best = Math.min(best, Math.abs(bossAt(s, i).x - s.player.x));
  }
  return best === Infinity ? Math.abs(s.boss.x - s.player.x) : best;
}

/** Collects `ReplayMeasures` update by update: pass `observe` to the replay, then read `result()`. */
export function createMeter(): { observe: UpdateObserver; result: () => ReplayMeasures } {
  const m: ReplayMeasures = {
    movement: { leftTicks: 0, rightTicks: 0, stillTicks: 0, turns: 0, wallTicks: 0, airTicks: 0 },
    clock: { ticks: 0, path: [], distance: [], attackSpans: [], bands: [], leftRuns: [], rightRuns: [] },
  };
  let heldSide = 0;
  let spanStart: number | null = null;
  const bandStart = new Map<number, number>();
  let leftStart: number | null = null;
  let rightStart: number | null = null;

  const observe: UpdateObserver = (before, after, frame) => {
    if (before.study.active) return;
    const { movement, clock } = m;
    if (clock.ticks % PATH_STEP === 0) {
      clock.path.push(Math.round(after.player.x));
      clock.distance.push(Math.round(nearestDistance(after)));
    }
    clock.ticks += 1;

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

    if (side < 0 && leftStart === null) leftStart = clock.ticks - 1;
    else if (side >= 0 && leftStart !== null) {
      clock.leftRuns.push([leftStart, clock.ticks - 1]);
      leftStart = null;
    }
    if (side > 0 && rightStart === null) rightStart = clock.ticks - 1;
    else if (side <= 0 && rightStart !== null) {
      clock.rightRuns.push([rightStart, clock.ticks - 1]);
      rightStart = null;
    }

    let attacking = false;
    for (let i = 0; i < bossCount(after); i++) {
      const boss = bossAt(after, i);
      if (boss.mode === 'attack') attacking = true;
      const open = bandStart.get(i);
      if (open !== undefined && (boss.mode !== 'attack' || boss.attackTick === 0)) {
        clock.bands.push({ boss: i, start: open, end: clock.ticks });
        bandStart.delete(i);
      }
      if (boss.mode === 'attack' && boss.attackTick === 0) bandStart.set(i, clock.ticks);
    }
    if (attacking && spanStart === null) spanStart = clock.ticks - 1;
    else if (!attacking && spanStart !== null) {
      clock.attackSpans.push([spanStart, clock.ticks - 1]);
      spanStart = null;
    }
  };

  const result = (): ReplayMeasures => {
    const end = m.clock.ticks;
    const closed = (open: number | null, runs: [number, number][]): [number, number][] => (open === null ? [...runs] : [...runs, [open, end]]);
    return {
      movement: { ...m.movement },
      clock: {
        ticks: end,
        path: [...m.clock.path],
        distance: [...m.clock.distance],
        attackSpans: closed(spanStart, m.clock.attackSpans),
        bands: [...m.clock.bands, ...[...bandStart].map(([boss, start]) => ({ boss, start, end }))].sort((a, b) => a.start - b.start),
        leftRuns: closed(leftStart, m.clock.leftRuns),
        rightRuns: closed(rightStart, m.clock.rightRuns),
      },
    };
  };
  return { observe, result };
}

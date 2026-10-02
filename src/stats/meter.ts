import type { InputFrame } from '../engine/input-frame';
import { bossAt, bossCount, isDowned, type GameState } from '../game/state';

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
    /** Updates holding the direction towards the nearest standing boss, away from it, and neither. */
    towardTicks: number;
    awayTicks: number;
    stillTicks: number;
  };
  clock: {
    /** Updates of the real fight. */
    ticks: number;
    /** The distance to the nearest standing boss, sampled every `PATH_STEP` updates from the first. */
    distance: number[];
    /** Runs of updates (start, end exclusive) in which at least one boss was in an attack, from its warning to the end of its recovery. */
    attackSpans: [start: number, end: number][];
    /** Each attack of each boss from the update its warning began to the first update it was over, on the same count as the details timeline. */
    bands: { boss: number; start: number; end: number }[];
    /** Runs of updates (start, end exclusive) holding the direction towards the nearest standing boss, and away from it. */
    towardRuns: [start: number, end: number][];
    awayRuns: [start: number, end: number][];
  };
  /** What the dodge rating needs to replay the fight's attacks (see `rateDodges`); not meant for display. */
  trace: {
    /** The input of every update of the real fight, the first update being index 0. */
    frames: InputFrame[];
    /** The updates on which a dash or a jump began (counted like `clock.bands`: 1 is the first update). */
    dodgeTicks: number[];
    /** Each attack of each boss, with the state just after its warning began. */
    starts: AttackStart[];
  };
}

/** The moment an attack's warning began. Replaying from `state` with `frames.slice(tick)` is the fight from there. */
export interface AttackStart {
  boss: number;
  attackId: string;
  /** The update on which the warning began, on the same count as `clock.bands`. */
  tick: number;
  state: GameState;
  /** The last update on which a shot of this attack was still in the air (`tick` when it fired none). */
  lastShotTick: number;
}

/** From the player to the nearest boss still standing (any boss when all are down): positive when it is on the right. */
function nearestOffset(s: GameState): number {
  let best = Infinity;
  let offset = s.boss.x - s.player.x;
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    const gap = bossAt(s, i).x - s.player.x;
    if (Math.abs(gap) < best) {
      best = Math.abs(gap);
      offset = gap;
    }
  }
  return offset;
}

/** Collects `ReplayMeasures` update by update: pass `observe` to the replay, then read `result()`. */
export function createMeter(): { observe: UpdateObserver; result: () => ReplayMeasures } {
  const m: ReplayMeasures = {
    movement: { towardTicks: 0, awayTicks: 0, stillTicks: 0 },
    clock: { ticks: 0, distance: [], attackSpans: [], bands: [], towardRuns: [], awayRuns: [] },
    trace: { frames: [], dodgeTicks: [], starts: [] },
  };
  const startOfShot = new Map<string, AttackStart>();
  let spanStart: number | null = null;
  const bandStart = new Map<number, number>();
  let towardStart: number | null = null;
  let awayStart: number | null = null;

  const observe: UpdateObserver = (before, after, frame) => {
    if (before.study.active) return;
    const { movement, clock } = m;
    if (clock.ticks % PATH_STEP === 0) {
      clock.distance.push(Math.round(Math.abs(nearestOffset(after))));
    }
    clock.ticks += 1;
    m.trace.frames.push(frame);
    if (after.events.includes('dash') || (before.player.onGround && !after.player.onGround && after.player.vy < 0)) {
      m.trace.dodgeTicks.push(clock.ticks);
    }

    // Towards or away is judged against where the boss was when the button was pressed.
    const side = Math.sign(frame.moveX) * Math.sign(nearestOffset(before));
    if (side > 0) movement.towardTicks += 1;
    else if (side < 0) movement.awayTicks += 1;
    else movement.stillTicks += 1;

    if (side > 0 && towardStart === null) towardStart = clock.ticks - 1;
    else if (side <= 0 && towardStart !== null) {
      clock.towardRuns.push([towardStart, clock.ticks - 1]);
      towardStart = null;
    }
    if (side < 0 && awayStart === null) awayStart = clock.ticks - 1;
    else if (side >= 0 && awayStart !== null) {
      clock.awayRuns.push([awayStart, clock.ticks - 1]);
      awayStart = null;
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
      if (boss.mode === 'attack' && boss.attackTick === 0) {
        bandStart.set(i, clock.ticks);
        const start: AttackStart = { boss: i, attackId: boss.attackId ?? '', tick: clock.ticks, state: after, lastShotTick: clock.ticks };
        m.trace.starts.push(start);
        startOfShot.set(`${i}:${after.tick}`, start);
      }
    }
    for (const shot of after.shots) {
      const start = startOfShot.get(`${shot.owner ?? 0}:${shot.originTick}`);
      if (start !== undefined && start.attackId === shot.attackId) start.lastShotTick = clock.ticks;
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
        distance: [...m.clock.distance],
        attackSpans: closed(spanStart, m.clock.attackSpans),
        bands: [...m.clock.bands, ...[...bandStart].map(([boss, start]) => ({ boss, start, end }))].sort((a, b) => a.start - b.start),
        towardRuns: closed(towardStart, m.clock.towardRuns),
        awayRuns: closed(awayStart, m.clock.awayRuns),
      },
      trace: { frames: m.trace.frames, dodgeTicks: [...m.trace.dodgeTicks], starts: [...m.trace.starts] },
    };
  };
  return { observe, result };
}

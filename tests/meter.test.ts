import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { analyzeRun } from '../src/stats/analyze';
import { fightDetails } from '../src/stats/details';
import { createMeter, PATH_STEP } from '../src/stats/meter';
import { standAt } from './boss-helpers';
import { QUIET_BOSS, withInput } from './helpers';

const repeat = (frame: InputFrame, n: number): InputFrame[] => Array.from({ length: n }, () => frame);
const right = withInput({ moveX: 1 });
const left = withInput({ moveX: -1 });

function measure(frames: InputFrame[], distance = 500) {
  const meter = createMeter();
  const initial = standAt(QUIET_BOSS, distance);
  const analysis = analyzeRun(QUIET_BOSS, initial, frames, 0, meter.observe);
  return { analysis, measures: meter.result() };
}

describe('movement', () => {
  it('counts the distance and the updates holding each direction', () => {
    const { measures } = measure([...repeat(right, 30), ...repeat(left, 20), ...repeat(NO_INPUT, 10)]);
    const m = measures.movement;
    expect(m.rightTicks).toBe(30);
    expect(m.leftTicks).toBe(20);
    expect(m.stillTicks).toBe(10);
  });

  it('counts a change of direction, also with a stop in between, but not a stop and a restart the same way', () => {
    expect(measure([...repeat(right, 10), ...repeat(left, 10)]).measures.movement.turns).toBe(1);
    expect(measure([...repeat(right, 10), ...repeat(NO_INPUT, 10), ...repeat(left, 10)]).measures.movement.turns).toBe(1);
    expect(measure([...repeat(right, 10), ...repeat(NO_INPUT, 10), ...repeat(right, 10)]).measures.movement.turns).toBe(0);
    expect(measure([...repeat(right, 5), ...repeat(left, 5), ...repeat(right, 5)]).measures.movement.turns).toBe(2);
  });

  it('counts the updates next to a wall and in the air', () => {
    const wall = createInitialState(QUIET_BOSS, 1);
    wall.player.x = 30;
    wall.player.prevX = 30;
    const meter = createMeter();
    analyzeRun(QUIET_BOSS, wall, repeat(NO_INPUT, 20), 0, meter.observe);
    expect(meter.result().movement.wallTicks).toBe(20);

    const jump = measure([withInput({ jumpPressed: true, jumpHeld: true }), ...repeat(withInput({ jumpHeld: true }), 20)]);
    expect(jump.measures.movement.airTicks).toBeGreaterThan(10);
    expect(measure(repeat(NO_INPUT, 20)).measures.movement.airTicks).toBe(0);
  });
});

describe('clock', () => {
  it('leaves out the study, like the rest of the details', () => {
    const meter = createMeter();
    const initial = createInitialState(EMBER_DUELIST, 1, 1);
    const analysis = analyzeRun(EMBER_DUELIST, initial, repeat(NO_INPUT, 3000), 1, meter.observe);
    expect(analysis.study.ticks).toBeGreaterThan(0);
    expect(meter.result().clock.ticks).toBe(analysis.ticks - analysis.study.ticks);
  });

  it('samples the position of the player every few updates', () => {
    const { measures } = measure(repeat(right, 61));
    const { path, ticks } = measures.clock;
    expect(path).toHaveLength(Math.ceil(ticks / PATH_STEP));
    expect(path[path.length - 1]!).toBeGreaterThan(path[0]!);
  });

  it('lists the runs in which a boss was attacking, inside the fight and in order', () => {
    const meter = createMeter();
    const analysis = analyzeRun(EMBER_DUELIST, createInitialState(EMBER_DUELIST, 1), repeat(NO_INPUT, 1200), 0, meter.observe);
    const { attackSpans, ticks } = meter.result().clock;
    expect(ticks).toBe(analysis.ticks);
    expect(attackSpans.length).toBeGreaterThan(0);
    let last = 0;
    for (const [start, end] of attackSpans) {
      expect(start).toBeGreaterThanOrEqual(last);
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(ticks);
      last = end;
    }
  });

  it('lists each attack as a band that matches the attacks of the analysis', () => {
    const meter = createMeter();
    const analysis = analyzeRun(EMBER_DUELIST, createInitialState(EMBER_DUELIST, 1), repeat(NO_INPUT, 1200), 0, meter.observe);
    const { bands } = meter.result().clock;
    expect(bands.length).toBeGreaterThan(1);
    for (const b of bands) expect(b.end).toBeGreaterThan(b.start);
    const details = fightDetails(analysis, meter.result());
    expect(details.attackBands).toHaveLength(analysis.attacks.length);
    for (const band of details.attackBands) {
      expect(bands.some((x) => Math.abs(x.start - band.start) <= 1 && x.end <= band.end)).toBe(true);
      expect(band.end).toBeGreaterThan(band.dangerStart);
      expect(band.dangerStart).toBeGreaterThanOrEqual(band.start);
    }
  });

  it('lists the runs holding each direction and samples the distance to the boss', () => {
    const { measures } = measure([...repeat(right, 20), ...repeat(NO_INPUT, 10), ...repeat(left, 30)]);
    expect(measures.clock.rightRuns).toEqual([[0, 20]]);
    expect(measures.clock.leftRuns).toEqual([[30, 60]]);
    expect(measures.clock.distance).toHaveLength(measures.clock.path.length);
    expect(Math.abs(measures.clock.distance[0]! - 500)).toBeLessThan(20);
  });

  it('has no attack runs against a boss that never attacks', () => {
    expect(measure(repeat(NO_INPUT, 100)).measures.clock.attackSpans).toEqual([]);
  });
});

describe('the numbers of the details', () => {
  it('count the real fight\'s attacks of the boss by how each ended', () => {
    const analysis = analyzeRun(EMBER_DUELIST, createInitialState(EMBER_DUELIST, 1), repeat(NO_INPUT, 2400));
    const { boss } = fightDetails(analysis).numbers;
    const real = analysis.attacks.filter((a) => !a.study);
    expect(boss.started).toBe(real.length);
    expect(boss.started).toBeGreaterThan(3);
    for (const a of boss.perAttack) expect(a.started).toBe(a.hit + a.dodged + a.countered + a.interrupted);
    expect(boss.perAttack.reduce((n, a) => n + a.started, 0)).toBe(boss.started);
  });

  it('have no movement or clock without a meter, and carry them with one', () => {
    const meter = createMeter();
    const analysis = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), repeat(right, 30), 0, meter.observe);
    expect(fightDetails(analysis).numbers.movement).toBeNull();
    expect(fightDetails(analysis, meter.result()).numbers.movement?.rightTicks).toBe(30);
  });
});

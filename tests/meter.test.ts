import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { analyzeRun } from '../src/stats/analyze';
import { fightDetails } from '../src/stats/details';
import { createMeter } from '../src/stats/meter';
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
    expect(m.right).toBeGreaterThan(m.left);
    expect(m.left).toBeGreaterThan(0);
  });

  it('counts a change of direction, also with a stop in between, but not a stop and a restart the same way', () => {
    expect(measure([...repeat(right, 10), ...repeat(left, 10)]).measures.movement.turns).toBe(1);
    expect(measure([...repeat(right, 10), ...repeat(NO_INPUT, 10), ...repeat(left, 10)]).measures.movement.turns).toBe(1);
    expect(measure([...repeat(right, 10), ...repeat(NO_INPUT, 10), ...repeat(right, 10)]).measures.movement.turns).toBe(0);
    expect(measure([...repeat(right, 5), ...repeat(left, 5), ...repeat(right, 5)]).measures.movement.turns).toBe(2);
  });

  it('tells moving towards the boss from moving away from it', () => {
    // The player stands to the left of the boss, so right is towards it.
    const towards = measure(repeat(right, 30)).measures.movement;
    expect(towards.toward).toBeGreaterThan(0);
    expect(towards.away).toBe(0);
    const away = measure(repeat(left, 30)).measures.movement;
    expect(away.away).toBeGreaterThan(0);
    expect(away.toward).toBe(0);
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

  it('adds up the time in phases, and the time attacking and not', () => {
    const meter = createMeter();
    const analysis = analyzeRun(EMBER_DUELIST, createInitialState(EMBER_DUELIST, 1), repeat(NO_INPUT, 1200), 0, meter.observe);
    const { clock } = meter.result();
    expect(clock.ticks).toBe(analysis.ticks);
    expect(clock.phaseTicks).toHaveLength(1);
    expect(clock.phaseTicks[0]!.reduce((a, b) => a + b, 0)).toBe(clock.ticks);
    expect(clock.attackingTicks).toBeGreaterThan(0);
    expect(clock.attackingTicks).toBeLessThan(clock.ticks);
    expect(clock.longestQuietTicks).toBeGreaterThan(0);
    expect(clock.longestQuietTicks).toBeLessThan(clock.ticks);
  });

  it('has no attacking time against a boss that never attacks', () => {
    const { measures } = measure(repeat(NO_INPUT, 100));
    expect(measures.clock.attackingTicks).toBe(0);
    expect(measures.clock.longestQuietTicks).toBe(100);
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
    expect(fightDetails(analysis).numbers.you.swings).toBe(0);
  });
});

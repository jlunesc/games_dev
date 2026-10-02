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
  it('counts the updates moving towards the boss, away from it, and neither (the boss starts on the right)', () => {
    const { measures } = measure([...repeat(right, 30), ...repeat(left, 20), ...repeat(NO_INPUT, 10)]);
    const m = measures.movement;
    expect(m.towardTicks).toBe(30);
    expect(m.awayTicks).toBe(20);
    expect(m.stillTicks).toBe(10);
  });

  it('judges towards and away against the side the boss is on, whichever it is', () => {
    const behind = standAt(QUIET_BOSS, 500);
    behind.player.x = behind.boss.x + 500;
    behind.player.prevX = behind.player.x;
    const meter = createMeter();
    analyzeRun(QUIET_BOSS, behind, [...repeat(left, 30), ...repeat(right, 10)], 0, meter.observe);
    expect(meter.result().movement).toEqual({ towardTicks: 30, awayTicks: 10, stillTicks: 0 });
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

  it('samples the distance to the boss every few updates', () => {
    const { measures } = measure(repeat(right, 61));
    const { distance, ticks } = measures.clock;
    expect(distance).toHaveLength(Math.ceil(ticks / PATH_STEP));
    expect(distance[distance.length - 1]!).toBeLessThan(distance[0]!);
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

  it('lists the runs moving towards and away from the boss and samples the distance to it', () => {
    const { measures } = measure([...repeat(right, 20), ...repeat(NO_INPUT, 10), ...repeat(left, 30)]);
    expect(measures.clock.towardRuns).toEqual([[0, 20]]);
    expect(measures.clock.awayRuns).toEqual([[30, 60]]);
    expect(Math.abs(measures.clock.distance[0]! - 500)).toBeLessThan(20);
  });

  it('has no attack runs against a boss that never attacks', () => {
    expect(measure(repeat(NO_INPUT, 100)).measures.clock.attackSpans).toEqual([]);
  });
});

describe('trace', () => {
  it('keeps every real update\'s input, the updates a dash or jump began on, and the state at each attack\'s warning', () => {
    const meter = createMeter();
    const frames = repeat(NO_INPUT, 600).map((f, i) => (i === 100 ? withInput({ dashPressed: true }) : f));
    const analysis = analyzeRun(EMBER_DUELIST, createInitialState(EMBER_DUELIST, 1), frames, 0, meter.observe);
    const { trace, clock } = meter.result();
    expect(trace.frames).toHaveLength(clock.ticks);
    expect(trace.dodgeTicks).toEqual([101]);
    expect(trace.starts).toHaveLength(clock.bands.length);
    for (const start of trace.starts) {
      expect(start.state.tick).toBe(start.tick);
      expect(start.lastShotTick).toBeGreaterThanOrEqual(start.tick);
    }
    expect(trace.starts.length).toBeGreaterThanOrEqual(analysis.attacks.length);
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
    expect(fightDetails(analysis, meter.result()).numbers.movement?.towardTicks).toBe(30);
  });
});

import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/engine/time';
import { MAX_UPDATES_PER_FRAME, planUpdates } from '../src/engine/loop';

describe('planUpdates', () => {
  it('does nothing when no time has passed', () => {
    expect(planUpdates(0, 0)).toEqual({ updates: 0, leftoverMs: 0, alpha: 0 });
  });

  it('runs one update per full tick of elapsed time', () => {
    const plan = planUpdates(0, 3 * TICK_MS);
    expect(plan.updates).toBe(3);
    expect(plan.leftoverMs).toBeCloseTo(0, 6);
  });

  it('keeps a partial tick as leftover and reports how far into the next tick we are', () => {
    const plan = planUpdates(0, 1.5 * TICK_MS);
    expect(plan.updates).toBe(1);
    expect(plan.leftoverMs).toBeCloseTo(0.5 * TICK_MS, 6);
    expect(plan.alpha).toBeCloseTo(0.5, 6);
  });

  it('adds the leftover from the previous frame', () => {
    const plan = planUpdates(0.5 * TICK_MS, 0.5 * TICK_MS);
    expect(plan.updates).toBe(1);
    expect(plan.leftoverMs).toBeCloseTo(0, 6);
  });

  it('on a 120 Hz screen alternates between zero and one update', () => {
    const half = TICK_MS / 2;
    let leftover = 0;
    const counts: number[] = [];
    for (let frame = 0; frame < 6; frame++) {
      const plan = planUpdates(leftover, half);
      leftover = plan.leftoverMs;
      counts.push(plan.updates);
    }
    expect(counts).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('never runs more than the cap after a long stall, and drops the backlog', () => {
    const plan = planUpdates(0, 5000);
    expect(plan.updates).toBe(MAX_UPDATES_PER_FRAME);
    expect(plan.leftoverMs).toBe(0);
    expect(plan.alpha).toBe(0);
  });

  it('treats negative elapsed time as zero', () => {
    expect(planUpdates(0, -20).updates).toBe(0);
  });
});

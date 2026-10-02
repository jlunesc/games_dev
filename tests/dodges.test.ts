import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { asFight } from '../src/game/fight';
import { analyzeRun } from '../src/stats/analyze';
import { DETAILS_TUNING as T } from '../src/stats/details-tuning';
import { rateDodges } from '../src/stats/dodges';
import { createMeter } from '../src/stats/meter';
import { customBoss, melee, standAt } from './boss-helpers';
import { withInput } from './helpers';

/** A swing that starts at once and can first hurt on the 32nd update; nothing else. */
const boss = customBoss(
  [melee('swing', { windup: 30, active: 6, recovery: 10, hits: [{ from: 30, to: 36, x0: 0, x1: 150, bottom: 0, top: 60 }] })],
  { attacks: [{ id: 'swing', weight: 1 }] },
);

/** The first 90 updates: `moves` maps an update (counted from 0) to what the player pressed on it. */
function rate(distance: number, moves: Record<number, Partial<InputFrame>>) {
  const frames = Array.from({ length: 90 }, (_, i) => (moves[i] === undefined ? NO_INPUT : withInput(moves[i]!)));
  const meter = createMeter();
  const analysis = analyzeRun(boss, standAt(boss, distance), frames, 0, meter.observe);
  return { analysis, ratings: rateDodges(asFight(boss), analysis, meter.result()) };
}

describe('rating a dodge by replaying the attack without it', () => {
  it('gives no rating to an attack in which the player made no dash or jump', () => {
    expect(rate(100, {}).ratings).toEqual([]);
  });

  it('says a dash that kept the attack off the player saved them, and by how much it could have been later', () => {
    const early = rate(100, { 10: { dashPressed: true } });
    expect(early.analysis.attacks[0]!.outcome).toBe('dodged');
    expect(early.ratings).toHaveLength(1);
    expect(early.ratings[0]).toMatchObject({ attackId: 'swing', boss: 0, verdict: 'saved' });
    const late = rate(100, { 31: { dashPressed: true } });
    expect(late.ratings[0]).toMatchObject({ verdict: 'saved', slackTicks: 0 });
    expect(early.ratings[0]!.slackTicks!).toBeGreaterThan(late.ratings[0]!.slackTicks!);
  });

  it('caps the slack at the longest delay tried', () => {
    expect(rate(100, { 4: { dashPressed: true } }).ratings[0]!.slackTicks).toBeLessThanOrEqual(T.maxSlackTicks);
  });

  it('says a dash made where the attack could not reach was not needed', () => {
    const { analysis, ratings } = rate(400, { 10: { dashPressed: true, moveX: -1 } });
    expect(analysis.attacks[0]!.outcome).toBe('dodged');
    expect(ratings[0]).toMatchObject({ verdict: 'unneeded', slackTicks: null });
  });

  it('says a dash that came too late did not stop the hit', () => {
    const { analysis, ratings } = rate(100, { 34: { dashPressed: true } });
    expect(analysis.attacks[0]!.outcome).toBe('hit');
    expect(ratings[0]).toMatchObject({ verdict: 'hitAnyway', slackTicks: null });
  });

  it('ignores a dash made after the attack\'s danger was over', () => {
    expect(rate(400, { 41: { dashPressed: true, moveX: -1 } }).ratings).toEqual([]);
  });

  it('rates a jump over the swing as well', () => {
    const held = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [20 + i, { jumpPressed: i === 0, jumpHeld: true }]));
    const { analysis, ratings } = rate(100, held);
    expect(analysis.attacks[0]!.evasion).toBe('jump');
    expect(ratings[0]).toMatchObject({ verdict: 'saved' });
  });
});

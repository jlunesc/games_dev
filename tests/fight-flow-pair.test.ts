import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { NORMAL_DIALS } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import type { FightMeta } from '../src/stats/record';
import { advanceFlow, leaveSummary, startFlow, type FinishedFight } from '../src/ui/fight-flow';
import { dummy, pair } from './duo-helpers';
import { withInput } from './helpers';

const META: FightMeta = {
  bossId: 'hound-and-sage',
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 1,
  study: 0,
  playedAt: '2026-09-29T10:00:00.000Z',
};

const fight: FightDef = pair(
  { ...dummy(700, 1), id: 'first', name: 'First' },
  { ...dummy(650, 1), id: 'second', name: 'Second' },
);

/** The player stands at x = 600 and swings on updates 1 and 27 (a swing takes 16 updates); the first swing downs the nearer boss, the second the other. */
const inputFor = (n: number): InputFrame => (n === 1 || n === 27 ? withInput({ attackPressed: true }) : NO_INPUT);

describe('the fight flow with two bosses', () => {
  const played = (() => {
    let flow = startFlow(META);
    let state = createInitialState(fight);
    state.player.x = 600;
    state.player.prevX = 600;
    const finishes: Array<{ update: number; finished: FinishedFight }> = [];
    const states = [state];
    for (let n = 1; n <= 60 && flow.ended === null; n++) {
      const before = state;
      const frame = inputFor(n);
      state = step(state, frame, fight);
      states.push(state);
      const result = advanceFlow(flow, before, state, fight, frame);
      flow = result.flow;
      if (result.finished !== null) finishes.push({ update: n, finished: result.finished });
    }
    return { flow, finishes, state, states };
  })();

  it('does not end the fight when only one boss falls', () => {
    const afterFirst = played.states[26]!;
    expect(afterFirst.phase).toBe('fight');
    expect(afterFirst.partners[0]!.hp).toBe(0);
    expect(afterFirst.boss.hp).toBe(1);
  });

  it('ends it as a victory when the last boss falls, once, with both bosses in the summary', () => {
    expect(played.finishes).toHaveLength(1);
    expect(played.finishes[0]!.update).toBe(27 + 3);
    expect(played.finishes[0]!.finished.result).toBe('victory');
    expect(played.flow.ended!.bosses).toEqual([
      { name: 'First', hpLeft: 0, maxHp: 1 },
      { name: 'Second', hpLeft: 0, maxHp: 1 },
    ]);
    expect(played.flow.ended!.bossHpLeft).toBe(0);
  });

  it('gives the left summary of a fight of two bosses when the player leaves', () => {
    const flow = startFlow(META);
    const summary = leaveSummary(flow, createInitialState(fight), fight);
    expect(summary.result).toBe('left');
    expect(summary.bosses.map((b) => b.hpLeft)).toEqual([1, 1]);
  });
});

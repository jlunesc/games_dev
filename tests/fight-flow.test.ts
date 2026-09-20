import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { GAME, PLAYER } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import type { FightSummary } from '../src/game/summary';
import { advanceFlow, leaveSummary, startFlow, type FightFlow } from '../src/ui/fight-flow';
import { solo, standAt } from './boss-helpers';
import { DUELIST, QUIET_BOSS, withInput } from './helpers';

interface Played {
  flow: FightFlow;
  states: GameState[];
  /** The updates (1-based) on which the flow asked to show the summary, with what it showed. */
  shows: Array<{ update: number; summary: FightSummary }>;
}

/** Drives the real `step` and the flow together, the way the app does, for up to `count` updates (it stops when the summary is shown). */
function play(
  start: GameState,
  count: number,
  boss: BossDef,
  inputFor: (n: number) => InputFrame = () => NO_INPUT,
): Played {
  let flow = startFlow();
  let state = start;
  const states: GameState[] = [];
  const shows: Played['shows'] = [];
  for (let n = 1; n <= count; n++) {
    const before = state;
    state = step(state, inputFor(n), boss);
    states.push(state);
    const result = advanceFlow(flow, before, state, boss);
    flow = result.flow;
    if (result.show !== null) {
      shows.push({ update: n, summary: result.show });
      break; // The app leaves the fight here.
    }
  }
  return { flow, states, shows };
}

const costing = (id: string, damage: number): BossDef => {
  const boss = solo(id);
  return { ...boss, attacks: boss.attacks.map((a) => (a.id === id ? { ...a, damage } : a)) };
};

/** The player swings on update 1: with the boss at 1 health in reach, that swing wins the fight. */
const winning = (): GameState => {
  const s = standAt(QUIET_BOSS, 120);
  s.boss.hp = 1;
  return s;
};
const swing = (n: number): InputFrame => withInput({ attackPressed: n === 1 });
const WIN_UPDATE = PLAYER.attack.startup + 1;

describe('a new flow', () => {
  it('has a fresh tracker and no ended fight', () => {
    const flow = startFlow();
    expect(flow.ended).toBeNull();
    expect(flow.tracker.hitsTaken).toBe(0);
    expect(flow.tracker.phaseReached).toBe(1);
  });

  it('does not carry the previous fight over', () => {
    const won = play(winning(), WIN_UPDATE + GAME.defeatRestartTicks, QUIET_BOSS, swing);
    expect(won.flow.ended).not.toBeNull();
    expect(startFlow().ended).toBeNull();
    expect(startFlow()).not.toBe(won.flow);
  });
});

describe('a win', () => {
  const start = winning();
  const played = play(start, WIN_UPDATE + GAME.defeatRestartTicks + 5, QUIET_BOSS, swing);

  it('asks to show the summary only when the game restarts the fight', () => {
    expect(played.states[WIN_UPDATE - 1]!.phase).toBe('victory');
    expect(played.shows.map((s) => s.update)).toEqual([WIN_UPDATE + GAME.defeatRestartTicks]);
    expect(played.states[WIN_UPDATE + GAME.defeatRestartTicks - 1]!.phase).toBe('fight');
  });

  it('reports a victory timed to the update the fight ended, not the restart', () => {
    const summary = played.shows[0]!.summary;
    expect(summary.result).toBe('victory');
    expect(summary.ticks).toBe(WIN_UPDATE);
    expect(summary.seconds).toBe(WIN_UPDATE / 60);
    expect(summary.bossHpLeft).toBe(0);
  });

  it('notes the end while the end pause runs, without showing yet', () => {
    const during = play(start, WIN_UPDATE + 10, QUIET_BOSS, swing);
    expect(during.shows).toEqual([]);
    expect(during.flow.ended?.result).toBe('victory');
  });
});

describe('a loss', () => {
  const boss = costing('slam', PLAYER.maxHealth + 4);
  const played = play(standAt(boss, 120), 400, boss);
  const lostAt = played.states.findIndex((s) => s.phase === 'defeated') + 1;

  it('shows the summary at the restart, as a defeat timed to the update it ended', () => {
    expect(lostAt).toBeGreaterThan(0);
    expect(played.shows.map((s) => s.update)).toEqual([lostAt + GAME.defeatRestartTicks]);
    const summary = played.shows[0]!.summary;
    expect(summary.result).toBe('defeat');
    expect(summary.ticks).toBe(lostAt);
    expect(summary.seconds).toBe(lostAt / 60);
  });

  it('counts the final hit in the hits taken', () => {
    expect(played.shows[0]!.summary.hitsTaken).toBe(1);
    expect(played.shows[0]!.summary.mostDangerousAttack?.id).toBe('slam');
  });

  it('counts every hit when there are several before the last', () => {
    const start = standAt(solo('slam'), 120);
    start.player.health = 2;
    const two = play(start, 600, solo('slam'));
    expect(two.shows[0]!.summary.result).toBe('defeat');
    expect(two.shows[0]!.summary.hitsTaken).toBe(2);
  });
});

describe('leaving', () => {
  it('in the middle of a fight gives "left" with the time so far', () => {
    const played = play(standAt(DUELIST, 300), 45, DUELIST);
    expect(played.flow.ended).toBeNull();
    const summary = leaveSummary(played.flow, played.states[44]!, DUELIST);
    expect(summary.result).toBe('left');
    expect(summary.ticks).toBe(45);
    expect(summary.seconds).toBe(0.75);
  });

  it('during the end pause gives the real result', () => {
    const won = play(winning(), WIN_UPDATE + 10, QUIET_BOSS, swing);
    const winSummary = leaveSummary(won.flow, won.states.at(-1)!, QUIET_BOSS);
    expect(winSummary.result).toBe('victory');
    expect(winSummary.ticks).toBe(WIN_UPDATE);

    const boss = costing('slam', PLAYER.maxHealth + 4);
    const lost = play(standAt(boss, 120), 400, boss);
    const lostAt = lost.states.findIndex((s) => s.phase === 'defeated') + 1;
    const early = play(standAt(boss, 120), lostAt + 5, boss);
    expect(leaveSummary(early.flow, early.states.at(-1)!, boss).result).toBe('defeat');
  });

  it('a fight that never ran gives "left" with no time', () => {
    const summary = leaveSummary(startFlow(), createInitialState(DUELIST), DUELIST);
    expect(summary.result).toBe('left');
    expect(summary.ticks).toBe(0);
  });
});

describe('advanceFlow', () => {
  it('does not change the flow or the states it is given', () => {
    const played = play(winning(), WIN_UPDATE, QUIET_BOSS, swing);
    const flow = played.flow;
    const before = played.states[WIN_UPDATE - 2]!;
    const after = played.states[WIN_UPDATE - 1]!;
    const copies = structuredClone({ flow, before, after });
    advanceFlow(flow, before, after, QUIET_BOSS);
    advanceFlow(startFlow(), before, after, QUIET_BOSS);
    expect({ flow, before, after }).toEqual(copies);
  });

  it('returns a new flow, and a new tracker whenever it tracks', () => {
    const start = createInitialState(DUELIST);
    const next = step(start, NO_INPUT, DUELIST);
    const flow = startFlow();
    const result = advanceFlow(flow, start, next, DUELIST);
    expect(result.flow).not.toBe(flow);
    expect(result.show).toBeNull();
  });

  it('does not track the restart update, and keeps the finished fight as it was', () => {
    const played = play(winning(), WIN_UPDATE + GAME.defeatRestartTicks, QUIET_BOSS, swing);
    expect(played.shows).toHaveLength(1);
    expect(played.flow.ended).toBe(played.shows[0]!.summary);
    expect(played.flow.tracker.hitsTaken).toBe(0);
  });
});

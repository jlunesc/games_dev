import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { makeFight, type FightDef } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { createTracker, summarize, trackUpdate, type SummaryTracker } from '../src/game/summary';
import { solo, updatesWith } from './boss-helpers';
import { dummy, pair } from './duo-helpers';
import { DUELIST } from './helpers';

const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
const slammer = (id: string, name: string, startX: number): BossDef => ({ ...solo('slam'), id, name, startX });

/** The player stands at `x` with plenty of health while the fight runs `count` idle updates, tracked as the app does. */
function play(fight: FightDef, x: number, count: number): { tracker: SummaryTracker; last: GameState; hits: number } {
  let previous = createInitialState(fight);
  previous.player.x = x;
  previous.player.prevX = x;
  previous.player.health = 1000;
  let tracker = createTracker();
  let hits = 0;
  for (let n = 0; n < count; n++) {
    const next = step(previous, NO_INPUT, fight);
    tracker = trackUpdate(tracker, next, previous);
    hits += updatesWith([next], 'playerHit').length;
    previous = next;
  }
  return { tracker, last: previous, hits };
}

describe('the summary of a fight of two bosses', () => {
  const fight = pair(
    { ...dummy(300, 18), id: 'first', name: 'First' },
    { ...dummy(900, 12), id: 'second', name: 'Second' },
  );
  const state = createInitialState(fight);
  state.partners[0]!.hp = 4;
  const summary = summarize(createTracker(), state, fight, 'left');

  it('lists each boss with its health left and its own maximum', () => {
    expect(summary.bosses).toEqual([
      { name: 'First', hpLeft: 18, maxHp: 18 },
      { name: 'Second', hpLeft: 4, maxHp: 12 },
    ]);
  });

  it('sums the health at the top and takes the phase count from the primary boss', () => {
    expect(summary.bossHpLeft).toBe(22);
    expect(summary.bossMaxHp).toBe(30);
    expect(summary.phaseCount).toBe(fight.bosses[0]!.phases.length);
  });
});

describe('the summary of a fight of one boss', () => {
  it('has one boss entry and the same numbers whether it is given the boss or a fight of one', () => {
    const { tracker, last } = play(makeFight([DUELIST]), 300, 30);
    const summary = summarize(tracker, last, DUELIST, 'left');
    expect(summary.bosses).toEqual([{ name: DUELIST.name, hpLeft: DUELIST.maxHp, maxHp: DUELIST.maxHp }]);
    expect(summarize(tracker, last, makeFight([DUELIST]), 'left')).toEqual(summary);
  });
});

describe('hits in a fight of two bosses', () => {
  it("counts a hit by the primary boss's attack under the attack id and names the boss in the summary", () => {
    const fight = pair(slammer('first', 'First', 1000), { ...dummy(300), id: 'second', name: 'Second' });
    const { tracker, last, hits } = play(fight, 880, 200);
    expect(hits).toBeGreaterThan(1);
    expect(tracker.hitsByAttack).toEqual({ slam: hits });
    expect(summarize(tracker, last, fight, 'defeat').mostDangerousAttack).toEqual({
      id: 'slam',
      name: `First's ${slam.name}`,
      hits,
    });
  });

  it("counts a hit by the partner's attack apart from the primary boss's attack of the same id", () => {
    const fight = pair({ ...dummy(300), id: 'first', name: 'First' }, slammer('second', 'Second', 1000));
    const { tracker, last, hits } = play(fight, 880, 200);
    expect(hits).toBeGreaterThan(1);
    expect(tracker.hitsByAttack).toEqual({ '1:slam': hits });
    expect(summarize(tracker, last, fight, 'defeat').mostDangerousAttack).toEqual({
      id: 'slam',
      name: `Second's ${slam.name}`,
      hits,
    });
  });

  it("gives a tie to the primary boss's attack", () => {
    const fight = pair(slammer('first', 'First', 1000), slammer('second', 'Second', 300));
    const tied: SummaryTracker = { hitsByAttack: { slam: 2, '1:slam': 2 }, hitsTaken: 4, phaseReached: 1 };
    expect(summarize(tied, createInitialState(fight), fight, 'defeat').mostDangerousAttack!.name).toBe(
      `First's ${slam.name}`,
    );
  });
});

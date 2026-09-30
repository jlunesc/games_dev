import { describe, expect, it } from 'vitest';
import { GALE_REAVER } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';

describe('the Gale Reaver file', () => {
  it('is loaded, has six attacks and no arena', () => {
    expect(GALE_REAVER).toBeDefined();
    expect(GALE_REAVER.id).toBe('gale-reaver');
    expect(GALE_REAVER.name).toBe('Gale Reaver');
    expect(GALE_REAVER.attacks.map((a) => a.id)).toEqual([
      'wind-slash',
      'gale-jab',
      'tempest-rush',
      'gale-cyclone',
      'gale-carry',
      'gale-recoil',
    ]);
    expect(GALE_REAVER.arena).toBeUndefined();
    expect(GALE_REAVER.phases).toHaveLength(1);
  });

  it('is fast: short gap, real chaining, quick but not-below-floor wind-ups', () => {
    const phase = GALE_REAVER.phases[0]!;
    expect(phase.gap).toBeLessThanOrEqual(40);
    expect(phase.maxChain).toBeGreaterThanOrEqual(3);
    expect(phase.combos).toHaveLength(2);
    expect(phase.chainChance).toBeGreaterThan(0);
    expect(phase.walkSpeed).toBeGreaterThanOrEqual(400);
    for (const a of GALE_REAVER.attacks) if (a.id !== 'gale-recoil') expect(a.windup).toBeGreaterThanOrEqual(18);
  });
});

// ---- The bot check: no degenerate fights ----

type Bot = (n: number, prev: GameState) => InputFrame;

const idle: Bot = () => NO_INPUT;

const MAX_UPDATES = 4000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, seed: number): { ended: boolean; won: boolean; updates: number } {
  let s = createInitialState(GALE_REAVER, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), GALE_REAVER);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Gale Reaver never makes a degenerate fight', () => {
  it('an idle player eventually loses, every fight ending within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

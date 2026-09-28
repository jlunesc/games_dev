import { describe, expect, it } from 'vitest';
import { BRASS_SENTINEL } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';

describe('the Brass Sentinel file', () => {
  it('is loaded, has four attacks and no arena', () => {
    expect(BRASS_SENTINEL).toBeDefined();
    expect(BRASS_SENTINEL.id).toBe('brass-sentinel');
    expect(BRASS_SENTINEL.name).toBe('Brass Sentinel');
    expect(BRASS_SENTINEL.attacks.map((a) => a.id)).toEqual([
      'herald-strike',
      'brass-slam',
      'wide-sweep',
      'charging-bash',
    ]);
    expect(BRASS_SENTINEL.arena).toBeUndefined();
    expect(BRASS_SENTINEL.phases).toHaveLength(1);
  });

  it('is mostly counterable: at least two counterable attacks and one or two mustDodge', () => {
    const counterable = BRASS_SENTINEL.attacks.filter((a) => a.class === 'counterable');
    const mustDodge = BRASS_SENTINEL.attacks.filter((a) => a.class === 'mustDodge');
    expect(counterable.length).toBeGreaterThanOrEqual(2);
    expect(mustDodge.length).toBeGreaterThanOrEqual(1);
    expect(mustDodge.length).toBeLessThanOrEqual(2);
  });

  it('has a generous counter window and range', () => {
    expect(BRASS_SENTINEL.counter.window).toBeGreaterThanOrEqual(14);
    expect(BRASS_SENTINEL.counter.range).toBeGreaterThanOrEqual(220);
  });
});

// ---- The bot check: no degenerate fights ----

type Bot = (n: number, prev: GameState) => InputFrame;

const idle: Bot = () => NO_INPUT;

const MAX_UPDATES = 4000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, seed: number): { ended: boolean; won: boolean; updates: number } {
  let s = createInitialState(BRASS_SENTINEL, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), BRASS_SENTINEL);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Brass Sentinel never makes a degenerate fight', () => {
  it('an idle player eventually loses, every fight ending within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

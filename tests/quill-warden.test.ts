import { describe, expect, it } from 'vitest';
import { QUILL_WARDEN } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';

describe('the Quill Warden file', () => {
  it('is loaded, has three attacks, no arena and exactly one counterable attack', () => {
    expect(QUILL_WARDEN).toBeDefined();
    expect(QUILL_WARDEN.id).toBe('quill-warden');
    expect(QUILL_WARDEN.name).toBe('Quill Warden');
    expect(QUILL_WARDEN.attacks.map((a) => a.id)).toEqual(['reaching-poke', 'low-piercer', 'overextended-thrust']);
    expect(QUILL_WARDEN.arena).toBeUndefined();
    expect(QUILL_WARDEN.attacks.filter((a) => a.class === 'counterable')).toHaveLength(1);
    expect(QUILL_WARDEN.phases).toHaveLength(1);
  });

  it('keeps a much larger spacing than the Duelist, to fight from range', () => {
    expect(QUILL_WARDEN.spacing).toEqual({ min: 350, max: 550 });
  });
});

// ---- The bot check: no degenerate fights, following tests/trainee.test.ts's pattern ----

type Bot = (n: number, prev: GameState) => InputFrame;

const idle: Bot = () => NO_INPUT;

const MAX_UPDATES = 4000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, seed: number): { ended: boolean; won: boolean; updates: number } {
  let s = createInitialState(QUILL_WARDEN, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), QUILL_WARDEN);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Quill Warden never makes a degenerate fight', () => {
  it('an idle player eventually loses, every fight ending within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { TRAINEE } from '../src/bosses';
import { checkFairness } from '../src/bosses/generate/fairness';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';

describe('the Trainee file', () => {
  it('is loaded, has two attacks, no arena and no counterable attack', () => {
    expect(TRAINEE).toBeDefined();
    expect(TRAINEE.id).toBe('trainee');
    expect(TRAINEE.attacks.map((a) => a.id)).toEqual(['swipe', 'charge']);
    expect(TRAINEE.arena).toBeUndefined();
    expect(TRAINEE.attacks.every((a) => a.class === 'mustDodge')).toBe(true);
    expect(TRAINEE.phases).toHaveLength(1);
  });
});

describe('the Trainee is fair (the reusable checker exercised against a hand-built boss)', () => {
  it('passes checkFairness', () => {
    const result = checkFairness(TRAINEE);
    expect(result.reasons).toEqual([]);
    expect(result.fair).toBe(true);
  });
});

// ---- The bot check: no degenerate fights, following tests/ashen-hound.test.ts's pattern ----

type Bot = (n: number, prev: GameState) => InputFrame;

const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

/** Does nothing at all. */
const idle: Bot = () => NO_INPUT;

/**
 * Walks toward the boss, swings when close, and dashes toward the boss whenever a warning starts
 * within 250 units (following `tests/ashen-hound.test.ts`'s `dodger` and `attacker` bots combined,
 * so it both survives and actually deals damage).
 */
const dodger: Bot = (n, prev) => {
  const dx = prev.boss.x - prev.player.x;
  const close = Math.abs(dx) < 90;
  const warned = prev.events.includes('bossWindupGold') || prev.events.includes('bossWindupRed');
  return withInput({
    moveX: close ? 0 : dx > 0 ? 1 : -1,
    attackPressed: close && n % 20 === 0,
    dashPressed: warned && Math.abs(dx) <= 250,
  });
};

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

interface Outcome {
  ended: boolean;
  won: boolean;
  updates: number;
}

function fight(boss: BossDef, bot: Bot, seed: number): Outcome {
  let s = createInitialState(boss, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Trainee never makes a degenerate fight (bots)', () => {
  it('idle always loses, and every fight ends within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(TRAINEE, idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });

  it('a simple dodger wins over a few seeds', () => {
    const seeds = [1, 2, 3, 4, 5];
    const wins = seeds.filter((seed) => fight(TRAINEE, dodger, seed).won);
    expect(wins.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      const r = fight(TRAINEE, dodger, seed);
      expect(r.ended).toBe(true);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { VEIL_DANCER } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { run } from './helpers';
import { updatesWith, windupUpdates } from './boss-helpers';

describe('the Veil Dancer file', () => {
  it('is loaded, has six attacks and no arena', () => {
    expect(VEIL_DANCER).toBeDefined();
    expect(VEIL_DANCER.id).toBe('veil-dancer');
    expect(VEIL_DANCER.name).toBe('Veil Dancer');
    expect(VEIL_DANCER.attacks.map((a) => a.id)).toEqual(['piercing-veil', 'veil-slip', 'needle-fan', 'twin-cut', 'blink-away', 'shadow-cut']);
    expect(VEIL_DANCER.arena).toBeUndefined();
    expect(VEIL_DANCER.phases).toHaveLength(1);
  });

  it('the twin cut is two swings, and the second reaches to both sides', () => {
    const cut = VEIL_DANCER.attacks.find((a) => a.id === 'twin-cut')!;
    expect(cut.hits).toHaveLength(2);
    expect(cut.hits[0]!.both).toBeUndefined();
    expect(cut.hits[1]!.both).toBe(true);
    expect(cut.hits[1]!.from).toBeGreaterThan(cut.hits[0]!.to);
  });
});

/** The Veil Dancer using only attack `id`, from any distance, never walking, restarting one update after the last ends. */
function solo(id: string): BossDef {
  return {
    ...VEIL_DANCER,
    reaction: undefined,
    temper: undefined,
    spacing: { min: 0, max: 1e9 },
    attacks: VEIL_DANCER.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: VEIL_DANCER.phases.map((p) => ({
      ...p,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      combos: [],
      attacks: [{ id, weight: 1 }],
    })),
  };
}

function standAt(boss: BossDef, distance: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

describe("the Veil Dancer's twin cut", () => {
  it('hurts a player who stands still in front of it', () => {
    const boss = solo('twin-cut');
    const states = run(standAt(boss, 100), 200, () => NO_INPUT, boss);
    expect(windupUpdates(states).length).toBeGreaterThan(0);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThan(0);
  });
});

// ---- The bot check: no degenerate fights ----

type Bot = (n: number, prev: GameState) => InputFrame;

const idle: Bot = () => NO_INPUT;

const MAX_UPDATES = 4000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, seed: number): { ended: boolean; won: boolean; updates: number } {
  let s = createInitialState(VEIL_DANCER, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), VEIL_DANCER);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Veil Dancer never makes a degenerate fight', () => {
  it('an idle player eventually loses, every fight ending within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

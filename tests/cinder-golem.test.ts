import { describe, expect, it } from 'vitest';
import { CINDER_GOLEM } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';

describe('the Cinder Golem file', () => {
  it('is loaded, has three attacks, no arena and exactly one counterable attack', () => {
    expect(CINDER_GOLEM).toBeDefined();
    expect(CINDER_GOLEM.id).toBe('cinder-golem');
    expect(CINDER_GOLEM.name).toBe('Cinder Golem');
    expect(CINDER_GOLEM.attacks.map((a) => a.id)).toEqual(['crag-slam', 'ground-charge', 'fault-slam']);
    expect(CINDER_GOLEM.arena).toBeUndefined();
    expect(CINDER_GOLEM.attacks.filter((a) => a.class === 'counterable')).toHaveLength(1);
    expect(CINDER_GOLEM.phases).toHaveLength(1);
  });

  it('is slow, with long wind-ups and long recoveries, matching a heavy bruiser', () => {
    const phase = CINDER_GOLEM.phases[0]!;
    expect(phase.walkSpeed).toBeLessThanOrEqual(260);
    expect(phase.retreatSpeed).toBeLessThanOrEqual(260);
    for (const a of CINDER_GOLEM.attacks) {
      expect(a.windup).toBeGreaterThanOrEqual(40);
      expect(a.recovery).toBeGreaterThanOrEqual(34);
    }
  });

  it('the crag slam and the fault slam cost the player 2 hits', () => {
    const bySlams = CINDER_GOLEM.attacks.filter((a) => a.id === 'crag-slam' || a.id === 'fault-slam');
    for (const a of bySlams) expect(a.damage).toBe(2);
  });
});

// ---- The bot check: no degenerate fights ----

type Bot = (n: number, prev: GameState) => InputFrame;

const idle: Bot = () => NO_INPUT;

const MAX_UPDATES = 4000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(boss: BossDef, bot: Bot, seed: number): { ended: boolean; won: boolean; updates: number } {
  let s = createInitialState(boss, seed);
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick };
}

describe('the Cinder Golem never makes a degenerate fight', () => {
  it('an idle player eventually loses, every fight ending within the cap', () => {
    for (const seed of SEEDS) {
      const r = fight(CINDER_GOLEM, idle, seed);
      expect(r.ended).toBe(true);
      expect(r.won).toBe(false);
      expect(r.updates).toBeLessThanOrEqual(MAX_UPDATES);
    }
  });
});

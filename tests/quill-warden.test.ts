import { describe, expect, it } from 'vitest';
import { QUILL_WARDEN } from '../src/bosses';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import type { BossDef } from '../src/bosses/schema';
import { updatesWith, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';

/** The real Warden using only attack `id`, from any distance, never walking. */
function soloWarden(id: string): BossDef {
  return {
    ...QUILL_WARDEN,
    spacing: { min: 0, max: 1e9 },
    attacks: QUILL_WARDEN.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: QUILL_WARDEN.phases.map((p) => ({ ...p, gap: 1, maxChain: 1, chainChance: 0, combos: [], attacks: [{ id, weight: 1 }] })),
  };
}

function facing(boss: BossDef, distance: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

describe('the Quill Warden file', () => {
  it('is loaded, has six attacks (four melee, an anti-air swipe and a backwards vault), no arena and exactly one counterable attack', () => {
    expect(QUILL_WARDEN).toBeDefined();
    expect(QUILL_WARDEN.id).toBe('quill-warden');
    expect(QUILL_WARDEN.name).toBe('Quill Warden');
    expect(QUILL_WARDEN.attacks.map((a) => a.id)).toEqual([
      'reaching-poke',
      'far-thrust',
      'low-piercer',
      'overextended-thrust',
      'backwards-vault',
      'rising-swipe',
      'snap-piercer',
    ]);
    expect(QUILL_WARDEN.arena).toBeUndefined();
    expect(QUILL_WARDEN.attacks.filter((a) => a.class === 'counterable')).toHaveLength(1);
    expect(QUILL_WARDEN.phases).toHaveLength(2);
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

describe('the Warden\'s two new attacks', () => {
  it('the rising swipe passes over a standing player but hits one who jumps into it', () => {
    const boss = soloWarden('rising-swipe');
    const standing = run(facing(boss, 200), 90, () => NO_INPUT, boss);
    expect(windupUpdates(standing).length).toBeGreaterThan(0);
    expect(updatesWith(standing, 'playerHit')).toEqual([]);
    const first = windupUpdates(standing)[0]!;
    const jumping = run(facing(boss, 200), 90, (n) => withInput({ jumpPressed: n === first + 8, jumpHeld: n >= first + 8 && n < first + 28 }), boss);
    expect(updatesWith(jumping, 'playerHit').length).toBeGreaterThan(0);
  });

  it('the backwards vault never hurts and carries the Warden away from a player next to it', () => {
    const boss = soloWarden('backwards-vault');
    const start = facing(boss, 100);
    const states = run(start, 90, () => NO_INPUT, boss);
    expect(windupUpdates(states).length).toBeGreaterThan(0);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    const away = Math.max(...states.map((s) => s.boss.x - start.boss.x));
    expect(away).toBeGreaterThan(150);
  });
});

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

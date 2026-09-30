import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { cuesFor, type Cue } from '../src/ui/sound/cues';
import { EDGE_PAN, PRIORITY, RECIPES } from '../src/ui/sound/tuning';
import { customBoss, melee } from './boss-helpers';

const blinker: BossDef = customBoss(
  [melee('cut', { blink: { from: 4, to: 12, target: 'player', distance: 80 } })],
  { attacks: [{ id: 'cut', weight: 1 }] },
);

const edgeBoss = (sides: ('left' | 'right' | 'none')[]): BossDef => {
  const attack: AttackDef = melee('volley', {
    windup: 30,
    active: 4,
    recovery: 10,
    hits: [],
    shots: sides.map((side) => ({
      kind: 'bolt' as const,
      at: 30,
      height: 60,
      size: 30,
      speed: 600,
      ...(side === 'none' ? {} : { edge: side }),
    })),
  });
  return customBoss([attack], { attacks: [{ id: 'volley', weight: 1 }] });
};

const voices = (cues: Cue[]): string[] => cues.map((c) => c.voice);

function at(boss: BossDef, attackId: string, tick: number | null): GameState {
  const s = createInitialState(boss, 1);
  if (tick !== null) {
    s.boss.mode = 'attack';
    s.boss.attackId = attackId;
    s.boss.attackTick = tick;
  }
  return s;
}

const played = (boss: BossDef, before: GameState, after: GameState): Cue[] => cuesFor(before, after, asFight(boss));

describe('the new voices', () => {
  it('have a recipe and a priority each, and stay quiet', () => {
    for (const name of ['blockClang', 'blinkOut', 'blinkIn', 'edgeWarn'] as const) {
      expect(RECIPES[name].length).toBeGreaterThan(0);
      expect(PRIORITY[name]).toBeGreaterThan(0);
      expect(PRIORITY[name]).toBeLessThan(PRIORITY.playerHurt);
      for (const part of RECIPES[name]) if ('tone' in part) expect(part.tone).not.toBe('square');
    }
  });
});

describe('cues for a shield', () => {
  it('a blocked hit gives the clang and nothing else', () => {
    const before = createInitialState(blinker, 1);
    const after: GameState = { ...before, events: ['bossBlocked'] as GameEvent[] };
    expect(voices(played(blinker, before, after))).toEqual(['blockClang']);
  });
});

describe('cues for a blink', () => {
  it('shimmers out on the update the boss vanishes and back on the update it returns', () => {
    expect(voices(played(blinker, at(blinker, 'cut', 3), at(blinker, 'cut', 4)))).toContain('blinkOut');
    expect(voices(played(blinker, at(blinker, 'cut', 11), at(blinker, 'cut', 12)))).toContain('blinkIn');
  });

  it('is silent while the boss stays vanished or stays visible', () => {
    for (const [a, b] of [[5, 6], [8, 9], [1, 2], [13, 14]]) {
      const v = voices(played(blinker, at(blinker, 'cut', a!), at(blinker, 'cut', b!)));
      expect(v).not.toContain('blinkOut');
      expect(v).not.toContain('blinkIn');
    }
  });
});

describe('cues for bolts from the side edges', () => {
  const start = (boss: BossDef): Cue[] => played(boss, at(boss, 'volley', null), at(boss, 'volley', 0));

  it('warns once when the attack begins, panned toward the one side', () => {
    const left = start(edgeBoss(['left'])).filter((c) => c.voice === 'edgeWarn');
    const right = start(edgeBoss(['right'])).filter((c) => c.voice === 'edgeWarn');
    expect(left).toHaveLength(1);
    expect(left[0]!.pan).toBeCloseTo(-EDGE_PAN);
    expect(right[0]!.pan).toBeCloseTo(EDGE_PAN);
  });

  it('is centred for a crossfire from both edges', () => {
    const both = start(edgeBoss(['left', 'right'])).filter((c) => c.voice === 'edgeWarn');
    expect(both).toHaveLength(1);
    expect(both[0]!.pan ?? 0).toBe(0);
  });

  it('does not warn for a normal bolt, and not in the middle of the attack', () => {
    expect(voices(start(edgeBoss(['none'])))).not.toContain('edgeWarn');
    const boss = edgeBoss(['left']);
    expect(voices(played(boss, at(boss, 'volley', 9), at(boss, 'volley', 10)))).not.toContain('edgeWarn');
  });
});

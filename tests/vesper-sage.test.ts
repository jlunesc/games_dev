import { describe, expect, it } from 'vitest';
import { VESPER_SAGE, bossById } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DIALS, NORMAL_DIALS, applyDials, presetDials, type Dials } from '../src/game/difficulty';
import { WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { withInput } from './helpers';

type Bot = (n: number, prev: GameState) => InputFrame;

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, boss: BossDef, seed: number) {
  const start = createInitialState(boss, seed);
  let s = start;
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick, damage: start.player.health - s.player.health };
}

/** The Sage using only attack `id` from any distance, never walking, starting a new attack one update after the last. */
function solo(id: string): BossDef {
  return {
    ...VESPER_SAGE,
    spacing: { min: 0, max: 1e9 },
    attacks: VESPER_SAGE.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: VESPER_SAGE.phases.map((p) => ({ ...p, gap: 1, maxChain: 1, chainChance: 0, attacks: [{ id, weight: 1 }] })),
  };
}

function standAt(boss: BossDef, x: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = x;
  s.player.prevX = x;
  return s;
}

describe('the Vesper Sage file', () => {
  it('is loaded and found by id, with four attacks, one cover and two phases', () => {
    expect(VESPER_SAGE.id).toBe('vesper-sage');
    expect(bossById('vesper-sage')).toBe(VESPER_SAGE);
    expect(VESPER_SAGE.attacks.map((a) => a.id)).toEqual(['single-bolt', 'triple-volley', 'lob', 'point-blank-burst']);
    expect(VESPER_SAGE.arena?.covers).toHaveLength(1);
    expect(VESPER_SAGE.phases).toHaveLength(2);
  });

  it('warns for at least 21 updates and marks every attack with shots as must-dodge', () => {
    for (const a of VESPER_SAGE.attacks) {
      expect(a.windup).toBeGreaterThanOrEqual(21);
      if (a.shots !== undefined) expect(a.class).toBe('mustDodge');
    }
  });

  it('survives every dial extreme and is unchanged at Normal', () => {
    expect(applyDials(VESPER_SAGE, NORMAL_DIALS)).toEqual(VESPER_SAGE);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(() => applyDials(VESPER_SAGE, { ...NORMAL_DIALS, [dial.id]: value })).not.toThrow();
      }
    }
    const lowest = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highest = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(VESPER_SAGE, lowest)).not.toThrow();
    expect(() => applyDials(VESPER_SAGE, highest)).not.toThrow();
  });
});

describe('the Sage never makes a degenerate fight', () => {
  it('an idle player always loses, at every preset', () => {
    for (const id of ['easy', 'normal', 'hard'] as const) {
      const boss = applyDials(VESPER_SAGE, presetDials(id));
      for (const seed of SEEDS) {
        const r = fight(() => NO_INPUT, boss, seed);
        expect(r.ended).toBe(true);
        expect(r.won).toBe(false);
      }
    }
  });

  /** Perches on top of the cover (x 590 to 690, 90 high) and never leaves it. */
  const coverCamper: Bot = (_n, prev) => {
    const p = prev.player;
    if (p.onGround && p.y < WORLD.floorY - 85 && p.x >= 590 && p.x <= 690) return NO_INPUT;
    const dx = 640 - p.x;
    return withInput({ moveX: Math.abs(dx) < 8 ? 0 : dx > 0 ? 1 : -1, jumpPressed: p.onGround, jumpHeld: true });
  };

  /** Stands right behind the cover, on the side away from the boss, and never leaves. */
  const hider: Bot = (_n, prev) => {
    const dx = 530 - prev.player.x;
    return withInput({ moveX: Math.abs(dx) < 6 ? 0 : dx > 0 ? 1 : -1 });
  };

  for (const [name, bot] of [
    ['perched on the cover', coverCamper],
    ['hiding behind the cover', hider],
  ] as const) {
    it(`a player ${name} is still hurt and the fight ends`, () => {
      const boss = applyDials(VESPER_SAGE, presetDials('normal'));
      for (const seed of [1, 2, 3, 4]) {
        const r = fight(bot, boss, seed);
        expect(r.damage).toBeGreaterThan(0);
        expect(r.ended).toBe(true);
      }
    });
  }
});

describe('each shot has an answer', () => {
  /** Dashes when a low bolt is about to reach the player. */
  const dashThroughBolts: Bot = (_n, prev) => {
    const p = prev.player;
    const close = prev.shots.some((s) => s.kind === 'bolt' && s.lift < 96 && (p.x - s.x) * s.dir > 0 && (p.x - s.x) * s.dir < 200);
    return withInput({ dashPressed: close });
  };

  it('a dash goes through the single bolt and the low bolts of the volley', () => {
    for (const id of ['single-bolt', 'triple-volley']) {
      const boss = solo(id);
      const idle = analyzeRun(boss, standAt(boss, 800), Array.from({ length: 200 }, () => NO_INPUT));
      expect(idle.attacks[0]!.outcome, `${id} idle`).toBe('hit');
      const frames: InputFrame[] = [];
      let s = standAt(boss, 800);
      for (let n = 0; n < 200; n++) {
        const f = dashThroughBolts(n + 1, s);
        frames.push(f);
        s = step(s, f, boss);
      }
      const a = analyzeRun(boss, standAt(boss, 800), frames);
      expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
    }
  });

  it('the cover stops the single bolt for a player behind it, but not the lob', () => {
    const single = solo('single-bolt');
    const safe = analyzeRun(single, standAt(single, 530), Array.from({ length: 200 }, () => NO_INPUT));
    expect(safe.attacks[0]!.outcome).toBe('dodged');
    const lob = solo('lob');
    const hit = analyzeRun(lob, standAt(lob, 530), Array.from({ length: 200 }, () => NO_INPUT));
    expect(hit.attacks[0]!.outcome).toBe('hit');
  });

  it('stepping off the arc\'s mark avoids the lob', () => {
    const boss = solo('lob');
    const frames = Array.from({ length: 200 }, () => withInput({ moveX: -1 }));
    const a = analyzeRun(boss, standAt(boss, 400), frames);
    expect(a.attacks[0]!.outcome).toBe('dodged');
  });
});

describe('the Sage can be beaten', () => {
  const knower: Bot = (n, prev) => {
    const p = prev.player;
    const b = prev.boss;
    for (const shot of prev.shots) {
      if (shot.kind === 'arc' && Math.abs(p.x - shot.toX) < shot.radius + 50) {
        return withInput({ moveX: p.x >= shot.toX ? 1 : -1 });
      }
    }
    const bolt = prev.shots.some((s) => s.kind === 'bolt' && s.lift < 96 && (p.x - s.x) * s.dir > 0 && (p.x - s.x) * s.dir < 200);
    if (bolt) return withInput({ dashPressed: true });
    if (b.mode === 'attack' && b.attackId === 'point-blank-burst' && b.attackTick + 1 === 20) return withInput({ dashPressed: true });
    const dx = b.x - p.x;
    // The cover is a wall for anyone below its top: hop over it on the way in.
    const hop = dx > 0 && p.x > 500 && p.x < 720;
    return withInput({ moveX: Math.abs(dx) < 90 ? 0 : dx > 0 ? 1 : -1, attackPressed: n % 20 === 0, jumpPressed: hop && p.onGround, jumpHeld: hop });
  };

  it('a player who knows its shots wins at Normal', () => {
    const boss = applyDials(VESPER_SAGE, presetDials('normal'));
    const results = SEEDS.map((seed) => fight(knower, boss, seed));
    // The bot only chases a retreating boss clumsily, so most fights time out; what matters is that it wins some and is barely touched.
    expect(results.some((r) => r.won)).toBe(true);
    expect(Math.max(...results.map((r) => r.damage))).toBeLessThanOrEqual(2);
  });
});

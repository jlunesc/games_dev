import { describe, expect, it } from 'vitest';
import { TREMOR_BRUTE, bossById } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DIALS, NORMAL_DIALS, applyDials, presetDials, type Dials } from '../src/game/difficulty';
import { ERUPTION, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { withInput } from './helpers';

type Bot = (n: number, prev: GameState) => InputFrame;

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function fight(bot: Bot, boss: BossDef, seed: number, startX?: number) {
  const start = createInitialState(boss, seed);
  if (startX !== undefined) {
    start.player.x = startX;
    start.player.prevX = startX;
  }
  let s = start;
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick, damage: start.player.health - s.player.health };
}

/** The Brute using only attack `id` from any distance, never walking, starting a new attack one update after the last. */
function solo(id: string): BossDef {
  return {
    ...TREMOR_BRUTE,
    spacing: { min: 0, max: 1e9 },
    attacks: TREMOR_BRUTE.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: TREMOR_BRUTE.phases.map((p) => ({ ...p, gap: 1, maxChain: 1, chainChance: 0, attacks: [{ id, weight: 1 }] })),
  };
}

function standAt(boss: BossDef, x: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = x;
  s.player.prevX = x;
  return s;
}

describe('the Tremor Brute file', () => {
  it('is loaded and found by id, with four attacks, no arena and two phases', () => {
    expect(TREMOR_BRUTE.id).toBe('tremor-brute');
    expect(bossById('tremor-brute')).toBe(TREMOR_BRUTE);
    expect(TREMOR_BRUTE.attacks.map((a) => a.id)).toEqual(['hammer-fist', 'backhand', 'fissure', 'twin-quake']);
    expect(TREMOR_BRUTE.arena).toBeUndefined();
    expect(TREMOR_BRUTE.phases).toHaveLength(2);
  });

  it('warns for at least 21 updates, marks eruptions with at least 21, and eruption attacks are must-dodge', () => {
    for (const a of TREMOR_BRUTE.attacks) {
      expect(a.windup).toBeGreaterThanOrEqual(21);
      for (const shot of a.shots ?? []) {
        if (shot.kind === 'eruption') {
          expect(shot.delay).toBeGreaterThanOrEqual(21);
          expect(a.class).toBe('mustDodge');
        }
      }
    }
  });

  it('survives every dial extreme and is unchanged at Normal', () => {
    expect(applyDials(TREMOR_BRUTE, NORMAL_DIALS)).toEqual(TREMOR_BRUTE);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(() => applyDials(TREMOR_BRUTE, { ...NORMAL_DIALS, [dial.id]: value })).not.toThrow();
      }
    }
    const lowest = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highest = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(TREMOR_BRUTE, lowest)).not.toThrow();
    expect(() => applyDials(TREMOR_BRUTE, highest)).not.toThrow();
  });
});

describe('the Brute never makes a degenerate fight', () => {
  it('an idle player always loses, at every preset', () => {
    for (const id of ['easy', 'normal', 'hard'] as const) {
      const boss = applyDials(TREMOR_BRUTE, presetDials(id));
      for (const seed of SEEDS) {
        const r = fight(() => NO_INPUT, boss, seed);
        expect(r.ended).toBe(true);
        expect(r.won).toBe(false);
      }
    }
  });

  it('a player who stands still in either corner is hurt and the fight ends', () => {
    const boss = applyDials(TREMOR_BRUTE, presetDials('normal'));
    for (const x of [30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const r = fight(() => NO_INPUT, boss, seed, x);
        expect(r.damage).toBeGreaterThan(0);
        expect(r.ended).toBe(true);
      }
    }
  });
});

describe('each eruption attack has an answer', () => {
  /** Walks to the nearest spot outside every blast area (with a margin) as soon as one is on the floor. */
  const stepOut: Bot = (_n, prev) => {
    const p = prev.player;
    const areas = prev.shots.flatMap((s) => (s.kind === 'eruption' ? [{ left: s.x - s.width / 2 - 40, right: s.x + s.width / 2 + 40 }] : []));
    if (areas.length === 0) return NO_INPUT;
    const inside = (x: number) => areas.some((a) => x > a.left && x < a.right);
    if (!inside(p.x)) return NO_INPUT;
    const spots = areas.flatMap((a) => [a.left, a.right]).filter((x) => x > 30 && x < WORLD.width - 30 && !inside(x));
    if (spots.length === 0) return NO_INPUT;
    const goal = spots.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best));
    return withInput({ moveX: goal > p.x ? 1 : -1 });
  };

  it('stepping out of the marks avoids the fissure and both quakes of the twin quake', () => {
    for (const id of ['fissure', 'twin-quake']) {
      const boss = solo(id);
      const idle = analyzeRun(boss, standAt(boss, 640), Array.from({ length: 200 }, () => NO_INPUT));
      expect(idle.attacks[0]!.outcome, `${id} idle`).toBe('hit');
      const frames: InputFrame[] = [];
      let s = standAt(boss, 640);
      for (let n = 0; n < 200; n++) {
        const f = stepOut(n + 1, s);
        frames.push(f);
        s = step(s, f, boss);
      }
      const a = analyzeRun(boss, standAt(boss, 640), frames);
      expect(a.attacks[0], id).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
    }
  });

  it('a jump does not clear a blast', () => {
    const boss = solo('fissure');
    expect(ERUPTION.height).toBeGreaterThan(200);
    const frames = Array.from({ length: 200 }, (_, i) => withInput({ jumpPressed: i + 1 >= 64 && i + 1 <= 66, jumpHeld: i + 1 >= 64 && i + 1 <= 90 }));
    const a = analyzeRun(boss, standAt(boss, 640), frames);
    expect(a.attacks[0]!.outcome).toBe('hit');
  });
});

describe('the Brute can be beaten', () => {
  const knower: Bot = (n, prev) => {
    const p = prev.player;
    const b = prev.boss;
    const marks = prev.shots.flatMap((s) => (s.kind === 'eruption' ? [{ left: s.x - s.width / 2 - 40, right: s.x + s.width / 2 + 40 }] : []));
    if (marks.length > 0) {
      const inside = (x: number) => marks.some((a) => x > a.left && x < a.right);
      if (inside(p.x)) {
        const spots = marks.flatMap((a) => [a.left, a.right]).filter((x) => x > 30 && x < WORLD.width - 30 && !inside(x));
        if (spots.length > 0) {
          const goal = spots.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best));
          return withInput({ moveX: goal > p.x ? 1 : -1 });
        }
      }
    }
    const away = p.x > b.x ? 1 : -1;
    if (b.mode === 'attack' && b.attackId === 'hammer-fist' && b.attackTick + 1 === 22) return withInput({ dashPressed: true, moveX: away });
    if (b.mode === 'attack' && b.attackId === 'backhand' && b.attackTick + 1 === 16) return withInput({ attackPressed: true });
    const dx = b.x - p.x;
    return withInput({ moveX: Math.abs(dx) < 90 ? 0 : dx > 0 ? 1 : -1, attackPressed: b.mode !== 'attack' && n % 20 === 0 });
  };

  it('a player who knows its attacks wins some fights at Normal, barely touched', () => {
    const boss = applyDials(TREMOR_BRUTE, presetDials('normal'));
    const results = SEEDS.map((seed) => fight(knower, boss, seed));
    expect(results.some((r) => r.won)).toBe(true);
    expect(Math.max(...results.map((r) => r.damage))).toBeLessThanOrEqual(2);
  });
});

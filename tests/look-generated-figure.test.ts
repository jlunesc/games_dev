import { describe, expect, it } from 'vitest';
import { generateBoss } from '../src/bosses/generate/boss';
import type { AttackDef, BossDef, ShotDef } from '../src/bosses/schema';
import { createInitialState, type GameState } from '../src/game/state';
import { bossFigure, type Primitive } from '../src/ui/look/figures';
import { ARMS, BACKS, HEADS, PLANS, TRIMS, figureRecipe } from '../src/ui/look/generated-figure';
import { bossDrawBox } from '../src/ui/look/pose';
import { LOOK } from '../src/ui/look/tuning';
import { DUELIST } from './helpers';

const BOLT: ShotDef = { kind: 'bolt', at: 20, height: 40, size: 14, speed: 300 };
const ERUPTION: ShotDef = { kind: 'eruption', at: 20, offset: 0, width: 60, delay: 30, burst: 10 };

/** The Duelist with every attack given the same extra, to test how the attacks tilt the recipe. */
function withEvery(extra: Partial<AttackDef>): BossDef {
  return { ...DUELIST, attacks: DUELIST.attacks.map((a) => ({ ...a, ...extra })) };
}
const plain = withEvery({ shots: undefined, leap: undefined, move: undefined });
const casters = withEvery({ shots: [BOLT] });
const erupters = withEvery({ shots: [ERUPTION] });

function count<T>(seeds: number, pick: (seed: number) => T, want: T): number {
  let n = 0;
  for (let s = 1; s <= seeds; s++) if (pick(s) === want) n++;
  return n;
}

describe('figureRecipe', () => {
  it('is the same for the same seed and boss', () => {
    const boss = generateBoss(7);
    expect(figureRecipe(7, boss)).toEqual(figureRecipe(7, boss));
  });

  it('gives many different looks over many seeds and uses every option', () => {
    const seen = new Set<string>();
    const plans = new Set<string>();
    const heads = new Set<string>();
    const arms = new Set<string>();
    const backs = new Set<string>();
    const trims = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const r = figureRecipe(seed, generateBoss(seed));
      seen.add(JSON.stringify(r));
      plans.add(r.plan);
      heads.add(r.head);
      arms.add(r.arm);
      backs.add(r.back);
      trims.add(r.trim);
    }
    expect(seen.size).toBeGreaterThan(150);
    expect(plans.size).toBe(PLANS.length);
    expect(heads.size).toBe(HEADS.length);
    expect(arms.size).toBe(ARMS.length);
    expect(backs.size).toBe(BACKS.length);
    expect(trims.size).toBe(TRIMS.length);
  });

  it('leans towards caster parts for a boss of shots and eruption parts for a boss of eruptions', () => {
    const n = 400;
    const of = (boss: BossDef) => (s: number) => figureRecipe(s, boss);
    expect(count(n, (s) => of(casters)(s).plan, 'wisp')).toBeGreaterThan(count(n, (s) => of(plain)(s).plan, 'wisp'));
    expect(count(n, (s) => of(casters)(s).back, 'orbs')).toBeGreaterThan(count(n, (s) => of(plain)(s).back, 'orbs'));
    expect(count(n, (s) => of(erupters)(s).back, 'spines')).toBeGreaterThan(
      count(n, (s) => of(plain)(s).back, 'spines'),
    );
    expect(count(n, (s) => of(erupters)(s).head, 'crown')).toBeGreaterThan(
      count(n, (s) => of(plain)(s).head, 'crown'),
    );
  });

  it('still lets the seed decide: a boss of shots is not always a wisp', () => {
    expect(count(400, (s) => figureRecipe(s, casters).plan, 'wisp')).toBeLessThan(400 * 0.6);
  });
});

const COLORS = { body: '#3a6ea5', accent: '#e8a23a', glow: null as string | null };
const MARGIN = 24;

function extremes(p: Primitive): { xs: number[]; ys: number[] } {
  if (p.kind === 'rect') return { xs: [p.x, p.x + p.w], ys: [p.y, p.y + p.h] };
  if (p.kind === 'circle') return { xs: [p.x - p.r, p.x + p.r], ys: [p.y - p.r, p.y + p.r] };
  return { xs: p.points.map((q) => q[0]), ys: p.points.map((q) => q[1]) };
}

function bounds(list: Primitive[]): { l: number; r: number; t: number; b: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of list) {
    const e = extremes(p);
    xs.push(...e.xs);
    ys.push(...e.ys);
  }
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

const fightState = (seed: number, tick: number): GameState => ({
  ...createInitialState(generateBoss(seed), seed),
  tick,
});

describe('generated figures', () => {
  it('draw inside the box, fill most of it and respect the shape cap, for 200 seeds and both facings', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const boss = generateBoss(seed);
      for (const facing of [1, -1] as const) {
        for (const tick of [0, 13, 57]) {
          const s = fightState(seed, tick);
          const state: GameState = { ...s, boss: { ...s.boss, facing } };
          const shapes = bossFigure(state, boss, COLORS);
          expect(shapes.length).toBeLessThanOrEqual(LOOK.genFigure.maxShapes);
          const box = bossDrawBox(state.boss, boss);
          const cx = state.boss.x;
          const b = bounds(shapes);
          expect(b.l, `seed ${seed} left`).toBeGreaterThanOrEqual(cx - boss.width / 2 - MARGIN);
          expect(b.r, `seed ${seed} right`).toBeLessThanOrEqual(cx + boss.width / 2 + MARGIN);
          expect(b.t, `seed ${seed} top`).toBeGreaterThanOrEqual(box.top - MARGIN);
          expect(b.b, `seed ${seed} bottom`).toBeLessThanOrEqual(box.top + box.height + MARGIN);
          expect(b.r - b.l, `seed ${seed} fills width`).toBeGreaterThanOrEqual(boss.width * 0.6);
          expect(b.b - b.t, `seed ${seed} fills height`).toBeGreaterThanOrEqual(box.height * 0.75);
        }
      }
    }
  });

  it('is deterministic: the same state gives the same shapes', () => {
    const boss = generateBoss(11);
    const state = fightState(11, 30);
    expect(bossFigure(state, boss, COLORS)).toEqual(bossFigure(state, boss, COLORS));
  });

  it('mirrors when the boss faces the other way', () => {
    for (const seed of [5, 6, 7, 8, 9, 10]) {
      const boss = generateBoss(seed);
      const s = fightState(seed, 20);
      const right = bossFigure({ ...s, boss: { ...s.boss, facing: 1 } }, boss, COLORS);
      const left = bossFigure({ ...s, boss: { ...s.boss, facing: -1 } }, boss, COLORS);
      const cx = s.boss.x;
      expect(left.length).toBe(right.length);
      right.forEach((p, i) => {
        const a = extremes(p);
        const b = extremes(left[i]!);
        const mirroredXs = a.xs.map((x) => 2 * cx - x).sort((u, v) => u - v);
        const leftXs = b.xs.slice().sort((u, v) => u - v);
        mirroredXs.forEach((x, k) => expect(x).toBeCloseTo(leftXs[k]!, 5));
        a.ys.forEach((y, k) => expect(y).toBeCloseTo(b.ys[k]!, 5));
      });
    }
  });

  it('changes the drawing while an attack winds up (the pose arm shows)', () => {
    const boss = generateBoss(9);
    const attack = boss.attacks[0]!;
    const s = fightState(9, 40);
    const idle = bossFigure(s, boss, COLORS);
    const winding = bossFigure(
      { ...s, boss: { ...s.boss, mode: 'attack', attackId: attack.id, attackTick: 4 } },
      boss,
      COLORS,
    );
    expect(JSON.stringify(winding)).not.toBe(JSON.stringify(idle));
  });

  it('does not depend on the seed for a hand-built boss', () => {
    expect(bossFigure(createInitialState(DUELIST, 1), DUELIST, COLORS)).toEqual(
      bossFigure(createInitialState(DUELIST, 999), DUELIST, COLORS),
    );
  });
});

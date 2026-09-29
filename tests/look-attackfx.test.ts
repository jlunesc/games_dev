import { describe, expect, it } from 'vitest';
import { BRASS_SENTINEL, CINDER_GOLEM, GALE_REAVER, QUILL_WARDEN, VEIL_DANCER } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import type { Box } from '../src/game/geometry';
import { WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { boltTrail, slashKind, slashShape } from '../src/ui/look/attackfx';
import { bossFigure, type Primitive } from '../src/ui/look/figures';
import { BOSS_COLORS } from '../src/ui/look/pose';
import { landingRing, landingSpans } from '../src/ui/render';

const points = (p: Primitive): [number, number][] =>
  p.kind === 'poly' ? p.points : p.kind === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y + p.h]] : [[p.x - p.r, p.y - p.r], [p.x + p.r, p.y + p.r]];

const floorBox = (w: number, h: number): Box => ({ x: 500, y: WORLD.floorY - h, w, h });

describe('the shape of a strike', () => {
  it('picks spikes for a low box on the floor, a spear for a long thin one and a crescent for a tall one', () => {
    expect(slashKind(floorBox(190, 70))).toBe('spikes');
    expect(slashKind({ x: 500, y: 400, w: 400, h: 60 })).toBe('spear');
    expect(slashKind(floorBox(170, 190))).toBe('crescent');
    expect(slashKind(floorBox(200, 100))).toBe('crescent');
  });

  const boxes: Box[] = [floorBox(190, 70), { x: 500, y: 400, w: 400, h: 60 }, floorBox(170, 190), floorBox(150, 110)];

  it('always stays inside the real hit box, on either side of the boss', () => {
    for (const box of boxes) {
      for (const side of [1, -1] as const) {
        const shape = slashShape(box, side);
        expect(shape.length).toBeGreaterThan(0);
        for (const p of shape) {
          for (const [x, y] of points(p)) {
            expect(x).toBeGreaterThanOrEqual(box.x - 1e-6);
            expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
            expect(y).toBeGreaterThanOrEqual(box.y - 1e-6);
            expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
          }
        }
      }
    }
  });

  it('points away from the boss: the far tip of a spear is on the side away from it', () => {
    const box: Box = { x: 500, y: 400, w: 400, h: 60 };
    const right = slashShape(box, 1)[0]!;
    const left = slashShape(box, -1)[0]!;
    expect(Math.max(...points(right).map(([x]) => x))).toBeCloseTo(900);
    expect(Math.min(...points(left).map(([x]) => x))).toBeCloseTo(500);
  });

  it('draws nothing for a box with no size', () => {
    expect(slashShape({ x: 0, y: 0, w: 0, h: 10 }, 1)).toEqual([]);
  });
});

describe('a bolt trail', () => {
  it('is flat for a level bolt and slants for a falling one', () => {
    const flat = points(boltTrail(500, 300, 1, 600, 0, 30, '#fff'));
    expect(new Set(flat.map(([, y]) => Math.round(y * 1000))).size).toBe(2);
    expect(Math.min(...flat.map(([x]) => x))).toBeLessThan(500);
    const falling = points(boltTrail(500, 300, 1, 600, -300, 30, '#fff'));
    expect(Math.max(...falling.map(([, y]) => y))).toBeLessThan(300 + 15);
    const diving = boltTrail(500, 300, 1, 600, -300, 30, '#fff');
    const tail = (diving as { points: [number, number][] }).points[1]!;
    expect(tail[1]).toBeLessThan(300);
  });
});

const bosses: [string, BossDef][] = [
  ['Quill Warden', QUILL_WARDEN],
  ['Cinder Golem', CINDER_GOLEM],
  ['Veil Dancer', VEIL_DANCER],
  ['Gale Reaver', GALE_REAVER],
  ['Brass Sentinel', BRASS_SENTINEL],
];

describe('the signs on a winding-up boss', () => {
  const attacking = (boss: BossDef, id: string, tick: number): GameState => {
    const s = createInitialState(boss, 1);
    return { ...s, boss: { ...s.boss, mode: 'attack', attackId: id, attackTick: tick, facing: 1, x: 700 } };
  };
  const colors = { body: BOSS_COLORS.red, accent: BOSS_COLORS.red, glow: BOSS_COLORS.red };
  const count = (boss: BossDef, id: string): number => {
    const a = boss.attacks.find((x) => x.id === id)!;
    return bossFigure(attacking(boss, id, a.windup - 1), boss, colors).length;
  };
  const idle = (boss: BossDef, id: string): number => {
    const s = attacking(boss, id, 0);
    return bossFigure({ ...s, boss: { ...s.boss, mode: 'gap', attackId: null } }, boss, colors).length;
  };

  it('add shapes for shots, both sides and hovering, and none for a plain melee attack', () => {
    expect(count(QUILL_WARDEN, 'feather-volley')).toBe(count(QUILL_WARDEN, 'reaching-poke') + 3);
    expect(count(QUILL_WARDEN, 'sky-lance')).toBeGreaterThan(idle(QUILL_WARDEN, 'sky-lance'));
    expect(count(BRASS_SENTINEL, 'spin-cycle')).toBeGreaterThan(count(BRASS_SENTINEL, 'wide-sweep'));
  });

  it('are gone when the attack is over', () => {
    for (const [, boss] of bosses) {
      for (const a of boss.attacks) {
        const s = attacking(boss, a.id, a.windup + a.active + 2);
        const after = bossFigure(s, boss, colors).length;
        const walking = bossFigure({ ...s, boss: { ...s.boss, mode: 'gap', attackId: null } }, boss, colors).length;
        expect(after).toBeLessThanOrEqual(walking + 6);
      }
    }
  });
});

describe('where a leap with a strike on both sides lands', () => {
  it('shows a landing span on each side', () => {
    const boss = VEIL_DANCER;
    const veil = boss.attacks.find((a) => a.id === 'falling-veil')!;
    const s = createInitialState(boss, 1);
    const b = { ...s.boss, mode: 'attack' as const, attackId: veil.id, attackTick: veil.leap!.from + 3, leapToX: 400, facing: -1 as const };
    const ring = landingRing(b, boss)!;
    expect(ring.both).toBe(true);
    const spans = landingSpans(ring);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.right).toBeLessThanOrEqual(400);
    expect(spans[1]!.left).toBeGreaterThanOrEqual(400);
  });

  it('shows one span for a one-sided strike', () => {
    const boss = QUILL_WARDEN;
    const lance = boss.attacks.find((a) => a.id === 'sky-lance')!;
    const s = createInitialState(boss, 1);
    const ring = landingRing({ ...s.boss, mode: 'attack', attackId: lance.id, attackTick: lance.leap!.from + 3, leapToX: 400 }, boss)!;
    expect(ring.both).toBeUndefined();
    expect(landingSpans(ring)).toHaveLength(1);
  });
});

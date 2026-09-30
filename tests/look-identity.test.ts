import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { EMBER, WORLD } from '../src/game/params';
import { createInitialState, type EruptionState } from '../src/game/state';
import { NO_FEEDBACK } from '../src/ui/feedback';
import { NO_EFFECTS, spawnEffects } from '../src/ui/look/effects';
import {
  blinkMark,
  edgeArrow,
  edgeWarnings,
  emberSpan,
  emberTongues,
  shieldPlate,
  temperGlow,
} from '../src/ui/look/identityfx';
import { attackPalette } from '../src/ui/look/attackfx';
import type { Primitive } from '../src/ui/look/figures';
import { LOOK } from '../src/ui/look/tuning';
import { bossFigure } from '../src/ui/look/figures';
import { drawFrame } from '../src/ui/render';
import { attackBox } from '../src/game/geometry';
import { customBoss, melee } from './boss-helpers';

const xs = (p: Primitive): number[] =>
  p.kind === 'poly' ? p.points.map((pt) => pt[0]) : p.kind === 'rect' ? [p.x, p.x + p.w] : [p.x - p.r, p.x + p.r];
const ys = (p: Primitive): number[] =>
  p.kind === 'poly' ? p.points.map((pt) => pt[1]) : p.kind === 'rect' ? [p.y, p.y + p.h] : [p.y - p.r, p.y + p.r];

const blinker: BossDef = customBoss(
  [melee('cut', { blink: { from: 4, to: 12, target: 'player', distance: 80 } })],
  { attacks: [{ id: 'cut', weight: 1 }] },
);

const volley: AttackDef = melee('volley', {
  windup: 30,
  active: 4,
  recovery: 10,
  hits: [],
  shots: [
    { kind: 'bolt', at: 30, height: 100, size: 30, speed: 600, edge: 'left' },
    { kind: 'bolt', at: 30, height: 40, size: 30, speed: 600, edge: 'right' },
    { kind: 'bolt', at: 30, height: 40, size: 30, speed: 600 },
  ],
});
const shooter: BossDef = customBoss([volley], { attacks: [{ id: 'volley', weight: 1 }] });

const shielded: BossDef = customBoss([melee('swing')], { attacks: [{ id: 'swing', weight: 1 }] }, { shield: { turnTicks: 40 } });

describe('blinkMark', () => {
  it('shows the landing spot only while the boss is vanished', () => {
    const s = createInitialState(blinker, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'cut';
    s.boss.blinkToX = 520;
    s.boss.attackTick = 6;
    expect(blinkMark(s.boss, blinker)).toEqual({ x: 520, width: blinker.width });
    s.boss.attackTick = 2;
    expect(blinkMark(s.boss, blinker)).toBeNull();
    s.boss.attackTick = 12;
    s.boss.blinkToX = null;
    expect(blinkMark(s.boss, blinker)).toBeNull();
  });
});

describe('edgeWarnings and edgeArrow', () => {
  const at = (attackTick: number) => {
    const s = createInitialState(shooter, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'volley';
    s.boss.attackTick = attackTick;
    return s.boss;
  };

  it('lists one warning per edge bolt still to come, and none for a normal bolt', () => {
    const w = edgeWarnings(at(10), shooter);
    expect(w.map((x) => x.side).sort()).toEqual(['left', 'right']);
    expect(w.find((x) => x.side === 'left')!.height).toBe(100);
    expect(w.find((x) => x.side === 'left')!.charge).toBeCloseTo(10 / 30);
  });

  it('is empty once the bolts have left, when idle, and for a boss without edge bolts', () => {
    expect(edgeWarnings(at(30), shooter)).toEqual([]);
    expect(edgeWarnings(createInitialState(shooter, 1).boss, shooter)).toEqual([]);
    expect(edgeWarnings(createInitialState(blinker, 1).boss, blinker)).toEqual([]);
  });

  it('draws an arrow inside the arena at the right edge, pointing inward, brighter as the bolt gets close', () => {
    const w = edgeWarnings(at(10), shooter);
    const left = edgeArrow(w.find((x) => x.side === 'left')!, 0);
    const right = edgeArrow(w.find((x) => x.side === 'right')!, 0);
    for (const x of left.primitives.flatMap(xs)) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of right.primitives.flatMap(xs)) expect(x).toBeLessThanOrEqual(WORLD.width);
    const tip = (p: Primitive) => (p.kind === 'poly' ? p.points[1]![0] : NaN);
    expect(tip(left.primitives[0]!)).toBeGreaterThan(xs(left.primitives[0]!)[0]!);
    expect(tip(right.primitives[0]!)).toBeLessThan(xs(right.primitives[0]!)[0]!);
    const near = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.9 }, 0);
    const far = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.1 }, 0);
    expect(near.alpha).toBeGreaterThan(far.alpha);
  });

  it('is centred where the bolt will fly', () => {
    const arrow = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.5 }, 0);
    const cy = WORLD.floorY - 100 - 15;
    const all = arrow.primitives.flatMap(ys);
    expect((Math.min(...all) + Math.max(...all)) / 2).toBeCloseTo(cy);
  });
});

describe('emberSpan and emberTongues', () => {
  const eruption = (age: number, linger: number | undefined): EruptionState => ({
    kind: 'eruption',
    attackId: 'e',
    originTick: 0,
    x: 600,
    lift: 0,
    age,
    width: 200,
    delay: 30,
    burst: 10,
    ...(linger === undefined ? {} : { linger }),
  });

  it('exists only in the stretch after the blast, and only with a linger', () => {
    expect(emberSpan(eruption(39, 60))).toBeNull();
    expect(emberSpan(eruption(40, 60))).toEqual({ left: 500, right: 700 });
    expect(emberSpan(eruption(99, 60))).not.toBeNull();
    expect(emberSpan(eruption(100, 60))).toBeNull();
    expect(emberSpan(eruption(60, undefined))).toBeNull();
  });

  it('draws flames that stay inside the real ember box and never more than the cap', () => {
    const palette = attackPalette('');
    for (const width of [40, 200, 1200]) {
      const span = { left: 300, right: 300 + width };
      for (const tick of [0, 3, 7, 11]) {
        const shapes = emberTongues(span, tick, palette);
        expect(shapes.length).toBeGreaterThan(0);
        expect(shapes.length).toBeLessThanOrEqual(LOOK.ember.maxTongues + 1);
        for (const p of shapes) {
          for (const x of xs(p)) {
            expect(x).toBeGreaterThanOrEqual(span.left - 1e-9);
            expect(x).toBeLessThanOrEqual(span.right + 1e-9);
          }
          for (const y of ys(p)) {
            expect(y).toBeGreaterThanOrEqual(WORLD.floorY - EMBER.height - 1e-9);
            expect(y).toBeLessThanOrEqual(WORLD.floorY + 1e-9);
          }
        }
      }
    }
  });

  it('flickers from one moment to the next', () => {
    const span = { left: 300, right: 500 };
    const palette = attackPalette('');
    expect(JSON.stringify(emberTongues(span, 0, palette))).not.toBe(JSON.stringify(emberTongues(span, LOOK.ember.flickerTicks, palette)));
  });
});

describe('shieldPlate', () => {
  const state = () => {
    const s = createInitialState(shielded, 1);
    s.boss.x = 800;
    s.boss.mode = 'gap';
    return s;
  };

  it('is a plate in front of the boss, on the side it faces, while the shield is up', () => {
    for (const facing of [1, -1] as const) {
      const s = state();
      s.boss.facing = facing;
      const plate = shieldPlate(s.boss, shielded);
      expect(plate.length).toBeGreaterThan(0);
      for (const p of plate) {
        for (const x of xs(p)) {
          if (facing === 1) expect(x).toBeGreaterThanOrEqual(800 + shielded.width / 2);
          else expect(x).toBeLessThanOrEqual(800 - shielded.width / 2);
        }
      }
    }
  });

  it('is gone when the shield is down, and never drawn for a boss without one', () => {
    const s = state();
    s.boss.mode = 'stagger';
    expect(shieldPlate(s.boss, shielded)).toEqual([]);
    const plain = createInitialState(blinker, 1);
    expect(shieldPlate(plain.boss, blinker)).toEqual([]);
  });
});

describe('temperGlow', () => {
  it('is nothing for a calm boss and grows to the maximum as the boss gets angrier', () => {
    expect(temperGlow(0)).toBe(0);
    expect(temperGlow(LOOK.temper.from)).toBe(0);
    expect(temperGlow(0.7)).toBeGreaterThan(0);
    expect(temperGlow(0.7)).toBeLessThan(temperGlow(1));
    expect(temperGlow(1)).toBeCloseTo(LOOK.temper.alphaMax);
  });
});

describe('the block spark', () => {
  it('a blocked hit gives sparks and a ring at the swing, and no more than a normal hit does', () => {
    const before = createInitialState(shielded, 1);
    const after = structuredClone(before);
    after.events = ['bossBlocked'];
    const fx = spawnEffects(NO_EFFECTS, before, after, shielded, true);
    const c = attackBox(after.player);
    const sparks = fx.particles.filter((p) => p.kind === 'spark');
    expect(sparks).toHaveLength(LOOK.sparksOnBlock);
    expect(sparks[0]!.x).toBe(c.x + c.w / 2);
    expect(sparks[0]!.color).toBe(LOOK.block);
    expect(fx.rings).toHaveLength(1);
    expect(LOOK.sparksOnBlock).toBeLessThanOrEqual(LOOK.sparksOnBossHit);
  });
});

/** A stand-in canvas that notes each call and the fill colour at that moment. */
function recorder() {
  const calls: { name: string; fillStyle: unknown }[] = [];
  const props: Record<string, unknown> = { fillStyle: '', globalAlpha: 1, strokeStyle: '' };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return () => {
        calls.push({ name: key, fillStyle: target.fillStyle });
        if (key === 'createLinearGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('drawFrame with the new mechanics', () => {
  it('draws the blink mark and no boss body while the boss is vanished', () => {
    const s = createInitialState(blinker, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'cut';
    s.boss.attackTick = 6;
    s.boss.blinkToX = 520;
    const f = recorder();
    expect(() => drawFrame(f.ctx, 1280, 720, s, blinker, 0.5, NO_FEEDBACK)).not.toThrow();
    expect(f.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.blink.color)).toBe(true);
  });

  it('draws flame tongues for an ember and the shield plate for a shielded boss', () => {
    const embers = createInitialState(blinker, 1);
    embers.shots.push({
      kind: 'eruption', attackId: 'e', originTick: 0, x: 600, lift: 0, age: 50, width: 200, delay: 30, burst: 10, linger: 60,
    });
    const f = recorder();
    drawFrame(f.ctx, 1280, 720, embers, blinker, 0.5, NO_FEEDBACK);
    expect(f.calls.some((c) => c.name === 'fill' && c.fillStyle === LOOK.shot.eruptionCore)).toBe(true);

    const s = createInitialState(shielded, 1);
    s.boss.mode = 'gap';
    const g = recorder();
    drawFrame(g.ctx, 1280, 720, s, shielded, 0.5, NO_FEEDBACK);
    expect(g.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.shield.edge)).toBe(true);
  });
});

describe('the wind-up signs for edge bolts', () => {
  const colors = { body: '#000', accent: '#111', glow: null };
  const winding = (boss: BossDef, id: string) => {
    const s = createInitialState(boss, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = id;
    s.boss.attackTick = 10;
    return s;
  };

  it('show no muzzle pip for a bolt that comes from the arena edge, only for one that leaves the boss', () => {
    const edgeOnly: AttackDef = { ...volley, shots: volley.shots!.filter((x) => x.kind === 'bolt' && x.edge !== undefined) };
    const none: AttackDef = { ...volley, shots: [] };
    const normal: AttackDef = { ...volley, shots: volley.shots!.filter((x) => x.kind === 'bolt' && x.edge === undefined) };
    const figure = (a: AttackDef) => {
      const boss = customBoss([a], { attacks: [{ id: a.id, weight: 1 }] }, { id: 'quill-warden' });
      return bossFigure(winding(boss, a.id), boss, colors);
    };
    expect(figure(edgeOnly)).toEqual(figure(none));
    expect(figure(normal)).not.toEqual(figure(none));
  });
});

describe('the shield in a fight with a partner', () => {
  it('is not drawn where it does not block', () => {
    const s = createInitialState(shielded, 1);
    s.boss.mode = 'gap';
    s.partners.push(structuredClone(s.boss));
    const g = recorder();
    drawFrame(g.ctx, 1280, 720, s, shielded, 0.5, NO_FEEDBACK);
    expect(g.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.shield.edge)).toBe(false);
  });
});

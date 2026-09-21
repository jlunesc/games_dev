import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD } from '../src/game/params';
import { LOOK } from '../src/ui/look/tuning';
import { MOODS, type LayerDef } from '../src/ui/look/moods';
import { createBackground, drawBackground, emberPositions, layerShapes } from '../src/ui/look/background';

const WIDTH = WORLD.width + 2 * LOOK.layerMargin;

function layer(shape: LayerDef['shape'], seed: number, heightFraction = 0.5): LayerDef {
  return { shape, color: '#123456', speed: 10, heightFraction, seed };
}

describe('layerShapes', () => {
  for (const shape of ['pillars', 'ridge', 'spires'] as const) {
    describe(shape, () => {
      it('is the same for the same layer, and different for a different seed', () => {
        expect(layerShapes(layer(shape, 5), WIDTH)).toEqual(layerShapes(layer(shape, 5), WIDTH));
        expect(layerShapes(layer(shape, 5), WIDTH)).not.toEqual(layerShapes(layer(shape, 6), WIDTH));
      });

      it('stays inside the width and under the height bound', () => {
        for (const seed of [1, 2, 3, 99, 12345]) {
          const def = layer(shape, seed, 0.6);
          const shapes = layerShapes(def, WIDTH);
          expect(shapes.length).toBeGreaterThan(2);
          for (const s of shapes) {
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.x + s.w).toBeLessThanOrEqual(WIDTH + 1e-6);
            expect(s.w).toBeGreaterThan(0);
            expect(s.h).toBeGreaterThan(0);
            expect(s.h).toBeLessThanOrEqual(def.heightFraction * WORLD.height + 1e-6);
          }
        }
      });

      it('has a bounded number of shapes', () => {
        for (const seed of [1, 2, 3, 99, 12345]) {
          expect(layerShapes(layer(shape, seed), WIDTH).length).toBeLessThanOrEqual(48);
        }
      });

      it('is in left-to-right order without overlapping (pillars, spires)', () => {
        if (shape === 'ridge') return;
        const shapes = layerShapes(layer(shape, 7), WIDTH);
        for (let i = 1; i < shapes.length; i++) {
          expect(shapes[i]!.x).toBeGreaterThanOrEqual(shapes[i - 1]!.x + shapes[i - 1]!.w);
        }
      });
    });
  }

  it('makes ridges that cover the whole width with no gap and base at both ends', () => {
    for (const seed of [1, 2, 3, 99]) {
      const shapes = layerShapes(layer('ridge', seed), WIDTH);
      expect(shapes[0]!.x).toBe(0);
      const last = shapes[shapes.length - 1]!;
      expect(last.x + last.w).toBeCloseTo(WIDTH, 6);
      for (let i = 1; i < shapes.length; i++) {
        expect(shapes[i]!.x).toBeLessThanOrEqual(shapes[i - 1]!.x + shapes[i - 1]!.w + 1e-6);
      }
    }
  });

  it('keeps pillars and spires off the pattern edges so the wrap has no cut shape', () => {
    for (const shape of ['pillars', 'spires'] as const) {
      const shapes = layerShapes(layer(shape, 4), WIDTH);
      expect(shapes[0]!.x).toBeGreaterThan(0);
      const last = shapes[shapes.length - 1]!;
      expect(last.x + last.w).toBeLessThan(WIDTH);
    }
  });

  it('makes spires thinner than pillars', () => {
    const avg = (l: LayerDef) => {
      const s = layerShapes(l, WIDTH);
      return s.reduce((a, b) => a + b.w, 0) / s.length;
    };
    expect(avg(layer('spires', 3))).toBeLessThan(avg(layer('pillars', 3)));
  });
});

describe('emberPositions', () => {
  const mood = MOODS['ember-duelist']!;

  it('depends only on the mood, the tick and the count', () => {
    expect(emberPositions(mood, 123, 10)).toEqual(emberPositions(mood, 123, 10));
  });

  it('gives the count asked for', () => {
    expect(emberPositions(mood, 0, 7)).toHaveLength(7);
    expect(emberPositions(mood, 0, 0)).toHaveLength(0);
  });

  it('stays inside the world, with alpha in [0, 1] and a positive size', () => {
    for (const tick of [0, 1, 59, 600, 12345, 999999]) {
      for (const e of emberPositions(mood, tick, LOOK.emberCount)) {
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x).toBeLessThanOrEqual(WORLD.width);
        expect(e.y).toBeGreaterThanOrEqual(0);
        expect(e.y).toBeLessThanOrEqual(WORLD.height);
        expect(e.alpha).toBeGreaterThanOrEqual(0);
        expect(e.alpha).toBeLessThanOrEqual(1);
        expect(e.size).toBeGreaterThanOrEqual(LOOK.emberSizeMin);
        expect(e.size).toBeLessThanOrEqual(LOOK.emberSizeMax);
      }
    }
  });

  it('moves as the tick advances, rising', () => {
    const a = emberPositions(mood, 100, 10);
    const b = emberPositions(mood, 101, 10);
    expect(b).not.toEqual(a);
    // Embers rise (y shrinks) except when one wraps from the top back to the bottom.
    const rising = a.filter((e, i) => b[i]!.y < e.y).length;
    expect(rising).toBeGreaterThanOrEqual(8);
  });

  it('spreads the embers out rather than stacking them', () => {
    const xs = new Set(emberPositions(mood, 0, 10).map((e) => Math.round(e.x)));
    expect(xs.size).toBeGreaterThan(5);
  });
});

describe('createBackground', () => {
  it('returns null when there is no document', () => {
    expect(typeof document).toBe('undefined');
    expect(createBackground(MOODS.neutral!)).toBeNull();
  });
});

/** A recording stand-in for the parts of a 2D context the background uses. */
function fakeContext() {
  const calls: string[] = [];
  let depth = 0;
  let minDepth = 0;
  const rec = (name: string) => (..._args: unknown[]) => {
    calls.push(name);
  };
  const ctx = {
    fillStyle: '' as unknown,
    globalAlpha: 1,
    save() {
      calls.push('save');
      depth++;
    },
    restore() {
      calls.push('restore');
      depth--;
      minDepth = Math.min(minDepth, depth);
    },
    createLinearGradient() {
      calls.push('createLinearGradient');
      return { addColorStop: rec('addColorStop') };
    },
    fillRect: rec('fillRect'),
    beginPath: rec('beginPath'),
    arc: rec('arc'),
    fill: rec('fill'),
    drawImage: rec('drawImage'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, balance: () => depth, minDepth: () => minDepth };
}

describe('drawBackground', () => {
  const mood = MOODS['ember-duelist']!;

  it('draws a plain gradient sky with no layers when there is no cache, and stays balanced', () => {
    const f = fakeContext();
    expect(() => drawBackground(f.ctx, mood, null, 0, false)).not.toThrow();
    expect(f.calls).toContain('createLinearGradient');
    expect(f.calls).toContain('fillRect');
    expect(f.calls).not.toContain('drawImage');
    expect(f.balance()).toBe(0);
    expect(f.minDepth()).toBe(0);
  });

  it('draws embers only when motion is on', () => {
    const still = fakeContext();
    drawBackground(still.ctx, mood, null, 500, false);
    expect(still.calls).not.toContain('arc');
    const moving = fakeContext();
    drawBackground(moving.ctx, mood, null, 500, true);
    expect(moving.calls.filter((c) => c === 'arc')).toHaveLength(LOOK.emberCount);
    expect(moving.balance()).toBe(0);
    expect(moving.minDepth()).toBe(0);
  });

  it('fills at least the world plus the shake margin', () => {
    const rects: number[][] = [];
    const f = fakeContext();
    (f.ctx as unknown as { fillRect: (...a: number[]) => void }).fillRect = (...a) => rects.push(a);
    drawBackground(f.ctx, mood, null, 0, false);
    const covers = rects.some(([x, y, w, h]) => x! <= -8 && y! <= -8 && x! + w! >= WORLD.width + 8 && y! + h! >= WORLD.height + 8);
    expect(covers).toBe(true);
  });
});

describe('a cached background (with a stand-in document)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubDocument() {
    const made: { width: number; height: number; fills: number }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          fills: 0,
          getContext: () => ({
            fillStyle: '',
            createLinearGradient: () => ({ addColorStop() {} }),
            fillRect() {},
            beginPath() {},
            rect() {},
            scale() {},
            moveTo() {},
            lineTo() {},
            closePath() {},
            fill() {
              canvas.fills++;
            },
          }),
        };
        made.push(canvas);
        return canvas;
      },
    });
    return made;
  }

  it('pre-renders the sky and each layer once, wide enough to wrap', () => {
    const made = stubDocument();
    const mood = MOODS['ember-duelist']!;
    const cache = createBackground(mood);
    expect(cache).not.toBeNull();
    expect(made).toHaveLength(1 + mood.layers.length);
    for (const layer of made.slice(1)) {
      // Half-size pixels (LOOK.layerScale) that stand for a full pattern width in world units.
      expect(layer.width).toBe(Math.ceil(WIDTH * LOOK.layerScale));
      expect(layer.height).toBe(Math.ceil(WORLD.floorY * LOOK.layerScale));
      expect(layer.width / LOOK.layerScale).toBeGreaterThanOrEqual(WORLD.width);
      expect(layer.fills).toBeGreaterThan(0);
    }
  });

  it('draws two copies of each layer, offset by the drift only with motion, and stays balanced', () => {
    stubDocument();
    const mood = MOODS['ember-duelist']!;
    const cache = createBackground(mood)!;
    const draws = (tick: number, motion: boolean) => {
      const f = fakeContext();
      const images: number[] = [];
      (f.ctx as unknown as { drawImage: (i: unknown, x: number) => void }).drawImage = (_i, x) => images.push(x);
      drawBackground(f.ctx, mood, cache, tick, motion);
      expect(f.balance()).toBe(0);
      expect(f.minDepth()).toBe(0);
      return images;
    };
    const still = draws(600, false);
    expect(still).toEqual(draws(0, false));
    // The sky, then two copies per layer.
    expect(still).toHaveLength(1 + 2 * mood.layers.length);
    const moving = draws(600, true);
    expect(moving).not.toEqual(still);
    // Two copies of a layer sit exactly one pattern apart, so they meet with no gap.
    expect(moving[2]! - moving[1]!).toBe(WIDTH);
    // Whatever the tick, the two copies together cover the world plus the shake margin.
    for (const tick of [0, 1, 777, 100000, 987654]) {
      const [a, b] = draws(tick, true).slice(1, 3);
      expect(a!).toBeLessThanOrEqual(-8);
      expect(b! + WIDTH).toBeGreaterThanOrEqual(WORLD.width + 8);
      expect(b!).toBeLessThanOrEqual(a! + WIDTH + 1e-6);
    }
  });

  it('stretches the half-size pictures back to world size when drawing (sky and layers)', () => {
    stubDocument();
    const mood = MOODS['ember-duelist']!;
    const cache = createBackground(mood)!;
    const f = fakeContext();
    const sizes: number[][] = [];
    (f.ctx as unknown as { drawImage: (...a: number[]) => void }).drawImage = (_i, ...a) => sizes.push(a.slice(1));
    drawBackground(f.ctx, mood, cache, 123, true);
    expect(sizes[0]).toEqual([-8, WORLD.width + 16, WORLD.height + 16]);
    for (const [y, w, h] of sizes.slice(1)) {
      expect(y).toBe(0);
      expect(w).toBe(WIDTH);
      expect(h).toBe(WORLD.floorY);
    }
  });
});

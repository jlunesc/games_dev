import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { attackBox } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import type { Primitive } from '../src/ui/look/figures';
import { playerSwing } from '../src/ui/look/playerfx';
import { LOOK } from '../src/ui/look/tuning';

const X = 400;
const Y = WORLD.floorY;
const { startup, active, recovery } = PLAYER.attack;
const total = startup + active + recovery;

function swinging(tick: number, facing: 1 | -1): GameState {
  const s = createInitialState(EMBER_DUELIST, 1);
  return { ...s, player: { ...s.player, x: X, y: Y, prevX: X, prevY: Y, facing, attackTick: tick } };
}

function points(list: Primitive[]): [number, number][] {
  return list.flatMap((p) => (p.kind === 'poly' ? p.points : p.kind === 'rect' ? [[p.x, p.y] as [number, number], [p.x + p.w, p.y + p.h] as [number, number]] : [[p.x, p.y] as [number, number]]));
}

describe('playerSwing', () => {
  it('is null when the player is not swinging', () => {
    expect(playerSwing(swinging(-1, 1), X, Y)).toBeNull();
  });

  it('has a sword for every tick of the swing and none of the slash before the sweep starts', () => {
    for (let t = 0; t < total; t++) {
      const swing = playerSwing(swinging(t, 1), X, Y)!;
      expect(swing.blade.length).toBeGreaterThan(0);
      if (t < startup) expect(swing.slash).toEqual([]);
      else if (t < startup + active + LOOK.playerSlash.fadeTicks) expect(swing.slash.length).toBeGreaterThan(0);
    }
  });

  it('shows the real hit box only while it can hit', () => {
    for (let t = 0; t < total; t++) {
      const swing = playerSwing(swinging(t, 1), X, Y)!;
      if (t >= startup && t < startup + active) expect(swing.box).toEqual(attackBox(swinging(t, 1).player));
      else expect(swing.box).toBeNull();
    }
  });

  it('keeps the slash inside the hit box, on either side', () => {
    for (const facing of [1, -1] as const) {
      const box = attackBox(swinging(0, facing).player);
      for (let t = startup; t < total; t++) {
        for (const [px, py] of points(playerSwing(swinging(t, facing), X, Y)!.slash)) {
          expect(px).toBeGreaterThanOrEqual(box.x - 1e-6);
          expect(px).toBeLessThanOrEqual(box.x + box.w + 1e-6);
          expect(py).toBeGreaterThanOrEqual(box.y - 1e-6);
          expect(py).toBeLessThanOrEqual(box.y + box.h + 1e-6);
        }
      }
    }
  });

  it('sweeps from the top down: each active tick reaches lower than the one before', () => {
    let lowest = -Infinity;
    for (let t = startup; t < startup + active; t++) {
      const bottom = Math.max(...points(playerSwing(swinging(t, 1), X, Y)!.slash).map(([, py]) => py));
      expect(bottom).toBeGreaterThan(lowest);
      lowest = bottom;
    }
  });

  it('fades after the sweep and is gone by the time the fade is over', () => {
    let previous = Infinity;
    for (let t = startup + active; t < total; t++) {
      const swing = playerSwing(swinging(t, 1), X, Y)!;
      expect(swing.slashAlpha).toBeLessThanOrEqual(previous);
      previous = swing.slashAlpha;
      if (t - startup - active >= LOOK.playerSlash.fadeTicks) {
        expect(swing.slashAlpha).toBe(0);
        expect(swing.slash).toEqual([]);
      }
    }
    expect(playerSwing(swinging(startup, 1), X, Y)!.slashAlpha).toBe(LOOK.playerSlash.alpha);
  });

  it('keeps the sword no longer than its tuning from the shoulder, and in front of the player in the sweep', () => {
    for (const facing of [1, -1] as const) {
      for (let t = 0; t < total; t++) {
        const pts = points(playerSwing(swinging(t, facing), X, Y)!.blade);
        const shoulderY = Y - PLAYER.height + 2 * LOOK.headRadius + 6;
        for (const [px, py] of pts) {
          expect(Math.hypot(px - (X + facing * 8), py - shoulderY)).toBeLessThanOrEqual(LOOK.playerBlade.length + 12 + 1e-6);
        }
      }
      // At the end of the sweep the tip is out in front.
      const tip = points(playerSwing(swinging(startup + active - 1, facing), X, Y)!.blade).map(([px]) => (px - X) * facing);
      expect(Math.max(...tip)).toBeGreaterThan(PLAYER.width / 2);
    }
  });

  it('mirrors around the player when the facing flips', () => {
    for (let t = 0; t < total; t++) {
      const right = playerSwing(swinging(t, 1), X, Y)!;
      const left = playerSwing(swinging(t, -1), X, Y)!;
      expect(left.slashAlpha).toBe(right.slashAlpha);
      const order = (list: [number, number][]) => list.map(([px, py]) => [Math.round(px * 1e6) / 1e6, Math.round(py * 1e6) / 1e6]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
      const mirror = points(right.blade).map(([px, py]): [number, number] => [2 * X - px, py]);
      expect(order(points(left.blade))).toEqual(order(mirror));
    }
  });
});

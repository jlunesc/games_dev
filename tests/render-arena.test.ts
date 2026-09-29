import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST } from '../src/bosses';
import { WORLD } from '../src/game/params';
import type { ArcState } from '../src/game/state';
import { arcFloorMark, arenaRects, eruptionMark } from '../src/ui/render';

describe('arenaRects', () => {
  it('gives the platforms (14 thick, top at the floor minus their height) and the cover (floor to top)', () => {
    const boss = {
      ...ASHEN_HOUND,
      arena: {
        platforms: [
          { x: 330, width: 200, height: 90 },
          { x: 950, width: 200, height: 90 },
        ],
        covers: [{ x: 640, width: 60, height: 100 }],
      },
    };
    const { platforms, covers } = arenaRects(boss);
    expect(WORLD.floorY).toBe(640);
    expect(platforms).toEqual([
      { x: 230, y: 550, w: 200, h: 14 },
      { x: 850, y: 550, w: 200, h: 14 },
    ]);
    expect(covers).toEqual([{ x: 610, y: 540, w: 60, h: 100 }]);
  });

  it('is empty for the Duelist, which has no arena', () => {
    expect(EMBER_DUELIST.arena).toBeUndefined();
    expect(arenaRects(EMBER_DUELIST)).toEqual({ platforms: [], covers: [] });
  });
});

describe('arcFloorMark', () => {
  const arcShot = (age: number): ArcState => ({
    kind: 'arc',
    attackId: 'lob',
    originTick: 1,
    x: 500,
    lift: 100,
    age,
    flight: 40,
    fromX: 900,
    toX: 500,
    launchLift: 100,
    peak: 250,
    radius: 60,
    burst: 6,
  });

  it('covers the burst span from launch until the burst ends, then is gone', () => {
    expect(arcFloorMark(arcShot(0))).toEqual({ left: 440, right: 560 });
    expect(arcFloorMark(arcShot(45))).toEqual({ left: 440, right: 560 });
    expect(arcFloorMark(arcShot(46))).toBeNull();
  });
});

describe('eruptionMark', () => {
  const at = (age: number) =>
    ({ kind: 'eruption', attackId: 'fissure', originTick: 1, x: 500, lift: 0, age, width: 140, delay: 30, burst: 6 }) as const;

  it('covers the blast span, charges up to the blast, and is gone when the blast ends', () => {
    expect(eruptionMark(at(0))).toEqual({ left: 430, right: 570, charge: 0 });
    expect(eruptionMark(at(15))).toEqual({ left: 430, right: 570, charge: 0.5 });
    expect(eruptionMark(at(30))?.charge).toBe(1);
    expect(eruptionMark(at(35))).not.toBeNull();
    expect(eruptionMark(at(36))).toBeNull();
  });
});

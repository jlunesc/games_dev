import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST } from '../src/bosses';
import { WORLD } from '../src/game/params';
import { arenaRects } from '../src/ui/render';

describe('arenaRects', () => {
  it('gives the Hound\'s platforms (14 thick, top at the floor minus their height) and its cover (floor to top)', () => {
    const { platforms, covers } = arenaRects(ASHEN_HOUND);
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

import { describe, expect, it } from 'vitest';
import type { ArenaDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { activeHitBoxes, type Box } from '../src/game/geometry';
import { WORLD } from '../src/game/params';
import { createInitialState, type BossState } from '../src/game/state';
import { step } from '../src/game/step';
import { solo } from './boss-helpers';
import { DUELIST } from './helpers';

interface Piece {
  x: number;
  width: number;
  height: number;
}
const arenaOf = (...covers: Piece[]): ArenaDef => ({ platforms: [], covers });
const withCovers = (...covers: Piece[]): BossDef => ({ ...DUELIST, arena: arenaOf(...covers) });

/** A boss state mid-attack, `tick` updates in, standing at `x`. */
function attacking(id: string, tick: number, x: number, facing: 1 | -1): BossState {
  const b = createInitialState(DUELIST).boss;
  return { ...b, x, facing, mode: 'attack', attackId: id, attackTick: tick };
}

/** The pre-M5c computation, kept here as the reference for arenas without cover. */
function oldBoxes(b: BossState, boss: BossDef): Box[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const attack = boss.attacks.find((a) => a.id === b.attackId);
  if (attack === undefined) return [];
  return attack.hits
    .filter((hit) => b.attackTick >= hit.from && b.attackTick < hit.to)
    .map((hit) => ({
      x: b.facing === 1 ? b.x + hit.x0 : b.x - hit.x1,
      y: WORLD.floorY - hit.top,
      w: hit.x1 - hit.x0,
      h: hit.top - hit.bottom,
    }));
}

/** The Duelist with the hit windows of one attack replaced. */
const withHits = (boss: BossDef, id: string, change: (h: BossDef['attacks'][number]['hits'][number]) => object): BossDef => ({
  ...boss,
  attacks: boss.attacks.map((a) => (a.id === id ? { ...a, hits: a.hits.map((h) => ({ ...h, ...change(h) })) } : a)),
});

const SWEEP_TICK = 24; // the sweep's hit window starts here (x0 0, x1 250, top 100)
const BX = 600;

describe('cover cutting the hit windows', () => {
  it('cuts a right-facing window at the near edge of a tall enough cover ahead', () => {
    const boss = withCovers({ x: BX + 170, width: 40, height: 120 }); // near edge at BX + 150
    const boxes = activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, 1), boss);
    expect(boxes).toEqual([{ x: BX, y: WORLD.floorY - 100, w: 150, h: 100 }]);
  });

  it('does not cut when the cover is below the window top', () => {
    const boss = withCovers({ x: BX + 170, width: 40, height: 90 });
    const b = attacking('sweep', SWEEP_TICK, BX, 1);
    expect(activeHitBoxes(b, boss)).toEqual(oldBoxes(b, DUELIST));
  });

  it('cuts when the cover is exactly as tall as the window top', () => {
    const boss = withCovers({ x: BX + 170, width: 40, height: 100 });
    const [box] = activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, 1), boss);
    expect(box!.w).toBe(150);
  });

  it('mirrors for a left-facing boss', () => {
    const boss = withCovers({ x: BX - 170, width: 40, height: 120 }); // near edge at BX - 150
    const boxes = activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, -1), boss);
    expect(boxes).toEqual([{ x: BX - 150, y: WORLD.floorY - 100, w: 150, h: 100 }]);
  });

  it('is not blocked by a cover behind the boss', () => {
    const coverLeftOfBoss = withCovers({ x: BX - 170, width: 40, height: 120 });
    const right = attacking('sweep', SWEEP_TICK, BX, 1);
    expect(activeHitBoxes(right, coverLeftOfBoss)).toEqual(oldBoxes(right, DUELIST));
    const coverRightOfBoss = withCovers({ x: BX + 170, width: 40, height: 120 });
    const left = attacking('sweep', SWEEP_TICK, BX, -1);
    expect(activeHitBoxes(left, coverRightOfBoss)).toEqual(oldBoxes(left, DUELIST));
  });

  it('is not blocked when the boss stands inside the cover', () => {
    const boss = withCovers({ x: BX + 10, width: 80, height: 200 });
    for (const facing of [1, -1] as const) {
      const b = attacking('sweep', SWEEP_TICK, BX, facing);
      expect(activeHitBoxes(b, boss)).toEqual(oldBoxes(b, DUELIST));
    }
  });

  it('drops a window that has no width left', () => {
    // Window from 10 to 250 ahead of the boss; the cover's near edge is exactly 10 ahead.
    const shifted = withHits(withCovers({ x: BX + 20, width: 20, height: 120 }), 'sweep', () => ({ x0: 10, x1: 250 }));
    expect(activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, 1), shifted)).toEqual([]);
    const mirrored = withHits(withCovers({ x: BX - 20, width: 20, height: 120 }), 'sweep', () => ({ x0: 10, x1: 250 }));
    expect(activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, -1), mirrored)).toEqual([]);
    // A cover nearer than the window's start gives a negative width: dropped too.
    const nearer = withHits(withCovers({ x: BX + 15, width: 10, height: 120 }), 'sweep', () => ({ x0: 30, x1: 250 }));
    expect(activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, 1), nearer)).toEqual([]);
  });

  it('lets the nearer of two covers win, in either list order', () => {
    const far = { x: BX + 220, width: 40, height: 150 };
    const near = { x: BX + 120, width: 40, height: 110 }; // near edge at BX + 100
    const b = attacking('sweep', SWEEP_TICK, BX, 1);
    expect(activeHitBoxes(b, withCovers(far, near))[0]!.w).toBe(100);
    expect(activeHitBoxes(b, withCovers(near, far))[0]!.w).toBe(100);
  });

  it('cuts a window that floats above the ground and keeps its vertical extent', () => {
    const boss = withHits(withCovers({ x: BX + 170, width: 40, height: 120 }), 'sweep', () => ({ bottom: 40, top: 110 }));
    const boxes = activeHitBoxes(attacking('sweep', SWEEP_TICK, BX, 1), boss);
    expect(boxes).toEqual([{ x: BX, y: WORLD.floorY - 110, w: 150, h: 70 }]);
  });

  it('returns the uncut boxes with ignoreCover', () => {
    const boss = withCovers({ x: BX + 170, width: 40, height: 120 });
    const b = attacking('sweep', SWEEP_TICK, BX, 1);
    expect(activeHitBoxes(b, boss, { ignoreCover: true })).toEqual(oldBoxes(b, DUELIST));
    expect(activeHitBoxes(b, boss, { ignoreCover: false })[0]!.w).toBe(150);
  });

  it('cuts only the windows a cover is tall enough for (slam top 180, lunge top 150)', () => {
    const cover = { x: BX + 100, width: 20, height: 160 }; // near edge at BX + 90
    const slam = attacking('slam', 30, BX, 1);
    expect(activeHitBoxes(slam, withCovers(cover))).toEqual(oldBoxes(slam, DUELIST)); // top 180 > 160
    const lunge = attacking('lunge', 30, BX, 1);
    expect(oldBoxes(lunge, DUELIST)[0]!.w).toBe(90);
    const lungeCover = { x: BX + 60, width: 20, height: 160 }; // near edge at BX + 50
    expect(activeHitBoxes(lunge, withCovers(lungeCover))[0]!.w).toBe(50);
  });

  it('cuts the burst windows (top 50) even with a low cover', () => {
    const burst = DUELIST.attacks.find((a) => a.id === 'burst')!;
    const cover = { x: BX + 40, width: 20, height: 50 }; // near edge at BX + 30
    let cutAny = false;
    for (let tick = 0; tick < 120; tick++) {
      const b = attacking('burst', tick, BX, 1);
      const old = oldBoxes(b, DUELIST);
      const cut = activeHitBoxes(b, withCovers(cover));
      expect(cut.length).toBeLessThanOrEqual(old.length);
      for (const box of cut) expect(box.x + box.w).toBeLessThanOrEqual(BX + 30);
      if (old.length > 0) cutAny = true;
    }
    expect(burst.hits.length).toBeGreaterThan(0);
    expect(cutAny).toBe(true);
  });
});

describe('a bare arena changes nothing', () => {
  const variants: BossDef[] = [
    DUELIST,
    { ...DUELIST, arena: { platforms: [], covers: [] } },
    { ...DUELIST, arena: { platforms: [{ x: 500, width: 200, height: 130 }], covers: [] } },
  ];

  it('gives exactly the old boxes for every Duelist attack at every attack time', () => {
    for (const boss of variants) {
      for (const attack of DUELIST.attacks) {
        for (const facing of [1, -1] as const) {
          for (let tick = 0; tick < 120; tick++) {
            const b = attacking(attack.id, tick, BX, facing);
            expect(activeHitBoxes(b, boss)).toEqual(oldBoxes(b, DUELIST));
          }
        }
      }
    }
  });

  it('returns nothing when the boss is not attacking', () => {
    const b = createInitialState(DUELIST).boss;
    expect(activeHitBoxes(b, withCovers({ x: 100, width: 20, height: 200 }))).toEqual([]);
  });
});

describe('cover in a real fight', () => {
  /** The solo sweep, usable from anywhere, with one cover between the boss and a player 200 to its left. */
  const fightBoss = (height: number): BossDef => {
    const base = solo('sweep');
    return {
      ...base,
      attacks: base.attacks.map((a) => (a.id === 'sweep' ? { ...a, range: { min: 0, max: 1e9 } } : a)),
      arena: arenaOf({ x: base.startX - 100, width: 40, height }),
    };
  };

  function hitsWithCover(height: number): number {
    const boss = fightBoss(height);
    let s = createInitialState(boss, 1);
    s.player.x = s.boss.x - 200;
    s.player.prevX = s.player.x;
    let hits = 0;
    let attacks = 0;
    for (let n = 0; n < 90; n++) {
      s = step(s, NO_INPUT, boss);
      if (s.events.includes('playerHit')) hits++;
      if (s.boss.mode === 'attack') attacks++;
    }
    expect(attacks).toBeGreaterThan(24); // the sweep really ran
    return hits;
  }

  it('does not hit a grounded player behind a cover as tall as the sweep', () => {
    expect(hitsWithCover(120)).toBe(0);
  });

  it('hits the same player when the cover is too low', () => {
    expect(hitsWithCover(60)).toBeGreaterThan(0);
  });
});

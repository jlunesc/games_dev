import { describe, expect, it } from 'vitest';
import type { ArenaDef, BossDef } from '../src/bosses/schema';
import { arenaSurfaces } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { QUIET_BOSS, advance, run, withInput } from './helpers';

const PLATFORM = { x: 500, width: 200, height: 130 };
const COVER = { x: 800, width: 60, height: 120 };
const HALF = PLAYER.width / 2;

/** QUIET_BOSS with an arena (skips the validator on purpose, like QUIET_BOSS itself). */
const withArena = (arena: Partial<ArenaDef> = {}): BossDef => ({
  ...QUIET_BOSS,
  arena: { platforms: [PLATFORM], covers: [COVER], ...arena },
});
const ARENA_BOSS = withArena();

/** A fresh state with the player placed by hand (on the floor unless `y` is given). */
function placed(boss: BossDef, x: number, y: number = WORLD.floorY): GameState {
  const s = createInitialState(boss);
  s.player.x = x;
  s.player.prevX = x;
  s.player.y = y;
  s.player.prevY = y;
  s.player.onGround = y === WORLD.floorY;
  return s;
}

const platformY = WORLD.floorY - PLATFORM.height;
const coverY = WORLD.floorY - COVER.height;
const coverLeft = COVER.x - COVER.width / 2;
const coverRight = COVER.x + COVER.width / 2;
const jumpFrame = withInput({ jumpPressed: true, jumpHeld: true });
const held = withInput({ jumpHeld: true });

describe('platforms', () => {
  it('lets a player jump up through a platform and land on top coming down', () => {
    const states = run(placed(ARENA_BOSS, PLATFORM.x), 80, (n) => (n === 1 ? jumpFrame : held), ARENA_BOSS);
    // Rising through the platform height: vy stays negative and there is no landing.
    const rising = states.filter((s) => s.player.y > platformY - 1 && s.player.vy < 0);
    expect(rising.length).toBeGreaterThan(0);
    expect(states.every((s) => s.player.vy >= 0 || !s.player.onGround)).toBe(true);
    const peak = Math.min(...states.map((s) => s.player.y));
    expect(peak).toBeLessThan(platformY);
    const last = states[states.length - 1]!;
    expect(last.player.y).toBe(platformY);
    expect(last.player.onGround).toBe(true);
    expect(last.player.vy).toBe(0);
  });

  it('keeps a player standing on a platform for 60 updates', () => {
    const start = placed(ARENA_BOSS, PLATFORM.x, platformY);
    const states = run(start, 60, () => withInput({}), ARENA_BOSS);
    for (const s of states) {
      expect(s.player.y).toBe(platformY);
      expect(s.player.onGround).toBe(true);
    }
  });

  it('keeps a running player on the platform', () => {
    const start = placed(ARENA_BOSS, PLATFORM.x - 60, platformY);
    const states = run(start, 20, () => withInput({ moveX: 1 }), ARENA_BOSS);
    expect(states[19]!.player.x).toBeGreaterThan(start.player.x + 100);
    for (const s of states) {
      expect(s.player.y).toBe(platformY);
      expect(s.player.onGround).toBe(true);
    }
  });

  it('lets a player run off the edge and fall back to the floor', () => {
    const edge = PLATFORM.x + PLATFORM.width / 2;
    const start = placed(ARENA_BOSS, edge - 10, platformY);
    const states = run(start, 120, () => withInput({ moveX: 1 }), ARENA_BOSS);
    const firstAir = states.findIndex((s) => !s.player.onGround);
    expect(firstAir).toBeGreaterThanOrEqual(0);
    expect(states[firstAir]!.player.x - HALF).toBeGreaterThanOrEqual(edge);
    // The next update is falling (positive vy) and the fall ends on the floor.
    expect(states[firstAir + 1]!.player.vy).toBeGreaterThan(0);
    expect(states[firstAir + 1]!.player.onGround).toBe(false);
    const last = states[states.length - 1]!;
    expect(last.player.y).toBe(WORLD.floorY);
    expect(last.player.onGround).toBe(true);
  });

  it('does not land a short hop that peaks below the platform top', () => {
    // Released at once, the jump peaks well under the platform (130 high).
    const states = run(placed(ARENA_BOSS, PLATFORM.x), 60, (n) => (n === 1 ? withInput({ jumpPressed: true }) : withInput({})), ARENA_BOSS);
    const peakHeight = WORLD.floorY - Math.min(...states.map((s) => s.player.y));
    expect(peakHeight).toBeLessThan(PLATFORM.height);
    expect(peakHeight).toBeGreaterThan(20);
    expect(states[states.length - 1]!.player.y).toBe(WORLD.floorY);
  });
});

describe('cover', () => {
  it('blocks walking from the left', () => {
    const s = advance(placed(ARENA_BOSS, 640), 120, withInput({ moveX: 1 }), ARENA_BOSS);
    expect(s.player.x).toBe(coverLeft - HALF);
    expect(s.player.y).toBe(WORLD.floorY);
  });

  it('blocks walking from the right', () => {
    const s = advance(placed(ARENA_BOSS, 1000), 120, withInput({ moveX: -1 }), ARENA_BOSS);
    expect(s.player.x).toBe(coverRight + HALF);
  });

  it('stops a dash at the same place', () => {
    const s = advance(placed(ARENA_BOSS, 640), 8, withInput({ dashPressed: true, moveX: 1 }), ARENA_BOSS);
    expect(s.player.x).toBe(coverLeft - HALF);
    expect(s.player.dashTick).toBeGreaterThanOrEqual(0);
    const t = advance(placed(ARENA_BOSS, 1000), 8, withInput({ dashPressed: true, moveX: -1 }), ARENA_BOSS);
    expect(t.player.x).toBe(coverRight + HALF);
  });

  it('is not crossed by a full-speed dash even at the minimum width', () => {
    const thin = withArena({ covers: [{ x: 800, width: 40, height: 120 }] });
    for (let startX = 600; startX <= 730; startX += 1) {
      const s = advance(placed(thin, startX), 11, withInput({ dashPressed: true, moveX: 1 }), thin);
      expect(s.player.x).toBeLessThanOrEqual(780 - HALF);
    }
    for (let startX = 1000; startX >= 900; startX -= 1) {
      const s = advance(placed(thin, startX), 11, withInput({ dashPressed: true, moveX: -1 }), thin);
      expect(s.player.x).toBeGreaterThanOrEqual(820 + HALF);
    }
  });

  it('lets a player jump over the low cover and land beyond it', () => {
    const states = run(placed(ARENA_BOSS, 650), 80, (n) => (n === 1 ? withInput({ jumpPressed: true, jumpHeld: true, moveX: 1 }) : withInput({ jumpHeld: true, moveX: 1 })), ARENA_BOSS);
    const last = states[states.length - 1]!;
    expect(last.player.x).toBeGreaterThan(coverRight + HALF);
    expect(last.player.y).toBe(WORLD.floorY);
    expect(last.player.onGround).toBe(true);
  });

  /** Jumps straight up beside the cover, drifts right above its top near the apex, then falls onto it. */
  const ontoCover = (n: number) =>
    withInput({ jumpPressed: n === 1, jumpHeld: n < 30, moveX: n >= 15 && n <= 22 ? 1 : 0 });

  it('lets a player jump onto the cover top and stand there', () => {
    const states = run(placed(ARENA_BOSS, 720), 80, ontoCover, ARENA_BOSS);
    const last = states[states.length - 1]!;
    expect(last.player.y).toBe(coverY);
    expect(last.player.onGround).toBe(true);
    expect(last.player.x).toBeGreaterThan(coverLeft);
    expect(last.player.x).toBeLessThan(coverRight);
  });

  it('lets a player walk off either side of the cover top', () => {
    const on = run(placed(ARENA_BOSS, 720), 80, ontoCover, ARENA_BOSS)[79]!;
    const right = advance(on, 80, withInput({ moveX: 1 }), ARENA_BOSS);
    expect(right.player.y).toBe(WORLD.floorY);
    expect(right.player.x).toBeGreaterThan(coverRight + HALF);
    const left = advance(on, 80, withInput({ moveX: -1 }), ARENA_BOSS);
    expect(left.player.y).toBe(WORLD.floorY);
    expect(left.player.x).toBeLessThan(coverLeft - HALF + 1);
  });

  it('does not push a player who stands on the cover top', () => {
    const start = placed(ARENA_BOSS, COVER.x, coverY);
    const states = run(start, 30, () => withInput({}), ARENA_BOSS);
    for (const s of states) {
      expect(s.player.x).toBe(COVER.x);
      expect(s.player.y).toBe(coverY);
      expect(s.player.onGround).toBe(true);
    }
    // Running across the top is free too.
    const across = advance(start, 5, withInput({ moveX: 1 }), ARENA_BOSS);
    expect(across.player.x).toBeCloseTo(COVER.x + (5 * PLAYER.runSpeed) / 60, 5);
    expect(across.player.y).toBe(coverY);
  });

  it('leaves a player who is already inside a cover where they are', () => {
    const s = advance(placed(ARENA_BOSS, COVER.x), 1, withInput({}), ARENA_BOSS);
    expect(s.player.x).toBe(COVER.x);
    const moving = advance(placed(ARENA_BOSS, COVER.x), 3, withInput({ moveX: 1 }), ARENA_BOSS);
    expect(moving.player.x).toBeCloseTo(COVER.x + (3 * PLAYER.runSpeed) / 60, 5);
  });
});

describe('flat arena', () => {
  const script = (n: number) =>
    withInput({
      moveX: Math.sin(n / 17) > 0.2 ? 1 : Math.sin(n / 17) < -0.2 ? -1 : 0,
      jumpPressed: n % 45 === 0,
      jumpHeld: n % 45 < 20,
      dashPressed: n % 90 === 30,
      attackPressed: n % 70 === 5,
    });

  it('is identical with no arena, empty lists, or an empty-arena boss', () => {
    const flat = run(createInitialState(QUIET_BOSS), 600, script, QUIET_BOSS);
    const empty: BossDef = { ...QUIET_BOSS, arena: { platforms: [], covers: [] } };
    const withEmpty = run(createInitialState(empty), 600, script, empty);
    expect(withEmpty).toEqual(flat);
  });
});

describe('arenaSurfaces', () => {
  it('lists platforms then covers with y = floorY - height', () => {
    expect(arenaSurfaces(ARENA_BOSS)).toEqual([
      { left: 400, right: 600, y: WORLD.floorY - 130, kind: 'platform' },
      { left: 770, right: 830, y: WORLD.floorY - 120, kind: 'cover' },
    ]);
  });

  it('is empty for a flat arena', () => {
    expect(arenaSurfaces(QUIET_BOSS)).toEqual([]);
    expect(arenaSurfaces({ ...QUIET_BOSS, arena: { platforms: [], covers: [] } })).toEqual([]);
  });
});

describe('determinism', () => {
  const script = (n: number) => withInput({ moveX: n % 40 < 25 ? 1 : -1, jumpPressed: n % 50 === 3, jumpHeld: n % 50 < 22, dashPressed: n % 97 === 40 });

  it('gives the same states for the same input', () => {
    const a = run(createInitialState(ARENA_BOSS), 400, script, ARENA_BOSS);
    const b = run(createInitialState(ARENA_BOSS), 400, script, ARENA_BOSS);
    expect(b).toEqual(a);
  });

  it('steps a JSON round trip of a state on a platform identically', () => {
    const start = placed(ARENA_BOSS, PLATFORM.x, platformY);
    const mid = run(start, 25, script, ARENA_BOSS)[24]!;
    const copy = JSON.parse(JSON.stringify(mid)) as GameState;
    const a = run(mid, 100, (n) => script(n + 25), ARENA_BOSS);
    const b = run(copy, 100, (n) => script(n + 25), ARENA_BOSS);
    expect(b).toEqual(a);
  });
});

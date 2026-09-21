import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import raw from '../src/bosses/ember-duelist.json';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { BossDef, LeapDef } from '../src/bosses/schema';

/** A deep copy of the real boss for a test to break on purpose. */
const copy = (): BossDef => structuredClone(EMBER_DUELIST);

const rejects = (boss: unknown, where: string): void => {
  expect(() => parseBoss(boss)).toThrow(BossFormatError);
  // The path must be exactly `where` (not merely start with it): the message reads "error at <path>: <reason>".
  expect(() => parseBoss(boss)).toThrow(`Boss data error at ${where}:`);
};

describe('the real Ember Duelist file', () => {
  it('is accepted and has the planned shape', () => {
    expect(() => parseBoss(raw)).not.toThrow();
    expect(EMBER_DUELIST.id).toBe('ember-duelist');
    expect(EMBER_DUELIST.attacks.map((a) => a.id)).toEqual(['slam', 'sweep', 'lunge', 'burst']);
    expect(EMBER_DUELIST.phases).toHaveLength(2);
    expect(EMBER_DUELIST.phases[0]!.startsAtHpFraction).toBe(1);
  });

  it('uses none of the movement-skill keys and survives a JSON round trip unchanged', () => {
    for (const attack of EMBER_DUELIST.attacks) {
      expect('leap' in attack).toBe(false);
      if (attack.move !== undefined) expect('dir' in attack.move).toBe(false);
    }
    expect(parseBoss(JSON.parse(JSON.stringify(EMBER_DUELIST)))).toEqual(EMBER_DUELIST);
  });

  it('has exactly one counterable attack, the slam', () => {
    expect(EMBER_DUELIST.attacks.filter((a) => a.class === 'counterable').map((a) => a.id)).toEqual([
      'slam',
    ]);
  });
});

describe('parseBoss rejects broken files, naming the place', () => {
  it('data that is not an object', () => {
    rejects(42, 'boss');
    rejects(null, 'boss');
    rejects([], 'boss');
  });

  it('a missing name', () => {
    const b = copy() as unknown as Record<string, unknown>;
    delete b.name;
    rejects(b, 'boss.name');
  });

  it('a negative health', () => {
    const b = copy();
    b.maxHp = -1;
    rejects(b, 'boss.maxHp');
  });

  it('a fractional whole-number field', () => {
    const b = copy();
    b.transitionTicks = 10.5;
    rejects(b, 'boss.transitionTicks');
  });

  it('a predictability outside 0 to 1', () => {
    const b = copy();
    b.predictability = 1.5;
    rejects(b, 'boss.predictability');
  });

  it('spacing whose maximum is not above its minimum', () => {
    const b = copy();
    b.spacing = { min: 300, max: 300 };
    rejects(b, 'boss.spacing');
  });

  it('two attacks with the same id', () => {
    const b = copy();
    b.attacks[1]!.id = 'slam';
    rejects(b, 'boss.attacks[1].id');
  });

  it('an unknown pose', () => {
    const b = copy();
    (b.attacks[0] as unknown as { pose: string }).pose = 'jumping';
    rejects(b, 'boss.attacks[0].pose');
  });

  it('an unknown attack class', () => {
    const b = copy();
    (b.attacks[0] as unknown as { class: string }).class = 'friendly';
    rejects(b, 'boss.attacks[0].class');
  });

  it('a range whose minimum is not below its maximum', () => {
    const b = copy();
    b.attacks[0]!.range = { min: 100, max: 100 };
    rejects(b, 'boss.attacks[0].range');
  });

  it('a hit window outside the active updates', () => {
    const b = copy();
    const slam = b.attacks[0]!;
    slam.hits[0]!.to = slam.windup + slam.active + 1;
    rejects(b, 'boss.attacks[0].hits[0]');
  });

  it('a hit window whose far edge is not beyond its near edge', () => {
    const b = copy();
    b.attacks[0]!.hits[0]!.x1 = b.attacks[0]!.hits[0]!.x0;
    rejects(b, 'boss.attacks[0].hits[0]');
  });

  it('an attack with no hit window', () => {
    const b = copy();
    b.attacks[0]!.hits = [];
    rejects(b, 'boss.attacks[0].hits');
  });

  it('a move outside the active updates', () => {
    const b = copy();
    const lunge = b.attacks[2]!;
    lunge.move = { from: lunge.windup, to: lunge.windup + lunge.active + 5, speed: 1500 };
    rejects(b, 'boss.attacks[2].move');
  });

  it('a phase that lists an attack that does not exist', () => {
    const b = copy();
    b.phases[0]!.attacks[0]!.id = 'nope';
    rejects(b, 'boss.phases[0].attacks[0].id');
  });

  it('an attack weight of zero', () => {
    const b = copy();
    b.phases[0]!.attacks[0]!.weight = 0;
    rejects(b, 'boss.phases[0].attacks[0].weight');
  });

  it('an opening attack that does not exist', () => {
    const b = copy();
    b.phases[1]!.opening = 'nope';
    rejects(b, 'boss.phases[1].opening');
  });

  it('a first phase that does not start at full health', () => {
    const b = copy();
    b.phases[0]!.startsAtHpFraction = 0.9;
    rejects(b, 'boss.phases[0].startsAtHpFraction');
  });

  it('phases that do not start in decreasing order', () => {
    const b = copy();
    b.phases[1]!.startsAtHpFraction = 1;
    rejects(b, 'boss.phases[1].startsAtHpFraction');
  });

  it('a phase that never walks', () => {
    const b = copy();
    b.phases[0]!.walkSpeed = 0;
    rejects(b, 'boss.phases[0].walkSpeed');
  });

  it('a counter window longer than a counterable attack wind-up', () => {
    const b = copy();
    b.counter.window = b.attacks[0]!.windup + 1;
    rejects(b, 'boss.counter.window');
  });

  it('no attacks and no phases', () => {
    const noAttacks = copy();
    noAttacks.attacks = [];
    rejects(noAttacks, 'boss.attacks');
    const noPhases = copy();
    noPhases.phases = [];
    rejects(noPhases, 'boss.phases');
  });
});

describe('attack damage', () => {
  it('defaults to 1 hit when a file does not say', () => {
    expect(EMBER_DUELIST.attacks.every((a) => a.damage === 1)).toBe(true);
  });

  it('accepts a whole number of hits', () => {
    const b = copy();
    b.attacks[0]!.damage = 3;
    expect(parseBoss(b).attacks[0]!.damage).toBe(3);
  });

  it('rejects zero, negative and fractional damage', () => {
    for (const bad of [0, -1, 1.5]) {
      const b = copy();
      b.attacks[0]!.damage = bad;
      rejects(b, 'boss.attacks[0].damage');
    }
  });
});

/** The Duelist's slam (its own windup and active unless `active` is given) with the given leap and move. */
const withLeap = (
  leap: unknown,
  move?: { from: number; to: number; speed: number },
  active?: number,
): BossDef => {
  const b = copy();
  const slam = b.attacks[0]!;
  if (active !== undefined) slam.active = active;
  (slam as unknown as { leap: unknown }).leap = leap;
  if (move !== undefined) slam.move = move;
  return b;
};

const at = (slam: BossDef['attacks'][number]) => ({ from: slam.windup, to: slam.windup + slam.active });

describe('attack leap', () => {
  it('accepts a leap aimed at each kind of target and keeps it exactly', () => {
    const slam = copy().attacks[0]!;
    const { from, to } = at(slam);
    const player: LeapDef = { from, to, height: 120, target: 'player' };
    const forward: LeapDef = { from, to, height: 120, target: 'forward', distance: 200 };
    const back: LeapDef = { from, to, height: 60, target: 'back', distance: 150 };
    for (const leap of [player, forward, back]) {
      expect(parseBoss(withLeap(leap)).attacks[0]!.leap).toEqual(leap);
    }
  });

  it('drops a distance written on a player-targeted leap', () => {
    const { from, to } = at(copy().attacks[0]!);
    const parsed = parseBoss(withLeap({ from, to, height: 100, target: 'player', distance: 99 }));
    expect(parsed.attacks[0]!.leap).toEqual({ from, to, height: 100, target: 'player' });
    expect(Object.keys(parsed.attacks[0]!.leap!).sort()).toEqual(['from', 'height', 'target', 'to']);
  });

  it('requires a distance of at least 1 for forward and back leaps', () => {
    const { from, to } = at(copy().attacks[0]!);
    for (const target of ['forward', 'back']) {
      rejects(withLeap({ from, to, height: 100, target }), 'boss.attacks[0].leap.distance');
      rejects(
        withLeap({ from, to, height: 100, target, distance: 0.5 }),
        'boss.attacks[0].leap.distance',
      );
    }
  });

  it('rejects a leap that starts before the active updates', () => {
    const slam = copy().attacks[0]!;
    rejects(
      withLeap({ from: slam.windup - 1, to: slam.windup + 4, height: 100, target: 'player' }),
      'boss.attacks[0].leap',
    );
    expect(() =>
      parseBoss(withLeap({ from: slam.windup - 1, to: slam.windup + 4, height: 100, target: 'player' })),
    ).toThrow('must lie inside the active updates');
  });

  it('rejects a leap that ends after the active updates', () => {
    const slam = copy().attacks[0]!;
    const leap = { from: slam.windup, to: slam.windup + slam.active + 1, height: 100, target: 'player' };
    rejects(withLeap(leap), 'boss.attacks[0].leap');
    expect(() => parseBoss(withLeap(leap))).toThrow('must lie inside the active updates');
  });

  it('rejects a leap whose end is not after its start', () => {
    const { from } = at(copy().attacks[0]!);
    rejects(withLeap({ from, to: from, height: 100, target: 'player' }), 'boss.attacks[0].leap');
    rejects(withLeap({ from, to: from - 1, height: 100, target: 'player' }), 'boss.attacks[0].leap');
  });

  it('rejects fractional times, a height below 1 and an unknown target', () => {
    const { from, to } = at(copy().attacks[0]!);
    rejects(withLeap({ from: from + 0.5, to, height: 100, target: 'player' }), 'boss.attacks[0].leap.from');
    rejects(withLeap({ from, to: to + 0.5, height: 100, target: 'player' }), 'boss.attacks[0].leap.to');
    rejects(withLeap({ from, to, height: 0, target: 'player' }), 'boss.attacks[0].leap.height');
    rejects(withLeap({ from, to, height: 100, target: 'up' }), 'boss.attacks[0].leap.target');
    rejects(withLeap({ from, to, height: 100 }), 'boss.attacks[0].leap.target');
  });

  it('allows a move and a leap that do not overlap, in either order', () => {
    const slam = copy().attacks[0]!;
    const a = slam.windup;
    const leap = { from: a + 4, to: a + 8, height: 100, target: 'player' };
    expect(parseBoss(withLeap(leap, { from: a, to: a + 4, speed: 300 }, 20)).attacks[0]!.move).toBeDefined();
    expect(parseBoss(withLeap(leap, { from: a + 8, to: a + 10, speed: 300 }, 20)).attacks[0]!.leap).toBeDefined();
  });

  it('rejects a leap that is not an object', () => {
    for (const leap of [null, 5, 'up', [1, 2]]) rejects(withLeap(leap), 'boss.attacks[0].leap');
  });

  it('rejects a leap that fully contains a move, and a move that fully contains a leap', () => {
    const a = copy().attacks[0]!.windup;
    const inner = { from: a + 4, to: a + 6, speed: 300 };
    const outer = { from: a + 2, to: a + 10, height: 100, target: 'player' };
    const containing = withLeap(outer, inner, 20);
    rejects(containing, 'boss.attacks[0].leap');
    expect(() => parseBoss(containing)).toThrow('must not overlap the move');

    const leap = { from: a + 4, to: a + 8, height: 100, target: 'player' };
    const wide = withLeap(leap, { from: a, to: a + 10, speed: 300 }, 20);
    rejects(wide, 'boss.attacks[0].leap');
    expect(() => parseBoss(wide)).toThrow('must not overlap the move');
  });

  it('rejects a move and a leap that overlap', () => {
    const a = copy().attacks[0]!.windup;
    const leap = { from: a + 4, to: a + 8, height: 100, target: 'player' };
    const bad = withLeap(leap, { from: a, to: a + 5, speed: 300 }, 20);
    rejects(bad, 'boss.attacks[0].leap');
    expect(() => parseBoss(bad)).toThrow('must not overlap the move');
    rejects(withLeap(leap, { from: a + 7, to: a + 10, speed: 300 }, 20), 'boss.attacks[0].leap');
  });
});

describe('attack move direction', () => {
  it('accepts forward and back and keeps them', () => {
    for (const dir of ['forward', 'back'] as const) {
      const b = copy();
      const lunge = b.attacks[2]!;
      lunge.move = { ...lunge.move!, dir };
      expect(parseBoss(b).attacks[2]!.move!.dir).toBe(dir);
    }
  });

  it('leaves an absent direction absent', () => {
    const parsed = parseBoss(copy());
    expect('dir' in parsed.attacks[2]!.move!).toBe(false);
  });

  it('rejects a direction that is null', () => {
    const b = copy();
    (b.attacks[2]!.move as unknown as { dir: null }).dir = null;
    rejects(b, 'boss.attacks[2].move.dir');
  });

  it('rejects an unknown direction', () => {
    const b = copy();
    const lunge = b.attacks[2]!;
    (lunge.move as unknown as { dir: string }).dir = 'sideways';
    rejects(b, 'boss.attacks[2].move.dir');
  });
});

describe('attacks with no hit window', () => {
  it('is accepted with a move', () => {
    const b = copy();
    b.attacks[2]!.hits = [];
    expect(parseBoss(b).attacks[2]!.hits).toEqual([]);
  });

  it('is accepted with a leap', () => {
    const { from, to } = at(copy().attacks[0]!);
    const b = withLeap({ from, to, height: 100, target: 'player' });
    b.attacks[0]!.hits = [];
    expect(parseBoss(b).attacks[0]!.hits).toEqual([]);
  });

  it('is rejected with neither, with the new wording', () => {
    const b = copy();
    b.attacks[0]!.hits = [];
    rejects(b, 'boss.attacks[0].hits');
    expect(() => parseBoss(b)).toThrow('needs at least one hit window, a move or a leap');
  });
});

describe('the crouch pose', () => {
  it('is accepted', () => {
    const b = copy();
    b.attacks[0]!.pose = 'crouch';
    expect(parseBoss(b).attacks[0]!.pose).toBe('crouch');
  });
});

describe('the arena', () => {
  const withArena = (arena: unknown): unknown => ({ ...copy(), arena });
  const piece = (x: number, width: number, height: number) => ({ x, width, height });

  it('is absent from the Duelist and from a file without it, with no stray key', () => {
    expect('arena' in EMBER_DUELIST).toBe(false);
    expect('arena' in parseBoss(copy())).toBe(false);
    expect(Object.keys(parseBoss(copy()))).not.toContain('arena');
  });

  it('accepts only platforms, only covers, both, and empty lists', () => {
    const p = piece(400, 200, 120);
    const c = piece(900, 100, 80);
    expect(parseBoss(withArena({ platforms: [p] })).arena).toEqual({ platforms: [p], covers: [] });
    expect(parseBoss(withArena({ covers: [c] })).arena).toEqual({ platforms: [], covers: [c] });
    expect(parseBoss(withArena({ platforms: [p], covers: [c] })).arena).toEqual({
      platforms: [p],
      covers: [c],
    });
    expect(parseBoss(withArena({ platforms: [], covers: [] })).arena).toEqual({
      platforms: [],
      covers: [],
    });
    expect(parseBoss(withArena({})).arena).toEqual({ platforms: [], covers: [] });
  });

  it('returns pieces with exactly x, width and height', () => {
    const parsed = parseBoss(withArena({ platforms: [{ ...piece(400, 200, 120), extra: 1 }] }));
    expect(Object.keys(parsed.arena!.platforms[0]!).sort()).toEqual(['height', 'width', 'x']);
  });

  it('rejects an arena that is not an object', () => {
    rejects(withArena(5), 'boss.arena');
    rejects(withArena([]), 'boss.arena');
    rejects(withArena(null), 'boss.arena');
  });

  it('rejects lists that are not lists', () => {
    rejects(withArena({ platforms: 3 }), 'boss.arena.platforms');
    rejects(withArena({ covers: {} }), 'boss.arena.covers');
  });

  it('rejects a piece that is not an object and a non-number x', () => {
    rejects(withArena({ platforms: [7] }), 'boss.arena.platforms[0]');
    rejects(withArena({ covers: [{ x: '5', width: 100, height: 50 }] }), 'boss.arena.covers[0].x');
    rejects(withArena({ platforms: [{ width: 100, height: 50 }] }), 'boss.arena.platforms[0].x');
  });

  it('checks width from 40 to 600', () => {
    rejects(withArena({ platforms: [piece(400, 39, 100)] }), 'boss.arena.platforms[0].width');
    rejects(withArena({ platforms: [piece(640, 601, 100)] }), 'boss.arena.platforms[0].width');
    rejects(withArena({ covers: [piece(400, 30, 100)] }), 'boss.arena.covers[0].width');
    expect(parseBoss(withArena({ platforms: [piece(400, 40, 100)] }))).toBeTruthy();
    expect(parseBoss(withArena({ platforms: [piece(640, 600, 100)] }))).toBeTruthy();
  });

  it('checks platform height from 40 to 300', () => {
    rejects(withArena({ platforms: [piece(400, 100, 39)] }), 'boss.arena.platforms[0].height');
    rejects(withArena({ platforms: [piece(400, 100, 301)] }), 'boss.arena.platforms[0].height');
    expect(parseBoss(withArena({ platforms: [piece(400, 100, 40)] }))).toBeTruthy();
    expect(parseBoss(withArena({ platforms: [piece(400, 100, 300)] }))).toBeTruthy();
  });

  it('checks cover height from 20 to 400', () => {
    rejects(withArena({ covers: [piece(400, 100, 19)] }), 'boss.arena.covers[0].height');
    rejects(withArena({ covers: [piece(400, 100, 401)] }), 'boss.arena.covers[0].height');
    expect(parseBoss(withArena({ covers: [piece(400, 100, 20)] }))).toBeTruthy();
    expect(parseBoss(withArena({ covers: [piece(400, 100, 400)] }))).toBeTruthy();
  });

  it('requires a piece to lie inside the arena', () => {
    rejects(withArena({ platforms: [piece(50, 200, 100)] }), 'boss.arena.platforms[0]');
    expect(() => parseBoss(withArena({ platforms: [piece(50, 200, 100)] }))).toThrow(
      'must lie inside the arena',
    );
    rejects(withArena({ covers: [piece(1250, 100, 100)] }), 'boss.arena.covers[0]');
    expect(() => parseBoss(withArena({ covers: [piece(1250, 100, 100)] }))).toThrow(
      'must lie inside the arena',
    );
    expect(parseBoss(withArena({ platforms: [piece(100, 200, 100)] }))).toBeTruthy();
    expect(parseBoss(withArena({ covers: [piece(1180, 200, 100)] }))).toBeTruthy();
  });

  it('allows at most 6 pieces per list', () => {
    const six = [0, 1, 2, 3, 4, 5].map((i) => piece(100 + i * 150, 100, 100));
    expect(parseBoss(withArena({ platforms: six })).arena!.platforms).toHaveLength(6);
    expect(parseBoss(withArena({ covers: six })).arena!.covers).toHaveLength(6);
    const seven = [...six, piece(1100, 100, 100)];
    rejects(withArena({ platforms: seven }), 'boss.arena.platforms');
    expect(() => parseBoss(withArena({ platforms: seven }))).toThrow('at most 6');
    rejects(withArena({ covers: seven }), 'boss.arena.covers');
    expect(() => parseBoss(withArena({ covers: seven }))).toThrow('at most 6');
  });

  it("rejects a cover that contains the player's start", () => {
    rejects(withArena({ covers: [piece(320, 100, 100)] }), 'boss.arena.covers[0]');
    expect(() => parseBoss(withArena({ covers: [piece(320, 100, 100)] }))).toThrow(
      "must not contain the player's start",
    );
    // left <= 320 < right fails; a cover starting exactly at 320 fails, one ending exactly at 320 is fine.
    expect(() => parseBoss(withArena({ covers: [piece(370, 100, 100)] }))).toThrow(
      "must not contain the player's start",
    );
    expect(parseBoss(withArena({ covers: [piece(270, 100, 100)] }))).toBeTruthy();
    expect(parseBoss(withArena({ covers: [piece(400, 100, 100)] }))).toBeTruthy();
    // A platform over the start is fine: the player runs under it.
    expect(parseBoss(withArena({ platforms: [piece(320, 200, 100)] }))).toBeTruthy();
    rejects(withArena({ covers: [piece(900, 100, 100), piece(320, 100, 100)] }), 'boss.arena.covers[1]');
  });

  it('rejects pieces of the same kind that overlap in x, but allows touching', () => {
    rejects(
      withArena({ platforms: [piece(300, 200, 100), piece(450, 200, 100)] }),
      'boss.arena.platforms[1]',
    );
    rejects(
      withArena({ covers: [piece(650, 200, 100), piece(500, 200, 100)] }),
      'boss.arena.covers[1]',
    );
    expect(() =>
      parseBoss(withArena({ platforms: [piece(300, 200, 100), piece(450, 200, 100)] })),
    ).toThrow('must not overlap');
    const touching = withArena({ platforms: [piece(300, 200, 100), piece(500, 200, 100)] });
    expect(parseBoss(touching).arena!.platforms).toHaveLength(2);
    const touchingCovers = withArena({ covers: [piece(700, 200, 100), piece(500, 200, 100)] });
    expect(parseBoss(touchingCovers).arena!.covers).toHaveLength(2);
  });

  it('rejects a piece that fully contains another, or is fully inside another', () => {
    const big = piece(600, 400, 100); // x 400 to 800
    const small = piece(600, 100, 100); // x 550 to 650
    for (const kind of ['platforms', 'covers'] as const) {
      rejects(withArena({ [kind]: [big, small] }), `boss.arena.${kind}[1]`);
      rejects(withArena({ [kind]: [small, big] }), `boss.arena.${kind}[1]`);
    }
    expect(() => parseBoss(withArena({ platforms: [big, small] }))).toThrow('must not overlap boss.arena.platforms[0]');
    expect(() => parseBoss(withArena({ covers: [small, big] }))).toThrow('must not overlap boss.arena.covers[0]');
  });

  it('rejects an overlap with an earlier piece that is not the one right before it, naming both', () => {
    // [0] spans x 400 to 600, [1] x 700 to 800, [2] x 550 to 650 overlaps [0] only.
    const pieces = [piece(500, 200, 100), piece(750, 100, 100), piece(600, 100, 100)];
    rejects(withArena({ platforms: pieces }), 'boss.arena.platforms[2]');
    expect(() => parseBoss(withArena({ platforms: pieces }))).toThrow('must not overlap boss.arena.platforms[0]');
    rejects(withArena({ covers: pieces }), 'boss.arena.covers[2]');
    expect(() => parseBoss(withArena({ covers: pieces }))).toThrow('must not overlap boss.arena.covers[0]');
    // The same three pieces with the last one clear of both are fine.
    const fine = [piece(500, 200, 100), piece(750, 100, 100), piece(900, 100, 100)];
    expect(parseBoss(withArena({ platforms: fine })).arena!.platforms).toHaveLength(3);
  });

  it('rejects a platform and a cover that overlap in x, naming the platform', () => {
    const b = withArena({ platforms: [piece(300, 200, 100)], covers: [piece(420, 100, 100)] });
    rejects(b, 'boss.arena.platforms[0]');
    expect(() => parseBoss(b)).toThrow('must not overlap a cover');
  });

  it('allows a platform and a cover that only touch in x', () => {
    // the platform spans [200, 400) and the cover spans [400, 500)
    const touching = withArena({ platforms: [piece(300, 200, 100)], covers: [piece(450, 100, 100)] });
    expect(parseBoss(touching).arena!.covers).toHaveLength(1);
  });
});

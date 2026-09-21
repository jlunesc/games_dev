import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import raw from '../src/bosses/ember-duelist.json';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { BossDef, LeapDef } from '../src/bosses/schema';

/** A deep copy of the real boss for a test to break on purpose. */
const copy = (): BossDef => structuredClone(EMBER_DUELIST);

const rejects = (boss: unknown, where: string): void => {
  expect(() => parseBoss(boss)).toThrow(BossFormatError);
  expect(() => parseBoss(boss)).toThrow(where);
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

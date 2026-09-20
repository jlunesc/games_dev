import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import raw from '../src/bosses/ember-duelist.json';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';

/** A deep copy of the real boss for a test to break on purpose. */
const copy = (): BossDef => structuredClone(EMBER_DUELIST);

const rejects = (boss: unknown, where: string): void => {
  expect(() => parseBoss(boss)).toThrow(BossFormatError);
  expect(() => parseBoss(boss)).toThrow(where);
};

describe('the real Ember Duelist file', () => {
  it('is accepted and has the planned shape', () => {
    expect(parseBoss(raw)).toEqual(EMBER_DUELIST);
    expect(EMBER_DUELIST.id).toBe('ember-duelist');
    expect(EMBER_DUELIST.attacks.map((a) => a.id)).toEqual(['slam', 'sweep', 'lunge', 'burst']);
    expect(EMBER_DUELIST.phases).toHaveLength(2);
    expect(EMBER_DUELIST.phases[0]!.startsAtHpFraction).toBe(1);
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

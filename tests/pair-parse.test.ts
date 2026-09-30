import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSSES, CINDER_GOLEM, STORM_KITE, VESPER_SAGE, bossById } from '../src/bosses';
import { PairFormatError, parsePair } from '../src/bosses/pair';
import rawPair from '../src/bosses/hound-and-sage.json';
import { GOLEM_AND_KITE, HOUND_AND_SAGE, PAIRS, pairById } from '../src/bosses/pairs';
import type { BossDef } from '../src/bosses/schema';

const strict = (id: string): BossDef | undefined => BOSSES.find((b) => b.id === id);

const member = (boss: string, healthScale = 0.6) => ({ boss, healthScale });

const pairWith = (over: Record<string, unknown>) => ({
  id: 'test-pair',
  name: 'Test Pair',
  bosses: [member('ashen-hound'), member('vesper-sage')],
  enrage: { gapScale: 0.6, walkScale: 1.3 },
  ...over,
});

function errorOf(data: unknown): string {
  try {
    parsePair(data, strict);
  } catch (error) {
    expect(error).toBeInstanceOf(PairFormatError);
    expect((error as Error).name).toBe('PairFormatError');
    return (error as Error).message;
  }
  throw new Error('expected parsePair to throw');
}

describe('parsePair', () => {
  it('accepts the real Hound and Sage file', () => {
    const pair = parsePair(rawPair, strict);
    expect(pair).toEqual({
      id: 'hound-and-sage',
      name: 'Hound and Sage',
      bosses: [
        { boss: 'ashen-hound', healthScale: 0.6 },
        { boss: 'vesper-sage', healthScale: 0.6 },
      ],
      enrage: { gapScale: 0.6, walkScale: 1.3 },
    });
  });

  it('reads a missing or null enrage as no enrage', () => {
    const noKey = { id: 'p', name: 'P', bosses: [member('ashen-hound'), member('vesper-sage')] };
    expect(parsePair(noKey, strict).enrage).toBeNull();
    expect(parsePair(pairWith({ enrage: null }), strict).enrage).toBeNull();
  });

  it('names the exact place of a problem', () => {
    expect(errorOf('nope')).toBe('Pair data error at pair: expected an object');
    expect(errorOf(pairWith({ id: undefined }))).toBe('Pair data error at pair.id: expected a non-empty text');
    expect(errorOf(pairWith({ name: '' }))).toBe('Pair data error at pair.name: expected a non-empty text');
  });

  it('refuses a pair id that is a boss id or "generated"', () => {
    expect(errorOf(pairWith({ id: 'ember-duelist' }))).toContain('pair.id');
    expect(errorOf(pairWith({ id: 'ember-duelist' }))).toContain('already used');
    expect(errorOf(pairWith({ id: 'generated' }))).toContain('already used');
  });

  it('needs exactly two bosses', () => {
    expect(errorOf(pairWith({ bosses: 'x' }))).toBe('Pair data error at pair.bosses: expected a list');
    expect(errorOf(pairWith({ bosses: [member('ashen-hound')] }))).toBe(
      'Pair data error at pair.bosses: expected exactly two bosses',
    );
    expect(
      errorOf(pairWith({ bosses: [member('ashen-hound'), member('vesper-sage'), member('ember-duelist')] })),
    ).toContain('exactly two');
  });

  it('refuses a boss id that does not exist (it never falls back to the Duelist)', () => {
    expect(bossById('nobody').id).toBe('ember-duelist');
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('nobody')] }))).toBe(
      'Pair data error at pair.bosses[1].boss: no boss has the id "nobody"',
    );
  });

  it('refuses the same boss twice', () => {
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('ashen-hound')] }))).toBe(
      'Pair data error at pair.bosses[1].boss: must be a different boss from the first ("ashen-hound")',
    );
  });

  it('keeps the health scale between 0.2 and 2', () => {
    expect(errorOf(pairWith({ bosses: [member('ashen-hound', 0.1), member('vesper-sage')] }))).toBe(
      'Pair data error at pair.bosses[0].healthScale: must be at least 0.2',
    );
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('vesper-sage', 2.5)] }))).toBe(
      'Pair data error at pair.bosses[1].healthScale: must be at most 2',
    );
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), { boss: 'vesper-sage' }] }))).toBe(
      'Pair data error at pair.bosses[1].healthScale: expected a number',
    );
    expect(parsePair(pairWith({ bosses: [member('ashen-hound', 0.2), member('vesper-sage', 2)] }), strict).bosses).toEqual([
      { boss: 'ashen-hound', healthScale: 0.2 },
      { boss: 'vesper-sage', healthScale: 2 },
    ]);
  });

  it('checks the enrage numbers', () => {
    expect(errorOf(pairWith({ enrage: 'angry' }))).toBe('Pair data error at pair.enrage: expected an object');
    expect(errorOf(pairWith({ enrage: { gapScale: 1.5, walkScale: 1.3 } }))).toBe(
      'Pair data error at pair.enrage.gapScale: must be at most 1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.05, walkScale: 1.3 } }))).toBe(
      'Pair data error at pair.enrage.gapScale: must be at least 0.1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6, walkScale: 0.5 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: must be at least 1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6, walkScale: 4 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: must be at most 3',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: expected a number',
    );
  });

  it('ignores fields it does not know, like the boss checker', () => {
    expect(parsePair(pairWith({ note: 'hello' }), strict).id).toBe('test-pair');
  });
});

describe('the pair registry', () => {
  it('lists Golem and Kite, the Golem first (the Golem is the primary boss)', () => {
    expect(GOLEM_AND_KITE.id).toBe('golem-and-kite');
    expect(GOLEM_AND_KITE.name).toBe('Golem and Kite');
    expect(GOLEM_AND_KITE.bosses.map((m) => m.boss)).toEqual([CINDER_GOLEM.id, STORM_KITE.id]);
  });

  it('lists Hound and Sage, the Hound first (the Hound is the primary boss)', () => {
    expect(PAIRS).toEqual([HOUND_AND_SAGE, GOLEM_AND_KITE]);
    expect(HOUND_AND_SAGE.id).toBe('hound-and-sage');
    expect(HOUND_AND_SAGE.name).toBe('Hound and Sage');
    expect(HOUND_AND_SAGE.bosses.map((m) => m.boss)).toEqual([ASHEN_HOUND.id, VESPER_SAGE.id]);
  });

  it('finds a pair by id and returns undefined for anything else', () => {
    expect(pairById('hound-and-sage')).toBe(HOUND_AND_SAGE);
    expect(pairById('golem-and-kite')).toBe(GOLEM_AND_KITE);
    expect(pairById('ember-duelist')).toBeUndefined();
    expect(pairById('generated')).toBeUndefined();
    expect(pairById('nobody')).toBeUndefined();
  });

  it('never uses the id of a boss, and never repeats an id', () => {
    const bossIds = new Set(BOSSES.map((b) => b.id));
    const seen = new Set<string>();
    for (const pair of PAIRS) {
      expect(bossIds.has(pair.id)).toBe(false);
      expect(pair.id).not.toBe('generated');
      expect(seen.has(pair.id)).toBe(false);
      seen.add(pair.id);
    }
  });
});

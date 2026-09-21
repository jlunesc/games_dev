import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST, bossById } from '../src/bosses';
import { DIALS, NORMAL_DIALS, PRESETS, presetDials } from '../src/game/difficulty';
import {
  DEFAULT_PREFS,
  changedFromPreset,
  isCustom,
  loadPrefs,
  nextStudy,
  nudgeDial,
  parsePrefs,
  resetDials,
  savePrefs,
  selectPreset,
  studyLabel,
} from '../src/ui/prefs';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('the remembered choices', () => {
  it('start with the first boss on Normal, not custom', () => {
    expect(DEFAULT_PREFS).toEqual({
      bossId: EMBER_DUELIST.id,
      presetId: 'normal',
      dials: NORMAL_DIALS,
      study: 1,
    });
    expect(isCustom(DEFAULT_PREFS)).toBe(false);
  });

  it('selecting a preset loads its dials and is not custom', () => {
    const hard = selectPreset(DEFAULT_PREFS, 'hard');
    expect(hard.presetId).toBe('hard');
    expect(hard.dials).toEqual(presetDials('hard'));
    expect(isCustom(hard)).toBe(false);
  });

  it('nudging a dial changes it by one step, makes the choice custom, and remembers the preset it began from', () => {
    const tweaked = nudgeDial(selectPreset(DEFAULT_PREFS, 'hard'), 'speed', 1);
    expect(tweaked.presetId).toBe('hard');
    expect(tweaked.dials.speed).toBeCloseTo(presetDials('hard').speed + 0.05, 9);
    expect(isCustom(tweaked)).toBe(true);
    expect(changedFromPreset(tweaked)).toEqual(['speed']);
  });

  it('nudging back to the preset value is no longer custom', () => {
    const there = nudgeDial(DEFAULT_PREFS, 'health', 1);
    const back = nudgeDial(there, 'health', -1);
    expect(isCustom(back)).toBe(false);
    expect(changedFromPreset(back)).toEqual([]);
  });

  it('never leaves a dial range and stays on the step after many nudges', () => {
    for (const dial of DIALS) {
      let prefs = DEFAULT_PREFS;
      for (let i = 0; i < 60; i++) prefs = nudgeDial(prefs, dial.id, 1);
      expect(prefs.dials[dial.id]).toBe(dial.max);
      for (let i = 0; i < 120; i++) prefs = nudgeDial(prefs, dial.id, -1);
      expect(prefs.dials[dial.id]).toBe(dial.min);
    }
  });

  it('resetting goes back to the preset values', () => {
    const tweaked = nudgeDial(selectPreset(DEFAULT_PREFS, 'easy'), 'damage', 1);
    expect(resetDials(tweaked)).toEqual(selectPreset(DEFAULT_PREFS, 'easy'));
  });

  it('do not share dial objects between choices', () => {
    const a = selectPreset(DEFAULT_PREFS, 'normal');
    a.dials.speed = 9;
    expect(presetDials('normal').speed).toBe(1);
    expect(DEFAULT_PREFS.dials.speed).toBe(1);
  });

  it('keep the default dials apart from the shared Normal dials', () => {
    expect(DEFAULT_PREFS.dials).not.toBe(NORMAL_DIALS);
  });
});

describe('storing the choices', () => {
  it('remembers a full choice', () => {
    const storage = new MemoryStorage();
    const chosen = nudgeDial(selectPreset(DEFAULT_PREFS, 'easy'), 'frequency', 1);
    savePrefs(storage, chosen);
    expect(loadPrefs(storage)).toEqual(chosen);
  });

  it('falls back to the defaults for broken data, an unknown preset or out-of-range dials', () => {
    expect(parsePrefs('nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"presetId":"impossible"}').presetId).toBe('normal');
    const wild = parsePrefs(JSON.stringify({ presetId: 'normal', dials: { speed: 99, health: -4, damage: 'x' } }));
    expect(wild.dials.speed).toBe(DIALS.find((d) => d.id === 'speed')!.max);
    expect(wild.dials.health).toBe(DIALS.find((d) => d.id === 'health')!.min);
    expect(wild.dials.damage).toBe(1);
  });

  it('fills dials missing from old stored data from the preset', () => {
    const partial = parsePrefs(JSON.stringify({ presetId: 'hard', dials: { speed: 1.2 } }));
    expect(partial.dials.speed).toBe(1.2);
    expect(partial.dials.health).toBe(PRESETS[2]!.dials.health);
  });

  it('ignores a dial stored as an infinite number, and a dials value that is not an object', () => {
    // 1e999 is valid JSON that reads back as Infinity.
    const infinite = parsePrefs('{"presetId":"hard","dials":{"speed":1e999,"health":-1e999}}');
    expect(infinite.dials.speed).toBe(PRESETS[2]!.dials.speed);
    expect(infinite.dials.health).toBe(PRESETS[2]!.dials.health);
    for (const dials of ['"text"', '42', 'null', '[1,2]', 'true']) {
      const parsed = parsePrefs(`{"presetId":"easy","dials":${dials}}`);
      expect(parsed.presetId).toBe('easy');
      expect(parsed.dials).toEqual(presetDials('easy'));
    }
  });

  it('keeps a boss id it does not know, and the boss lookup then gives the Duelist', () => {
    const parsed = parsePrefs('{"bossId":"a-boss-that-was-removed"}');
    expect(parsed.bossId).toBe('a-boss-that-was-removed');
    expect(bossById(parsed.bossId)).toBe(EMBER_DUELIST);
  });

  it.each([0, 1, 2] as const)('keeps a stored study value of %i', (study) => {
    expect(parsePrefs(JSON.stringify({ study })).study).toBe(study);
    const storage = new MemoryStorage();
    savePrefs(storage, { ...DEFAULT_PREFS, study });
    expect(loadPrefs(storage).study).toBe(study);
  });

  it.each([3, -1, 'x', null, 1.5, undefined])('reads an invalid study value (%s) as Once and keeps the other fields', (bad) => {
    const raw = JSON.stringify({ bossId: 'some-boss', presetId: 'hard', dials: { speed: 1.2 }, study: bad });
    const parsed = parsePrefs(raw);
    expect(parsed.study).toBe(1);
    expect(parsed.bossId).toBe('some-boss');
    expect(parsed.presetId).toBe('hard');
    expect(parsed.dials.speed).toBe(1.2);
  });

  it('survive a browser that blocks storage', () => {
    const broken = new BrokenStorage();
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, DEFAULT_PREFS)).not.toThrow();
  });
});

describe('the study setting', () => {
  it('cycles Off, Once, Twice and wraps both ways', () => {
    expect(nextStudy(0, 1)).toBe(1);
    expect(nextStudy(1, 1)).toBe(2);
    expect(nextStudy(2, 1)).toBe(0);
    expect(nextStudy(0, -1)).toBe(2);
    expect(nextStudy(2, -1)).toBe(1);
    expect(nextStudy(1, -1)).toBe(0);
  });

  it('has a plain label for each value', () => {
    expect(studyLabel(0)).toBe('Off');
    expect(studyLabel(1)).toBe('Once');
    expect(studyLabel(2)).toBe('Twice');
  });
});

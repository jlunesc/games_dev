import { describe, expect, it } from 'vitest';
import { DIALS } from '../src/game/difficulty';
import {
  createTweak,
  formatDial,
  tweakRows,
  tweakStep,
  type TweakModel,
} from '../src/ui/tweak-model';
import { DEFAULT_PREFS, isCustom, selectPreset } from '../src/ui/prefs';

const row = (model: TweakModel, id: string) => tweakRows(model).findIndex((r) => r.id === id);
const at = (index: number, model = createTweak(DEFAULT_PREFS)): TweakModel => ({ ...model, focus: index });

describe('the tweak rows', () => {
  it('list every dial, then reset, then back, with values and help', () => {
    const rows = tweakRows(createTweak(DEFAULT_PREFS));
    expect(rows.map((r) => r.id)).toEqual([...DIALS.map((d) => d.id), 'reset', 'back']);
    for (const r of rows) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.help.length).toBeGreaterThan(0);
    }
    expect(rows[row(createTweak(DEFAULT_PREFS), 'speed')]!.value).toBe('100%');
    expect(rows[row(createTweak(DEFAULT_PREFS), 'damage')]!.value).toBe('1 hit');
    expect(rows[row(createTweak(DEFAULT_PREFS), 'back')]!.value).toBeUndefined();
  });

  it('formats dial values as percentages, and damage as hits', () => {
    expect(formatDial('speed', 1.05)).toBe('105%');
    expect(formatDial('variety', 0.65)).toBe('65%');
    expect(formatDial('damage', 1)).toBe('1 hit');
    expect(formatDial('damage', 2)).toBe('2 hits');
  });
});

describe('the tweak screen', () => {
  it('up and down move the focus and wrap over the rows including reset and back', () => {
    const count = DIALS.length + 2;
    const start = createTweak(DEFAULT_PREFS);
    expect(tweakStep(start, 'up').model.focus).toBe(count - 1);
    expect(tweakStep(at(count - 1), 'down').model.focus).toBe(0);
  });

  it('right and left change the focused dial by one step and make the choice custom', () => {
    const speed = row(createTweak(DEFAULT_PREFS), 'speed');
    const up = tweakStep(at(speed), 'right').model;
    expect(up.prefs.dials.speed).toBeCloseTo(1.05, 9);
    expect(isCustom(up.prefs)).toBe(true);
    const down = tweakStep(at(speed), 'left').model;
    expect(down.prefs.dials.speed).toBeCloseTo(0.95, 9);
  });

  it('never goes past the ends of a dial', () => {
    const damage = row(createTweak(DEFAULT_PREFS), 'damage');
    let m = at(damage);
    for (let i = 0; i < 6; i++) m = tweakStep(m, 'right').model;
    expect(m.prefs.dials.damage).toBe(3);
  });

  it('confirm on a dial adds a step and wraps from the maximum to the minimum', () => {
    const damage = row(createTweak(DEFAULT_PREFS), 'damage');
    let m = at(damage);
    m = tweakStep(m, 'confirm').model;
    m = tweakStep(m, 'confirm').model;
    expect(m.prefs.dials.damage).toBe(3);
    expect(tweakStep(m, 'confirm').model.prefs.dials.damage).toBe(1);
  });

  it('confirm on a decimal dial wraps from its maximum to its minimum too', () => {
    const speed = row(createTweak(DEFAULT_PREFS), 'speed');
    const atMax = at(speed, createTweak({ ...DEFAULT_PREFS, dials: { ...DEFAULT_PREFS.dials, speed: 1.4 } }));
    expect(tweakStep(atMax, 'confirm').model.prefs.dials.speed).toBe(0.7);
  });

  it('the reset row restores the preset dials', () => {
    const tweaked = at(row(createTweak(DEFAULT_PREFS), 'health'), createTweak(selectPreset(DEFAULT_PREFS, 'hard')));
    const changed = tweakStep(tweakStep(tweaked, 'right').model, 'right').model;
    expect(isCustom(changed.prefs)).toBe(true);
    const reset = tweakStep({ ...changed, focus: DIALS.length }, 'confirm').model;
    expect(reset.prefs).toEqual(selectPreset(DEFAULT_PREFS, 'hard'));
  });

  it('left and right do nothing on the reset row, and back leaves', () => {
    const resetRow = at(DIALS.length);
    expect(tweakStep(resetRow, 'right')).toEqual({ model: resetRow, outcome: 'stay' });
    expect(tweakStep(createTweak(DEFAULT_PREFS), 'back').outcome).toBe('back');
    expect(tweakStep(createTweak(DEFAULT_PREFS), 'down').outcome).toBe('stay');
  });

  it('confirm on the Back row leaves; left and right do nothing there', () => {
    const backRow = at(DIALS.length + 1);
    expect(tweakStep(backRow, 'confirm').outcome).toBe('back');
    expect(tweakStep(backRow, 'left')).toEqual({ model: backRow, outcome: 'stay' });
    expect(tweakStep(backRow, 'right')).toEqual({ model: backRow, outcome: 'stay' });
  });
});

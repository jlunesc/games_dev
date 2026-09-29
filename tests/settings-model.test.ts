import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import {
  createSettingsModel,
  settingsRows,
  settingsStep,
  type SettingsModel,
} from '../src/ui/settings-model';

const at = (focus: number): SettingsModel => ({ ...createSettingsModel(DEFAULT_SETTINGS), focus });

describe('the settings rows', () => {
  it('list the four switches, the Volume row, then Back, each with a help line', () => {
    const rows = settingsRows(createSettingsModel(DEFAULT_SETTINGS));
    expect(rows.map((r) => r.id)).toEqual(['freeze', 'shake', 'flash', 'effects', 'volume', 'back']);
    const effects = rows.find((r) => r.id === 'effects')!;
    expect(effects.label).toBe('Effects');
    expect(effects.help).toBe('Particles, drifting embers and moving background layers.');
    expect(rows.slice(0, 4).every((r) => r.value === 'On' && r.help.length > 0)).toBe(true);
    const off = settingsRows(createSettingsModel({ ...DEFAULT_SETTINGS, shake: false }));
    expect(off.find((r) => r.id === 'shake')!.value).toBe('Off');
    const volume = rows.find((r) => r.id === 'volume')!;
    expect(volume.label).toBe('Volume');
    expect(volume.value).toBe('Medium');
    expect(volume.help).toBe('How loud the sounds and music are.');
    const back = rows.find((r) => r.id === 'back')!;
    expect(back.label).toBe('Back');
    expect(back.value).toBeUndefined();
    expect(back.help).toBe('Return to the menu.');
  });
});

describe('the settings screen', () => {
  it('up and down move the focus and wrap over the rows', () => {
    expect(settingsStep(createSettingsModel(DEFAULT_SETTINGS), 'up').model.focus).toBe(5);
    expect(settingsStep(at(5), 'down').model.focus).toBe(0);
  });

  it('left, right and confirm toggle the focused switch', () => {
    for (const action of ['left', 'right', 'confirm'] as const) {
      const toggled = settingsStep(at(1), action).model;
      expect(toggled.settings).toEqual({ ...DEFAULT_SETTINGS, shake: false });
      expect(settingsStep(toggled, action).model.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('left, right and confirm toggle Effects', () => {
    for (const action of ['left', 'right', 'confirm'] as const) {
      const toggled = settingsStep(at(3), action).model;
      expect(toggled.settings).toEqual({ ...DEFAULT_SETTINGS, effects: false });
      expect(settingsStep(toggled, action).model.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('right and confirm step the volume up, left steps it down, all wrapping round', () => {
    const volumeOf = (m: SettingsModel): string => m.settings.volume;
    expect(volumeOf(settingsStep(at(4), 'right').model)).toBe('high');
    expect(volumeOf(settingsStep(at(4), 'confirm').model)).toBe('high');
    expect(volumeOf(settingsStep(at(4), 'left').model)).toBe('low');
    const high = { ...at(4), settings: { ...DEFAULT_SETTINGS, volume: 'high' as const } };
    expect(volumeOf(settingsStep(high, 'right').model)).toBe('off');
    const off = { ...at(4), settings: { ...DEFAULT_SETTINGS, volume: 'off' as const } };
    expect(volumeOf(settingsStep(off, 'left').model)).toBe('high');
    expect(settingsStep(at(4), 'right').outcome).toBe('stay');
  });

  it('back leaves and nothing else does', () => {
    expect(settingsStep(at(0), 'back').outcome).toBe('back');
    expect(settingsStep(at(0), 'confirm').outcome).toBe('stay');
  });

  it('confirm on the Back row leaves; left and right do nothing there', () => {
    const backRow = at(5);
    expect(settingsStep(backRow, 'confirm').outcome).toBe('back');
    expect(settingsStep(backRow, 'left')).toEqual({ model: backRow, outcome: 'stay' });
    expect(settingsStep(backRow, 'right')).toEqual({ model: backRow, outcome: 'stay' });
  });

  it('does not change the model it is given', () => {
    const start = at(2);
    const before = JSON.stringify(start);
    settingsStep(start, 'confirm');
    expect(JSON.stringify(start)).toBe(before);
  });
});

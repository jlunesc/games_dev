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
  it('list the four switches with On or Off and a help line', () => {
    const rows = settingsRows(createSettingsModel(DEFAULT_SETTINGS));
    expect(rows.map((r) => r.id)).toEqual(['freeze', 'shake', 'flash', 'sound']);
    expect(rows.every((r) => r.value === 'On' && r.help.length > 0)).toBe(true);
    const off = settingsRows(createSettingsModel({ ...DEFAULT_SETTINGS, shake: false }));
    expect(off.find((r) => r.id === 'shake')!.value).toBe('Off');
  });
});

describe('the settings screen', () => {
  it('up and down move the focus and wrap', () => {
    expect(settingsStep(createSettingsModel(DEFAULT_SETTINGS), 'up').model.focus).toBe(3);
    expect(settingsStep(at(3), 'down').model.focus).toBe(0);
  });

  it('left, right and confirm toggle the focused switch', () => {
    for (const action of ['left', 'right', 'confirm'] as const) {
      const toggled = settingsStep(at(1), action).model;
      expect(toggled.settings).toEqual({ ...DEFAULT_SETTINGS, shake: false });
      expect(settingsStep(toggled, action).model.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('back leaves and nothing else does', () => {
    expect(settingsStep(at(0), 'back').outcome).toBe('back');
    expect(settingsStep(at(0), 'confirm').outcome).toBe('stay');
  });

  it('does not change the model it is given', () => {
    const start = at(2);
    const before = JSON.stringify(start);
    settingsStep(start, 'confirm');
    expect(JSON.stringify(start)).toBe(before);
  });
});

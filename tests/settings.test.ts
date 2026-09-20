import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/ui/settings';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('settings', () => {
  it('start with everything on', () => {
    expect(DEFAULT_SETTINGS).toEqual({ freeze: true, shake: true, flash: true, sound: true });
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('are remembered', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { freeze: false, shake: true, flash: false, sound: true });
    expect(loadSettings(storage)).toEqual({ freeze: false, shake: true, flash: false, sound: true });
  });

  it('fall back to the defaults for broken or partial stored data', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"shake": false, "sound": "no"}')).toEqual({
      ...DEFAULT_SETTINGS,
      shake: false,
    });
  });

  it('survive a browser that blocks storage', () => {
    const broken = new BrokenStorage();
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('never hand out the shared default object', () => {
    const a = loadSettings(null);
    a.sound = false;
    expect(DEFAULT_SETTINGS.sound).toBe(true);
  });
});

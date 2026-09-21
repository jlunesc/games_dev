import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/ui/settings';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('settings', () => {
  it('start with everything on', () => {
    expect(DEFAULT_SETTINGS).toEqual({ freeze: true, shake: true, flash: true, effects: true, sound: true });
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('are remembered', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { freeze: false, shake: true, flash: false, effects: false, sound: true });
    expect(loadSettings(storage)).toEqual({ freeze: false, shake: true, flash: false, effects: false, sound: true });
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

  it('read the Effects switch: missing or not a boolean is on, false is kept, the others stay intact', () => {
    expect(parseSettings('{"freeze": false, "shake": true, "flash": true, "sound": true}')).toEqual({
      freeze: false,
      shake: true,
      flash: true,
      effects: true,
      sound: true,
    });
    expect(parseSettings('{"effects": "no"}').effects).toBe(true);
    expect(parseSettings('{"effects": 0}').effects).toBe(true);
    expect(parseSettings('{"effects": false}')).toEqual({ ...DEFAULT_SETTINGS, effects: false });
    expect(parseSettings('{"effects": false, "sound": false, "freeze": false}')).toEqual({
      freeze: false,
      shake: true,
      flash: true,
      effects: false,
      sound: false,
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

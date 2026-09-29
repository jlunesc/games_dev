import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/ui/settings';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('settings', () => {
  it('start with everything on and the volume at medium', () => {
    expect(DEFAULT_SETTINGS).toEqual({ freeze: true, shake: true, flash: true, effects: true, volume: 'medium' });
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('are remembered', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { freeze: false, shake: true, flash: false, effects: false, volume: 'low' });
    expect(loadSettings(storage)).toEqual({ freeze: false, shake: true, flash: false, effects: false, volume: 'low' });
  });

  it('fall back to the defaults for broken or partial stored data', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"shake": false, "sound": "no"}')).toEqual({ ...DEFAULT_SETTINGS, shake: false });
  });

  it('read the Effects switch: missing or not a boolean is on, false is kept, the others stay intact', () => {
    expect(parseSettings('{"freeze": false, "shake": true, "flash": true, "volume": "high"}')).toEqual({
      freeze: false,
      shake: true,
      flash: true,
      effects: true,
      volume: 'high',
    });
    expect(parseSettings('{"effects": "no"}').effects).toBe(true);
    expect(parseSettings('{"effects": 0}').effects).toBe(true);
    expect(parseSettings('{"effects": false}')).toEqual({ ...DEFAULT_SETTINGS, effects: false });
  });

  it('read the volume: a valid value is kept, anything else falls back to medium', () => {
    for (const volume of ['off', 'low', 'medium', 'high']) {
      expect(parseSettings(JSON.stringify({ volume })).volume).toBe(volume);
    }
    expect(parseSettings('{"volume": "loud"}').volume).toBe('medium');
    expect(parseSettings('{"volume": 3}').volume).toBe('medium');
    expect(parseSettings('{}').volume).toBe('medium');
  });

  it('turn an old saved sound switch into the volume', () => {
    expect(parseSettings('{"sound": false}').volume).toBe('off');
    expect(parseSettings('{"sound": true}').volume).toBe('medium');
    expect(parseSettings('{"sound": false, "volume": "low"}').volume).toBe('low');
  });

  it('survive a browser that blocks storage', () => {
    const broken = new BrokenStorage();
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('never hand out the shared default object', () => {
    const a = loadSettings(null);
    a.volume = 'off';
    expect(DEFAULT_SETTINGS.volume).toBe('medium');
  });
});

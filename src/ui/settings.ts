import type { StorageLike } from './storage';

export const VOLUMES = ['off', 'low', 'medium', 'high'] as const;
export type Volume = (typeof VOLUMES)[number];

/** The settings on the Settings screen. Changing one never changes how a fight plays. */
export interface Settings {
  freeze: boolean;
  shake: boolean;
  flash: boolean;
  /** Particles, drifting embers and moving background layers. */
  effects: boolean;
  /** One master volume for every sound and the music. */
  volume: Volume;
}

export const DEFAULT_SETTINGS: Settings = { freeze: true, shake: true, flash: true, effects: true, volume: 'medium' };

const KEY = 'boss-trainer.settings';

/** Reads stored settings; anything missing or broken falls back to the default. Always returns a new object. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
    const o = data as Record<string, unknown>;
    const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : true);
    // An older save has a `sound` switch instead: off stays off, anything else is the default volume.
    const volume = (): Volume => {
      if (typeof o.volume === 'string' && (VOLUMES as readonly string[]).includes(o.volume)) return o.volume as Volume;
      if (o.sound === false) return 'off';
      return DEFAULT_SETTINGS.volume;
    };
    return {
      freeze: flag(o.freeze),
      shake: flag(o.shake),
      flash: flag(o.flash),
      effects: flag(o.effects),
      volume: volume(),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    return parseSettings(storage?.getItem(KEY) ?? null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is full or blocked: the settings just will not be remembered.
  }
}

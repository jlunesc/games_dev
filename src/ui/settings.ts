import type { StorageLike } from './storage';

/** The switches on the Settings screen. Switching one off never changes how a fight plays. */
export interface Settings {
  freeze: boolean;
  shake: boolean;
  flash: boolean;
  /** Particles, drifting embers and moving background layers. */
  effects: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { freeze: true, shake: true, flash: true, effects: true, sound: true };

const KEY = 'boss-trainer.settings';

/** Reads stored settings; anything missing or broken falls back to on. Always returns a new object. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
    const o = data as Record<string, unknown>;
    const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : true);
    return {
      freeze: flag(o.freeze),
      shake: flag(o.shake),
      flash: flag(o.flash),
      effects: flag(o.effects),
      sound: flag(o.sound),
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

import { EMBER_DUELIST } from '../bosses';
import {
  DIALS,
  NORMAL_DIALS,
  PRESETS,
  changedDials,
  clampDial,
  dialsEqual,
  presetDials,
  type DialId,
  type Dials,
  type PresetId,
} from '../game/difficulty';
import { wrap } from './nav';
import type { StorageLike } from './storage';

/** How many times the study phase runs before a fight: 0 = Off, 1 = Once, 2 = Twice. */
export type StudySetting = 0 | 1 | 2;

/** What the menu remembers: the boss, the preset, the dial values (which differ from the preset once tweaked), and the study setting. */
export interface Prefs {
  bossId: string;
  presetId: PresetId;
  dials: Dials;
  study: StudySetting;
}

export const DEFAULT_PREFS: Prefs = {
  bossId: EMBER_DUELIST.id,
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  study: 1,
};

const KEY = 'boss-trainer.prefs';

/** True once the dials differ from the preset the choice began from. */
export function isCustom(prefs: Prefs): boolean {
  return !dialsEqual(prefs.dials, presetDials(prefs.presetId));
}

export function selectPreset(prefs: Prefs, id: PresetId): Prefs {
  return { ...prefs, presetId: id, dials: presetDials(id) };
}

/** Moves one dial by one step up (1) or down (-1), staying inside its range. */
export function nudgeDial(prefs: Prefs, id: DialId, direction: 1 | -1): Prefs {
  const def = DIALS.find((d) => d.id === id);
  if (def === undefined) return prefs;
  const next = clampDial(id, prefs.dials[id] + direction * def.step);
  return { ...prefs, dials: { ...prefs.dials, [id]: next } };
}

/** Back to the values of the preset the choice began from. */
export function resetDials(prefs: Prefs): Prefs {
  return selectPreset(prefs, prefs.presetId);
}

/** The dials that differ from the preset, for the record of a fight. */
export function changedFromPreset(prefs: Prefs): DialId[] {
  return changedDials(presetDials(prefs.presetId), prefs.dials);
}

/** The next study setting, wrapping 0 -> 1 -> 2 -> 0 (or backwards). */
export function nextStudy(value: StudySetting, direction: 1 | -1): StudySetting {
  return wrap(value, direction, 3) as StudySetting;
}

export function studyLabel(value: StudySetting): 'Off' | 'Once' | 'Twice' {
  return value === 0 ? 'Off' : value === 2 ? 'Twice' : 'Once';
}

/** Reads stored choices; anything missing, unknown or out of range falls back safely. */
export function parsePrefs(raw: string | null): Prefs {
  const fallback: Prefs = { ...DEFAULT_PREFS, dials: { ...NORMAL_DIALS } };
  if (raw === null) return fallback;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return fallback;
    const o = data as Record<string, unknown>;
    const presetId = PRESETS.some((p) => p.id === o.presetId) ? (o.presetId as PresetId) : 'normal';
    const base = presetDials(presetId);
    const stored = typeof o.dials === 'object' && o.dials !== null ? (o.dials as Record<string, unknown>) : {};
    const dials = { ...base };
    for (const dial of DIALS) {
      const value = stored[dial.id];
      if (typeof value === 'number' && Number.isFinite(value)) dials[dial.id] = clampDial(dial.id, value);
    }
    return {
      bossId: typeof o.bossId === 'string' ? o.bossId : fallback.bossId,
      presetId,
      dials,
      study: o.study === 0 || o.study === 1 || o.study === 2 ? o.study : fallback.study,
    };
  } catch {
    return fallback;
  }
}

export function loadPrefs(storage: StorageLike | null): Prefs {
  try {
    return parsePrefs(storage?.getItem(KEY) ?? null);
  } catch {
    return parsePrefs(null);
  }
}

export function savePrefs(storage: StorageLike | null, prefs: Prefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage is full or blocked: the choices just will not be remembered.
  }
}

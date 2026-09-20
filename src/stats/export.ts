import type { StorageLike } from '../ui/storage';
import { GAME_VERSION, STATS_SCHEMA_VERSION } from './record';
import type { StoredFight } from './store';

export const EXPORT_FORMAT = 'boss-trainer-stats';

export interface ExportDocument {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  gameVersion: string;
  fights: StoredFight[];
}

export interface ExportFile {
  name: string;
  json: string;
  count: number;
}

/** The export document as a file. The name ends in `.stats.json`, which git ignores (exports are never committed). */
export function buildExport(fights: readonly StoredFight[], now: Date): ExportFile {
  const document: ExportDocument = {
    format: EXPORT_FORMAT,
    schemaVersion: STATS_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    gameVersion: GAME_VERSION,
    fights: [...fights],
  };
  return {
    name: `boss-trainer-${now.toISOString().slice(0, 10)}.stats.json`,
    json: JSON.stringify(document),
    count: fights.length,
  };
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Hands the file to the user: the phone's share sheet where the browser can share files, otherwise a normal
 * download. Nothing is uploaded anywhere; the file only goes where the user sends it.
 */
export async function shareOrDownload(file: ExportFile): Promise<ShareResult> {
  try {
    const blob = new Blob([file.json], { type: 'application/json' });
    const shareable = new File([blob], file.name, { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareable] })) {
      try {
        await navigator.share({ files: [shareable], title: 'Boss Trainer stats' });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // The share sheet failed for another reason: fall back to a download.
      }
    }
    if (typeof document === 'undefined') return 'failed';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

const LAST_EXPORT_KEY = 'boss-trainer.lastExport';

/** When the fights were last exported (an ISO date), or null if never or unreadable. */
export function loadLastExport(storage: StorageLike | null): string | null {
  try {
    const raw = storage?.getItem(LAST_EXPORT_KEY) ?? null;
    return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastExport(storage: StorageLike | null, iso: string): void {
  try {
    storage?.setItem(LAST_EXPORT_KEY, iso);
  } catch {
    // Storage may be full or blocked; the reminder just shows "never".
  }
}

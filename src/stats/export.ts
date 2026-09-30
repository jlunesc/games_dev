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

/** The export document as a file. The content is JSON, but the name ends in `.stats.txt` (plain text) so chat apps accept it as an attachment; git ignores it (exports are never committed). */
export function buildExport(fights: readonly StoredFight[], now: Date): ExportFile {
  const document: ExportDocument = {
    format: EXPORT_FORMAT,
    schemaVersion: STATS_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    gameVersion: GAME_VERSION,
    fights: [...fights],
  };
  return {
    name: `boss-trainer-${now.toISOString().slice(0, 10)}.stats.txt`,
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
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const shareable = new File([file.json], file.name, { type: 'text/plain' });
        if (navigator.canShare({ files: [shareable] })) {
          await navigator.share({ files: [shareable], title: 'Boss Trainer stats' });
          return 'shared';
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // The share sheet failed for another reason: fall back to a download.
      }
    }
    return downloadFile(file);
  } catch {
    return 'failed';
  }
}

/** Saves the file to the device's downloads folder, without the share sheet. */
export function downloadFile(file: ExportFile): 'downloaded' | 'failed' {
  if (typeof document === 'undefined') return 'failed';
  try {
    const url = URL.createObjectURL(new Blob([file.json], { type: 'text/plain' }));
    const link = document.createElement('a');
    try {
      link.href = url;
      link.download = file.name;
      link.hidden = true;
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** Puts the export text on the clipboard so it can be pasted into a chat. A browser may refuse without a finger tap. */
export async function copyToClipboard(file: ExportFile): Promise<'copied' | 'failed'> {
  try {
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return 'failed';
    await navigator.clipboard.writeText(file.json);
    return 'copied';
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

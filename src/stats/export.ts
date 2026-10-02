import type { StorageLike } from '../ui/storage';
import type { FightResult } from '../game/summary';
import type { FightDetails } from './details';
import { GAME_VERSION, STATS_SCHEMA_VERSION, type FightMeta } from './record';
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

export const DETAILS_EXPORT_FORMAT = 'boss-trainer-fight-details';
/** Version of the fight details file (`docs/stats.md` section 7.7); raise it whenever `FightDetails` changes shape. */
export const DETAILS_EXPORT_VERSION = 1;

export interface DetailsExportDocument {
  format: string;
  detailsVersion: number;
  exportedAt: string;
  gameVersion: string;
  /** How the fight was set up and how it ended; with `seed` and `dials` it can be found again in the stats export. */
  fight: FightMeta & { result: FightResult };
  /** The boss's own names for the attacks that appear in `details`, by attack id. */
  attackNames: Record<string, string>;
  details: FightDetails;
}

/** The fight details screen's numbers as a file, named after when the fight was played. Same plain-text naming as the stats export. */
export function buildDetailsExport(
  meta: FightMeta,
  result: FightResult,
  details: FightDetails,
  nameOf: (attackId: string) => string,
  now: Date,
): ExportFile {
  const ids = new Set([
    ...details.attackBands.map((b) => b.attackId),
    ...details.numbers.boss.perAttack.map((a) => a.attackId),
    ...details.reply.perAttack.map((a) => a.attackId),
  ]);
  const document: DetailsExportDocument = {
    format: DETAILS_EXPORT_FORMAT,
    detailsVersion: DETAILS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    gameVersion: GAME_VERSION,
    fight: { ...meta, result },
    attackNames: Object.fromEntries([...ids].map((id) => [id, nameOf(id)])),
    details,
  };
  return {
    name: `boss-trainer-details-${meta.playedAt.slice(0, 19).replace(/[:T]/g, '-')}.stats.txt`,
    json: JSON.stringify(document),
    count: 1,
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

/** Saves the file to the device's downloads folder. */
function downloadFile(file: ExportFile): 'downloaded' | 'failed' {
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

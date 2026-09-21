import { afterEach, describe, expect, it, vi } from 'vitest';
import { bossById } from '../src/bosses';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import type { InputFrame } from '../src/engine/input-frame';
import { analyzeFight } from '../src/stats/analyze';
import { buildExport, EXPORT_FORMAT, loadLastExport, saveLastExport, shareOrDownload, type ExportDocument, type ExportFile } from '../src/stats/export';
import {
  buildRecord,
  GAME_VERSION,
  recordUpdate,
  replayFinalState,
  startRecording,
  STATS_SCHEMA_VERSION,
  type FightMeta,
} from '../src/stats/record';
import type { StoredFight } from '../src/stats/store';
import { BrokenStorage, MemoryStorage } from './memory-storage';
import { withInput } from './helpers';

const meta: FightMeta = {
  bossId: 'ember-duelist',
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 7,
  playedAt: '2026-09-20T10:00:00.000Z',
};

/** The same deterministic player as the record tests. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

function playScripted(updates: number): { state: GameState; fight: StoredFight } {
  const boss = applyDials(bossById(meta.bossId), meta.dials);
  let state = createInitialState(boss, meta.seed);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = scripted(n);
    state = step(state, frame, boss);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  const analysis = analyzeFight({ bossId: meta.bossId, dials: meta.dials, seed: meta.seed, input: rec.runs });
  return { state, fight: buildRecord(rec, 'left', 1, analysis) };
}

const NOW = new Date('2026-09-21T10:00:00Z');

describe('buildExport', () => {
  it('wraps the fights in a versioned document with a dated .stats.json name', () => {
    const { fight } = playScripted(300);
    const file = buildExport([fight], NOW);
    expect(file.count).toBe(1);
    expect(file.name).toBe('boss-trainer-2026-09-21.stats.json');
    expect(file.name).toMatch(/\.stats\.json$/);
    const parsed = JSON.parse(file.json) as ExportDocument;
    expect(parsed.format).toBe(EXPORT_FORMAT);
    expect(parsed.schemaVersion).toBe(STATS_SCHEMA_VERSION);
    expect(parsed.gameVersion).toBe(GAME_VERSION);
    expect(parsed.exportedAt).toBe(NOW.toISOString());
    expect(parsed.fights).toEqual([fight]);
  });

  it('still produces a valid document with no fights', () => {
    const file = buildExport([], NOW);
    expect(file.count).toBe(0);
    const parsed = JSON.parse(file.json) as ExportDocument;
    expect(parsed.fights).toEqual([]);
    expect(parsed.format).toBe(EXPORT_FORMAT);
  });

  it('is replayable: the exported file rebuilds the final state and the analysis', () => {
    const { state, fight } = playScripted(2000);
    const parsed = JSON.parse(buildExport([fight], NOW).json) as ExportDocument;
    const exported = parsed.fights[0]!;
    expect(replayFinalState(exported)).toEqual(state);
    expect(analyzeFight(exported)).toEqual(fight.analysis);
  });
});

describe('last export date', () => {
  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    expect(loadLastExport(storage)).toBeNull();
    saveLastExport(storage, '2026-09-21T10:00:00.000Z');
    expect(loadLastExport(storage)).toBe('2026-09-21T10:00:00.000Z');
  });

  it('gives null for a garbage value, missing storage and blocked storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('boss-trainer.lastExport', 'not a date');
    expect(loadLastExport(storage)).toBeNull();
    expect(loadLastExport(null)).toBeNull();
    expect(loadLastExport(new BrokenStorage())).toBeNull();
  });

  it('does not throw when storage is missing or blocked', () => {
    expect(() => saveLastExport(null, '2026-09-21T10:00:00.000Z')).not.toThrow();
    expect(() => saveLastExport(new BrokenStorage(), '2026-09-21T10:00:00.000Z')).not.toThrow();
  });
});

describe('shareOrDownload', () => {
  const file: ExportFile = { name: 'boss-trainer-2026-09-21.stats.json', json: '{"fights":[]}', count: 0 };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  interface FakeAnchor {
    href: string;
    download: string;
    hidden: boolean;
    click: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }

  function stubDocument(): FakeAnchor {
    const anchor: FakeAnchor = { href: '', download: '', hidden: false, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append: vi.fn() } });
    return anchor;
  }

  it('shares the file through the share sheet when the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(file)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0]![0] as { files: File[] };
    expect(shared.files).toHaveLength(1);
    expect(shared.files[0]!.name).toBe(file.name);
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(file)).toBe('cancelled');
  });

  it('downloads the file when the browser cannot share files', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchor = stubDocument();
    expect(await shareOrDownload(file)).toBe('downloaded');
    expect(create).toHaveBeenCalledTimes(1);
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.download).toBe(file.name);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    // The address is kept for a while so the browser can finish the download, then released.
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith('blob:fake-url');
    create.mockRestore();
    revoke.mockRestore();
  });

  it('falls back to a download when canShare itself throws', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new TypeError('not supported');
      },
      share: vi.fn(),
    });
    const anchor = stubDocument();
    expect(await shareOrDownload(file)).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it('shares the same content as plain text when the browser refuses a JSON file', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn((data: { files: File[] }) => data.files[0]!.type === 'text/plain');
    vi.stubGlobal('navigator', { canShare, share });
    expect(await shareOrDownload(file)).toBe('shared');
    expect(canShare).toHaveBeenCalledTimes(2);
    const shared = share.mock.calls[0]![0] as { files: File[] };
    expect(shared.files[0]!.type).toBe('text/plain');
    expect(shared.files[0]!.name).toBe(file.name);
    expect(await shared.files[0]!.text()).toBe(file.json);
  });

  it('shares a JSON file first when the browser accepts it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    await shareOrDownload(file);
    expect((share.mock.calls[0]![0] as { files: File[] }).files[0]!.type).toBe('application/json');
  });

  it('removes the link even when the click fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {});
    const anchor = stubDocument();
    anchor.click.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await shareOrDownload(file)).toBe('failed');
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });

  it('falls back to a download when the share sheet fails for another reason', async () => {
    vi.useFakeTimers();
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const anchor = stubDocument();
    expect(await shareOrDownload(file)).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it('fails when there is nothing to share with and no page to download from', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', undefined);
    expect(await shareOrDownload(file)).toBe('failed');
  });
});

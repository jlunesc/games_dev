import { describe, expect, it } from 'vitest';
import { NORMAL_DIALS } from '../src/game/difficulty';
import { analyzeFight } from '../src/stats/analyze';
import { buildRecord, recordUpdate, startRecording } from '../src/stats/record';
import { MemoryFightStore, openIndexedDbStore, type StoredFight } from '../src/stats/store';
import { withInput } from './helpers';

/** A small finished fight, with a real analysis. `playedAt` and `seed` make its id unique. */
function sampleFight(playedAt: string, seed = 1): StoredFight {
  let rec = startRecording({
    bossId: 'ember-duelist',
    presetId: 'normal',
    dials: { ...NORMAL_DIALS },
    seed,
    playedAt,
  });
  for (let n = 0; n < 5; n++) rec = recordUpdate(rec, withInput({ moveX: 1 }));
  const analysis = analyzeFight({
    bossId: rec.meta.bossId,
    dials: rec.meta.dials,
    seed: rec.meta.seed,
    input: rec.runs,
  });
  return buildRecord(rec, 'victory', 1, analysis);
}

describe('MemoryFightStore', () => {
  it('round-trips fights, oldest first, and counts them', async () => {
    const store = new MemoryFightStore();
    const later = sampleFight('2026-09-20T11:00:00.000Z');
    const earlier = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(later);
    await store.add(earlier);
    expect(await store.count()).toBe(2);
    expect(await store.all()).toEqual([earlier, later]);
  });

  it('orders fights with the same time by id', async () => {
    const store = new MemoryFightStore();
    const b = sampleFight('2026-09-20T10:00:00.000Z', 0xb);
    const a = sampleFight('2026-09-20T10:00:00.000Z', 0xa);
    await store.add(b);
    await store.add(a);
    expect((await store.all()).map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it('replaces a fight that is added again with the same id', async () => {
    const store = new MemoryFightStore();
    const first = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(first);
    await store.add({ ...first, result: 'defeat' });
    expect(await store.count()).toBe(1);
    expect((await store.all())[0]?.result).toBe('defeat');
  });

  it('clears everything', async () => {
    const store = new MemoryFightStore();
    await store.add(sampleFight('2026-09-20T10:00:00.000Z'));
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it('hands out copies, so changing them does not change the store', async () => {
    const store = new MemoryFightStore();
    const fight = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(fight);
    const got = await store.all();
    got[0]!.result = 'defeat';
    got.pop();
    fight.attempt = 99;
    const again = await store.all();
    expect(again).toHaveLength(1);
    expect(again[0]?.result).toBe('victory');
    expect(again[0]?.attempt).toBe(1);
  });
});

describe('openIndexedDbStore', () => {
  it('resolves to null when there is no IndexedDB (the Node test environment)', async () => {
    expect(await openIndexedDbStore()).toBeNull();
  });

  it('resolves to null when opening fails', async () => {
    const broken = {
      open() {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbStore(broken)).toBeNull();
  });
});

/** What the fake database should do wrong, for the tests that need it to. */
interface FakeOptions {
  /** `open` fires `onerror` instead of succeeding. */
  openFails?: boolean;
  /** Every transaction is aborted instead of completing (its writes are dropped). Carries the abort's error, if any. */
  abort?: { error: Error | null };
}

interface FakeRequest {
  result: unknown;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
  onblocked?: (() => void) | null;
}
interface FakeDb {
  onversionchange: (() => void) | null;
  close(): void;
  createObjectStore(name: string, options: { keyPath: string }): void;
  transaction(name: string, mode: string): unknown;
}


/**
 * The smallest IndexedDB that `openIndexedDbStore` needs, written by hand (no dependency): open with
 * `onupgradeneeded`, one object store keyed by `id`, and transactions that run their requests one macrotask
 * later and then fire `oncomplete` (or `onabort`).
 */
function fakeIndexedDb(options: FakeOptions = {}): { factory: IDBFactory; closed: () => boolean; db: () => FakeDb } {
  const rows = new Map<string, unknown>();
  let created = false;
  let isClosed = false;
  let theDb: FakeDb | null = null;

  const request = (): FakeRequest => ({ result: undefined, error: null, onsuccess: null, onerror: null });

  const db: FakeDb = {
    onversionchange: null,
    close() {
      isClosed = true;
    },
    createObjectStore() {
      created = true;
    },
    transaction() {
      const queue: Array<() => void> = [];
      const tx = {
        error: null as Error | null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore() {
          const add = <T>(work: () => T): FakeRequest => {
            const req = request();
            queue.push(() => {
              req.result = work();
              req.onsuccess?.();
            });
            return req;
          };
          return {
            put: (value: { id: string }) => add(() => {
              rows.set(value.id, structuredClone(value));
            }),
            getAll: () => add(() => [...rows.values()].map((v) => structuredClone(v))),
            count: () => add(() => rows.size),
            clear: () => add(() => rows.clear()),
          };
        },
      };
      setTimeout(() => {
        if (options.abort !== undefined) {
          tx.error = options.abort.error;
          tx.onabort?.();
          return;
        }
        for (const work of queue) work();
        tx.oncomplete?.();
      }, 0);
      return tx;
    },
  };
  theDb = db;

  const factory = {
    open() {
      const req = request();
      req.onupgradeneeded = null;
      req.onblocked = null;
      setTimeout(() => {
        if (options.openFails === true) {
          req.error = new Error('open failed');
          req.onerror?.();
          return;
        }
        req.result = db;
        if (!created) req.onupgradeneeded?.();
        req.onsuccess?.();
      }, 0);
      return req;
    },
  } as unknown as IDBFactory;
  return { factory, closed: () => isClosed, db: () => theDb! };
}

describe('openIndexedDbStore with a fake IndexedDB', () => {
  it('adds, lists oldest first, counts and clears', async () => {
    const store = (await openIndexedDbStore(fakeIndexedDb().factory))!;
    expect(store).not.toBeNull();
    const later = sampleFight('2026-09-20T11:00:00.000Z');
    const earlier = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(later);
    await store.add(earlier);
    expect(await store.count()).toBe(2);
    expect(await store.all()).toEqual([earlier, later]);
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it('replaces a fight added again with the same id', async () => {
    const store = (await openIndexedDbStore(fakeIndexedDb().factory))!;
    const first = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(first);
    await store.add({ ...first, result: 'defeat' });
    expect(await store.count()).toBe(1);
    expect((await store.all())[0]?.result).toBe('defeat');
  });

  it('closes itself when another tab asks for a newer version', async () => {
    const fake = fakeIndexedDb();
    await openIndexedDbStore(fake.factory);
    expect(fake.closed()).toBe(false);
    fake.db().onversionchange?.();
    expect(fake.closed()).toBe(true);
  });

  it('rejects when a transaction is aborted, with the database error or a plain one', async () => {
    const withError = (await openIndexedDbStore(fakeIndexedDb({ abort: { error: new Error('quota') } }).factory))!;
    await expect(withError.add(sampleFight('2026-09-20T10:00:00.000Z'))).rejects.toThrow('quota');
    const without = (await openIndexedDbStore(fakeIndexedDb({ abort: { error: null } }).factory))!;
    await expect(without.add(sampleFight('2026-09-20T10:00:00.000Z'))).rejects.toThrow(
      'IndexedDB transaction aborted',
    );
    await expect(without.clear()).rejects.toThrow('IndexedDB transaction aborted');
  });

  it('gives null when opening fires an error', async () => {
    const fake = fakeIndexedDb({ openFails: true });
    expect(await openIndexedDbStore(fake.factory)).toBeNull();
  });
});

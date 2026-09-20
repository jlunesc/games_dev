import type { Analysis } from './analyze';
import type { FightRecord } from './record';

export type StoredFight = FightRecord<Analysis>;

/** Where finished fights are kept on the device. Tests use memory; the browser uses IndexedDB. */
export interface FightStore {
  add(record: StoredFight): Promise<void>;
  /** Every saved fight, oldest first. */
  all(): Promise<StoredFight[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

const oldestFirst = (a: StoredFight, b: StoredFight): number =>
  a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export class MemoryFightStore implements FightStore {
  private fights = new Map<string, StoredFight>();

  async add(record: StoredFight): Promise<void> {
    this.fights.set(record.id, structuredClone(record));
  }

  async all(): Promise<StoredFight[]> {
    return [...this.fights.values()].map((f) => structuredClone(f)).sort(oldestFirst);
  }

  async count(): Promise<number> {
    return this.fights.size;
  }

  async clear(): Promise<void> {
    this.fights.clear();
  }
}

const DB_NAME = 'boss-trainer';
const STORE_NAME = 'fights';

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/**
 * The browser's IndexedDB as a `FightStore`, or null when it is missing or will not open (private windows,
 * blocked site data). The game plays on without stats in that case.
 */
export async function openIndexedDbStore(factory?: IDBFactory): Promise<FightStore | null> {
  try {
    const idb = factory ?? globalThis.indexedDB;
    if (idb === undefined) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = idb.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    const store = (mode: IDBTransactionMode): { tx: IDBTransaction; fights: IDBObjectStore } => {
      const tx = db.transaction(STORE_NAME, mode);
      return { tx, fights: tx.objectStore(STORE_NAME) };
    };
    return {
      async add(record) {
        const { tx, fights } = store('readwrite');
        fights.put(record);
        await transactionDone(tx);
      },
      async all() {
        const { fights } = store('readonly');
        const found = (await requestResult(fights.getAll())) as StoredFight[];
        return found.sort(oldestFirst);
      },
      async count() {
        const { fights } = store('readonly');
        return requestResult(fights.count());
      },
      async clear() {
        const { tx, fights } = store('readwrite');
        fights.clear();
        await transactionDone(tx);
      },
    };
  } catch {
    return null;
  }
}

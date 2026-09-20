import type { StorageLike } from '../src/ui/storage';

/** A storage that lives in memory, for tests. */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** A storage that throws on every use, like a browser that blocks site data. */
export class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage blocked');
  }
  setItem(): void {
    throw new Error('storage blocked');
  }
}

import { describe, expect, it } from 'vitest';
import { buildServiceWorker } from '../tools/service-worker';

const SCOPE = 'https://owner.github.io/game_dev/';
const ORIGIN = 'https://owner.github.io';
const FILES = ['index.html', 'assets/index-abc123.js', 'manifest.webmanifest'];
const CACHE = 'boss-trainer-cafe00000001';

// Small stand-ins for the browser objects the service worker touches.
class FakeRequest {
  readonly url: string;
  readonly cache: string | undefined;
  readonly method: string;
  readonly mode: string;
  constructor(url: string, init: { cache?: string; method?: string; mode?: string } = {}) {
    this.url = url;
    this.cache = init.cache;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? 'cors';
  }
}

interface FakeResponse {
  readonly body: string;
}

type Listener = (event: never) => void;

function setup(existingCaches: Record<string, Record<string, string>> = {}) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, FakeResponse>>();
  for (const [name, entries] of Object.entries(existingCaches)) {
    stores.set(name, new Map(Object.entries(entries).map(([url, body]) => [url, { body }])));
  }
  const added: FakeRequest[] = [];
  const fetched: FakeRequest[] = [];
  const calls = { skipWaiting: 0, claim: 0 };

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    skipWaiting: () => {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
    clients: {
      claim: () => {
        calls.claim += 1;
        return Promise.resolve();
      },
    },
  };

  const urlOf = (r: FakeRequest | string): string => (typeof r === 'string' ? r : r.url);
  const caches = {
    open: (name: string) => {
      let store = stores.get(name);
      if (!store) {
        store = new Map();
        stores.set(name, store);
      }
      const target = store;
      return Promise.resolve({
        addAll: (requests: FakeRequest[]) => {
          for (const request of requests) {
            added.push(request);
            target.set(request.url, { body: `cached:${request.url}` });
          }
          return Promise.resolve();
        },
      });
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: (request: FakeRequest | string) => {
      for (const store of stores.values()) {
        const hit = store.get(urlOf(request));
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    },
  };

  const network: FakeResponse = { body: 'from the network' };
  const fetchStub = (request: FakeRequest): Promise<FakeResponse> => {
    fetched.push(request);
    return Promise.resolve(network);
  };

  const source = buildServiceWorker(FILES, 'cafe00000001');
  new Function('self', 'caches', 'fetch', 'Request', 'URL', source)(
    self,
    caches,
    fetchStub,
    FakeRequest,
    URL,
  );

  async function lifecycle(type: 'install' | 'activate'): Promise<void> {
    const waits: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    if (!listener) throw new Error(`no ${type} listener registered`);
    listener({ waitUntil: (p: Promise<unknown>) => waits.push(p) } as never);
    await Promise.all(waits);
  }

  /** Dispatch a fetch event. `response` is undefined when the worker did not call respondWith. */
  async function fetchEvent(request: FakeRequest): Promise<{ intercepted: boolean; response?: FakeResponse }> {
    const listener = listeners.get('fetch');
    if (!listener) throw new Error('no fetch listener registered');
    let pending: Promise<FakeResponse> | undefined;
    listener({
      request,
      respondWith: (p: Promise<FakeResponse>) => {
        pending = p;
      },
    } as never);
    if (!pending) return { intercepted: false };
    return { intercepted: true, response: await pending };
  }

  return { install: () => lifecycle('install'), activate: () => lifecycle('activate'), fetchEvent, stores, added, fetched, calls };
}

describe('service worker behavior', () => {
  it('install caches every listed file, resolved against the scope, bypassing the HTTP cache', async () => {
    const sw = setup();
    await sw.install();
    expect(sw.added.map((r) => r.url)).toEqual(FILES.map((f) => new URL(f, SCOPE).href));
    expect(sw.added.every((r) => r instanceof FakeRequest && r.cache === 'reload')).toBe(true);
    expect(sw.stores.has(CACHE)).toBe(true);
    expect(sw.calls.skipWaiting).toBe(1);
  });

  it('activate deletes old caches, keeps the current one and claims the open pages', async () => {
    const sw = setup({ 'boss-trainer-OLD': { [`${SCOPE}index.html`]: 'old' }, [CACHE]: {} });
    await sw.activate();
    expect([...sw.stores.keys()]).toEqual([CACHE]);
    expect(sw.calls.claim).toBe(1);
  });

  it('serves a cached asset from the cache without touching the network', async () => {
    const sw = setup();
    await sw.install();
    const asset = `${SCOPE}assets/index-abc123.js`;
    const result = await sw.fetchEvent(new FakeRequest(asset));
    expect(result.intercepted).toBe(true);
    expect(result.response).toEqual({ body: `cached:${asset}` });
    expect(sw.fetched).toHaveLength(0);
  });

  it('answers a navigation to the scope root or an unknown path with the cached index.html', async () => {
    const sw = setup();
    await sw.install();
    const index = { body: `cached:${SCOPE}index.html` };
    for (const url of [SCOPE, `${SCOPE}no/such/page`]) {
      const result = await sw.fetchEvent(new FakeRequest(url, { mode: 'navigate' }));
      expect(result.intercepted, url).toBe(true);
      expect(result.response, url).toEqual(index);
    }
    expect(sw.fetched).toHaveLength(0);
  });

  it('does not intercept cross-origin GET requests or same-origin non-GET requests', async () => {
    const sw = setup();
    await sw.install();
    const crossOrigin = await sw.fetchEvent(new FakeRequest('https://example.com/x.js'));
    const post = await sw.fetchEvent(new FakeRequest(`${SCOPE}assets/index-abc123.js`, { method: 'POST' }));
    expect(crossOrigin.intercepted).toBe(false);
    expect(post.intercepted).toBe(false);
    expect(sw.fetched).toHaveLength(0);
  });

  it('sends a non-navigation cache miss to the network', async () => {
    const sw = setup();
    await sw.install();
    const request = new FakeRequest(`${SCOPE}not-cached.json`);
    const result = await sw.fetchEvent(request);
    expect(result.intercepted).toBe(true);
    expect(result.response).toEqual({ body: 'from the network' });
    expect(sw.fetched).toEqual([request]);
  });
});

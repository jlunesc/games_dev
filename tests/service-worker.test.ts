import { describe, expect, it } from 'vitest';
import { buildServiceWorker, computeVersion } from '../tools/service-worker';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('buildServiceWorker', () => {
  const files = ['index.html', 'assets/index-abc123.js', 'manifest.webmanifest'];
  const source = buildServiceWorker(files, 'deadbeef0001');

  it('precaches every listed file', () => {
    for (const file of files) expect(source).toContain(JSON.stringify(file));
  });

  it('names the cache after the version', () => {
    expect(source).toContain('"boss-trainer-deadbeef0001"');
  });

  it('never precaches itself', () => {
    expect(buildServiceWorker([...files, 'sw.js'], 'v')).not.toContain('"sw.js"');
  });

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(source)).not.toThrow();
  });

  it('only handles same-origin GET requests and falls back to index.html for navigation', () => {
    expect(source).toContain("request.method !== 'GET'");
    expect(source).toContain('url.origin !== self.location.origin');
    expect(source).toContain("request.mode === 'navigate'");
  });

  it('never fetches from anywhere except through the page request', () => {
    expect(source).not.toMatch(/https?:\/\//);
  });
});

describe('computeVersion', () => {
  const a = { path: 'index.html', content: bytes('<html>') };
  const b = { path: 'assets/x.js', content: bytes('console.log(1)') };

  it('is 12 hex characters', () => {
    expect(computeVersion([a, b])).toMatch(/^[0-9a-f]{12}$/);
  });

  it('does not depend on the order of the entries', () => {
    expect(computeVersion([a, b])).toBe(computeVersion([b, a]));
  });

  it('changes when a file changes', () => {
    const changed = { path: 'assets/x.js', content: bytes('console.log(2)') };
    expect(computeVersion([a, changed])).not.toBe(computeVersion([a, b]));
  });

  it('changes when a file is renamed', () => {
    const renamed = { path: 'assets/y.js', content: b.content };
    expect(computeVersion([a, renamed])).not.toBe(computeVersion([a, b]));
  });
});

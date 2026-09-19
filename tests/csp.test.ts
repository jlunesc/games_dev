import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function policy(): Map<string, string[]> {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/,
  );
  if (!match?.[1]) throw new Error('index.html has no Content-Security-Policy meta tag');
  const directives = new Map<string, string[]>();
  for (const part of match[1].split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

describe('Content Security Policy in index.html', () => {
  it('exists and denies everything by default except the page itself', () => {
    expect(policy().get('default-src')).toEqual(["'self'"]);
  });

  it('only allows scripts, styles and network requests from the page itself', () => {
    const p = policy();
    expect(p.get('script-src')).toEqual(["'self'"]);
    expect(p.get('style-src')).toEqual(["'self'"]);
    expect(p.get('connect-src')).toEqual(["'self'"]);
  });

  it('only allows images, the manifest and workers from the page itself', () => {
    const p = policy();
    expect(p.get('img-src')).toEqual(["'self'"]);
    expect(p.get('manifest-src')).toEqual(["'self'"]);
    expect(p.get('worker-src')).toEqual(["'self'"]);
  });

  it('blocks plugins and restricts base and form targets', () => {
    const p = policy();
    expect(p.get('object-src')).toEqual(["'none'"]);
    expect(p.get('base-uri')).toEqual(["'self'"]);
    expect(p.get('form-action')).toEqual(["'self'"]);
  });

  it('has no unsafe source, wildcard, or remote origin in any directive', () => {
    for (const [name, sources] of policy()) {
      for (const source of sources) {
        expect(source, `${name} ${source}`).not.toMatch(/^'unsafe-/);
        expect(source, `${name} ${source}`).not.toBe('*');
        expect(source, `${name} ${source}`).not.toMatch(/^(https?:|wss?:|\/\/)/);
      }
    }
  });

  it('has no inline script (every <script> has a src)', () => {
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
      (m) => !/\ssrc=/.test(m[1] ?? ''),
    );
    expect(inline).toHaveLength(0);
  });

  it('has no inline style attribute or style element', () => {
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/<style\b/);
  });
});

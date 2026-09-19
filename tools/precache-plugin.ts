import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { buildServiceWorker, computeVersion } from './service-worker.ts';

/** After the build, list every file in the output folder and write a service worker that precaches them. */
export function precachePlugin(): Plugin {
  return {
    name: 'boss-trainer-precache',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) throw new Error('precache plugin needs an output directory');
      const paths = (readdirSync(outDir, { recursive: true }) as string[])
        .map((p) => p.split('\\').join('/'))
        .filter((p) => p !== 'sw.js' && statSync(join(outDir, p)).isFile())
        .sort();
      const entries = paths.map((path) => ({ path, content: readFileSync(join(outDir, path)) }));
      writeFileSync(join(outDir, 'sw.js'), buildServiceWorker(paths, computeVersion(entries)));
    },
  };
}

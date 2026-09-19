// Checks the built site in dist/ (run after `npm run build`). Plain node, no dependencies.
// Run from the repo root. Prints one line per failed assertion and exits 1 if any fail.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const read = (path) => readFileSync(path, 'utf8');

function cspOf(html) {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/,
  );
  return match ? match[1].trim().split(/\s+/).join(' ') : null;
}

// The files the deployed site must contain.
for (const required of [
  'dist/index.html',
  'dist/sw.js',
  'dist/manifest.webmanifest',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png',
]) {
  check(existsSync(required), `${required} is missing`);
}

if (existsSync('dist/index.html')) {
  const html = read('dist/index.html');

  const sourceCsp = cspOf(read('index.html'));
  const builtCsp = cspOf(html);
  check(builtCsp !== null, 'dist/index.html has no Content-Security-Policy meta tag');
  check(
    builtCsp === null || builtCsp === sourceCsp,
    'the Content-Security-Policy in dist/index.html differs from the one in index.html',
  );

  for (const [tag, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
    check(/\ssrc\s*=/i.test(attributes), `dist/index.html has an inline script: ${tag}`);
  }
  check(!/<style\b/i.test(html), 'dist/index.html has a <style> element');
  check(!/\sstyle\s*=/i.test(html), 'dist/index.html has a style="..." attribute');
}

// A data: URI is "data:" followed by a media type or a ";" or "," (avoids matching object keys in minified JS).
const dataUri = /\bdata:(?:[a-z]+\/[a-z0-9.+-]+|;|,)/i;
const textFiles = ['dist/index.html'];
if (existsSync('dist/assets')) {
  for (const name of readdirSync('dist/assets')) {
    if (name.endsWith('.css') || name.endsWith('.js')) textFiles.push(`dist/assets/${name}`);
  }
}
for (const path of textFiles) {
  if (existsSync(path)) check(!dataUri.test(read(path)), `${path} contains a data: URI`);
}

// Every built file (except sw.js itself) must be in the service worker's precache list.
if (existsSync('dist/sw.js')) {
  const match = read('dist/sw.js').match(/const FILES = (\[.*\]);/);
  let listed = null;
  try {
    listed = match ? JSON.parse(match[1]) : null;
  } catch {
    listed = null;
  }
  if (!Array.isArray(listed)) {
    check(false, 'dist/sw.js has no readable FILES list');
  } else {
    const built = readdirSync('dist', { recursive: true })
      .map((p) => p.split('\\').join('/'))
      .filter((p) => p !== 'sw.js' && statSync(join('dist', p)).isFile());
    for (const file of built) check(listed.includes(file), `dist/${file} is not in the sw.js precache list`);
    for (const file of listed) check(built.includes(file), `sw.js precaches ${file}, which is not in dist/`);
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL: ${message}`);
  process.exit(1);
}
console.log('dist check ok');

# M0: PWA Skeleton and Controller Test Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite + TypeScript (strict) repository that builds an installable, offline-capable PWA whose only screen is a controller-agnostic gamepad test screen, with CI and GitHub Pages deployment.

**Architecture:** Pure logic (gamepad report formatting, service worker generation) lives in plain TypeScript modules with Vitest tests. A thin DOM layer (`src/ui/controller-screen.ts`) polls `navigator.getGamepads()` every animation frame and renders with `textContent` only. The service worker is generated at build time by a small in-repo Vite plugin that lists every built file, so no PWA dependency is needed. CSP is a `<meta>` tag.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Node 22 (`>=22.12`), GitHub Actions, GitHub Pages. Dev dependencies only, all pinned exactly with a lockfile: `vite`, `vitest`, `typescript`, `@types/node`.

**Spec:** `docs/superpowers/specs/2026-09-19-m0-design.md` (implements M0 of `docs/SPEC.md` section 11). Also read `CLAUDE.md`.

**Version note:** the versions installed by `npm install` (Vite 8, Vitest 5, TypeScript 7 at planning time) are newer than the config examples below were written against. If a config option or API differs, read the installed package's docs and adapt, keeping the behavior described. Do not downgrade to make the examples fit.

## Global Constraints

- TypeScript strict mode. No `any`. Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- No backend, accounts, uploads, third-party scripts, trackers, or CDN-loaded code. Nothing at runtime talks to the network except loading its own files.
- Few dependencies, all pinned exactly (`.npmrc` has `save-exact=true`) with `package-lock.json` committed. Runtime dependencies: none. Do not add any dependency beyond `vite`, `vitest`, `typescript`, `@types/node` without asking the owner.
- Strict CSP delivered as a `<meta>` tag: no `unsafe-*` sources, no inline `<script>`, no `style="..."` attributes and no `setAttribute('style', ...)` (both blocked). Setting styles through `el.style.setProperty(...)` is allowed and is how this plan passes dynamic values.
- Build output is relative (`base: './'`) so it works on a GitHub Pages sub-path.
- DOM is written with `textContent` and `createElement`. Never `innerHTML`.
- Exported stats and player data are git-ignored. Never commit them.
- **Commit messages: never add a `Co-Authored-By` line or any Claude/Anthropic attribution.** This is the owner's global rule and overrides any default.
- Working style from `CLAUDE.md`: do not add features that are not in this plan without asking the owner.

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json`, `.npmrc` | Scripts and pinned dev dependencies |
| `tsconfig.json` | Strict TypeScript for `src`, `tests`, `tools`, `vite.config.ts` |
| `vite.config.ts` | Vite + Vitest config, registers the precache plugin |
| `.gitignore` | Ignores build output, `node_modules`, exported stats |
| `index.html` | Entry page, CSP meta tag, links to manifest, icon, stylesheet |
| `src/main.ts` | Mounts the screen, registers the service worker in production |
| `src/engine/gamepad-report.ts` | Pure: snapshot, history, text report of gamepads |
| `src/ui/controller-screen.ts` | DOM: polling loop, rendering, copy-report button |
| `src/ui/style.css` | Styles (loaded through `<link>`, so it works under the CSP in dev too) |
| `tools/service-worker.ts` | Pure: generates `sw.js` source and cache version hash |
| `tools/precache-plugin.ts` | Vite plugin: lists `dist/` files and writes `dist/sw.js` |
| `tools/make-icons.mjs` | Generates `public/icons/*.png` with no dependencies |
| `public/manifest.webmanifest`, `public/icons/` | PWA manifest and icons |
| `tests/gamepad-report.test.ts`, `tests/csp.test.ts`, `tests/service-worker.test.ts` | Vitest tests |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI, audit, Pages deploy, dependency alerts |
| `docs/phone-testing.md` | Manual S21 checklist |

`src/bosses`, `src/game` and the rest of the SPEC section 10 layout are created by the milestones that need them (git does not track empty directories).

---

### Task 1: Tooling scaffold and first commit

**Files:**
- Create: `package.json`, `.npmrc`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- Commit also: `CLAUDE.md`, `docs/` (already present)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `typecheck`, `test`, `audit:deps`; `vite.config.ts` default export (extended in Task 5); base `./`.

- [ ] **Step 1: Create `.npmrc`, `package.json`, `.gitignore`**

`.npmrc`:
```
save-exact=true
```

`package.json`:
```json
{
  "name": "boss-trainer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "audit:deps": "npm audit --audit-level=high"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
*.tsbuildinfo
.env

# Exported stats and player data must never be committed (SPEC section 4, rule 6).
# The export file naming is decided in M3; these patterns cover the likely names.
stats/
stats-export/
exports/
*.stats.json
*.stats.csv
```

- [ ] **Step 2: Install pinned dev dependencies**

Run: `npm install --save-dev vite vitest typescript @types/node@22`
Expected: `package.json` gains a `devDependencies` block with exact versions (no `^` or `~`) and `package-lock.json` is created. If any version shows `^` or `~`, remove the prefix by hand and run `npm install` again.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["vite/client", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "tools", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`, minimal `index.html`, `src/main.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Never inline assets as data: URIs; the CSP does not allow them.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Boss Trainer</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
const root = document.getElementById('app');
if (root) {
  root.textContent = 'Boss Trainer';
}
```

- [ ] **Step 5: Verify typecheck and build work**

Run: `npm run typecheck && npm run build`
Expected: both exit 0; `dist/index.html` and `dist/assets/*.js` exist.

- [ ] **Step 6: Commit**

```bash
git add .npmrc .gitignore package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts CLAUDE.md docs
git status --short
git commit -m "chore: scaffold Vite + TypeScript project with project docs"
```
Expected: `git status --short` before committing lists only the files above, with no `node_modules` or `dist`. The commit message has no attribution line.

---

### Task 2: Gamepad report module (TDD)

**Files:**
- Create: `src/engine/gamepad-report.ts`
- Test: `tests/gamepad-report.test.ts`
- Modify: `docs/superpowers/specs/2026-09-19-m0-design.md` (record the history refinement)

**Interfaces:**
- Produces (all exported from `src/engine/gamepad-report.ts`):
  - `interface GamepadLike { readonly index: number; readonly id: string; readonly mapping: string; readonly connected: boolean; readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>; readonly axes: ReadonlyArray<number> }` (the DOM `Gamepad` satisfies it)
  - `interface GamepadSnapshot { index: number; id: string; mapping: string; connected: boolean; buttons: { pressed: boolean; value: number }[]; axes: number[] }`
  - `interface PadHistory { pressedEver: number[]; axisMin: number[]; axisMax: number[] }`
  - `interface PadReading { snapshot: GamepadSnapshot; history: PadHistory }`
  - `interface ReportEnv { date: string; userAgent: string }`
  - `snapshotGamepad(gp: GamepadLike): GamepadSnapshot`
  - `mappingLabel(mapping: string): string`
  - `updateHistory(prev: PadHistory | undefined, snapshot: GamepadSnapshot): PadHistory`
  - `formatGamepad(reading: PadReading): string`
  - `formatReport(env: ReportEnv, readings: readonly PadReading[]): string`

Why history: on the phone the owner taps "Copy report" with a finger, so no controller button is held at that moment. The report therefore also records which buttons were ever pressed and each axis's min/max since the page loaded. This is a small refinement of the approved design.

- [ ] **Step 1: Write the failing tests**

`tests/gamepad-report.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  formatGamepad,
  formatReport,
  mappingLabel,
  snapshotGamepad,
  updateHistory,
  type GamepadLike,
  type PadReading,
} from '../src/engine/gamepad-report';

const pad: GamepadLike = {
  index: 0,
  id: '8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)',
  mapping: 'standard',
  connected: true,
  buttons: [
    { pressed: false, value: 0 },
    { pressed: true, value: 1 },
    { pressed: true, value: 0.5 },
  ],
  axes: [0, -1, 0.25],
};

function reading(gp: GamepadLike): PadReading {
  const snapshot = snapshotGamepad(gp);
  return { snapshot, history: updateHistory(undefined, snapshot) };
}

describe('snapshotGamepad', () => {
  it('copies the values so later changes to the source do not leak in', () => {
    const buttons = [{ pressed: true, value: 1 }];
    const axes = [0.5];
    const source: GamepadLike = { ...pad, buttons, axes };
    const snapshot = snapshotGamepad(source);
    buttons[0] = { pressed: false, value: 0 };
    axes[0] = -1;
    expect(snapshot.buttons).toEqual([{ pressed: true, value: 1 }]);
    expect(snapshot.axes).toEqual([0.5]);
    expect(snapshot.id).toBe(pad.id);
    expect(snapshot.index).toBe(0);
    expect(snapshot.mapping).toBe('standard');
    expect(snapshot.connected).toBe(true);
  });
});

describe('mappingLabel', () => {
  it('names the empty mapping as non-standard', () => {
    expect(mappingLabel('')).toBe('(none, non-standard)');
    expect(mappingLabel('standard')).toBe('standard');
  });
});

describe('updateHistory', () => {
  it('starts from the first snapshot', () => {
    const history = updateHistory(undefined, snapshotGamepad(pad));
    expect(history).toEqual({
      pressedEver: [1, 2],
      axisMin: [0, -1, 0.25],
      axisMax: [0, -1, 0.25],
    });
  });

  it('remembers buttons pressed earlier and widens the axis range', () => {
    const first = updateHistory(undefined, snapshotGamepad(pad));
    const later = snapshotGamepad({
      ...pad,
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
      ],
      axes: [1, 0, -0.5],
    });
    expect(updateHistory(first, later)).toEqual({
      pressedEver: [0, 1, 2],
      axisMin: [0, -1, -0.5],
      axisMax: [1, 0, 0.25],
    });
  });
});

describe('formatGamepad', () => {
  it('prints identity, live values and history for a standard pad', () => {
    expect(formatGamepad(reading(pad))).toBe(
      [
        '--- Gamepad 0 ---',
        'id: 8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)',
        'mapping: standard',
        'buttons: 3',
        'axes: 3',
        'pressed now: 1, 2',
        'button values: 0=0.00 1=1.00 2=0.50',
        'axis values: 0=0.00 1=-1.00 2=0.25',
        'ever pressed: 1, 2',
        'axis range seen: 0=0.00..0.00 1=-1.00..-1.00 2=0.25..0.25',
      ].join('\n'),
    );
  });

  it('labels a non-standard mapping and shows (none) when nothing is pressed', () => {
    const text = formatGamepad(
      reading({ ...pad, mapping: '', buttons: [{ pressed: false, value: 0 }], axes: [] }),
    );
    expect(text).toContain('mapping: (none, non-standard)');
    expect(text).toContain('pressed now: (none)');
    expect(text).toContain('ever pressed: (none)');
  });
});

describe('formatReport', () => {
  const env = { date: '2026-09-19T12:00:00.000Z', userAgent: 'TestAgent/1.0' };

  it('states clearly when no gamepad is connected', () => {
    expect(formatReport(env, [])).toBe(
      [
        'Boss Trainer controller report',
        'date: 2026-09-19T12:00:00.000Z',
        'user agent: TestAgent/1.0',
        'gamepads: 0',
        '',
        'No gamepad detected. Press a button on the controller to wake it.',
      ].join('\n'),
    );
  });

  it('starts with the environment and includes every gamepad', () => {
    const second: GamepadLike = { ...pad, index: 1, id: 'Other Pad', mapping: '' };
    const text = formatReport(env, [reading(pad), reading(second)]);
    expect(
      text.startsWith(
        [
          'Boss Trainer controller report',
          'date: 2026-09-19T12:00:00.000Z',
          'user agent: TestAgent/1.0',
          'gamepads: 2',
          '',
          '--- Gamepad 0 ---',
        ].join('\n'),
      ),
    ).toBe(true);
    expect(text).toContain('--- Gamepad 1 ---');
    expect(text).toContain('id: Other Pad');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/gamepad-report.test.ts`
Expected: FAIL, the import `../src/engine/gamepad-report` cannot be resolved.

- [ ] **Step 3: Implement `src/engine/gamepad-report.ts`**

```ts
export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ReadonlyArray<number>;
}

export interface GamepadSnapshot {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

/** What a pad has done since the page loaded. Lets the report show buttons that are not held at copy time. */
export interface PadHistory {
  pressedEver: number[];
  axisMin: number[];
  axisMax: number[];
}

export interface PadReading {
  snapshot: GamepadSnapshot;
  history: PadHistory;
}

export interface ReportEnv {
  date: string;
  userAgent: string;
}

const fixed = (n: number): string => n.toFixed(2);

const list = (values: readonly number[]): string =>
  values.length > 0 ? values.join(', ') : '(none)';

export function snapshotGamepad(gp: GamepadLike): GamepadSnapshot {
  return {
    index: gp.index,
    id: gp.id,
    mapping: gp.mapping,
    connected: gp.connected,
    buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...gp.axes],
  };
}

export function mappingLabel(mapping: string): string {
  return mapping === '' ? '(none, non-standard)' : mapping;
}

export function updateHistory(
  prev: PadHistory | undefined,
  snapshot: GamepadSnapshot,
): PadHistory {
  const pressed = new Set(prev?.pressedEver ?? []);
  snapshot.buttons.forEach((b, i) => {
    if (b.pressed) pressed.add(i);
  });
  return {
    pressedEver: [...pressed].sort((a, b) => a - b),
    axisMin: snapshot.axes.map((a, i) => Math.min(a, prev?.axisMin[i] ?? a)),
    axisMax: snapshot.axes.map((a, i) => Math.max(a, prev?.axisMax[i] ?? a)),
  };
}

export function formatGamepad({ snapshot: s, history: h }: PadReading): string {
  const pressedNow = s.buttons.flatMap((b, i) => (b.pressed ? [i] : []));
  const ranges = s.axes.map(
    (_, i) => `${i}=${fixed(h.axisMin[i] ?? 0)}..${fixed(h.axisMax[i] ?? 0)}`,
  );
  return [
    `--- Gamepad ${s.index} ---`,
    `id: ${s.id}`,
    `mapping: ${mappingLabel(s.mapping)}`,
    `buttons: ${s.buttons.length}`,
    `axes: ${s.axes.length}`,
    `pressed now: ${list(pressedNow)}`,
    `button values: ${s.buttons.map((b, i) => `${i}=${fixed(b.value)}`).join(' ')}`,
    `axis values: ${s.axes.map((a, i) => `${i}=${fixed(a)}`).join(' ')}`,
    `ever pressed: ${list(h.pressedEver)}`,
    `axis range seen: ${ranges.join(' ')}`,
  ].join('\n');
}

export function formatReport(env: ReportEnv, readings: readonly PadReading[]): string {
  const header = [
    'Boss Trainer controller report',
    `date: ${env.date}`,
    `user agent: ${env.userAgent}`,
    `gamepads: ${readings.length}`,
  ];
  const body =
    readings.length === 0
      ? ['No gamepad detected. Press a button on the controller to wake it.']
      : readings.map(formatGamepad);
  return [...header, '', ...body.flatMap((part, i) => (i === 0 ? [part] : ['', part]))].join('\n');
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/gamepad-report.test.ts && npm run typecheck`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 5: Record the refinement in the design doc**

In `docs/superpowers/specs/2026-09-19-m0-design.md`, under scope item 2, after the "copy report" bullet, add this bullet:

```
   - The report also lists which buttons were ever pressed and each axis's min/max since page load, because on the phone the copy button is tapped by finger while no controller button is held.
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/gamepad-report.ts tests/gamepad-report.test.ts docs/superpowers/specs/2026-09-19-m0-design.md
git commit -m "feat: add gamepad report formatter with press history"
```

---

### Task 3: Hardened entry page and CSP test (TDD)

**Files:**
- Modify: `index.html` (full rewrite)
- Test: `tests/csp.test.ts`

**Interfaces:**
- Consumes: `index.html` at repo root, read as text by the test.
- Produces: the CSP policy string used by every later task. Later tasks add `<link>` tags to `index.html` but must not loosen the CSP.

- [ ] **Step 1: Write the failing test**

`tests/csp.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/csp.test.ts`
Expected: FAIL with "index.html has no Content-Security-Policy meta tag" (the meta test cases fail; the last two cases may pass).

- [ ] **Step 3: Rewrite `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Boss Trainer</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Note: the test regex expects `http-equiv` and `content` on the same meta tag, in that order, with the content value on one line inside double quotes. Keep that shape (attributes may be on separate lines).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/csp.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Verify the built page keeps the CSP and gets no inline script**

Run: `npm run build && grep -c "Content-Security-Policy" dist/index.html && grep -E "<script" dist/index.html`
Expected: count is `1`; every `<script` line contains `src=` (Vite must not have injected an inline script). If Vite injected one, disable that injection in `vite.config.ts` (for example `build.modulePreload: { polyfill: false }`) and re-run.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/csp.test.ts
git commit -m "feat: add strict CSP meta tag with tests"
```

---

### Task 4: Controller test screen

**Files:**
- Create: `src/ui/controller-screen.ts`, `src/ui/style.css`
- Modify: `src/main.ts` (full rewrite), `index.html` (add stylesheet link)

**Interfaces:**
- Consumes: `formatReport`, `mappingLabel`, `snapshotGamepad`, `updateHistory`, types `PadHistory`, `PadReading` from `src/engine/gamepad-report.ts` (Task 2).
- Produces: `mountControllerScreen(root: HTMLElement): void` from `src/ui/controller-screen.ts`. `src/main.ts` is extended in Task 6 (service worker registration).

This task is DOM code with no unit test (no DOM test dependency is allowed). It is verified by typecheck, build, and a manual check.

- [ ] **Step 1: Create `src/ui/controller-screen.ts`**

```ts
import {
  formatReport,
  mappingLabel,
  snapshotGamepad,
  updateHistory,
  type PadHistory,
  type PadReading,
} from '../engine/gamepad-report';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderButton(index: number, pressed: boolean, value: number): HTMLElement {
  const cell = el('div', pressed ? 'button pressed' : 'button');
  const fill = el('div', 'fill');
  fill.style.setProperty('--value', String(value));
  cell.append(fill, el('span', 'label', String(index)));
  return cell;
}

function renderAxis(index: number, value: number): HTMLElement {
  const row = el('div', 'axis');
  const track = el('div', 'track');
  const marker = el('div', 'marker');
  marker.style.setProperty('--value', String(value));
  track.append(marker);
  row.append(el('span', 'label', `axis ${index}`), track, el('span', 'value', value.toFixed(2)));
  return row;
}

function renderPad({ snapshot, history }: PadReading): HTMLElement {
  const section = el('section', 'pad');
  const buttons = el('div', 'buttons');
  snapshot.buttons.forEach((b, i) => buttons.append(renderButton(i, b.pressed, b.value)));
  const axes = el('div', 'axes');
  snapshot.axes.forEach((a, i) => axes.append(renderAxis(i, a)));
  const ever = history.pressedEver.length > 0 ? history.pressedEver.join(', ') : '(none)';
  section.append(
    el('h2', undefined, `Gamepad ${snapshot.index}`),
    el('p', 'pad-id', snapshot.id),
    el('p', undefined, `mapping: ${mappingLabel(snapshot.mapping)}`),
    buttons,
    axes,
    el('p', 'ever', `ever pressed: ${ever}`),
  );
  return section;
}

export function mountControllerScreen(root: HTMLElement): void {
  const title = el('h1', undefined, 'Controller test');
  const hint = el(
    'p',
    'hint',
    'Press any button on the controller to wake it. Press every button and move every stick, then copy the report.',
  );
  const pads = el('div', 'pads');
  const copyButton = el('button', 'copy', 'Copy report');
  copyButton.type = 'button';
  const status = el('p', 'status');
  const fallback = el('textarea');
  fallback.readOnly = true;
  fallback.hidden = true;
  root.replaceChildren(title, hint, pads, copyButton, status, fallback);

  if (typeof navigator.getGamepads !== 'function') {
    pads.append(el('p', 'hint', 'The Gamepad API is not available here. It needs HTTPS or localhost.'));
    copyButton.disabled = true;
    return;
  }

  const noPad = el('p', 'hint', 'No gamepad detected.');
  const histories = new Map<string, PadHistory>();
  let latest: PadReading[] = [];

  function read(): PadReading[] {
    const readings: PadReading[] = [];
    for (const gp of navigator.getGamepads()) {
      if (gp === null) continue;
      const snapshot = snapshotGamepad(gp);
      const key = `${snapshot.index}:${snapshot.id}`;
      const history = updateHistory(histories.get(key), snapshot);
      histories.set(key, history);
      readings.push({ snapshot, history });
    }
    return readings;
  }

  function frame(): void {
    latest = read();
    pads.replaceChildren(...(latest.length > 0 ? latest.map(renderPad) : [noPad]));
    requestAnimationFrame(frame);
  }

  copyButton.addEventListener('click', () => {
    const report = formatReport(
      { date: new Date().toISOString(), userAgent: navigator.userAgent },
      latest,
    );
    navigator.clipboard.writeText(report).then(
      () => {
        fallback.hidden = true;
        status.textContent = 'Report copied to the clipboard.';
      },
      () => {
        fallback.value = report;
        fallback.hidden = false;
        fallback.select();
        status.textContent = 'Clipboard unavailable. Select and copy the text below.';
      },
    );
  });

  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Create `src/ui/style.css`**

```css
:root {
  color-scheme: dark;
  --bg: #12121a;
  --panel: #1c1c28;
  --fg: #e8e8f0;
  --dim: #8a8aa0;
  --accent: #f5c542;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.4 system-ui, sans-serif;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1rem;
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.4rem;
}

h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.hint,
.status {
  color: var(--dim);
}

.pad {
  margin: 1rem 0;
  padding: 1rem;
  background: var(--panel);
  border-radius: 0.5rem;
}

.pad-id {
  margin: 0.25rem 0;
  color: var(--dim);
  font: 0.85rem ui-monospace, monospace;
  word-break: break-all;
}

.buttons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
  gap: 0.4rem;
}

.button {
  position: relative;
  height: 3rem;
  overflow: hidden;
  border: 2px solid var(--dim);
  border-radius: 0.4rem;
}

.button.pressed {
  border-color: var(--accent);
}

.button .fill {
  position: absolute;
  inset: 0;
  background: var(--accent);
  opacity: 0.6;
  transform: scaleY(var(--value, 0));
  transform-origin: bottom;
}

.button .label {
  position: relative;
  display: grid;
  height: 100%;
  place-items: center;
  font-weight: 600;
}

.axes {
  display: grid;
  gap: 0.4rem;
  margin-top: 1rem;
}

.axis {
  display: grid;
  grid-template-columns: 5rem 1fr 4rem;
  align-items: center;
  gap: 0.5rem;
}

.track {
  position: relative;
  height: 0.6rem;
  background: #2a2a3a;
  border-radius: 0.3rem;
}

.marker {
  position: absolute;
  top: -0.2rem;
  left: calc((var(--value, 0) + 1) * 50%);
  width: 0.5rem;
  height: 1rem;
  background: var(--accent);
  border-radius: 0.2rem;
  transform: translateX(-50%);
}

.value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.copy {
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 0.4rem;
  background: var(--accent);
  color: var(--bg);
  font: inherit;
  font-weight: 700;
}

.copy:disabled {
  opacity: 0.4;
}

textarea {
  width: 100%;
  min-height: 12rem;
  margin-top: 0.5rem;
  background: var(--panel);
  color: var(--fg);
  border: 1px solid var(--dim);
  font: 0.85rem ui-monospace, monospace;
}
```

- [ ] **Step 3: Rewrite `src/main.ts` and link the stylesheet**

`src/main.ts`:
```ts
import { mountControllerScreen } from './ui/controller-screen';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountControllerScreen(root);
```

In `index.html`, add this line directly after `<title>Boss Trainer</title>`:
```html
    <link rel="stylesheet" href="/src/ui/style.css" />
```

- [ ] **Step 4: Verify typecheck, tests and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all exit 0 (tests from Tasks 2 and 3 pass, including the CSP test still passing with the new link tag). Then confirm no data: URIs and no inline styles in the build:

Run: `grep -rE "data:|style=" dist/index.html dist/assets/*.css || echo clean`
Expected: `clean`.

- [ ] **Step 5: Manual check on the PC**

Run: `npm run dev` and open the printed `http://localhost:5173` in Chrome or Firefox with the browser console open. Plug in or pair the PC controller and press a button.
Expected: a Gamepad panel appears with the controller's id and mapping; pressed buttons highlight and stick axes move their marker; the browser console shows no CSP violation errors; "Copy report" copies text (paste it to check it matches the format from Task 2) and shows "Report copied to the clipboard."
If the dev server's hot-reload connection is blocked by the CSP (console shows a `connect-src` violation for a `ws:` URL), do not loosen the CSP in `index.html`; instead test with `npm run build && npm run preview` (port 4173) and tell the owner.
Stop the dev server afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/main.ts index.html
git commit -m "feat: add controller test screen"
```

---

### Task 5: Service worker generator and precache plugin (TDD)

**Files:**
- Create: `tools/service-worker.ts`, `tools/precache-plugin.ts`
- Test: `tests/service-worker.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces:
  - `buildServiceWorker(files: readonly string[], version: string): string` from `tools/service-worker.ts`. `files` are paths relative to `dist/` using `/`; the entry `sw.js` is dropped if present.
  - `computeVersion(entries: ReadonlyArray<{ path: string; content: Uint8Array }>): string` returns 12 lowercase hex characters, independent of entry order.
  - `precachePlugin(): Plugin` from `tools/precache-plugin.ts`; on `vite build` writes `dist/sw.js`.
- Consumes: nothing from earlier tasks except `vite.config.ts` (Task 1).

- [ ] **Step 1: Write the failing tests**

`tests/service-worker.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: FAIL, `../tools/service-worker` cannot be resolved.

- [ ] **Step 3: Implement `tools/service-worker.ts`**

```ts
import { createHash } from 'node:crypto';

const SERVICE_WORKER_FILE = 'sw.js';

export function computeVersion(
  entries: ReadonlyArray<{ path: string; content: Uint8Array }>,
): string {
  const hash = createHash('sha256');
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of sorted) {
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * Source of the service worker: precache every built file on install,
 * drop old caches on activate, and serve same-origin GETs cache-first.
 * Navigation requests that miss the cache get index.html, so the app opens offline.
 */
export function buildServiceWorker(files: readonly string[], version: string): string {
  const precache = files.filter((f) => f !== SERVICE_WORKER_FILE);
  return `// Generated by tools/precache-plugin.ts. Do not edit.
const CACHE = ${JSON.stringify(`boss-trainer-${version}`)};
const FILES = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new URL(f, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      if (request.mode === 'navigate') {
        return caches.match(new URL('index.html', self.registration.scope).href);
      }
      return fetch(request);
    }),
  );
});
`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Implement `tools/precache-plugin.ts` and register it**

`tools/precache-plugin.ts`:
```ts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { buildServiceWorker, computeVersion } from './service-worker';

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
```

In `vite.config.ts`, add the import and the `plugins` entry:
```ts
import { defineConfig } from 'vitest/config';
import { precachePlugin } from './tools/precache-plugin';

export default defineConfig({
  base: './',
  plugins: [precachePlugin()],
  build: {
    target: 'es2022',
    // Never inline assets as data: URIs; the CSP does not allow them.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Verify the generated worker**

Run: `npm run typecheck && npm test && npm run build && ls dist && grep -E "boss-trainer-|FILES" dist/sw.js`
Expected: everything exits 0; `dist/sw.js` exists; `FILES` lists `index.html` and the hashed `assets/...` files; the cache name contains a 12-character hash. Run `npm run build` a second time: the cache name is identical (deterministic).

- [ ] **Step 7: Commit**

```bash
git add tools/service-worker.ts tools/precache-plugin.ts tests/service-worker.test.ts vite.config.ts
git commit -m "feat: generate a precaching service worker at build time"
```

---

### Task 6: Manifest, icons, worker registration, PWA check

**Files:**
- Create: `tools/make-icons.mjs`, `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png` (the last two are generated)
- Modify: `index.html` (link tags), `src/main.ts` (register the worker)

**Interfaces:**
- Consumes: `dist/sw.js` produced in Task 5; the page CSP from Task 3 (`manifest-src 'self'`, `worker-src 'self'`, `img-src 'self'` already allow these).
- Produces: an installable PWA.

- [ ] **Step 1: Create `tools/make-icons.mjs` and generate the icons**

```js
// Generates the PWA icons without any dependency: a gold diamond on the dark background.
// Run from the repo root: node tools/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BACKGROUND = [0x12, 0x12, 0x1a];
const DIAMOND = [0xf5, 0xc5, 0x42];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function png(size) {
  const center = (size - 1) / 2;
  const radius = size * 0.32; // stays inside the maskable safe zone
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // first byte is the filter type (0 = none)
    for (let x = 0; x < size; x++) {
      const inside = Math.abs(x - center) + Math.abs(y - center) <= radius;
      const [r, g, b] = inside ? DIAMOND : BACKGROUND;
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size));
}
```

Run: `node tools/make-icons.mjs && file public/icons/*.png`
Expected: `icon-192.png: PNG image data, 192 x 192, 8-bit/color RGB` and the same for 512.

- [ ] **Step 2: Create `public/manifest.webmanifest`**

```json
{
  "name": "Boss Trainer",
  "short_name": "Boss Trainer",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#12121a",
  "theme_color": "#12121a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: Link the manifest and icon in `index.html`, register the worker in `src/main.ts`**

In `index.html`, add these lines directly after the `<link rel="stylesheet" ...>` line:
```html
    <meta name="theme-color" content="#12121a" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/png" href="/icons/icon-192.png" />
```

Append to `src/main.ts`:
```ts

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.error('Service worker registration failed', error);
  });
}
```

- [ ] **Step 4: Verify tests and build output**

Run: `npm run typecheck && npm test && npm run build && grep -E "manifest|icon|theme-color" dist/index.html && ls dist dist/icons`
Expected: exits 0; `dist/index.html` references the manifest and icon with relative paths (`./manifest.webmanifest`, `./icons/icon-192.png`, not `/manifest...`); `dist/manifest.webmanifest`, `dist/icons/*.png` and `dist/sw.js` exist; `dist/sw.js` `FILES` includes the manifest and both icons. If the links came out absolute (`/manifest...`), fix the `base` handling so they are relative, because an absolute path breaks on a GitHub Pages sub-path.

- [ ] **Step 5: Manual PWA check on the PC**

Run: `npm run preview` and open `http://localhost:4173` in Chrome. In DevTools, Application tab:
- Manifest: no errors, shows the name and both icons.
- Service Workers: `sw.js` is "activated and is running".
- Cache Storage: one cache named `boss-trainer-<hash>` holding the built files.
- Tick "Offline" in the Network panel and reload: the page still loads and the controller screen works.
- Console: no CSP violations.
Stop the preview server afterwards. If any check fails, fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add tools/make-icons.mjs public index.html src/main.ts
git commit -m "feat: make the app an installable offline PWA"
```

---

### Task 7: CI, audit, Pages deploy, Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Consumes: npm scripts from Task 1 (`typecheck`, `test`, `audit:deps`, `build`) and the `dist/` output.
- Produces: CI on every push and pull request; deploy of `dist/` to GitHub Pages on pushes to `main`.

Third-party actions are pinned to full commit SHAs (resolved from the GitHub release tags on 2026-09-19); the trailing comment gives the tag. Dependabot keeps them updated.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run audit:deps
      - run: npm run build
      - uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        with:
          path: dist

  deploy:
    needs: check
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    concurrency:
      group: pages
      cancel-in-progress: false
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

- [ ] **Step 2: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 3: Verify what can be verified locally**

Run: `npm run audit:deps`
Expected: exits 0 (no high-severity advisories). If it reports one, tell the owner which package and do not weaken the check.

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ('.github/workflows/ci.yml','.github/dependabot.yml')]; print('yaml ok')"`
Expected: `yaml ok`. If Python has no `yaml` module, skip this; the first CI run is the real check.

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: add checks, npm audit, Pages deploy and Dependabot"
```

---

### Task 8: Docs and spec updates

**Files:**
- Create: `docs/phone-testing.md`
- Modify: `CLAUDE.md` (Commands section and one convention), `docs/SPEC.md` (sections 3, 10, 12)

**Interfaces:**
- Consumes: the scripts and behavior built in Tasks 1 to 7.

- [ ] **Step 1: Fill in `CLAUDE.md`**

Replace the whole "Commands" section (heading and the line "To be added once the tooling is set up (M0).") with:

```markdown
## Commands
- `npm ci`: install the pinned dependencies.
- `npm run dev`: dev server with hot reload at http://localhost:5173.
- `npm test`: run Vitest once.
- `npm run typecheck`: strict TypeScript check.
- `npm run build`: typecheck, then build into `dist/` (also generates `dist/sw.js`, the offline service worker).
- `npm run preview`: serve `dist/` at http://localhost:4173 to test the PWA and service worker.
- `npm run audit:deps`: `npm audit`, fails on high severity.
- `node tools/make-icons.mjs`: regenerate `public/icons/`.

Phone testing is in `docs/phone-testing.md`.
```

Add this bullet at the end of the "Conventions" section:

```markdown
- The CSP blocks inline scripts and `style="..."` attributes. Style through CSS classes or `el.style.setProperty(...)`, and write DOM with `textContent`, never `innerHTML`.
```

- [ ] **Step 2: Update `docs/SPEC.md`**

Section 3: replace the line
`- **DEFAULT**: hosting on GitHub Pages.`
with
```
- **LOCKED**: hosting on **GitHub Pages**. The Content Security Policy is delivered as a `<meta>` tag because Pages cannot set HTTP headers. `frame-ancestors` cannot be enforced this way; accepted as low risk because the game has no login and no data.
- **LOCKED**: build and test tooling is **Vite and Vitest**. The service worker is generated by a small in-repo build plugin (no PWA plugin), to keep dependencies few.
```

Section 10: replace the line
`- **Tooling**: TypeScript strict mode, a minimal build tool and test runner, pinned dependencies, CI with an audit step.`
with
`- **Tooling (LOCKED)**: TypeScript strict mode, Vite and Vitest, pinned dependencies, CI with an audit step.`

Section 12: delete the line `- Hosting and build tooling confirmation.`

- [ ] **Step 3: Create `docs/phone-testing.md`**

```markdown
# Testing on the phone (Galaxy S21)

A PWA can only be installed over HTTPS, so test the phone from the deployed GitHub Pages site, not from the PC over wifi.

## One-time setup
1. Create the GitHub repository and push `main`. Turn on two-factor authentication on the account (SPEC section 4, rule 5).
2. In the repository: Settings, Pages, Source: **GitHub Actions**. The `CI` workflow deploys on every push to `main`.
3. Open the Pages URL (shown in the workflow run) in Chrome on the S21.

## Install and offline check
- [ ] Chrome menu, "Install app" (or "Add to Home screen"). The icon is a gold diamond on dark.
- [ ] Launch it from the home screen: it opens without the browser bar.
- [ ] Turn on airplane mode, close the app fully, launch it again: it still opens.

## Controller check (repeat for every controller mode)
Pair the 8BitDo in Android Bluetooth settings. Check the controller's manual for how to switch modes; each mode may report buttons differently.
1. Open the app and press any button. A "Gamepad" panel appears.
2. Press every button once and move each stick and trigger through its full range.
3. Tap **Copy report** and paste the text into the chat with Claude. Note which 8BitDo mode it was in.
4. Repeat for each mode. The button layout decision (SPEC section 5) will use these reports.

If the controller shows nothing, note the mode, the id string from a different mode if any, and whether the Gamepad panel says "not available" (that means the page is not HTTPS).

## On the PC
`npm run dev`, open http://localhost:5173, plug in or pair the PC controller, and follow the controller check above. Reports from different controllers are expected to differ.
```

- [ ] **Step 4: Final full verification**

Run: `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build`
Expected: everything exits 0 from a clean install. Then `git status --short` shows only the docs changes from this task.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/SPEC.md docs/phone-testing.md
git commit -m "docs: add commands, phone testing checklist and lock tooling decisions"
```

---

## M0 done when

- All eight tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build` passes from a clean checkout.
- The owner has pushed to GitHub, the Pages deploy is green, and the phone checklist in `docs/phone-testing.md` has been completed on the S21 (install, offline launch, and one controller report per 8BitDo mode). The phone steps are the owner's; the code tasks cannot verify them.

## Self-review notes

- Spec coverage: design scope items 1 (Task 1), 2 (Tasks 2, 4), 3 (Tasks 5, 6), 4 (Task 3), 5 (Tasks 1, 7), 6 (Task 8). Tests section: formatter and CSP tests (Tasks 2, 3), plus a service worker generator test (Task 5). The manual S21 check is in Task 8's document.
- Type names are consistent across tasks: `GamepadLike`, `GamepadSnapshot`, `PadHistory`, `PadReading`, `ReportEnv`, `snapshotGamepad`, `mappingLabel`, `updateHistory`, `formatGamepad`, `formatReport`, `buildServiceWorker`, `computeVersion`, `precachePlugin`, `mountControllerScreen`.

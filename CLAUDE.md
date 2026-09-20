# Boss Trainer

A public-repo web game (TypeScript, PWA) that trains boss-fight skills for metroidvanias such as Hollow Knight and Grime. The owner plays it on a Samsung Galaxy S21 with a Bluetooth 8BitDo controller and develops on a PC. Fights are logged and the stats exported for analysis.

**Read `docs/SPEC.md` before implementing anything.** It is the source of truth. Status tags: LOCKED (decided by the owner), DELEGATED, DEFAULT (proposed, not yet approved) and OPEN. Do not silently change LOCKED items. When a decision changes, update the spec and its tag.

## Non-negotiable rules
- No backend, accounts or uploads. No third-party scripts, trackers or CDN-loaded code.
- Few dependencies, all pinned with a lockfile. Add one only when it clearly earns its place, and say so.
- Strict Content Security Policy.
- Exported stats are git-ignored. Never commit them or any player data.
- Bosses are data files, separate from engine code. Art is separate from fight logic.
- Boss designs are inspired by other games but never copied: original names, art and patterns.

## Conventions
- TypeScript in strict mode.
- Game loop uses a fixed timestep so timings are deterministic and measurable in ms.
- The stats schema is versioned and documented. Do not change it without updating the docs.
- Bosses are JSON files in `src/bosses/`, checked by `parseBoss`. The format is documented in `docs/bosses.md`; when the format changes, update that file and the tests.
- The CSP blocks inline scripts and `style="..."` attributes. Style through CSS classes or `el.style.setProperty(...)`, and write DOM with `textContent`, never `innerHTML`.

## Working style
- The owner decides design questions. Propose options with a recommendation and ask before adding anything that is not in the spec.
- For new design topics, go one decision at a time. Do not present a full plan up front.
- Build and test on PC first. Keep the game working as an offline PWA on the phone.

## Commands
- `npm ci`: install the pinned dependencies.
- `npm run dev`: dev server with hot reload at http://localhost:5173.
- `npm test`: run Vitest once.
- `npm run typecheck`: strict TypeScript check.
- `npm run build`: typecheck, then build into `dist/` (also generates `dist/sw.js`, the offline service worker).
- `npm run check:dist`: after a build, check the shipped `dist/` (CSP meta tag, no inline script or style, no `data:` URI, every file in the service worker precache list). Run by CI.
- `npm run preview`: serve `dist/` at http://localhost:4173 to test the PWA and service worker.
- `npm run audit:deps`: `npm audit`, fails on high severity.
- `node tools/make-icons.mjs`: regenerate `public/icons/`. Run it from the repo root.

Phone testing is in `docs/phone-testing.md`.

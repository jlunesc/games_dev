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

## Working style
- The owner decides design questions. Propose options with a recommendation and ask before adding anything that is not in the spec.
- For new design topics, go one decision at a time. Do not present a full plan up front.
- Build and test on PC first. Keep the game working as an offline PWA on the phone.

## Commands
To be added once the tooling is set up (M0).

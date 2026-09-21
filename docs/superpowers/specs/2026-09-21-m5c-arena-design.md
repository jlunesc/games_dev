# M5c Design: arena features (platforms and cover)

Third step of M5 (direction set by the owner on 2026-09-21; the visual pass is M5d and the boss generator M5e). Owner decisions (2026-09-21): **platforms plus cover, described in the boss's data file**; the **Ember Duelist stays flat** (so statistics stay comparable) and the **Ashen Hound gets the first arena**. Everything else is **DELEGATED**.

## What the player sees and can do
- **Platforms:** raised ledges. The player can jump up onto one from below (it does not stop the jump), lands on top when falling, can stand and run on it, and drops off by walking off the edge. A ground-level attack (a sweep, a low shockwave, the bite's box) cannot hurt a player standing above the top of its hit box, so a platform is a place to stand safely from low attacks. From a platform the player's swing cannot reach a boss standing on the floor.
- **Cover:** solid pillars and low walls standing on the floor. They stop the player moving sideways through them (the player can jump onto their top if they are low enough, or over them: a jump peaks at about 155 units), and a dash stops at them. They **block the boss's hit windows**: a hit window that would reach through a cover is cut off at the near edge of the cover, so a player behind it is safe, but only if the cover is at least as tall as the window's top (a low wall stops a low shockwave but a taller attack passes over it). The boss itself is not blocked by cover (it walks through it; a first simplification).
- Drawing in this step is plain (rectangles with a glowing top edge); the visual pass (M5d) makes it nicer.

## Data format (`docs/bosses.md`, `src/bosses/schema.ts`, `parse.ts`)
An optional `arena` on the boss: `{ platforms: [{ x, width, height }], covers: [{ x, width, height }] }` (either list may be empty or absent; absent `arena` means the flat arena as today). `x` is the horizontal centre, `width` the size, `height` the top surface's height above the floor. Rules checked by `parseBoss`: `width` at least 40 and at most 600, the piece inside the arena (`x - width/2 >= 0`, `x + width/2 <= 1280`), platform `height` between 40 and 300, cover `height` between 20 and 400, at most 6 pieces of each kind, pieces of the same kind must not overlap each other, and a platform must not overlap a cover in x while lower than it is tall (keep it simple: platforms and covers must not overlap in x at all). The parsed boss keeps `arena` exactly (absent stays absent).

## Rules (`src/game/`)
- **Player surfaces.** `updatePlayer` gets the arena: the floor, each platform top and each cover top are landing surfaces (one-way: a player lands only when falling or standing, with the feet at or above the surface before the move and at or below it after; jumping up through a platform is free). Covers are also solid from the side: after the horizontal move, if the feet are below the cover's top and the body overlaps the cover in x, the player is pushed back out on the side the player came from (using the previous position); a dash is stopped the same way. Standing on a surface means `onGround` and `y` equal to the surface. Walking off an edge starts a fall. The flat arena behaves exactly as before (the Duelist golden test must pass unchanged).
- **Hit windows and cover.** `activeHitBoxes(b, boss)` returns the hit boxes cut by cover: for a hit window with `top` at or below a cover's height, and a cover in front of the boss (the boss's centre is not inside it), the part of the window beyond the cover's near edge (toward the way the boss faces) is removed; if nothing is left the window is dropped. An option `ignoreCover` returns the uncut boxes (used by the analyzer).
- No new randomness. Everything is arithmetic on integers and the arena data.

## Stats (schema version 3)
- New evasion values: `platform` (the player stood on a raised surface and the attack's box, cut by cover, would have reached a player standing on the floor at that spot) and `cover` (the uncut box would have overlapped the player but the cut box did not). Priority when several apply: `dash`, `jump`, `platform`, `cover`, `distance`.
- New behaviour number `behavior.updatesOnPlatform` (updates the player stood on a platform or a cover top).
- `STATS_SCHEMA_VERSION` becomes 3 (new evasion values are a change of meaning) and `docs/stats.md` is updated. `GAME_VERSION` becomes `0.4.0`: giving the Hound an arena changes how Hound fights replay, so Hound records made by 0.3.0 no longer replay exactly (the analysis stored inside them stays valid data); Ember Duelist records still replay exactly (guarded by the golden test).

## The Ashen Hound's arena (first guess, tuned by feel)
Two platforms and one cover: platforms at x 330 and x 950, width 200, height 130; a cover at x 640, width 60, height 120 (it stops the bite, the rush and the pounce's shockwave, none of which is taller than 120; the player can hop over it). The Duelist stays flat.

## Tests
Parse: valid arenas accepted and kept exactly; each rule rejected with a path (`boss.arena.platforms[0].width` etc.); the Duelist (no arena) unchanged. Physics: landing on a platform from above, jumping up through it, standing and running on it, walking off the edge falls, cover blocks walking and dashing from both sides, jumping onto a cover top and standing there, jumping over a low cover, the flat arena unchanged (golden). Hit boxes: cut at the near edge for facing right and left, kept when the cover is shorter than the window's top, dropped when the boss stands inside the cover, several covers, `ignoreCover`. Analyzer: evasion `platform` and `cover` in scripted fights (a Hound sweep/bite with the player on a platform or behind the cover), priorities, `updatesOnPlatform`. Determinism/replay: Hound fights with the arena replay identically (including through the emulated app loop and with the study). Bots: the Hound bot checks still hold (every fight ends, idle loses).

## Out of scope
Platforms the boss uses, hazards, moving pieces, destroyable cover, a boss blocked by cover, arena pieces chosen at random (M5e), and the nicer look (M5d).

## Done when
Tests pass, CI is green and deployed, and the owner has fought the Hound with the arena on the phone (standing on a platform, hiding behind the cover) and the Duelist still plays as before.

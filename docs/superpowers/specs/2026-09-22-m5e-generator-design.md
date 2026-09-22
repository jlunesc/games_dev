# M5e Design: the boss generator

Fifth and last step of M5. Owner decisions (2026-09-22, this and the two follow-up rounds):
- **Approach:** build from a **bank of skill primitives**, randomized and assembled, not a wholly free-form generator. The reusable part is a **fairness checker** general enough to serve later steps (arenas, phase 2) without a rewrite.
- **Reach:** a **"Generated"** entry in the Boss row; picking Fight builds a **fresh boss from that fight's seed**, so it is replayable and needs no roster or storage.
- **v1 scope:** **no arena** for generated bosses (the arena needs its own placement rules — the owner's feedback on the crowded Hound arena is exactly why this is deferred), **one phase only**, and generated bosses **do get a counterable attack**, like the Duelist's slam.
- If a candidate keeps failing the fairness check, **fall back to a hand-built safe boss** rather than block the fight.

Everything else is **DELEGATED**.

## Primitives
An attack is assembled from the same pieces a boss file already uses (`src/bosses/schema.ts`): a pose, a class, `windup`/`active`/`recovery`, a `range`, and one effect: a **hit window**, a **move** (a dash, forward or back), or a **leap** (an arc landing with a shockwave, like the Hound's pounce). The generator never invents a new kind of effect; it picks among the three that already exist and randomizes their numbers inside **tuned ranges**, narrower than the file format's own limits, so a value that is legal but unfair (a windup too short to read) can never come out.

**Readability floor.** The M5a review found a 233 ms warning unreactable; 283 ms was fine. The generator's `windup` floor is **18 updates (300 ms)** for every attack, regardless of effect, with **21 updates (350 ms)** as the floor for a leap or a fast dash (their danger starts later than the pose, so the floor is measured to the first dangerous update, not to `windup` itself). These floors are constants next to the other tuned ranges (`src/bosses/generate/tuning.ts`), so a later play-test can move them without touching the algorithm.

**Tuned ranges (first guess, all in one file, all a single change to retune):**
- `windup`: 18 to 40. `active`: 4 to 20. `recovery`: 12 to 36.
- Hit window: `x0` 0 to 40, `x1 − x0` 80 to 260, `top` 50 to 190, `bottom` 0.
- Move: `speed` 900 to 1700, duration (`to − from`) 8 to 16.
- Leap: `height` 120 to 260, flight length 16 to 26, target `player` or `forward`/`back` with `distance` 200 to 400.
- `range`: `min` 40 to 240, `max = min + (120 to 260)`.
- `damage`: always 1 (the difficulty dial still scales it; a generated boss does not start harder than a hand-built one).
- Phase: `maxHp` 20 to 40, `spacing` similar to the Hound's, `walkSpeed`/`retreatSpeed` 260 to 420, `gap` 35 to 60, `maxChain` 1 to 2, `chainChance` 0 to 0.3, `predictability` 0.1 to 0.3, `approachTimeout` 40 to 50.
- 3 to 5 attacks per boss. Exactly **one** is `counterable` (the rest `mustDodge`), with a `counter` block (`window` 8 to 14, `range` 160 to 220, `staggerTicks` 70 to 100, `damageMultiplier` 2), and its `windup` gets the extra rule that `window` never exceeds it (the same rule `parseBoss` already enforces).
- `width`/`height`: 60 to 110 each. `startX`: the arena centre, 960 (matching the other bosses). `arena`: absent.
- `id`: always `'generated'`. `name`: `'Generated Boss'`.

Every generated boss is built, then run through `parseBoss` unmodified, exactly like `applyDials` does today — a bad combination can never reach the simulation.

## Determinism and replay
`generateBoss(seed: number): BossDef` uses its **own** seeded stream, derived from the fight's seed by one fixed mixing step (`(seed ^ 0x51ed270b) >>> 0`, then `mulberry32`), so **building the boss never consumes a draw of the gameplay stream**. The state's own `rng` still starts at `seed` and drives attack choice and the study shuffle exactly as it does for a named boss — nothing about `src/game/` changes. The same `seed` therefore reproduces the identical boss and the identical fight every time, on this device or from an exported record on another one.

## The fairness checker (the reusable part)
`checkFairness(boss: BossDef): { fair: boolean; reasons: string[] }` is general — it takes any `BossDef` and says nothing about how it was made, so it is the piece arenas and phase 2 will reuse later. It runs a small, cheap bot battery, all inside pure simulation (no drawing):
- **An idle player must always lose** (over 2 seeds, capped at 3000 updates): proves the boss cannot stall.
- **A scripted skilled bot must win without taking damage** in at least one of 2 seeds (capped at 4000 updates): proves the boss is beatable. The bot reacts to each attack's pose the same way the M5a/M5c review bots did — dash or jump chosen by the attack's effect and height.
- Both checks must finish (no update cap reached with the fight still going): a stalled fight is itself a failure.

A boss that fails any check is rejected with the reasons named (for logs only; the player never sees them).

## Building a fight with "Generated"
1. When the fight starts with `prefs.bossId === 'generated'`, try up to **3** candidates: `generateBoss(seed)`, then `generateBoss(nextRandom(seed).state)`, then one more step of the same chain. Each candidate is checked with `checkFairness`; the first one that passes is used.
2. If all three fail, fall back to a small **hand-built safe boss** (`src/bosses/trainee.json`, id `'trainee'`, two plain attacks, no leap, no counter, generous timings) — built and tested exactly like the Ember Duelist and the Ashen Hound. It is not offered in the Boss row on its own; it exists only as this fallback, so the fight always starts and stays replayable (the same seed always reaches the same outcome: three failed tries, then the trainee).
3. Whichever boss is used, the rest of the fight (dials, study, recording, stats, drawing) works exactly as it does for a named boss: `applyDials`, `createInitialState(boss, seed, study)`, and the analyzer read a `BossDef` and do not know or care that it was generated.

**Cost.** Each fairness check is a handful of pure simulated fights of a few thousand updates; the M5b/M5d benchmarks put full simulated updates (including `structuredClone`) at roughly 12 µs each, so the whole battery for one candidate is on the order of tens of milliseconds, and three candidates well under 300 ms even on a phone several times slower than the machine that measured it. This runs once, synchronously, right before the fight starts (not every frame), so it is not expected to be noticeable; if it is, the app shows nothing extra today (out of scope for v1) and a loading note is a cheap follow-up if the owner's play test says it stutters.

## Wiring
- `resolveBoss(bossId: string, seed: number): BossDef` in `src/bosses/resolve.ts`: `bossId === 'generated'` runs the algorithm above; anything else is `bossById(bossId)` unchanged. Every place that currently calls `bossById(prefs.bossId)` or `bossById(record.bossId)` to start or replay a fight (`src/ui/app.ts` `startFight`, `src/stats/record.ts` `replayFinalState`, `src/stats/analyze.ts` `analyzeFight`) calls `resolveBoss(id, seed)` instead, so recorded "Generated" fights replay exactly.
- The menu's Boss row grows a synthetic **"Generated"** entry after the Ashen Hound (`BOSS_CHOICES`, a small `{ id, name }` list built from `BOSSES` plus the generated entry; the row's cycling and display use this list, `prefs.bossId` is unchanged as the stored string).
- `GAME_VERSION` (`src/stats/record.ts`) is bumped whenever the generator's algorithm or its tuned ranges change, exactly like the rule already in place for a named boss's numbers — a "Generated" record from an older version is not guaranteed to replay identically, and this is documented next to the existing note about the Ashen Hound's arena.
- The Duelist and Hound `bossById` fallback, dials, study, drawing (`moodFor` already falls back to `'neutral'` for an unknown id) and stats are untouched for a generated boss; it is drawn with the neutral mood and the generic figure from M5d, exactly as those were built to allow for.

## Tests
Attack pieces: every field stays inside its tuned range and inside what `parseBoss` allows; the readability floor holds for every effect kind; determinism (the same stream state gives the same attack). Assembly: `generateBoss(seed)` always parses; the same seed gives a deep-equal boss; different seeds usually differ; exactly one counterable attack with a counter block that respects it; a wide sweep of seeds (hundreds) never fails to parse. Fairness: hand-built boss fixtures that should pass (readable, beatable) and should fail (idle stalls forever, an unreadable windup, an unbeatable wall of damage) give the right verdict and reasons; the checker never mutates the boss it is given; it is fast (a measured time budget, not just "seems fast"). Fallback and retry: a forced-always-fail fairness stub proves the three-try-then-trainee path is taken and is itself deterministic from the seed; the trainee boss has its own parse and behaviour tests like the Duelist and the Hound. Wiring: `resolveBoss` for a named id is identical to `bossById`; a "Generated" record replays through `replayFinalState`/`analyzeFight`/the emulated app-loop test exactly like a named one, including with dials, the study and leaving mid-fight; the menu's Boss row cycles Duelist, Hound, Generated and back.

## Out of scope
Arenas for generated bosses, a second phase, a roster of saved generated bosses, exposing the trainee boss on its own, using play stats to steer generation, any change to `src/game/`.

## Done when
Tests pass, CI is green and deployed, and the owner has fought a handful of "Generated" bosses on the phone (different seeds by retrying), including at least one that used its fallback (rare, hard to force from the menu, may need to be shown by a report rather than felt), and found them readable and fair to a first approximation.

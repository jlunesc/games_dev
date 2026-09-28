# Projectiles and the Vesper Sage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add straight bolts and lobbed arcs as a new attack primitive, and one new hand-built caster boss (the Vesper Sage) with its own shape.

**Architecture:** An attack may carry a `shots` list. Shots are game state (`GameState.shots`) advanced once per update by a new `src/game/shots.ts`, so recorded fights replay exactly. Shots outlive their attack; the stats analyzer keeps an attack open until its last shot is gone. The looks (figure, mood, shot drawing) stay in `src/ui/look/` and `render.ts` and never affect the rules.

**Tech Stack:** TypeScript strict, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-28-projectiles-design.md`

## Global Constraints

- Dodge only: the player's swing does nothing to a shot.
- Straight bolt and lobbed arc only. No homing, no rolling waves.
- Cover stops a bolt whose bottom edge is below the cover's height. Arcs ignore cover. Platforms affect nothing.
- An attack with shots is `mustDodge`. The parser rejects `counterable` with shots.
- An attack may have shots and no hit windows: the parser rule becomes "a hit window, a move, a leap or shots".
- A phase change and the end of the fight clear every shot. A shot outlives its attack.
- Shots are deterministic state stepped by the fixed-timestep loop. Study phase: shots are shown but harmless.
- An attack with shots counts as dodged only when all its shots are gone without a hit, and as a hit if any lands.
- Dials: speed scales bolt speed only (an arc's flight is not scaled); readability shifts each shot's `at` with the wind-up; range scales an arc's `distance` and `radius`. No dial changes a bolt's height.
- The five existing bosses and the generator do not change. The Duelist golden test must not move.
- Readability floor for the new boss: wind-up of at least 21 updates for anything that fires after the wind-up.
- The pre-fight fairness check stays the cheap "idle bot must lose".
- CSP rules: no `innerHTML`, no `style="..."`. Looks never change how a fight plays. Every tunable colour, size and strength of the looks is in `src/ui/look/tuning.ts`.
- Stats export shape changes only with a `schemaVersion` bump and `docs/stats.md`. `docs/bosses.md` documents the boss format.
- No attribution lines in commit messages (owner's global rule).

## Data shapes (fixed here so every task uses the same names)

Boss file (`src/bosses/schema.ts`):

```ts
/** A straight bolt: appears at the boss's front at update `at` and flies the way the boss faces. `height` is the bottom edge above the floor, `size` the side of its square, `speed` in units per second. */
export interface BoltDef { kind: 'bolt'; at: number; height: number; size: number; speed: number }
/** A lobbed arc: launched at update `at`, lands `flight` updates later on an x fixed at launch (same targeting as a leap). Only the landing burst hurts: `radius` either side of the landing x, for `burst` updates. */
export interface ArcDef { kind: 'arc'; at: number; flight: number; peak: number; target: LeapTarget; distance?: number; radius: number; burst: number }
export type ShotDef = BoltDef | ArcDef;
// AttackDef gets:  shots?: ShotDef[];
```

Game state (`src/game/state.ts`):

```ts
interface ShotBase { attackId: string; /** state.tick of the update the attack began (unique per occurrence). */ originTick: number; x: number; /** Bottom edge above the floor. */ lift: number }
export interface BoltState extends ShotBase { kind: 'bolt'; dir: 1 | -1; originX: number; size: number; speed: number; height: number }
export interface ArcState extends ShotBase { kind: 'arc'; age: number; flight: number; fromX: number; toX: number; launchLift: number; peak: number; radius: number; burst: number }
export type ShotState = BoltState | ArcState;
// GameState gets:  shots: ShotState[];  shotHits: { attackId: string; originTick: number }[];  (shotHits is reset every update)
```

`src/game/params.ts` gets `SHOT = { arcBurstHeight: 90 }`.

Geometry (`src/game/geometry.ts`): `shotBox(shot: ShotState): Box | null` (a bolt's square; an arc's burst rectangle while its burst is on; `null` while an arc is still flying).

## File Structure

- Create `src/game/shots.ts`: `spawnShots`, `moveShots`, `resolveShotHits`. One responsibility: the life of a shot.
- Create `src/bosses/vesper-sage.json`.
- Modify `schema.ts`, `parse.ts`, `state.ts`, `geometry.ts`, `boss.ts`, `step.ts`, `params.ts`, `difficulty.ts`, `stats/analyze.ts`, `stats/record.ts`, `ui/render.ts`, `ui/look/figures.ts`, `ui/look/moods.ts`, `ui/look/tuning.ts`, `bosses/index.ts`.
- Docs: `docs/bosses.md`, `docs/stats.md`, `docs/SPEC.md` (section 11, DEFAULT), `docs/backlog.md`.
- Tests: new `tests/shots.test.ts`, `tests/vesper-sage.test.ts`; extend `tests/boss-parse.test.ts`, `tests/difficulty.test.ts`, `tests/bosses-index.test.ts`, the stats tests and the schema-version references (`tests/record.test.ts`, `tests/export.test.ts`, `tests/loop-replay.test.ts`).

---

### Task 1: Format, parser and dials

**Files:**
- Modify: `src/bosses/schema.ts`, `src/bosses/parse.ts`, `src/game/difficulty.ts`
- Test: `tests/boss-parse.test.ts`, `tests/difficulty.test.ts`

**Interfaces:**
- Produces: `BoltDef`, `ArcDef`, `ShotDef`, `AttackDef.shots?`; `parseBoss` accepts and checks `shots`; `applyDials` adjusts them.

Parser rules (paths like `boss.attacks[0].shots[1].height`):
- `shots`, when present, is a list of 1 to 8 entries; each has `kind` `'bolt'` or `'arc'`.
- both kinds: `at` whole, `>= windup` and `< windup + active`.
- bolt: `height` 0 to 200, `size` 10 to 80, `speed` 100 to 1600.
- arc: `flight` whole 20 to 120, `peak` 60 to 400, `target` in `player|forward|back` (`distance >= 1` for the other two, absent for `player`), `radius` 10 to 200, `burst` whole 3 to 30.
- an attack with `shots` must be `mustDodge`.
- an attack needs a hit window, a move, a leap or shots.

Dials (`adjustAttack`): each shot gets `at + shift`; a bolt's `speed * d.speed`; an arc's `radius * d.range` (never below 10) and, when it has one, `distance * d.range` (never below 1).

- [ ] **Step 1: Write failing tests.** In `tests/boss-parse.test.ts`: a valid attack with one bolt and one arc parses and keeps its fields; each rejection (unknown kind, `at` before wind-up, `at` after the active part, bolt speed 0, arc without `distance` for `forward`, `distance` given for `player`, `counterable` with shots, empty `shots` list on an attack with no hit/move/leap, more than 8 shots) throws a `BossFormatError` naming the path. In `tests/difficulty.test.ts`: with a shot-carrying boss (built by spreading `DUELIST` and adding an attack), at every dial extreme the result parses, every bolt `height` is unchanged, `at` moves by the same amount as `windup`, bolt speed scales with `speed`, arc `flight` and `peak` are unchanged, arc `radius` and `distance` scale with `range`.
- [ ] **Step 2: Run** `npx vitest run tests/boss-parse.test.ts tests/difficulty.test.ts`. Expected: FAIL (`shots` unknown / not kept).
- [ ] **Step 3: Implement** the types in `schema.ts`, a `shotList(o.shots, path, windup, active, cls)` function in `parse.ts` plus the relaxed "needs" rule, and the `shots` mapping in `adjustAttack` (`next.shots = attack.shots.map(...)`), following the rules above. `parse.ts` returns `shots` only when present (like `move` and `leap`).
- [ ] **Step 4: Run** the two test files, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add a shots list to attacks (bolts and lobbed arcs) with parser checks and dials`.

---

### Task 2: State and engine

**Files:**
- Create: `src/game/shots.ts`
- Modify: `src/game/state.ts`, `src/game/params.ts`, `src/game/geometry.ts`, `src/game/boss.ts`, `src/game/step.ts`
- Test: `tests/shots.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `spawnShots(s: GameState, boss: BossDef, attack: AttackDef): void`, `moveShots(s: GameState, boss: BossDef): void`, `resolveShotHits(s: GameState, boss: BossDef, studying: boolean): void`, `shotBox(shot)`, `GameState.shots`, `GameState.shotHits`.

Behaviour, in `step` order: `updatePlayer`, then `moveShots` (advance the shots already alive), then `updateBoss` (which calls `spawnShots` when `attackTick === shot.at`, so a new shot appears on update `at` and first moves on the next one), the existing counter and swing resolution, `resolveBossHits`, then `resolveShotHits`. `s.shotHits = []` at the start of every update. `beginTransition` sets `s.shots = []`; `step` clears them when the fight is over.

- `spawnShots`: `originTick = s.tick - b.attackTick`. Bolt: `x = originX = b.x + b.facing * boss.width / 2`, `dir = b.facing`, `lift = height`. Arc: `fromX = boss.x-front` as for a bolt, `toX` = same targeting as `leapLanding` (player x at launch, or `distance` forward or back of the boss) clamped to the arena, `launchLift = boss.height * 0.6`, `age = 0`.
- `moveShots`: bolt `x += dir * speed * DT`; removed when its box is fully outside `[0, WORLD.width]`, or when a cover with `height > bolt.height` lies ahead of `originX` and the bolt's front edge has reached the cover's near edge. Arc: `age += 1`; while `age < flight`, `p = age / flight`, `x = fromX + (toX - fromX) * p`, `lift = launchLift * (1 - p) + 4 * peak * p * (1 - p)`; from `age >= flight` the burst is on (`x = toX`, `lift = 0`); removed at `age >= flight + burst`.
- `resolveShotHits`: nothing if the player is invulnerable. Shots whose `shotBox` overlaps the player box are removed and recorded in `shotHits`. Not studying: one `hurtPlayer` for the largest `damage` among them. Studying: `invulnerableTicks = PLAYER.hitInvulnerability` and a `studyHit` event, no damage.

- [ ] **Step 1: Write failing tests** in `tests/shots.test.ts`, using a small test boss built from `DUELIST` (spread, then one attack with `shots`, `spacing` wide and `range` 0 to 1e9 so it fires at once, arena with one cover where a test needs it). Cases: a bolt appears at the boss's front on update `at`, flies at `speed / 60` per update and disappears at the wall; a bolt hits a standing player for the attack's damage and is removed; a jumping player passes over a low bolt; a dashing player passes through it, and the bolt keeps flying; a cover of height above the bolt's `height` stops it, a lower cover does not; an arc records its landing x at launch (the player moves away afterwards and is not hurt), hurts a player standing at the mark on the landing update, and is not stopped by a cover; a bolt still flies after its attack ended; a phase change and a defeat clear `s.shots`; in the study a shot that reaches the player gives `studyHit` and no damage; one update never hurts twice; a fight with shots replays identically from the same seed and input.
- [ ] **Step 2: Run** `npx vitest run tests/shots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the state fields (initialised empty in `createInitialState`), `SHOT` in `params.ts`, `shotBox` in `geometry.ts`, `shots.ts`, the spawn call in `boss.ts` `updateAttack` (after the move and leap, `for (const shot of attack.shots ?? []) if (shot.at === b.attackTick) ...`), the clear in `beginTransition`, and the calls and end-of-fight clear in `step.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: all PASS, and the Duelist golden test unchanged.
- [ ] **Step 5: Commit** `feat: bolts and lobbed arcs as game state (spawn, move, cover, hit, clear)`.

---

### Task 3: Stats

**Files:**
- Modify: `src/stats/analyze.ts`, `src/stats/record.ts` (`STATS_SCHEMA_VERSION` 3 to 4), `docs/stats.md`
- Modify tests that name the schema version: `tests/record.test.ts`, `tests/export.test.ts`, `tests/loop-replay.test.ts`
- Test: `tests/stats-shots.test.ts`

**Interfaces:**
- Consumes: `GameState.shots`, `GameState.shotHits`, `shotBox`.
- Produces: `AttackOccurrence.shotsFired: number` (how many shots the attack fires; 0 for the old kinds of attack).

Analyzer changes:
- `OpenAttack` gets `hasShots`, `lastShotAt`, `shotsDone`, `shotsCleared`.
- `dangerFrom` / `dangerTo` include the shots: a bolt at `at`, an arc at `at + flight` to `at + flight + burst`.
- An attack with shots is resolved when `lastT >= lastShotAt`, none of its shots (`attackId` and `originTick === startTick`) is left in `after.shots`, and the update did not carry `phaseChange`, `bossDefeated` or `playerDefeated` (then `shotsCleared`, and the outcome is `interrupted` unless already hit).
- When an attack ends while its shots still fly, it moves to a `lingering` list instead of being emitted. Each update the lingering attacks get `observeShots` and are emitted once done or cleared; the ones left at the end of the run are emitted as they are. The list is sorted by `startTick` at the end.
- Hits: `observe` attributes a `playerHit`/`studyHit` to the open attack only when `after.shotHits` is empty; `observeShots` attributes it to the attack whose `attackId` and `originTick` are in `after.shotHits`, and adds the health lost.
- Evasion for shots (dash, jump, platform, else distance): while one of the attack's shots has a `shotBox` that overlaps the player and the player dashes, `dashedInDanger`; if the box does not overlap the player but would overlap the player standing on the floor at the same x, and the player is airborne (not dashing) `airborneInDanger`, on a raised surface `platformInDanger`. A bolt stopped by cover counts as `distance` (documented in `docs/stats.md`).

- [ ] **Step 1: Write failing tests** in `tests/stats-shots.test.ts` using `analyzeRun` with a shot boss and scripted input: an idle player is hit by a bolt, outcome `hit`, `damageTaken` equal to the attack's damage, `shotsFired` 1; a player who jumps over a low bolt gets `dodged` with evasion `jump`, and the outcome appears only after the bolt is gone (the occurrence exists when the run continues past the bolt); a dash through a bolt gives `dodged`/`dash`; an attack with three bolts where the last one hits is `hit`; a hit during the next attack is not attributed to the next attack; a phase change while a bolt flies gives `interrupted`; the list of occurrences is sorted by `startTick`.
- [ ] **Step 2: Run** `npx vitest run tests/stats-shots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as above. Bump the schema version, update `docs/stats.md` (new field, the meaning of the outcome for shot attacks, the cover note, the version history line) and the three tests that name the version.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, and `tests/golden` (Duelist fight fingerprint) unchanged.
- [ ] **Step 5: Commit** `feat: stats resolve attacks with shots once the last shot is gone (schema 4)`.

---

### Task 4: Drawing the shots

**Files:**
- Modify: `src/ui/render.ts`, `src/ui/look/tuning.ts`
- Test: extend `tests/look-render.test.ts` if it exists, otherwise a small pure-function test for any helper that is extracted.

A bolt is a glowing square (`LOOK.shot.boltColor`, a lighter core), interpolated like other moving things is not needed (it moves at most 27 units per update). An arc in flight is a round orb at `(x, floorY - lift)` and, from launch until the burst ends, a red mark on the floor at `toX` with the burst's width (`2 * radius`), like `landingRing` for the leap; the burst itself is drawn as a bright rising column while `age >= flight`. Colours are red-family to match "must dodge". All numbers in `LOOK.shot`.

- [ ] **Step 1: Add** `LOOK.shot` to `tuning.ts` (bolt colour and core colour, orb radius, mark colour and alpha, burst colour).
- [ ] **Step 2: Implement** `drawShots(ctx, shots, arc)` in `render.ts` next to `drawBoss` and call it after the boss and before the player, following the same pattern (world units through the existing transform).
- [ ] **Step 3: Run** `npm run typecheck` and `npm test`. Expected: PASS.
- [ ] **Step 4: Commit** `feat: draw bolts, arcs and the arc's floor mark`.

---

### Task 5: The Vesper Sage

**Files:**
- Create: `src/bosses/vesper-sage.json`, `tests/vesper-sage.test.ts`
- Modify: `src/bosses/index.ts` (`VESPER_SAGE`, added to `BOSSES` last), `src/ui/look/figures.ts` (`vesperSageFigure` and `case 'vesper-sage'` in `bossFigure`), `src/ui/look/moods.ts` (`'vesper-sage'`), `tests/bosses-index.test.ts`, `tests/look-figures.test.ts`, `tests/menu-model.test.ts` if it hard-codes the roster.

Boss file (first guess, tuned later from play): width 60, height 170, `startX` 1000, `maxHp` 20, `spacing` 420 to 620, `approachTimeout` 30, `predictability` 0.2, counter as usual (never used: all attacks are `mustDodge`), `transitionTicks` 60. Arena: one cover at `x` 640, width 100, height 90 (stops the low and chest bolts, not the high one; the arcs and the burst reach anyone behind it, so there is no safe place).

| Attack | Pose | Wind-up / active / recovery | Range | What it does |
|---|---|---|---|---|
| `single-bolt` | sideways | 30 / 6 / 24 | 300 to 700 | one bolt at `at` 30, height 40, size 30, speed 700 |
| `triple-volley` | raised | 32 / 24 / 30 | 300 to 700 | bolts at 32 (height 0), 42 (height 46), 52 (height 110), size 30, speed 620 |
| `lob` | back | 34 / 4 / 40 | 250 to 700 | arc at 34, flight 46, peak 300, target `player`, radius 70, burst 8 |
| `point-blank-burst` | down | 22 / 6 / 26 | 0 to 260 | hit window 22 to 28, x 0 to 220, height 0 to 150 |

Phase 1 "Vesper": `single-bolt` 3, `triple-volley` 2, `lob` 2, `point-blank-burst` 1; `gap` 45, `maxChain` 1, `chainChance` 0, `walkSpeed` 260, `retreatSpeed` 380. Phase 2 "Overcharged" from 0.5: same attacks, `opening` `lob`, `gap` 30, `maxChain` 2, `chainChance` 0.4, speeds 300 and 420.

Figure: a tall thin hooded body with a triangular robe, a hood peak, and a glowing orb held out at the front that grows during the wind-up (all inside the boss's drawn box plus the usual margin, mirrored with `facing`, as `tests/look-figures.test.ts` checks for the others). Mood: a cold violet dusk (`skyTop '#0c0a1a'`, `skyBottom '#241a4a'`, accent `'#b48cff'`).

- [ ] **Step 1: Write failing tests.** `tests/vesper-sage.test.ts`: file shape (id, name, four attack ids, one cover, two phases, every attack with shots is `mustDodge`, every wind-up at least 21); the idle bot loses on 8 seeds within 4000 updates; the camp check (idle player perched on the cover's top) also loses; a scripted player who dashes through each bolt and steps off each arc's mark wins a seed without taking damage (the boss is beatable), and a player who hides behind the cover is still hurt (by an arc or the burst) and the fight ends; the boss survives `applyDials` at every extreme (parses and an idle player still loses). `tests/bosses-index.test.ts`: add the boss to the list and ids. `tests/look-figures.test.ts`: the new figure stays inside its box, mirrors, and the orb is larger during a wind-up. Moods test already loops over `BOSSES`.
- [ ] **Step 2: Run** the new and changed tests. Expected: FAIL.
- [ ] **Step 3: Implement** the file, the registration, the figure and the mood.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the Vesper Sage, a caster boss with bolts and lobbed arcs`.

---

### Task 6: Docs and hand-off

**Files:**
- Modify: `docs/bosses.md` (the `shots` field, its checks, the dials, the Vesper Sage's section), `docs/SPEC.md` (section 11 entry for this slice, tagged DEFAULT until the owner plays it), `docs/backlog.md` (what slice A left: no shots in the generator, no cutting or deflecting, slices B to D), the spec (status line "built").

- [ ] **Step 1: Update** the four documents.
- [ ] **Step 2: Run** `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist`.
- [ ] **Step 3: Commit** `docs: document projectiles and the Vesper Sage`.

---

## Self-review

- Spec coverage: dodge-only (no code touches shots in `resolvePlayerAttack`), bolt and arc (Tasks 1 and 2), cover rules (Task 2), one caster boss with figure and mood (Task 5), dials (Task 1), stats and schema bump (Task 3), fairness (Task 5 bot tests), format docs (Task 6), study harmless (Task 2), clean slate (Task 2), determinism (Task 2). The open items of the spec are resolved above: data shapes in "Data shapes", numbers in Tasks 1, 2 and 5, the `SPEC.md` entry in Task 6, the name stays Vesper Sage.
- Placeholders: none; numbers marked "first guess" are for play-testing, as in the spec.
- Types: `ShotDef`/`ShotState`, `shotBox`, `shotHits`, `shotsFired` are used with these names in every task.

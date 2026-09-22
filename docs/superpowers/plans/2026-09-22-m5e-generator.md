# M5e Boss Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Generated" entry in the Boss row builds a fresh, fair boss from the fight's own seed, using the same attack pieces (hit windows, moves, leaps) named bosses already use, checked by a reusable fairness checker before the fight starts, with a hand-built fallback so a fight never refuses to begin.

**Architecture:** Pure generator functions build a `BossDef` from a seeded stream separate from gameplay randomness; a pure fairness checker runs a small bot battery in simulation only; a small `resolveBoss(id, seed)` wrapper around the existing `bossById` handles the "generated" id everywhere a fight is started or replayed.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-m5e-generator-design.md` (binding; read it first). Also `docs/bosses.md`, `docs/stats.md`.

## Global Constraints
- Deterministic pure simulation: `generateBoss(seed)` uses its own seeded stream, mixed from the fight's seed by `(seed ^ 0x51ed270b) >>> 0` fed into `mulberry32` (`src/game/rng.ts`'s `nextRandom`), so building the boss NEVER advances the gameplay `rng` the state carries. `tests/duelist-golden.test.ts` (the four pinned Ember Duelist scenarios) must pass UNCHANGED after every task.
- Every generated boss, and the fallback boss, is run through `parseBoss` unmodified before use, exactly like `applyDials` already does — a bad combination must never reach the simulation.
- `GAME_VERSION` (`src/stats/record.ts`) is bumped in the task that ships the generator (it changes how a `'generated'` record replays whenever the algorithm changes; Ember Duelist and Ashen Hound records are unaffected and keep replaying exactly).
- Strict CSP unaffected (no UI/drawing rule is touched except the menu's Boss row). TypeScript strict, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`. No new dependencies.
- Commit messages: plain, no `Co-Authored-By` or any Claude/Anthropic attribution. Never push. `git add` explicit paths only (tasks may run close together on the same branch).

## Files
| File | Responsibility |
|---|---|
| `src/bosses/generate/tuning.ts` (new) | Every generator range and count, one file |
| `src/bosses/generate/attack.ts` (new) | One randomized `AttackDef` from a stream |
| `src/bosses/generate/boss.ts` (new) | `generateBoss(seed)`: assembles the whole `BossDef` |
| `src/bosses/generate/fairness.ts` (new) | `checkFairness(boss)`: the reusable bot-battery checker |
| `src/bosses/trainee.json`, `src/bosses/index.ts` (new/modify) | The hand-built fallback boss |
| `src/bosses/resolve.ts` (new) | `resolveBoss(id, seed)`: generation + retry + fallback, or `bossById` |
| `src/stats/record.ts`, `src/stats/analyze.ts`, `src/ui/app.ts`, `src/ui/menu-model.ts` (modify) | Wire `resolveBoss` into starting and replaying a fight; the "Generated" menu row |
| `docs/bosses.md`, `docs/stats.md`, `docs/phone-testing.md`, `docs/SPEC.md`, `docs/backlog.md` (modify) | Docs |
| `tests/*.test.ts` | Tests per task |

---

### Task 1: The tuning file and one generated attack (TDD)

**Files:**
- Create: `src/bosses/generate/tuning.ts`, `src/bosses/generate/attack.ts`
- Test: `tests/generate-attack.test.ts` (new)

**Interfaces:**
- Consumes: `nextRandom` (`src/game/rng.ts`), `AttackDef`, `AttackMove`, `LeapDef`, `HitWindow`, `Pose` (`src/bosses/schema.ts`).
- Produces:
  - `src/bosses/generate/tuning.ts`: `export const GEN = {...}` (a single flat object; every field used by this and later tasks lives here). Required fields and values for this task: `windupMin: 18, windupMax: 40, leapWindupMin: 21` (the floor for an attack whose effect is a `leap`, or a `move` whose `speed` is at or above `moveFastSpeed`), `activeMin: 4, activeMax: 20, recoveryMin: 12, recoveryMax: 36, hitX0Max: 40, hitSpanMin: 80, hitSpanMax: 260, hitTopMin: 50, hitTopMax: 190, moveSpeedMin: 900, moveSpeedMax: 1700, moveFastSpeed: 1300, moveDurationMin: 8, moveDurationMax: 16, leapHeightMin: 120, leapHeightMax: 260, leapFlightMin: 16, leapFlightMax: 26, leapDistanceMin: 200, leapDistanceMax: 400, rangeMinMin: 40, rangeMinMax: 240, rangeSpanMin: 120, rangeSpanMax: 260`.
  - `src/bosses/generate/attack.ts`: `type EffectKind = 'hit' | 'move' | 'leap'`; `interface Stream { state: number }` is NOT needed — use the plain `number` state type `nextRandom` already uses. `interface Draw<T> { value: T; state: number }`. `generateAttack(state: number, id: string, counterable: boolean): Draw<AttackDef>`: draws the effect kind (equal thirds: `< 1/3` hit, `< 2/3` move, else leap), the pose (`'raised' | 'sideways' | 'back' | 'down'` for a hit or a move — never `'crouch'` for those; `'crouch'` for a leap, matching how `bossDrawBox`'s crouch shortening only applies to a `'crouch'`-posed attack — see `src/ui/render.ts`/`src/ui/look/pose.ts`), `windup` (uniform integer `GEN.windupMin`..`GEN.windupMax`, raised to `GEN.leapWindupMin` when the effect is a leap or a move with `speed >= GEN.moveFastSpeed`), `active` and `recovery` (uniform integers in their ranges), `range` (`min` uniform in `[GEN.rangeMinMin, GEN.rangeMinMax]`, `max = min + span` with `span` uniform in `[GEN.rangeSpanMin, GEN.rangeSpanMax]`), `damage: 1`, `class: counterable ? 'counterable' : 'mustDodge'`, `id`, `name: id` (a short readable id like `'attack-0'`, `'attack-1'`, given by the caller; the name can equal the id for now). For each effect kind build exactly the pieces the design lists:
    - `hit`: one `HitWindow` with `from = windup`, `to = windup + active`, `x0` uniform `[0, GEN.hitX0Max]`, `x1 = x0 + span` with `span` uniform `[GEN.hitSpanMin, GEN.hitSpanMax]`, `bottom: 0`, `top` uniform `[GEN.hitTopMin, GEN.hitTopMax]`. `move` and `leap` absent.
    - `move`: `hits` is the same single `HitWindow` as above (so a fast dash still hurts, like the Duelist's lunge); `move: { from: windup, to: windup + Math.min(active, moveDuration), speed, dir: 'forward' }` where `moveDuration` is uniform `[GEN.moveDurationMin, GEN.moveDurationMax]` and `speed` is uniform `[GEN.moveSpeedMin, GEN.moveSpeedMax]`; `move.to` must stay `<= windup + active` (clamp `moveDuration` to `active` if needed, and require `active >= 2` for a move so `move.to > move.from`: if the drawn `active` is 1, redraw only `active` uniformly from `[2, GEN.activeMax]` for this branch — keep it simple and deterministic from the same stream).
    - `leap`: `hits` is one `HitWindow` with `from = windup + flightLen` and `to = from + active` (so the shockwave starts once the leap lands, as the design requires: "author leap hit windows at or after `leap.to`" in `docs/bosses.md`), `x0`/`x1`/`top` as in the `hit` case; `leap: { from: windup, to: windup + flightLen, height, target: 'player' }` with `flightLen` uniform `[GEN.leapFlightMin, GEN.leapFlightMax]` and `height` uniform `[GEN.leapHeightMin, GEN.leapHeightMax]`; `active = flightLen + (the hit's active)` so the attack's own `active` covers both the flight and the landing hit exactly (recompute the returned `AttackDef.active` accordingly; `recovery` stays as drawn).
  - Drawing a uniform integer or float from the stream: `const draw = nextRandom(state); state = draw.state; const v = min + draw.value * (max - min);` (round with `Math.round` for integers). Keep this pattern in one small local helper reused by every field so the whole function reads clearly.

- [ ] **Step 1: Write the failing tests** `tests/generate-attack.test.ts`. Use `parseBoss` (via a tiny wrapper boss: build a minimal valid `BossDef` shell around one generated attack — same shape as `QUIET_BOSS` in `tests/helpers.ts`, but with the generated attack in `phases[0].attacks`) to prove every generated attack is accepted. Tests: (1) a sweep of 2000 states (seeded from `1..2000`) for each `counterable` value: every attack parses (wrap-and-`parseBoss`), `windup >= GEN.windupMin`, and for `leap`/fast-`move` attacks `windup >= GEN.leapWindupMin`; (2) `class` matches the `counterable` argument, and a `counterable` attack still parses when used as the boss's sole attack with a counter block whose `window <= windup` (build the block with `window = Math.min(12, windup)` in the test); (3) a `hit`-kind attack has `move` and `leap` both absent; a `move`-kind attack has `hits.length === 1` and `move.to <= move.from + move` fits inside the active updates and `move.to > move.from`; a `leap`-kind attack has `leap.to <= windup + active`, the hit window starts at or after `leap.to`, and `pose === 'crouch'`; (4) determinism: the same starting `state` gives a deep-equal `AttackDef` and the same returned `state`; two different starting states give attacks that differ in at least one field over a sample of 50 pairs; (5) the returned `state` is always a valid uint32 (`0 <= state < 2**32`) after a long chain of 500 calls threading `state` through.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0; golden unchanged.
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/generate/tuning.ts src/bosses/generate/attack.ts tests/generate-attack.test.ts
git commit -m "feat: add the tuning ranges and one generated attack"
```

---

### Task 2: Assembling a whole boss (TDD)

**Files:**
- Create: `src/bosses/generate/boss.ts`
- Modify: `src/bosses/generate/tuning.ts` (append fields)
- Test: `tests/generate-boss.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 (`GEN`, `generateAttack`), `nextRandom`, `parseBoss`, `BossDef`, `PhaseDef`, `CounterDef` (`src/bosses/schema.ts`).
- Produces: append to `GEN`: `maxHpMin: 20, maxHpMax: 40, spacingMinMin: 100, spacingMinMax: 200, spacingSpan: 100, walkSpeedMin: 260, walkSpeedMax: 420, gapMin: 35, gapMax: 60, maxChainMin: 1, maxChainMax: 2, chainChanceMax: 0.3, predictabilityMin: 0.1, predictabilityMax: 0.3, approachTimeoutMin: 40, approachTimeoutMax: 50, attackCountMin: 3, attackCountMax: 5, counterWindowMin: 8, counterWindowMax: 14, counterRangeMin: 160, counterRangeMax: 220, staggerTicksMin: 70, staggerTicksMax: 100, bodyMin: 60, bodyMax: 110`. `generateBoss(seed: number): BossDef`: mixes `seed` into its own stream (`const start = (seed ^ 0x51ed270b) >>> 0`), draws `attackCount` (integer `[GEN.attackCountMin, GEN.attackCountMax]`), builds that many attacks with `generateAttack` (ids `attack-0`..`attack-{n-1}`), picks one index uniformly to be `counterable: true` (the rest `false`), builds the boss: `id: 'generated'`, `name: 'Generated Boss'`, `width`/`height` each uniform integer `[GEN.bodyMin, GEN.bodyMax]`, `startX: 960`, `maxHp` uniform integer `[GEN.maxHpMin, GEN.maxHpMax]`, `spacing: { min, max: min + GEN.spacingSpan }` with `min` uniform `[GEN.spacingMinMin, GEN.spacingMinMax]`, `approachTimeout` uniform integer `[GEN.approachTimeoutMin, GEN.approachTimeoutMax]`, `predictability` uniform `[GEN.predictabilityMin, GEN.predictabilityMax]`, `counter: { window: min(uniform integer [GEN.counterWindowMin, GEN.counterWindowMax], the counterable attack's windup), range: uniform [GEN.counterRangeMin, GEN.counterRangeMax], staggerTicks: uniform integer [GEN.staggerTicksMin, GEN.staggerTicksMax], damageMultiplier: 2 }`, `transitionTicks: 60` (unused with one phase, kept for schema validity), `attacks`: the list built above, `phases`: exactly one `PhaseDef` with `name: 'Only phase'`, `startsAtHpFraction: 1`, `attacks: attacks.map(a => ({ id: a.id, weight: 1 }))`, `gap` uniform integer `[GEN.gapMin, GEN.gapMax]`, `maxChain` uniform integer `[GEN.maxChainMin, GEN.maxChainMax]`, `chainChance` uniform `[0, GEN.chainChanceMax]`, `walkSpeed`/`retreatSpeed` each uniform `[GEN.walkSpeedMin, GEN.walkSpeedMax]` (drawn independently), no `opening`. Run the assembled object through `parseBoss` before returning (so a bad draw fails loudly in tests rather than silently).

- [ ] **Step 1: Write the failing tests** `tests/generate-boss.test.ts`. (1) `generateBoss(seed)` does not throw, for seeds `1..500` (a genuine sweep: call it in a loop, no `try`/`catch` swallowing — a thrown `BossFormatError` fails the test). (2) The same seed gives a deep-equal boss on two calls; different seeds (sampled, 100 pairs) usually differ (assert at least 90% of pairs differ in `attacks.length`, `maxHp`, or the first attack's `windup`, to catch a broken stream without being flaky). (3) Exactly one attack has `class: 'counterable'` and the rest `'mustDodge'`, for every seed in a 200-seed sweep. (4) The boss has one phase whose `attacks` list has one entry per generated attack, each `weight: 1`. (5) `generateBoss` never advances a gameplay `rng`: call it, then separately call `nextRandom(seed)` and confirm the *unrelated* value does not match anything internal to the generator (a documentation-level test: assert that generating a boss from `seed` and then continuing gameplay from `nextRandom(seed)` — the exact call `createInitialState` makes for a NAMED boss — gives the same first gameplay draw as a run that never called `generateBoss` at all; i.e. build this by comparing `createInitialState(EMBER_DUELIST, seed).rng` after one `step` against the same after first calling `generateBoss(seed)` and discarding the result: they must be bit-identical). (6) `width`/`height`, `maxHp`, `spacing`, speeds and the counter block are inside their tuned ranges for a 200-seed sweep.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything** (as above; golden unchanged).
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/generate/boss.ts src/bosses/generate/tuning.ts tests/generate-boss.test.ts
git commit -m "feat: assemble a whole generated boss from a seed"
```

---

### Task 3: The fairness checker (TDD)

**Files:**
- Create: `src/bosses/generate/fairness.ts`
- Test: `tests/generate-fairness.test.ts` (new)

**Interfaces:**
- Consumes: `BossDef`, `applyDials` is NOT used here (fairness is checked at Normal, i.e. the boss as generated); `createInitialState`, `step` (`src/game/state.ts`, `src/game/step.ts`), `NO_INPUT`, `InputFrame` (`src/engine/input-frame.ts`), `PLAYER`, `WORLD` (`src/game/params.ts`), `activeHitBoxes`, `playerBox`, `attackBox`, `bossBox`, `overlaps` (`src/game/geometry.ts`).
- Produces: `interface FairnessResult { fair: boolean; reasons: string[] }`; `checkFairness(boss: BossDef): FairnessResult`. Constants (append to `GEN` in `tuning.ts`): `fairnessSeeds: [11, 97]` (two fixed seeds, not derived from the checked boss, so the checker's own randomness never depends on what it is checking), `fairnessCapTicks: 3000` (idle bot) and `fairnessSkilledCapTicks: 4000` (skilled bot).

Bots (write as small internal functions in `fairness.ts`, not exported):
- **Idle bot:** `NO_INPUT` every update. Run `step` up to `fairnessCapTicks` times or until `state.phase !== 'fight'`. Fails (adds a reason) unless the run ends with `state.phase === 'defeated'` — an idle player must always lose. If the fight is still `'fight'` at the cap, that is also a failure reason ("stalls: the boss never lands enough hits to defeat an idle player within the cap" or "idle player did not lose").
- **Skilled bot:** deterministic and reactive, built the same way the M5a/M5c review's skilled bots were: each update it looks at `state.boss.mode`/`attackId`/`attackTick` and the running attack's effect (does it have `leap`? `move`? neither, just `hits`?) and answers: for a plain `hit` attack, dash toward the boss once `attackTick` reaches `windup - 6` if `class === 'counterable'` (to land a counter) else jump when `attackTick` reaches `windup - 10` (to clear a floor-level hit; if the hit's `top` is 0 treat it as unavoidable by jumping and dash through instead — use `Math.min` on the hit's `top` across the running attack's `hits` to decide: `top <= 90` dash, otherwise jump, matching the reach of a jump apex established in M5c, about 163, versus the player's crouch-height reach for a dash which is invulnerable throughout); for a `move` attack, dash at `attackTick === windup - 3` (dash through it, like the Duelist's lunge); for a `leap` attack, hold still until the boss lands then move away from the remembered landing x (read `state.boss.leapToX`) once it is known, or dash away if already close when it lands. Otherwise (no attack running) walk toward the boss and, when `Math.abs(player.x - boss.x) < attack.reach` for at least one of the boss's own attacks' `range.min`, press attack once per `PLAYER.attack.startup + PLAYER.attack.active + PLAYER.attack.recovery` updates while `boss.mode !== 'attack'`. Run this bot for `fairnessSkilledCapTicks` updates or until the fight ends; it passes when `state.phase === 'victory'` and the player's `health === PLAYER.maxHealth` throughout the whole run (track the minimum health seen).
- `checkFairness(boss)`: for each seed in `GEN.fairnessSeeds`, run the idle bot once (both seeds; both must show the idle player losing — a boss whose attacks depend heavily on where the player starts should not stall for either seed) and the skilled bot once; the skilled bot's no-damage win only needs to happen for **at least one** of the two seeds (the design's "at least one of 2 seeds"). Collect every failure into `reasons` (plain sentences, e.g. `"idle player did not lose at seed 97"`, `"skilled bot took damage at every seed"`, `"skilled bot did not finish within the cap"`); `fair` is true only when every idle check passed and the skilled check passed for at least one seed.

- [ ] **Step 1: Write the failing tests** `tests/generate-fairness.test.ts`. Build fixtures with `{ ...ASHEN_HOUND-shaped helpers or a hand-built minimal BossDef }` (do not import `generateBoss` here; this task's checker must work on any `BossDef`, tested in isolation): (1) a boss that should PASS: reuse `EMBER_DUELIST` itself (`import { EMBER_DUELIST } from '../src/bosses'`) — `checkFairness(EMBER_DUELIST).fair` is `true` with an empty `reasons` list (this also proves the checker doesn't reject bosses we already know are fine). (2) A boss built to FAIL "idle never loses": one attack whose `hits` never actually reaches the player (`x1` absurdly small, e.g. 1, so `range.min` is far but the hit is tiny — or simpler, a boss with `maxHp` fine but attacks whose active hit windows are given `top: 0, bottom: 0`-adjacent so they can never overlap the player box — construct concretely: a hand-built boss whose single attack's hit window has `bottom: 0, top: 1` (below the player's feet) so `resolveBossHits` never lands): `checkFairness(...).fair` is `false` and `reasons` mentions the idle player. (3) A boss built to FAIL "unbeatable": `maxHp` absurdly high (e.g. 100000) so the skilled bot cannot win inside the cap: `fair` is `false` with a reason mentioning the skilled bot or the cap. (4) A boss built to FAIL "unreadable": copy the Duelist's sweep but with `windup: 5` (well under any floor) so even the skilled bot's dash/jump timing (tuned for the floor) takes damage at both seeds: `fair` is `false`. (5) `checkFairness` does not mutate the boss it is given (snapshot compare before/after). (6) Timing: `checkFairness(EMBER_DUELIST)` completes (wall-clock) in under 2 seconds in the test run (a generous ceiling; log the actual time in the report) — this is a smoke check that the battery is not pathologically slow, not a strict budget.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything** (as above; golden unchanged; do not import or reference `generateBoss` from this file).
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/generate/fairness.ts src/bosses/generate/tuning.ts tests/generate-fairness.test.ts
git commit -m "feat: add the reusable fairness checker"
```

---

### Task 4: The trainee fallback boss (TDD)

**Files:**
- Create: `src/bosses/trainee.json`
- Modify: `src/bosses/index.ts`
- Test: `tests/trainee.test.ts` (new)

**Interfaces:**
- Consumes: `parseBoss`.
- Produces: `TRAINEE` exported from `src/bosses/index.ts` (parsed once at load, like `EMBER_DUELIST` and `ASHEN_HOUND`), **not** added to `BOSSES` or the menu's Boss row — it exists only as the generator's fallback (Task 5). `docs/bosses.md`'s "Adding a boss" step 2 pattern applies (`import rawTrainee from './trainee.json'; export const TRAINEE = parseBoss(rawTrainee);`), but skip its step 4 (menu wiring): the trainee is deliberately not selectable on its own.

`src/bosses/trainee.json` (a plain, generous, hand-built boss — two `mustDodge` attacks, no leap, no counter, no arena; every number well inside what the M5a/M5c reviews found genuinely fair):
```json
{
  "id": "trainee",
  "name": "Trainee",
  "width": 80,
  "height": 100,
  "startX": 960,
  "maxHp": 24,
  "spacing": { "min": 150, "max": 300 },
  "approachTimeout": 45,
  "predictability": 0.2,
  "counter": { "window": 10, "range": 180, "staggerTicks": 80, "damageMultiplier": 2 },
  "transitionTicks": 60,
  "attacks": [
    { "id": "swipe", "name": "Swipe", "pose": "sideways", "class": "mustDodge",
      "windup": 30, "active": 8, "recovery": 26, "range": { "min": 60, "max": 220 },
      "hits": [ { "from": 30, "to": 38, "x0": 0, "x1": 200, "bottom": 0, "top": 110 } ] },
    { "id": "charge", "name": "Charge", "pose": "back", "class": "mustDodge",
      "windup": 32, "active": 12, "recovery": 30, "range": { "min": 220, "max": 400 },
      "move": { "from": 32, "to": 44, "speed": 1200 },
      "hits": [ { "from": 32, "to": 44, "x0": 0, "x1": 100, "bottom": 0, "top": 100 } ] }
  ],
  "phases": [
    { "name": "Only phase", "startsAtHpFraction": 1,
      "attacks": [ { "id": "swipe", "weight": 1 }, { "id": "charge", "weight": 1 } ],
      "gap": 50, "maxChain": 1, "chainChance": 0, "walkSpeed": 300, "retreatSpeed": 260 }
  ]
}
```
(No `class: 'counterable'` attack is used, so the `counter` block is present but inert; check the field names against `src/bosses/schema.ts` and adjust minimally if the checker objects, reporting the change.)

- [ ] **Step 1: Write the failing tests** `tests/trainee.test.ts`: `TRAINEE` parses, has two attacks, no arena, no counterable attack; `checkFairness(TRAINEE).fair` is `true` (using Task 3's checker: import it here — this is the one place outside its own test file the checker is exercised against a hand-built boss, and it must pass, or the fallback itself would be unfair); a scripted fight against `TRAINEE` (idle loses; a simple dodger over a few seeds wins) behaves sensibly, following the pattern of `tests/ashen-hound.test.ts`'s bot checks (every fight ends within 5400 updates, idle always loses).
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0.
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/trainee.json src/bosses/index.ts tests/trainee.test.ts
git commit -m "feat: add the trainee, a hand-built fallback boss"
```

---

### Task 5: `resolveBoss` — retry, fairness and the fallback (TDD)

**Files:**
- Create: `src/bosses/resolve.ts`
- Test: `tests/resolve.test.ts` (new)

**Interfaces:**
- Consumes: `bossById`, `TRAINEE` (`src/bosses/index.ts`), `generateBoss` (Task 2), `checkFairness` (Task 3), `nextRandom` (`src/game/rng.ts`), `BossDef`.
- Produces: `resolveBoss(id: string, seed: number): BossDef`. Behaviour: `id !== 'generated'` returns `bossById(id)` unchanged (identical to every call site's current behaviour). `id === 'generated'`: try up to 3 candidates — `generateBoss(seed)`, then `generateBoss(nextRandom(seed).state)`, then `generateBoss(nextRandom(nextRandom(seed).state).state)` — checking each with `checkFairness` and returning the first one that passes; if none of the three pass, return `TRAINEE`. Pure and deterministic: the same `(id, seed)` always returns a deep-equal boss.

- [ ] **Step 1: Write the failing tests** `tests/resolve.test.ts`: `resolveBoss('ember-duelist', anySeed)` equals `EMBER_DUELIST`; `resolveBoss('ashen-hound', anySeed)` equals `ASHEN_HOUND`; an unknown id falls back to `EMBER_DUELIST` (matching `bossById`); `resolveBoss('generated', seed)` for the same `seed` called twice gives a deep-equal boss; over a 100-seed sweep every result `fair` per `checkFairness` OR equals `TRAINEE` (this proves the guarantee end to end: nothing unfair is ever returned); force the fallback path with a test-only stub (do not modify `fairness.ts`: instead pick or note in the report whether a real seed in the swept range actually lands on the fallback — if none does in 100 seeds, write one additional focused test that directly calls the internal 3-candidate logic with a hand-injected always-fail checker via dependency injection — if `resolveBoss`'s current signature does not allow injecting a checker, ADD an optional second parameter `checkFairness: typeof realCheckFairness = realCheckFairness` used only by tests, defaulting to the real one everywhere else, and use it to prove the fallback is reached deterministically after exactly 3 failures and never sooner). `resolveBoss` never mutates anything global (`BOSSES`, `TRAINEE`).
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything** (as above; golden unchanged).
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/resolve.ts tests/resolve.test.ts
git commit -m "feat: add resolveBoss with retry and the fallback"
```

---

### Task 6: Wiring "Generated" into the menu, the fight and replay

**Files:**
- Modify: `src/bosses/index.ts`, `src/ui/menu-model.ts`, `src/ui/app.ts`, `src/stats/record.ts`, `src/stats/analyze.ts`
- Test: `tests/menu-model.test.ts`, `tests/record.test.ts`, `tests/analyze.test.ts`, `tests/loop-replay.test.ts` (extend)

**Interfaces:**
- Consumes: Task 5 (`resolveBoss`).
- Produces:
  - `src/bosses/index.ts`: `interface BossChoice { id: string; name: string }`; `export const BOSS_CHOICES: readonly BossChoice[] = [...BOSSES.map((b) => ({ id: b.id, name: b.name })), { id: 'generated', name: 'Generated' }];` `export function bossChoiceName(id: string): string { return BOSS_CHOICES.find((c) => c.id === id)?.name ?? EMBER_DUELIST.name; }` (unknown ids fall back to the Duelist's name, matching `bossById`'s own fallback).
  - `src/ui/menu-model.ts`: `import { BOSS_CHOICES, bossChoiceName } from '../bosses';` replaces the `BOSSES`/`bossById` import for the boss row; `menuRows`'s boss row uses `value: bossChoiceName(model.prefs.bossId)`; `menuStep`'s `item === 'boss'` branch cycles over `BOSS_CHOICES` (`BOSS_CHOICES.findIndex((c) => c.id === model.prefs.bossId)`, `BOSS_CHOICES[wrap(...)]`) instead of `BOSSES`, otherwise identical logic (left/right/confirm cycle, wrap both ways). Every other row and the rest of the file is untouched.
  - `src/ui/app.ts`: `import { resolveBoss } from '../bosses/resolve';` (keep the existing `bossById` import only if still used elsewhere in the file — check with a search; the mount-time placeholder at line ~141 may switch to `resolveBoss(prefs.bossId, 1)` for consistency, since it is never actually played). In `startFight`: reorder so `seed` is computed before the boss is built (`const seed = newSeed(); boss = applyDials(resolveBoss(prefs.bossId, seed), prefs.dials); state = createInitialState(boss, seed, prefs.study);` — the rest of the function, including `flow = startFlow({ bossId: boss.id, ... })`, is unchanged: for a generated boss `boss.id` is `'generated'`, and the meta's `seed` is what lets a replay reconstruct the exact same boss later).
  - `src/stats/record.ts`: `replayFinalState` imports `resolveBoss` from `'../bosses/resolve'` instead of `bossById` from `'../bosses'`, and its one call becomes `resolveBoss(record.bossId, record.seed)`.
  - `src/stats/analyze.ts`: same substitution in `analyzeFight` (`resolveBoss(record.bossId, record.seed)`).

- [ ] **Step 1: Write the failing tests.** Menu: extend `tests/menu-model.test.ts`'s existing boss-row cycling tests (the ones added in M5a for two bosses) to a three-way cycle Duelist → Hound → Generated → Duelist (both directions), and that `menuRows` shows `'Generated'` as the value when `prefs.bossId === 'generated'`. Record/analyze: a scripted fight recorded with `bossId: 'generated'` (build the meta by hand, as `tests/record.test.ts` already does for named bosses, calling `resolveBoss('generated', seed)` directly to get the boss to step through) replays through `replayFinalState` to the identical final state on a second call, and `analyzeFight`/`analyzeRecording` agree with `analyzeRun` driven from the same resolved boss; a version-1/2-style record (bossId a normal string) is unaffected — no behavioural change for named bosses (rerun the existing `bossById`-based tests unedited, they must still pass since `resolveBoss` is a superset). `tests/loop-replay.test.ts`: add one "Generated" case through the emulated app loop (pick a seed known to resolve without hitting the fallback, or accept the fallback — either way the replay guarantee must hold) proving the replay/analysis agreement end to end, the same shape as the existing Duelist/Hound cases.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Verify.** `npm test && npm run typecheck && npm run build && npm run check:dist` (all exit 0), then the preview smoke check (start `npm run preview -- --port 4173 --strictPort` in the background, curl `/` and `/sw.js`, stop it, confirm the port is free). State plainly in the report that picking "Generated" in a real browser and playing it was NOT checked.
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/index.ts src/ui/menu-model.ts src/ui/app.ts src/stats/record.ts src/stats/analyze.ts tests/menu-model.test.ts tests/record.test.ts tests/analyze.test.ts tests/loop-replay.test.ts
git commit -m "feat: add Generated to the Boss row and wire it into fights and replay"
```

---

### Task 7: Docs and the play-test checklist

**Files:**
- Modify: `docs/bosses.md`, `docs/stats.md`, `docs/phone-testing.md`, `docs/SPEC.md`, `docs/backlog.md`, `CLAUDE.md` (only a line if needed)

- [ ] **Step 1: Read the code first and verify every statement.** `docs/bosses.md`: a new section "The boss generator" — the three attack effects it draws from, the readability floor (300 ms, 350 ms for a leap/fast dash) and why (the M5a sweep finding), that it always includes exactly one counterable attack, one phase only, no arena in this version, the tuning file `src/bosses/generate/tuning.ts` as the one place to retune it, the fairness checker and what it checks (idle must lose, a skilled bot must win clean at least once), the 3-try-then-trainee fallback, and that the trainee is not itself selectable in the menu. `docs/stats.md`: `GAME_VERSION` bump note (find the current note next to the Ashen Hound's arena change and add a matching one: a `'generated'` record's replay is only guaranteed to match while the generator's algorithm and tuning are unchanged; a version-1/2/3 record with a real boss id is unaffected); `bossId: 'generated'` in an exported record means the boss must be reconstructed with `resolveBoss`/the seed, not looked up by name. `docs/phone-testing.md`: a new section "The boss generator (M5e)" in plain language: pick "Generated" on the Boss row (after the Ashen Hound); every time you press Fight it builds a new boss for that attempt (so retrying gives a different one; there is no way to fight the "same" generated boss again except by keeping the exported seed); it always has 3 to 5 attacks, one of them counterable (gold, can be countered like the Duelist's slam), no ledges or walls yet; it is checked for fairness before the fight starts, so it should always be beatable and never stall — if a fight against a Generated boss ever feels impossible or never-ending, that is exactly the kind of report this milestone needs; rarely, the check may fail three times in a row and you get the same small fallback boss (not otherwise visible in the menu) instead — note it if you ever see an unusually plain-looking boss with just a swipe and a charge attack. Checklist: the Boss row cycles Duelist, Hound, Generated and back; picking Generated and fighting several times in a row gives visibly different attack sets, timings and boss sizes each time; every generated boss you meet is readable (you can tell what is coming from its pose/glow within a couple of tries) and beatable; an idle test (stand still) always loses to it, if you try it; the gold/counterable attack works like the Duelist's; stats save and export for Generated fights, and the exported `bossId` says `generated`. Questions: does a generated boss ever feel unfair (too fast to read, or a wall you can't get past)? Does the variety feel meaningfully different from fight to fight, or same-ish? Any attack shape that reads badly (a leap, a dash, a plain hit) more than the others? `docs/SPEC.md`: record the owner's M5e decisions (archetype-bank generator; regenerate every fight from a seed; no arena and one phase in v1; counterable attack included; fallback to a hand-built boss on repeated failure) and that M5e is built and awaiting the owner's play test; M5 as a whole is then complete (study, arena, looks, generator all built) pending outstanding play-test feedback. `docs/backlog.md`: mark the generator as built in M5e; list what is not built (generated arenas, a second phase, a saved roster of generated bosses, using play stats to steer generation, exposing the trainee on its own).
- [ ] **Step 2: Final verification.** `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`; all exit 0; `git status --short` shows only the docs before the commit.
- [ ] **Step 3: Commit.**
```bash
git add docs CLAUDE.md
git commit -m "docs: document the boss generator and the M5e play test"
```
(Only add files that changed.)

---

## M5e done when
- All seven tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout, with the Duelist golden test unchanged.
- The controller pushes (owner's go-ahead first), CI is green and the site is deployed.
- The owner has fought several "Generated" bosses on the phone and found them readable and fair to a first approximation.

## Self-review notes
- **Spec coverage** (`docs/superpowers/specs/2026-09-22-m5e-generator-design.md`): primitives and tuning (Task 1), assembly (Task 2), the reusable fairness checker (Task 3), the fallback boss (Task 4), retry-and-fallback wiring (Task 5), the menu row and fight/replay wiring incl. `GAME_VERSION` (Task 6, `GAME_VERSION` is already bumped to `0.4.0` on `main` from M5c — this plan does not need a further bump unless the generator ships in the same version window as another replay-affecting change; if `main` has moved since this plan was written, the implementer of Task 6 checks the current `GAME_VERSION` and bumps it again only if this is the first replay-affecting change since the last bump, updating the comment to explain why), docs (Task 7).
- **Names used across tasks:** `GEN`, `generateAttack`, `generateBoss`, `FairnessResult`, `checkFairness`, `TRAINEE`, `resolveBoss`, `BossChoice`, `BOSS_CHOICES`, `bossChoiceName`.
- **Risks to watch:** the generator's stream must never share state with the gameplay `rng` (Task 2's test 5 pins this); every generated/fallback boss must pass `parseBoss` before use, so a bad draw fails loudly in a test rather than silently producing a broken boss; the fairness checker's own bots must stay deterministic and cheap (a runaway loop would make `resolveBoss` slow on the phone); `menu-model.ts`'s boss row must keep working identically for the two named bosses (a regression there would break the M5a/M5c/M5d Boss-row tests); `GAME_VERSION` discipline (check the current value before bumping, do not bump twice for the same change).

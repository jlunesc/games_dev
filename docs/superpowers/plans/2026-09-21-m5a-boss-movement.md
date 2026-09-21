# M5a Boss Movement Skills (Leap and Dash) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bosses can leap (crouch, arc through the air, land with a shockwave, with a landing ring showing where) and dash (fast slide, including a reposition dash that hurts nobody); a new second boss, the Ashen Hound, uses them; the Ember Duelist and every stored record keep replaying exactly as before.

**Architecture:** The boss data format gains an optional `leap` block, a `move.dir` (`forward` or `back`), attacks with no hit windows (reposition), and a `crouch` pose. The boss state gains `lift` and the landing points; `updateAttack` moves the boss along the arc; `bossBox` is lifted so the player's swing only hits when the boxes overlap. `applyDials` and the drawing code learn the new fields. A golden test written FIRST pins the Duelist's behaviour.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-m5a-boss-movement-design.md` (binding; read it first). Also `docs/bosses.md`, `docs/SPEC.md` section 7 and 11.

## Global Constraints
- Simulation stays pure and deterministic: no new randomness, no time, no floating point that differs between runs (all arcs computed from integers of attack time with the same formulas every run).
- The Ember Duelist (`src/bosses/ember-duelist.json`) is not changed, and its fights must replay identically: the golden test of Task 1 must pass unchanged after every task.
- Boss data stays validated by `parseBoss`; the adjusted copy made by `applyDials` is validated again. The checker ignores unknown fields, so after adding a field check that it has an effect.
- Strict CSP: no `innerHTML`, no `style=`, no `data:` URIs; DOM via `el`/`textContent`. Drawing stays separate from fight logic.
- TypeScript strict, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`. No new dependencies.
- Stats: recorded fights replay through `bossById` + `applyDials`; `GAME_VERSION` in `src/stats/record.ts` is bumped only if the Duelist's replays change (they must not).
- Commit messages: plain, no `Co-Authored-By` or any Claude/Anthropic attribution. Never push.

## Files
| File | Responsibility |
|---|---|
| `tests/duelist-golden.test.ts` (new) | Pins the Duelist's scripted-fight behaviour before any change |
| `src/bosses/schema.ts`, `src/bosses/parse.ts` (modify) | `leap`, `move.dir`, empty `hits`, pose `crouch` |
| `src/game/state.ts`, `src/game/boss.ts`, `src/game/geometry.ts`, `src/game/step.ts` (modify) | `lift`, landing points, the arc, cancel handling, lifted body box |
| `src/game/difficulty.ts` (modify) | Dials for the new fields |
| `src/ui/render.ts` (modify) | Lifted boss, landing ring, crouch pose |
| `src/bosses/ashen-hound.json`, `src/bosses/index.ts` (new/modify) | The new boss and the boss list |
| `docs/bosses.md`, `docs/phone-testing.md`, `docs/SPEC.md` (modify) | Format, checklist, status |
| `tests/*.test.ts` | Tests per task |

---

### Task 1: Pin the Duelist before touching anything (TDD-style golden test)

**Files:**
- Create: `tests/duelist-golden.test.ts`

**Interfaces:**
- Consumes: `DUELIST`, `withInput` from `tests/helpers.ts`; `step`, `createInitialState`.
- Produces: a test that fails if the Duelist's simulation changes in any way that is visible in the existing state fields.

This test must be written and committed **before any other change**, with expected values recorded from the CURRENT code.

- [ ] **Step 1: Write the test.** A scripted, deterministic player (as in `tests/record.test.ts`: run toward the boss, then periodic attack, dash and jump presses) drives 2400 updates (or until the fight ends) of the real Duelist at Normal dials with seed 4242, and again at Hard dials (`applyDials(DUELIST, PRESETS hard dials)`) with seed 99. For each update compute a compact fingerprint string from ONLY these existing fields (so adding new fields later does not change it): `[tick, phase, endTicks, player.x, player.y, player.health, player.attackTick, player.dashTick, player.invulnerableTicks, boss.x, boss.facing, boss.hp, boss.phase, boss.mode, boss.modeTick, boss.attackId, boss.attackTick, boss.pendingAttackId, boss.chainLeft, events.join('+'), rng]` joined with `|`, and fold all fingerprints into one 32-bit FNV-1a hash (write the small hash function in the test file). Assert two things per scenario: the final hash equals a hard-coded number, and the number of updates run equals a hard-coded number (and, in the same test, a few readable facts that are true for that run, for example `finalState.boss.phase` and whether the player was defeated, so a failure is easier to read).
- [ ] **Step 2: Record the numbers from the current code.** Run the test once with placeholder expected values (0), read the actual values from the failure output, and put them in the file. Run again: PASS. Add a comment in the file explaining that it pins the reference boss (its statistics must stay comparable) and that a change to these numbers must be deliberate: update them only when the Duelist's behaviour is meant to change, and then bump `GAME_VERSION`.
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0.
- [ ] **Step 4: Commit.**
```bash
git add tests/duelist-golden.test.ts
git commit -m "test: pin the Ember Duelist's scripted fights before adding boss movement skills"
```

---

### Task 2: The boss format learns leap, move direction, and empty hits (TDD)

**Files:**
- Modify: `src/bosses/schema.ts`, `src/bosses/parse.ts`, `docs/bosses.md` (field tables only)
- Test: `tests/boss-parse.test.ts` (extend)

**Interfaces:**
- Consumes: the existing `parseBoss` helpers (`object`, `num`, `text`, `fail`), `AttackDef`, `AttackMove`, `Pose`.
- Produces: in `schema.ts`: `Pose` gains `'crouch'`; `AttackMove` gains optional `dir?: 'forward' | 'back'` (absent means forward); new `LeapTarget = 'player' | 'forward' | 'back'`; `interface LeapDef { from: number; to: number; height: number; target: LeapTarget; distance?: number }`; `AttackDef` gains optional `leap?: LeapDef`. In `parse.ts`: the parser accepts and validates them (rules below) and `POSES` includes `'crouch'`.

Rules (each with a failing test first):
- `move.dir`, when present, must be `"forward"` or `"back"`.
- `leap` (optional object): `from` whole number at least 0, `to` whole number at least 1, `to > from`, both inside the active updates (`windup <= from` and `to <= windup + active`, the same message as `move`: `must lie inside the active updates`, path `<attack>.leap`); `height` a number at least 1; `target` one of `player`, `forward`, `back`; `distance` required and at least 1 when `target` is `forward` or `back`, ignored (and dropped from the parsed object) when `target` is `player`. An attack may have both `move` and `leap`, but their time ranges must not overlap (fail at `<attack>.leap` with `must not overlap the move`), because both change the boss's x.
- `hits` may be empty **only when** the attack has a `move` or a `leap`; otherwise the existing error stays (`needs at least one hit window`, now worded `needs at least one hit window, a move or a leap`). Existing files still parse to identical objects (the Duelist test that compares the parsed file must still pass).
- The parsed attack keeps `leap` and `move.dir` exactly (no extra keys; `dir: 'forward'` written in a file stays `'forward'`, an absent `dir` stays absent).

- [ ] **Step 1: Write the failing tests** in `tests/boss-parse.test.ts`, following the file's existing pattern (`rejects(boss, 'boss.attacks[0].leap.height')` style helper; copy the existing helper usage): accepted leap with each target; `distance` rules; timing rules (from before windup, to after the active end, to not after from, overlap with move); height 0; unknown target; unknown `move.dir`; empty `hits` accepted with a move, accepted with a leap, rejected with neither; a `crouch` pose accepted; the real Duelist file still parsed to an equal object as before (use the existing assertion; do not weaken it); parsed output has no extra keys.
- [ ] **Step 2: Run to verify they fail**, then implement in `schema.ts` and `parse.ts`.
- [ ] **Step 3: Docs.** In `docs/bosses.md` update only the attack field table: `move.dir`, `leap` (the four fields and what each means, with the rule that the landing x is fixed at take-off, `target: 'player'` uses the player's x at update `from`), the empty `hits` rule, the pose `crouch`. Keep the rest for Task 7.
- [ ] **Step 4: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0 (the golden test still passes).
- [ ] **Step 5: Commit.**
```bash
git add src/bosses/schema.ts src/bosses/parse.ts tests/boss-parse.test.ts docs/bosses.md
git commit -m "feat: let boss files describe leaps, move direction and reposition-only attacks"
```

---

### Task 3: The boss leaps and dashes in the simulation (TDD)

**Files:**
- Modify: `src/game/state.ts`, `src/game/boss.ts`, `src/game/geometry.ts`, `src/game/step.ts`
- Test: `tests/step-leap.test.ts` (new); the golden test and all existing tests must stay green

**Interfaces:**
- Consumes: Task 2's types; `solo`, `standAt`, `windupUpdates`, `updatesWith`, `anywhere` from `tests/boss-helpers.ts`; `DUELIST`, `run`, `withInput`, `advance` from `tests/helpers.ts`.
- Produces: `BossState` gains `lift: number` (height above the floor in world units, 0 on the floor), `leapFromX: number | null`, `leapToX: number | null` (both null when no leap is running). `createInitialState` sets `lift: 0, leapFromX: null, leapToX: null`. `bossBox` (geometry.ts) returns `y: WORLD.floorY - boss.height - b.lift`. `updateAttack` moves the boss as below. A helper `landBoss(b: BossState): void` in `boss.ts` (exported) sets `lift = 0`, `leapFromX = null`, `leapToX = null`, and is called wherever a boss leaves its attack early: `enterGap`, `beginTransition`, and the counter in `src/game/step.ts` (`tryCounter`), so a cancelled leap drops straight to the floor where it is.

Movement rules (attack time `t` = `b.attackTick` after it is incremented in `updateAttack`, as `move` already works):
- `move`: unchanged, except `dir: 'back'` moves the boss away from the way it faces (`-facing`) instead of along it.
- `leap` `{ from, to, height, target, distance }` with `n = to - from`:
  - At `t === from`: decide the landing and remember the start: `leapFromX = b.x`; `leapToX` = the player's current x for `target: 'player'`, `b.x + b.facing * distance` for `forward`, `b.x - b.facing * distance` for `back`; then clamp `leapToX` to `[boss.width / 2, WORLD.width - boss.width / 2]`. (Use the player's x at that moment; the caller passes `s.player.x`.)
  - For `from <= t < to`: `p = (t - from + 1) / (n + 1)`; `b.x = leapFromX + (leapToX - leapFromX) * p`; `b.lift = 4 * height * p * (1 - p)`. (So the boss is strictly above the floor for every update of the flight, at most `height` at the middle.)
  - At `t >= to` while `leapToX !== null`: `b.x = leapToX`, then `landBoss(b)` (lift 0, points cleared): the boss is on the floor at the landing x from update `to` on.
  - The boss does not change `facing` during the flight.
- An attack with no hit windows simply deals no damage (nothing in `activeHitBoxes` changes: it maps over `hits`).
- Nothing else in the boss's behaviour changes: choosing, approaching, chaining, stagger, phases.

- [ ] **Step 1: Write the failing tests** `tests/step-leap.test.ts`. Build test bosses from the real Duelist data: a helper `withAttack(attack)` returning `{ ...DUELIST, spacing: { min: 0, max: 1e9 }, attacks: [attack], phases: DUELIST.phases.map(p => ({ ...p, gap: 1, maxChain: 1, chainChance: 0, attacks: [{ id: attack.id, weight: 1 }] })) }`. Attack fixtures (defined in the test): `pounce` = `{ id: 'pounce', name: 'Pounce', pose: 'crouch', class: 'mustDodge', damage: 1, windup: 30, active: 30, recovery: 30, range: { min: 0, max: 1e9 }, leap: { from: 30, to: 52, height: 200, target: 'player' }, hits: [{ from: 52, to: 58, x0: 0, x1: 200, bottom: 0, top: 60 }] }`, and variants for `forward` / `back` with `distance: 300`; `slip` = a reposition dash `{ ..., windup: 18, active: 10, recovery: 14, move: { from: 18, to: 28, speed: 1400 }, hits: [] }` and a `dir: 'back'` variant. Tests (each derives `first`, the update of the first windup event, with `windupUpdates` as `tests/step-counter.test.ts` does):
  1. **Arc:** while the attack time is below 30 and from 52 on, `boss.lift` is 0; for attack time 30..51 it is above 0 and never above 200; it is at least 195 at some update of the flight (the peak); `leapFromX` and `leapToX` are non-null exactly during the flight and null otherwise.
  2. **Landing point fixed at take-off:** `target: 'player'` with the player standing still at distance 120: the boss's x at attack time 52 equals the player's x at attack time 30 (clamped). Then repeat with the player running away during the flight (input `moveX` -1 or +1 from update `first + 30` on): the landing x is still the player's x at attack time 30, not the player's later x.
  3. **`forward` / `back`:** landing x = start x plus/minus `facing * 300`, clamped to the arena (test a landing that would leave the arena: it clamps).
  4. **Shockwave:** a grounded player standing at the landing spot is hit exactly once, on the first update of the hit window (attack time 52); a player who jumps so that his feet are above 60 units at attack time 52 to 57 (jump at attack time about 40 with `jumpHeld`) is not hit; a player 400 units away is not hit; the boss body while airborne does not hurt (a grounded player directly under the flight path is not hit before attack time 52).
  5. **Player swing vs lifted body:** a player swing whose active frames fall while the boss is high (attack time 40) does not hurt the boss (`bossHit` absent, hp unchanged); a swing whose active frames fall after landing (from attack time 52 on, close enough) does. (`bossBox` lifted; the swing box is at the player's mid body.)
  6. **Cancel:** a counterable variant of the pounce (class `counterable`, windup 30) countered before take-off leaves the boss on the floor (lift 0, points null); a phase transition triggered during the flight (boss hp just above the phase threshold, player swing while it is low enough to connect: construct the state by setting `boss.hp` and `boss.lift` directly if needed) also leaves `lift` 0 and the points null. `enterGap` after a normal finish leaves both clear.
  7. **Dash `back` and reposition:** the `slip` (forward) moves the boss `speed * (10/60)` units forward in attack time 18 to 27 (compare to the start x within 1 unit, ignoring the arena walls) and never produces `playerHit`; the `dir: 'back'` variant moves it the opposite way; both leave the attack with the boss on the floor.
  8. **No change for old bosses:** `createInitialState` has `lift 0`, `leapFromX null`, `leapToX null`; the golden test passes unchanged.
- [ ] **Step 2: Run to verify the new tests fail** (`npx vitest run tests/step-leap.test.ts`).
- [ ] **Step 3: Implement** the state fields, `bossBox`, `landBoss`, the arc in `updateAttack` (pass what it needs; `updateBoss` already has `s` so the player's x is `s.player.x`), and the calls of `landBoss` in `enterGap`, `beginTransition` and `tryCounter`. Keep functions small and comment why (for example why the arc uses `n + 1`).
- [ ] **Step 4: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0, golden test unchanged.
- [ ] **Step 5: Commit.**
```bash
git add src/game/state.ts src/game/boss.ts src/game/geometry.ts src/game/step.ts tests/step-leap.test.ts
git commit -m "feat: bosses can leap and dash in the simulation"
```

---

### Task 4: The difficulty dials handle the new fields (TDD)

**Files:**
- Modify: `src/game/difficulty.ts` (`adjustAttack`)
- Test: `tests/difficulty.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 2 and 3 types; `applyDials`, `DIALS`, `PRESETS`, the existing dial tests.
- Produces: `adjustAttack` keeps `move.dir`, shifts `leap.from`/`leap.to` with the windup change, and scales `leap.distance` with the range dial.

Known trap: `adjustAttack` rebuilds `move` from scratch, which would silently drop the new `dir` (a back-dash would become a forward dash under any dial). Rules:
- `move`: `{ ...attack.move, from: from + shift, to: to + shift, speed: speed * d.speed }` (keeps `dir`).
- `leap`: `{ ...attack.leap, from: from + shift, to: to + shift }` and, when `distance` is present, `distance: distance * d.range`. The flight length (`to - from`) and `height` are not scaled by any dial (scaling the flight would move the shockwave in time); the speed dial only changes recovery, as today.
- A reposition attack (empty `hits`) stays valid: the validator accepts it because it has a `move` or a `leap`.

- [ ] **Step 1: Write the failing tests.** Using a test boss with a `pounce` (leap, forward target with distance), a `back` slip and a plain attack (define them in the test file or a small helper): (a) `dir: 'back'` survives every preset and dial extreme; (b) readability 0.7 and 1.6 shift `leap.from/to` by exactly the windup change and keep the flight length; (c) range 0.8 and 1.2 scale `leap.distance` and leave `height` and the flight length alone; (d) at every dial's minimum and maximum, all-min, all-max and 200 random mixes (reuse the existing extreme-testing helper/pattern in the file) the adjusted boss is accepted by `parseBoss` (that is what `applyDials` does; assert it does not throw) and its leap times lie inside the active updates; (e) Normal dials leave the pounce and slip deeply equal to the input; (f) the Duelist is still unchanged at Normal (existing test) and the golden test passes.
- [ ] **Step 2: Run to verify they fail** (a, b and c fail on the old code), then implement.
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0.
- [ ] **Step 4: Commit.**
```bash
git add src/game/difficulty.ts tests/difficulty.test.ts
git commit -m "feat: make the difficulty dials handle leaps and move directions"
```

---

### Task 5: Drawing the leap (TDD for the pure parts)

**Files:**
- Modify: `src/ui/render.ts`
- Test: `tests/boss-look.test.ts` (extend) or a new `tests/render-leap.test.ts`

**Interfaces:**
- Consumes: `armRect`, `bossLook`, `drawBoss`, `BossState.lift/leapToX`, `AttackDef.leap`, `hits`.
- Produces (pure, exported, tested): `landingRing(b: BossState, boss: BossDef): { x: number; halfWidth: number } | null` — null unless `b.leapToX !== null`; otherwise `x: b.leapToX` and `halfWidth` = the largest `x1` over the running attack's hit windows (the shockwave reach; if the attack has no hit windows, `boss.width`); `armRect` handles the new pose `'crouch'`: an arm hanging low in front (`{ x: shoulderX + facing * 20 - t / 2, y: shoulderY + 30, w: t, h: ARM_LENGTH * 0.6 }`). The canvas drawing itself is not unit tested.

Drawing rules (in `drawBoss` and `drawFrame`):
- The boss body is drawn `b.lift` units higher than on the floor (its top at `WORLD.floorY - boss.height - b.lift`), and so are its arm and its notch.
- While the pose is `crouch` and the boss is on the floor (`lift === 0`) and the attack is winding up, draw the body 25% shorter (bottom on the floor) so the crouch reads as a crouch.
- While `landingRing(...)` is non-null draw a ring on the floor: an ellipse or a flat rectangle outline centred on `x`, `halfWidth` wide each side, 6 units tall on the floor line, colour `BOSS_COLORS.red`, pulsing alpha like the glow (`0.55 + 0.35 * Math.sin(state.tick / 6)`), drawn before the boss so the boss is over it. A shadow under the airborne boss is optional.
- Nothing changes for bosses that never leap.

- [ ] **Step 1: Write the failing tests:** `armRect('crouch', 1, 100, 200)` and with facing -1 return the exact rectangles from the formula; `landingRing` is null on a fresh state and while the boss is on the floor mid-attack of a non-leap attack; it returns `{ x: leapToX, halfWidth: <max x1> }` during a leap of the test pounce (drive the real `step` to a state in the flight); `halfWidth` falls back to `boss.width` for a reposition leap with no hits.
- [ ] **Step 2: Run to verify they fail, implement, run everything** (`npm test && npm run typecheck && npm run build && npm run check:dist`).
- [ ] **Step 3: Commit.**
```bash
git add src/ui/render.ts tests/boss-look.test.ts
git commit -m "feat: draw the leap, its landing ring and the crouch"
```
(Add whichever test file you used.)

---

### Task 6: The Ashen Hound (TDD)

**Files:**
- Create: `src/bosses/ashen-hound.json`
- Modify: `src/bosses/index.ts`
- Test: `tests/ashen-hound.test.ts` (new), `tests/bosses-index.test.ts` and `tests/menu-model.test.ts` (extend), `tests/loop-replay.test.ts` (add a Hound case)

**Interfaces:**
- Consumes: Tasks 2 to 5; `parseBoss`, `BOSSES`, `bossById`, `applyDials`, the analyzer (`analyzeFight`), `replayFinalState`, the loop-replay helper.
- Produces: `ASHEN_HOUND` exported from `src/bosses/index.ts` (parsed once at load like the Duelist), appended to `BOSSES` after the Duelist (menu order: Duelist first, so the default and any stored choice stay as they are); `bossById('ashen-hound')` returns it.

Starting values for `src/bosses/ashen-hound.json` (a first guess, tuned by feel later; every number must pass `parseBoss`, adjust minimally if the checker objects and say so in the report). Original design: a low, fast beast.
```json
{
  "id": "ashen-hound",
  "name": "Ashen Hound",
  "width": 90,
  "height": 90,
  "startX": 960,
  "maxHp": 24,
  "spacing": { "min": 110, "max": 260 },
  "approachTimeout": 45,
  "predictability": 0.2,
  "counter": { "window": 12, "range": 200, "staggerTicks": 90, "damageMultiplier": 2 },
  "transitionTicks": 60,
  "attacks": [
    { "id": "bite", "name": "Bite", "pose": "sideways", "class": "mustDodge",
      "windup": 22, "active": 6, "recovery": 26, "range": { "min": 60, "max": 140 },
      "hits": [ { "from": 22, "to": 28, "x0": 0, "x1": 140, "bottom": 0, "top": 110 } ] },
    { "id": "rush", "name": "Rush", "pose": "back", "class": "mustDodge",
      "windup": 26, "active": 12, "recovery": 34, "range": { "min": 240, "max": 420 },
      "move": { "from": 26, "to": 38, "speed": 1600 },
      "hits": [ { "from": 26, "to": 38, "x0": 0, "x1": 100, "bottom": 0, "top": 100 } ] },
    { "id": "slip", "name": "Slip", "pose": "back", "class": "mustDodge",
      "windup": 18, "active": 10, "recovery": 14, "range": { "min": 40, "max": 240 },
      "move": { "from": 18, "to": 28, "speed": 1400 },
      "hits": [] },
    { "id": "pounce", "name": "Pounce", "pose": "crouch", "class": "mustDodge",
      "windup": 30, "active": 30, "recovery": 32, "range": { "min": 200, "max": 420 },
      "leap": { "from": 30, "to": 52, "height": 220, "target": "player" },
      "hits": [ { "from": 52, "to": 58, "x0": 0, "x1": 200, "bottom": 0, "top": 60 } ] }
  ],
  "phases": [
    { "name": "Hunt", "startsAtHpFraction": 1,
      "attacks": [ { "id": "bite", "weight": 3 }, { "id": "rush", "weight": 2 }, { "id": "slip", "weight": 2 }, { "id": "pounce", "weight": 3 } ],
      "gap": 45, "maxChain": 2, "chainChance": 0.35, "walkSpeed": 330, "retreatSpeed": 260 }
  ]
}
```
(Check the field names of a phase against `ember-duelist.json` and `src/bosses/schema.ts` and copy them exactly; `opening` is left out.)

- [ ] **Step 1: Write the failing tests.**
  - `tests/ashen-hound.test.ts`: the real file parses (`ASHEN_HOUND` defined, id `ashen-hound`, four attacks, one phase); a `slip` never produces `playerHit` on its own; a `pounce` launched at a standing player hits him at the landing spot and not before; the Hound's attack ids in the analysis of a scripted fight include `pounce` and `slip` with sensible outcomes (drive the real fight with a scripted player for 3000 updates and assert the analysis has at least one `pounce` occurrence and its `firstDangerTick` equals `startTick + 52`); **no degenerate fights (bot check):** for seeds 1 to 8 and each of three simple bots (idle; an attacker that runs toward the boss and swings every 30 updates; a dodger that dashes when a warning starts and the boss is within 250 units) at Normal dials, every fight ends (win or loss) within 5400 updates (90 s), the idle player always loses, and at Easy and Hard presets the same holds; no bot wins every one of its eight Normal fights while taking no damage (report the table of results in your report).
  - Every dial extreme produces a valid Hound (`applyDials` does not throw) and the Hound at Normal equals the parsed file.
  - `tests/bosses-index.test.ts`: `BOSSES` is `[EMBER_DUELIST, ASHEN_HOUND]`, `bossById('ashen-hound')` is the Hound, an unknown id still gives the Duelist.
  - `tests/menu-model.test.ts`: the Boss row now cycles Duelist, Hound, Duelist with right and left (replace the "with one boss the Boss row keeps that boss" test with real cycling tests) and shows each name.
  - `tests/loop-replay.test.ts`: add a Hound case (Normal dials) proving the replay guarantee and analysis-agreement hold for a Hound fight through the emulated app loop.
- [ ] **Step 2: Run to verify they fail; implement** the JSON and the index change.
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0; the golden test passes unchanged. Also run `npm run build` and check that `dist` contains the Hound in the JS bundle (`check:dist` must pass; no new static file is needed since JSON is bundled).
- [ ] **Step 4: Commit.**
```bash
git add src/bosses/ashen-hound.json src/bosses/index.ts tests/ashen-hound.test.ts tests/bosses-index.test.ts tests/menu-model.test.ts tests/loop-replay.test.ts
git commit -m "feat: add the Ashen Hound, a boss that dashes and leaps"
```

---

### Task 7: Docs and the play-test checklist

**Files:**
- Modify: `docs/bosses.md`, `docs/phone-testing.md`, `docs/SPEC.md`, `CLAUDE.md` (only if a line is needed)

- [ ] **Step 1: `docs/bosses.md`.** Read it and the code first; verify every statement. Complete the format documentation started in Task 2 (the field table): a new subsection "Movement skills" explaining leap (the arc, the fixed landing point decided at take-off, the ring, the shockwave as an ordinary hit window that starts at or after `to`, the body being lifted so the player's swing misses while it is high, cancel behaviour), the `move.dir` values and reposition dashes (empty `hits`), the `crouch` pose, and how the dials treat them (readability shifts, range scales `leap.distance`, flight length and height are not scaled). Add the Ashen Hound to the intro's file list and a short "The Ashen Hound" section (its four attacks, what each trains, its numbers are a first guess). Update "Adding a boss" if anything changed (the boss must also work at the dial extremes, now including the leap fields). Mention the Duelist golden test in the tuning section: the reference boss is pinned by `tests/duelist-golden.test.ts`.
- [ ] **Step 2: `docs/phone-testing.md`** (plain language for a non-programmer; keep everything else). Add "Boss movement (M5a)": how to pick the Ashen Hound (Boss row, left and right), what to expect (the crouch, the ring on the floor, the arc, the shockwave; the slip that only repositions; the rush; the bite), and checklist items: the Boss row switches between the two bosses and remembers the choice; the Hound crouches before a leap and a red ring appears on the floor where it will land; the ring does not move while the boss is in the air; the landing shockwave hurts if you are on the ground at the ring, not if you jump over it or stand outside; your swing does not hurt the Hound while it is high in the air but does after it lands; the slip never hurts by itself; the Duelist still plays exactly as before (same feel, same numbers on the summary for a similar fight); stats still save, export and replay for Hound fights. Questions: is the ring readable enough, is the leap fair (enough time to react), is the Hound too easy or too hard, anything that looks wrong in the air.
- [ ] **Step 3: `docs/SPEC.md`.** In the M5 line note that M5a (leap and dash, the Ashen Hound) is built and awaiting the owner's play test; in section 7 (bosses) add the Ashen Hound as a built sample with its skills. Keep status tags; do not change LOCKED items.
- [ ] **Step 4: Final verification.** `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`; all exit 0; `git status --short` shows only these docs before the commit.
- [ ] **Step 5: Commit.**
```bash
git add docs/bosses.md docs/phone-testing.md docs/SPEC.md CLAUDE.md
git commit -m "docs: document boss movement skills, the Ashen Hound and the M5a play test"
```
(Only add files that changed.)

---

## M5a done when
- All seven tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout, with the Duelist golden test unchanged.
- The controller pushes (owner's go-ahead first), CI is green and the site is deployed.
- The owner has fought the Ashen Hound on the phone and the Duelist still plays as before.

## Self-review notes
- **Spec coverage** (`docs/superpowers/specs/2026-09-21-m5a-boss-movement-design.md`): data format (Task 2), leap and dash rules and the lifted body (Task 3), dials (Task 4), drawing with the ring and crouch (Task 5), the Ashen Hound and the Boss row (Task 6), docs and checklist (Task 7), the Duelist golden test (Task 1) and its re-check at every task, replay and analysis for Hound fights (Task 6).
- **Names used across tasks:** `LeapDef`, `LeapTarget`, `AttackMove.dir`, `Pose 'crouch'`, `BossState.lift/leapFromX/leapToX`, `landBoss`, `landingRing`, `ASHEN_HOUND`, `tests/duelist-golden.test.ts`.
- **Risks to watch:** the arc formula must give a strictly positive lift for every flight update and exactly 0 at update `to`; a leap cancelled mid-air must not leave the boss floating; `adjustAttack` must not drop `move.dir` (Task 4 trap); empty `hits` must not break code that assumes at least one hit window (the analyzer already handles it; check `difficulty.ts`, `render.ts`, `summary.ts`, `geometry.ts` and the tests' helpers); the analyzer's evasion rules are written for boxes that stay on the floor: the shockwave is a floor-level box, so they apply.

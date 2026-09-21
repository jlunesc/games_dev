# M5b Study Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the real fight the player can go through a study phase: the boss demonstrates each attack of its first phase (once or twice, random order), nothing can hurt the player and the boss cannot be hurt; then "The fight begins!". A menu row sets Off, Once or Twice. The stats record and analyse the study separately.

**Architecture:** `GameState` gains a `study` block; `createInitialState` takes the number of rounds and builds a seeded shuffled queue; the boss code takes attacks from the queue while the study is active; hits become `studyHit` events, swings do nothing, counters are off; `studyEnd` ends it. Records gain `study`; schema version 2; the analyzer flags study occurrences. Prefs and the menu get the Study row; the app shows a banner.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-m5b-study-phase-design.md` (binding; read it first). Also `docs/stats.md`, `docs/bosses.md`.

## Global Constraints
- The simulation stays pure and deterministic. With `studyRounds` 0 nothing changes and the seeded generator is not touched: `tests/duelist-golden.test.ts` (4 scenarios) must pass UNCHANGED after every task; never edit its expected values.
- Recorded fights replay exactly: a version-1 record (no `study` field) replays as study 0; the emulated-app-loop replay tests must pass.
- `STATS_SCHEMA_VERSION` becomes 2 (Task 2) and `docs/stats.md` is updated in Task 5; `GAME_VERSION` stays `0.3.0` unless a fight of the Duelist replays differently (it must not).
- Strict CSP: no `innerHTML`, no `style=`, no `data:` URIs; DOM via `el`/`textContent`. No new dependencies. TypeScript strict, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`.
- Commit messages: plain, no `Co-Authored-By` or any Claude/Anthropic attribution. Never push.

## Files
| File | Responsibility |
|---|---|
| `src/game/state.ts`, `src/game/boss.ts`, `src/game/step.ts` (modify) | `study` state, seeded queue, boss takes queue attacks, hits/swings/counters gated |
| `src/stats/record.ts`, `src/stats/analyze.ts`, `src/stats/export.ts` (modify) | `study` in the record and replay, schema 2, analysis study block and flags |
| `src/game/summary.ts`, `src/ui/summary-text.ts`, `src/ui/fight-flow.ts` (modify) | Summary time excludes the study |
| `src/ui/prefs.ts`, `src/ui/menu-model.ts` (modify) | The Study setting and menu row |
| `src/ui/study-banner.ts` (new), `src/ui/app.ts`, `src/ui/feedback.ts`, `src/ui/audio.ts`, `src/ui/render.ts` (modify) | Banner, feedback for `studyHit`, wiring |
| `docs/stats.md`, `docs/phone-testing.md`, `docs/SPEC.md`, `docs/backlog.md` (modify) | Docs and checklist |
| `tests/*.test.ts` | Tests per task |

---

### Task 1: The study in the simulation (TDD)

**Files:**
- Modify: `src/game/state.ts`, `src/game/boss.ts`, `src/game/step.ts`
- Test: `tests/step-study.test.ts` (new); the golden test and all existing tests stay green

**Interfaces:**
- Consumes: `nextRandom` (`src/game/rng.ts`), helpers `solo`, `standAt`, `windupUpdates`, `updatesWith` (`tests/boss-helpers.ts`), `DUELIST`, `run`, `withInput` (`tests/helpers.ts`).
- Produces: `interface StudyState { active: boolean; queue: string[]; endTick: number }`; `GameState.study: StudyState`; `createInitialState(boss: BossDef, seed = 1, studyRounds = 0)`; `GameEvent` gains `'studyHit' | 'studyEnd'`.

Rules:
- `createInitialState`: `study = { active: false, queue: [], endTick: 0 }` when `studyRounds` is 0 (no generator call at all). Otherwise: `ids` = the ids of `boss.phases[0].attacks` in list order; for each of `studyRounds` rounds, shuffle a copy with Fisher-Yates (`for i = n-1 down to 1: j = floor(random * (i+1)); swap`) using `nextRandom(rng)` from the state's `rng` (store the advanced `rng` back), and append it to the queue; `active = queue.length > 0`.
- While `s.study.active` (all in the code that runs each update):
  - Boss: in `updateGap`, when `b.modeTick >= phase.gap`, instead of `chooseAttack`/`planChain`, take `s.study.queue.shift()` as `pendingAttackId` with `chainLeft = 0` and go to `approach` as usual (no random draws). In `finishAttack`: no chains; after the attack, if `s.study.active && s.study.queue.length === 0` the study ends: `active = false`, `endTick = s.tick`, event `studyEnd`, then the boss goes to waiting as usual (`enterGap`).
  - `resolvePlayerAttack`: return at once (no `bossHit`, no `attackConnected`, no damage, no phase change).
  - `tryCounter`: return at once (no counter, no stagger).
  - `resolveBossHits`: when the player would be hit (not invulnerable and a box overlaps): do not call `hurtPlayer`; push event `studyHit` and set `p.invulnerableTicks = PLAYER.hitInvulnerability` (so one demonstration gives one `studyHit`); no health change, no defeat.
- Nothing else changes (walking, approach, attack timing, leaps, dials).

- [ ] **Step 1: Write the failing tests** (`tests/step-study.test.ts`). Use the real Duelist and the Hound (`ASHEN_HOUND`) where useful and build the boss for a scripted fight with the real spacing/attack ranges (so the boss really walks); use a player that stands still or runs at the boss. Tests: (1) `studyRounds` 0: `createInitialState(DUELIST, 5)` deep-equals the old state plus `study: { active: false, queue: [], endTick: 0 }` and its `rng` equals the seed (no draw). (2) `studyRounds` 1 on the Duelist: `study.queue` is a permutation of `['slam', 'sweep', 'lunge']` (its first-phase attacks), `active` true; the order differs for at least two different seeds among seeds 1..10 (proves the shuffle uses the seed) and is identical for the same seed. (3) `studyRounds` 2: the queue has 6 entries, each id twice, and each half is a permutation. (4) Running a study fight to its end with a standing player: the boss starts exactly the queued attacks in queue order (read the attack ids at each windup event), `attackIds` never contains `burst` (a later-phase attack) or anything not in the queue, `studyEnd` occurs exactly once, right on the update the last attack finishes, `study.active` is false afterwards and `study.endTick` equals that update's tick, and afterwards the boss picks attacks by the normal random rule (run 600 more updates: attacks appear and the real hits now hurt: `playerHit` events occur and health drops for the standing player). (5) During the study: the standing player's health stays at the maximum, `playerHit` never occurs, `studyHit` occurs for attacks that reach him (at least once in a Duelist study with `sweep` in range: place the player so the attack reaches; assert exactly one `studyHit` per reaching demonstration), and no `playerDefeated`. (6) A swing that overlaps the boss during the study produces no `bossHit`, boss hp unchanged, no phase change; a swing timed inside a counter window of the counterable slam produces no `counter` and no stagger (the slam completes). (7) No chains: `chainLeft` is 0 throughout the study even for a boss with `chainChance` 1 (test with a modified Duelist). (8) After the study a counter works again and a swing hurts the boss (repeat the existing counter/hurt scenario at the end of a study). (9) Determinism: the same seed and inputs give identical state sequences; the state survives JSON round trip and `structuredClone` mid-study. (10) The four golden scenarios still pass (run the file).
- [ ] **Step 2: Run to verify they fail**, implement, run again.
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0, golden unchanged.
- [ ] **Step 4: Commit.**
```bash
git add src/game/state.ts src/game/boss.ts src/game/step.ts tests/step-study.test.ts
git commit -m "feat: add the study phase to the simulation"
```

---

### Task 2: Recording, replay and analysis of the study (TDD)

**Files:**
- Modify: `src/stats/record.ts`, `src/stats/analyze.ts`, `src/stats/export.ts` (only if it hard-codes the version), `src/game/summary.ts`, `src/ui/summary-text.ts`, `src/ui/fight-flow.ts`
- Test: `tests/record.test.ts`, `tests/analyze.test.ts`, `tests/fight-flow.test.ts`, `tests/summary.test.ts`, `tests/summary-text.test.ts`, `tests/loop-replay.test.ts` (extend), `tests/export.test.ts` (schema version)

**Interfaces:**
- Consumes: Task 1 (`createInitialState(boss, seed, studyRounds)`, `state.study`, events).
- Produces:
  - `record.ts`: `STATS_SCHEMA_VERSION = 2`; `FightMeta` gains `study: 0 | 1 | 2`; `FightRecord` gains `study: 0 | 1 | 2`; `buildRecord` copies it; `replayFinalState(record)` uses `createInitialState(boss, seed, record.study ?? 0)` (the record type for replay/analysis accepts a missing `study`, so version-1 records still work).
  - `analyze.ts`: `AttackOccurrence` gains `study: boolean`; `Analysis` gains `study: { rounds: number; ticks: number; attacks: number; hits: number }` (`rounds` from the record, `ticks` = `study.endTick` when the study ended else the number of updates played while active, `attacks` = number of study occurrences, `hits` = number of `studyHit` events); `analyzeRun(boss, initial, frames)` derives everything from the states (the initial state's `study` gives the rounds: `initial.study.queue.length / phase-1 attack count` is NOT reliable: pass the rounds explicitly as a fourth parameter `studyRounds = 0` used only for the report field); `analyzeFight(record)` passes `record.study ?? 0`.
  - `summary.ts`: `FightSummary` gains `studySeconds: number` (`study.endTick / 60`, or the seconds played so far if the study is still active) and `seconds` now excludes the study (`(tick - endTick)/60`, or 0 while the study is still active); `summaryLines` adds a line `Study time: m:ss` after the time line when `studySeconds > 0`, and for a fight left while the study was active (`result === 'left'` and study active) the title stays "You left the fight" and a line "You left during the study." replaces the phase and hits lines' meaning: keep the other lines but add that line first.
  - `fight-flow.ts`: `startFlow(meta)` unchanged in shape (the meta carries `study`); `trackUpdate` counts only `playerHit` (unchanged), so study hits are not counted.

Analyzer rules for the study (flag `study: true` on an occurrence when `state.study.active` was true at the update the attack started, i.e. read it from the `before`/`after` states at the start event):
- `studyHit` events act like `playerHit` for the attack bookkeeping (outcome `hit`, `playerActionWhenHit`, `open.hit`), with `damageTaken` 0 (`health` did not change), but they do NOT increase the fight-level `hitsTaken` or `playerHitTicks`; `damageTaken` (fight) is unchanged (health based).
- Punish windows: no window is opened or counted for study occurrences.
- `swings`, `dashes`, `jumps`, positions and distance bands cover the whole session including the study.
- Counters cannot happen in the study; `counters` unaffected.
- The frame loop's end condition and everything else unchanged.

- [ ] **Step 1: Write the failing tests.** Record: `buildRecord` carries `study`; schema constant is 2; a fight with study 1 and one with study 2 (real Duelist, scripted deterministic player, as in `tests/record.test.ts`) replay to the identical final state through `replayFinalState` including a JSON round trip; a record without `study` (delete the field) replays as 0 and equals the study-0 replay. Analyzer: for a study-1 Duelist fight with a standing player: `analysis.study` = `{ rounds: 1, ticks: <endTick>, attacks: 3, hits: <number of studyHit events> }`; the study occurrences are flagged `study: true` and their ids are exactly the queue; the real-fight occurrences after `endTick` are `study: false`; fight-level `hitsTaken`/`damageTaken`/`playerHitTicks` count only real hits (agree with the M3a `FightSummary` via `advanceFlow`/`summarize` on `ticks`, `hitsTaken`, `phaseReached`); no punish windows come from study attacks (`punish.opened` equals `taken + missed` and counts only real ones); a study occurrence with a `studyHit` has outcome `hit` and `damageTaken` 0; a study fight with study 0 has `study: { rounds: 0, ticks: 0, attacks: 0, hits: 0 }` and all occurrences `study: false`. Summary: `seconds` excludes the study, `studySeconds` is the study length, a fight left during the study has `seconds` 0 and the extra line. `tests/loop-replay.test.ts`: add study cases (Duelist study 1 at Normal, Hound study 2 at Hard) to the emulated app loop, asserting the replay guarantee and the analysis agreement. Export: the document's `schemaVersion` is 2. Old data: a hand-built version-1 record still analyses.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything.** `npm test && npm run typecheck && npm run build && npm run check:dist`; all exit 0, golden unchanged.
- [ ] **Step 4: Commit.**
```bash
git add src/stats src/game/summary.ts src/ui/summary-text.ts src/ui/fight-flow.ts tests
git commit -m "feat: record, replay and analyse the study phase (stats schema 2)"
```

---

### Task 3: The Study setting and menu row (TDD)

**Files:**
- Modify: `src/ui/prefs.ts`, `src/ui/menu-model.ts`
- Test: `tests/prefs.test.ts`, `tests/menu-model.test.ts` (extend)

**Interfaces:**
- Consumes: the existing prefs functions (read `src/ui/prefs.ts` first) and `menuStep`, `MENU_ITEMS`, `menuRows`.
- Produces: `Prefs.study: 0 | 1 | 2`; `DEFAULT_PREFS.study = 1`; `parsePrefs` reads `study` (0, 1 or 2 only; anything else, or missing, gives 1 without discarding the other fields); `savePrefs`/`loadPrefs` keep it; helper `nextStudy(value: 0 | 1 | 2, direction: 1 | -1): 0 | 1 | 2` (wraps 0 → 1 → 2 → 0) and `studyLabel(value)` (`'Off' | 'Once' | 'Twice'`) exported from `prefs.ts`; the menu order becomes `fight, boss, difficulty, study, tweak, stats, settings, test`; the Study row shows `studyLabel(prefs.study)` and left, right and confirm cycle it (`nextStudy`; left goes backwards) and stay on the menu (outcome `stay`); the labels: row label `Study`.

- [ ] **Step 1: Write the failing tests.** prefs: default 1; parse of valid 0/1/2 keeps them; invalid (3, -1, 'x', null, 1.5, missing) → 1 and other fields intact; round trip through `MemoryStorage` and `BrokenStorage` still safe; `nextStudy` wraps both ways; `studyLabel`. Menu: the new row order and the row value; left/right/confirm cycle Off/Once/Twice with wrap and change only `prefs.study` (dials, preset, boss untouched); the existing "no-choice rows" and open-outcome tests updated for the new order; focus wrap over the new length.
- [ ] **Step 2: Run to verify they fail, implement, run again.**
- [ ] **Step 3: Run everything** (as above; `src/ui/app.ts` may need a compile fix if it lists menu items: keep it minimal).
- [ ] **Step 4: Commit.**
```bash
git add src/ui/prefs.ts src/ui/menu-model.ts tests
git commit -m "feat: add the Study setting to the menu"
```

---

### Task 4: The app: study banner, feedback and wiring

**Files:**
- Create: `src/ui/study-banner.ts`
- Modify: `src/ui/app.ts`, `src/ui/feedback.ts`, `src/ui/audio.ts`, `src/ui/render.ts` (small)
- Test: `tests/study-banner.test.ts` (new); `tests/feedback.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1 to 3; existing banner element and `setBanner` in `app.ts`, `applyEvents`/`freezeFor` (`src/ui/feedback.ts`), `Sound.play`.
- Produces: `studyBanner(study: StudyState, tick: number): string | null` in `src/ui/study-banner.ts`: `"Study: watch what it can do. Nothing can hurt you."` while `study.active`; `"The fight begins!"` for the 120 updates after `study.endTick` (when `endTick > 0` and `tick - endTick < 120`); otherwise null. Feedback: `studyHit` sets the player flash like a hit (`playerFlashTicks`) but no freeze (`freezeFor` returns 0 for it), no shake; sound: a soft low beep (shorter and quieter than the hit sound; reuse the existing `beep` helper; nothing when sound is off). Wiring: `startFight` passes `prefs.study` to `createInitialState(boss, seed, prefs.study)` and puts `study: prefs.study` in the `FightMeta`; during a fight the banner text is `studyBanner(state.study, state.tick)` unless the paused-controller banner has priority; the study never changes hold-to-leave or the summary flow; the summary shows the study line from Task 2 (already in `summaryLines`); a small "STUDY" tag next to the boss name in the HUD while active is optional (only if trivial in `drawHud`, no tests needed for the drawing).

- [ ] **Step 1: Write the failing tests:** `studyBanner` for active, just after the end (tick difference 0, 119, 120), never-studied (endTick 0), and off; feedback: `studyHit` flashes the player, no freeze, no shake, and honours the Flashes setting like the hit flash; `freezeFor` of `studyHit` is 0.
- [ ] **Step 2: Implement.** Read `src/ui/app.ts` (`runFight`, `startFight`) and keep the recording rule intact: the frame recorded is the exact frame given to `step`; recording starts at the first update (the study is part of the recording). No `innerHTML`, no `style=`.
- [ ] **Step 3: Run everything** (`npm test && npm run typecheck && npm run build && npm run check:dist`), then the preview smoke check (start `npm run preview -- --port 4173 --strictPort` in the background, `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:4173/` and `/sw.js`, stop it, confirm the port is free). State plainly in the report that the in-browser check is NOT done and remains for the owner.
- [ ] **Step 4: Commit.**
```bash
git add src/ui tests
git commit -m "feat: show the study banner and wire the study setting into the fight"
```

---

### Task 5: Docs and the play-test checklist

**Files:**
- Modify: `docs/stats.md`, `docs/phone-testing.md`, `docs/SPEC.md`, `docs/backlog.md`, `docs/bosses.md` (only if it should mention the study), `CLAUDE.md` (only a line if needed)

- [ ] **Step 1: `docs/stats.md`.** Read the code first and verify every statement. Bump to schema version 2 everywhere it is stated (export document, record); document the new record field `study` (0, 1 or 2, "study rounds", absent in version 1 records meaning 0), the new `analysis.study` block, the new `study` flag on attack occurrences, `studyHit` counted like a hit for the occurrence but with 0 damage and not in `hitsTaken`/`playerHitTicks`, punish windows excluded for study attacks, behaviour counters covering the whole session, how to replay (`createInitialState(boss, seed, study)`), how to compare study and real fight (filter occurrences by `study`), and an example. Say that version-1 files remain valid.
- [ ] **Step 2: `docs/phone-testing.md`** (plain language for a non-programmer; keep everything else). Add "The study phase (M5b)": the Study row (Off, Once, Twice; default Once; remembered), what happens in the study (the banner; each first-phase attack once or twice in random order with its normal warning; nothing can hurt you and you cannot hurt the boss; the red flash when an attack would have hit; "The fight begins!"), leaving with the top button, the summary's "Study time" line. Checklist: the Study row cycles and is remembered; with Off the fight starts straight away as before; with Once the boss shows each of its first-phase attacks exactly once (Duelist: slam, sweep, lunge; Hound: bite, rush, slip, pounce) and never a later-phase attack; with Twice each twice in two different orders; no damage and no hearts lost in the study; your swing does nothing to the boss in the study; the banner texts appear and go away; the real fight then hurts normally; the summary shows the fight time without the study and a Study time line; leaving during the study ends as "You left the fight"; the stats save the study fights and Export still works. Questions: is the study useful to learn the attacks, is it too long or too short, should the boss be hittable in the study, is the banner readable.
- [ ] **Step 3: `docs/SPEC.md`.** Record the owner's M5b decisions (study shows first-phase attacks only; setting Off/Once/Twice default Once; details DELEGATED) and that M5b is built and awaiting the owner's play test; keep the order of the later steps as OPEN. `docs/backlog.md`: mark the study-phase item as built in M5b and list the not-built ideas (adaptive study, study for later phases, slow-motion demonstrations).
- [ ] **Step 4: Final verification.** `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`; all exit 0; `git status --short` shows only the docs before the commit.
- [ ] **Step 5: Commit.**
```bash
git add docs CLAUDE.md
git commit -m "docs: document the study phase, stats schema 2 and the M5b play test"
```
(Only add files that changed.)

---

## M5b done when
- All five tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout, with the Duelist golden test unchanged.
- The controller pushes (owner's go-ahead first), CI is green and the site is deployed.
- The owner has played with Study Off, Once and Twice on the phone and exported a study fight that replays correctly.

## Self-review notes
- **Spec coverage** (`docs/superpowers/specs/2026-09-21-m5b-study-phase-design.md`): setting and menu row (Task 3), study in the simulation with the seeded shuffle, no damage, no boss damage, no counters, `studyHit`/`studyEnd` (Task 1), record/replay/analysis/summary/schema 2 (Task 2), banner, feedback and wiring (Task 4), docs and checklist (Task 5).
- **Names used across tasks:** `StudyState`, `GameState.study`, `createInitialState(boss, seed, studyRounds)`, `studyHit`, `studyEnd`, `FightMeta.study`, `FightRecord.study`, `Analysis.study`, `AttackOccurrence.study`, `FightSummary.studySeconds`, `Prefs.study`, `nextStudy`, `studyLabel`, `studyBanner`.
- **Risks to watch:** the golden test must not change (no generator use when rounds is 0); `advanceFlow` treats a non-`fight` `phase` as the end, and the study does NOT use `phase` (it uses `study.active`), so nothing else treats the study as the end; the analyzer's `break` on `before.phase !== 'fight'` is unaffected; `finishAttack` is also called for stagger/chain paths (no chains in the study); the study must end exactly once even if the last attack is interrupted (phase changes and counters cannot happen in the study).

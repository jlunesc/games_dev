# Two-boss fights, plan 2: play a pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-boss engine (plan 1, merged) playable: a pair file, a first real pair (Ashen Hound + Vesper Sage) in the Boss row, fights that record and replay, an analysis that measures both bosses, and a screen that shows both.

**Architecture:** A pair is a small JSON file naming two existing bosses, a health scale for each, and the enrage strength. `resolveFight(id, seed)` turns a boss id or a pair id into a `FightDef`; the pair id is stored as the record's `bossId`, so replay and analysis find the fight again from the id, the seed, the dials and the input. The app holds a `FightDef` instead of one `BossDef`; drawing, effects and the summary loop over every boss of the fight. Solo fights (a one-boss `FightDef`) must stay bit-identical.

**Tech Stack:** TypeScript (strict), Vitest, Vite, canvas 2D. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-two-boss-fights-design.md` (design agreed with the owner). Plan 1 (engine) is `docs/superpowers/plans/2026-09-29-two-boss-fights-engine.md` and is merged on `main`.

## Global Constraints

- No backend, accounts or uploads. No third-party scripts, trackers or CDN-loaded code. No new dependency.
- Strict Content Security Policy: no inline scripts, no `style="..."` attributes; style through CSS classes or `el.style.setProperty(...)`; write DOM with `textContent`, never `innerHTML`.
- TypeScript in strict mode. Default to no comments; one short line only where the reason is not obvious.
- Exported stats are git-ignored; never commit stats or player data.
- Bosses and pairs are data files, separate from engine code. Art is separate from fight logic. The looks live in `src/ui/look/` and never change how a fight plays; every tunable colour, size and strength is in `src/ui/look/tuning.ts`.
- The game loop stays a fixed-timestep, deterministic, seeded simulation. A one-boss fight must replay bit-identically: the Ember Duelist golden test and every existing replay test pass unedited.
- The stats schema is versioned and documented. Any change to the shape needs a `STATS_SCHEMA_VERSION` bump and an update to `docs/stats.md` in the same task. Bump `GAME_VERSION` in `src/stats/record.ts` only if a change makes recorded fights of existing bosses replay differently (this plan must not).
- Bosses are JSON files checked by a parser; the format is documented in `docs/bosses.md`; when the format changes, update that file and the tests.
- Phone performance: effects stay light for the Galaxy S21 (cap counts, pre-render, no per-frame blur).
- Explanations to the owner are in plain language; the owner is not a programmer.
- Do not add `Co-Authored-By: Claude` or any Claude/Anthropic attribution line to commits (owner's rule, overrides any default).
- Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:dist` (after a build).

## Decisions taken as defaults (the owner may change any of them)

| # | Topic | Default | Status |
|---|---|---|---|
| 1 | First pair | Ashen Hound (primary) + Vesper Sage | LOCKED (owner, 2026-09-29) |
| 2 | Pair id and name | id `hound-and-sage`, name "Hound and Sage"; the pair id is used wherever a boss id is stored (prefs, record `bossId`) | DEFAULT |
| 3 | Health scale | Each boss's `maxHp` is multiplied by its `healthScale` (first numbers: Hound 0.6, Sage 0.6), then the health dial applies on top | DEFAULT, tuned in the last task |
| 4 | Enrage strength | `gapScale 0.6`, `walkScale 1.3` for the first pair | DEFAULT, tuned in the last task |
| 5 | Arena and backdrop | The primary boss's arena, and the backdrop mood of the primary boss | DEFAULT |
| 6 | Study | Off for pair fights (the engine already skips it; the record stores `study: 0`). A per-boss study is a later plan | DEFAULT |
| 7 | Analysis | Schema version 6. Each attack occurrence gains `boss` (0 = primary, 1 = partner; always 0 in a solo fight). `Analysis` gains `bosses` (one entry per boss). The existing top-level boss fields stay: `bossMaxHp`, `bossHpLeft`, `damageDealt` are summed over all bosses; `phaseReached` and `phaseCount` are the primary's. Older records stay valid and read as a one-boss fight | DEFAULT |
| 8 | Two health bars | Stacked at the top right, primary above the partner, each in its boss's colour with its name; a fallen boss's bar is dimmed | DEFAULT |
| 9 | Turn marker | A small pulsing triangle above the boss that holds the turn (approaching, attacking, or owning shots); look-only, tunable in `tuning.ts` | DEFAULT |
| 10 | Knockdown feedback | The `'bossDown'` event gets the same shake, flash and freeze as `'bossDefeated'` | DEFAULT |

## Shared interfaces (every task uses these exact names)

Already on `main` (plan 1): `FightDef`, `EnrageDef`, `makeFight`, `asFight`, `enrageBoss` (`src/game/fight.ts`); `GameState.partners`, `bossAt`, `bossCount`, `allBosses`, `isDowned`, `createInitialState(source: BossDef | FightDef, seed?, studyRounds?)` (`src/game/state.ts`); `holdsTurn`, `isEnraged`, `bossDefFor`, `pickCommitter` (`src/game/turns.ts`); `step(prev, input, source: BossDef | FightDef)`.

Produced by this plan:

- `src/bosses/pair.ts`: `interface PairMember { boss: string; healthScale: number }`; `interface PairDef { id: string; name: string; bosses: readonly [PairMember, PairMember]; enrage: EnrageDef | null }`; `class PairFormatError extends Error`; `parsePair(data: unknown, boss: (id: string) => BossDef | undefined): PairDef`.
- `src/bosses/pairs.ts`: `HOUND_AND_SAGE: PairDef`; `PAIRS: readonly PairDef[]`; `pairById(id: string): PairDef | undefined`.
- `src/bosses/resolve.ts`: `resolveFight(id: string, seed: number): { fight: FightDef; unfair: boolean }`. A boss id or `'generated'` gives a fight of one (same boss and `unfair` as `resolveBoss`); a pair id gives a `FightDef` of its scaled bosses and its enrage.
- `src/game/difficulty.ts`: `applyDialsToFight(fight: FightDef, dials: Dials): FightDef` (each boss through `applyDials`, then `makeFight(bosses, fight.enrage)`).
- `src/bosses/index.ts`: `BOSS_CHOICES` gains one entry per pair after the named bosses and before `'generated'`; `bossChoiceName` finds pair names too.
- `src/stats/analyze.ts`: `AttackOccurrence.boss: number`; `Analysis.bosses: BossAnalysis[]` with `BossAnalysis { id: string; name: string; maxHp: number; hpLeft: number; phaseReached: number; phaseCount: number; damageDealt: number }`; `analyzeRun(fight: FightDef, initial, frames, studyRounds)`.
- `src/game/summary.ts`: `summarize(tracker, state, fight: FightDef, result)`; `FightSummary` gains `bosses: { name: string; hpLeft: number; maxHp: number }[]`.

## Task groups

- Tasks 1-3 (data and recording): pair file and parser; `resolveFight` and dials for fights; recording, replay, schema version 6.
- Tasks 4-5 (measuring): analyzer for a fight of any size; summary and stats screens.
- Tasks 6-8 (screen): app wiring; drawing (both bosses, two bars, turn marker); effects, figures and knockdown feedback.
- Task 9: the Boss row entry (the pair becomes selectable).
- Task 10: docs, phone checklist, and tuning the first pair with scripted players.

---

## Contract notes

Where the code on `main`, or another task, needs a call the Shared interfaces block does not make.

### Tasks 1-3


1. **Import cycle, solved with a split.** `BOSS_CHOICES` (in `src/bosses/index.ts`) needs the pairs, and `pairs.ts` needs the boss definitions to check a pair file at load. So Task 1 moves the boss constants and the `BOSSES` list into a new `src/bosses/roster.ts` (a `git mv` of `index.ts`, minus `bossById` and the choices). `src/bosses/index.ts` stays the public module: it re-exports everything in `roster.ts` and keeps `bossById`, `BossChoice`, `BOSS_CHOICES` and `bossChoiceName`. Every existing `import ... from '../bosses'` keeps working unedited. `pairs.ts` imports `roster.ts`, never `index.ts`.
2. **Strict lookup.** `pairs.ts` passes `parsePair` a lookup over `BOSSES` that returns `undefined` for an unknown id. It must never use `bossById` (that falls back to the Duelist).
3. **`resolveFight` has an optional third parameter** `checkFairness = realCheckFairness`, passed through to `resolveBoss`, so tests can resolve a `'generated'` fight quickly. Callers that pass two arguments (the contract) are unaffected.
4. **Task 3 versus Task 4 (analysis).** Task 3 switches only `replayFinalState` (and the schema number and docs). `analyzeFight` and `analyzeRun` in `src/stats/analyze.ts` still use `resolveBoss` until Task 4 moves them to `resolveFight` and `applyDialsToFight`; until then, analysing a pair record would silently use the Duelist. That is harmless while Task 9 (the Boss row entry) is last, and nothing can record a pair before Task 6.
5. **Docs overlap with Task 4.** Task 3 writes the whole "Version 6" bullet in `docs/stats.md` section 9, including the analysis additions of Decision 7 (`boss` per attack, `bosses` per analysis), and changes the two "Currently 5" lines. Task 4 should only fill in the section 7 tables and must not add a second Version 6 bullet or touch those lines.
6. **Study is stored as 0 for a pair by the app (Task 6).** `createInitialState` already ignores the study for a fight with partners, so replay is correct whatever a record says; Task 3 tests that. The menu's Study row still shows the player's own setting while a pair is chosen (Task 9 leaves it alone; open question below).
7. **Tests edited on purpose (schema bump only):** `tests/record.test.ts` (three `5` to `6`) and `tests/export.test.ts` (one `5` to `6`). No replay or golden test is edited.
8. **`parsePrefs` is left unchanged.** It keeps any stored `bossId` string (an existing test pins that). An unknown or removed id is handled where it is used: the Boss row shows the Duelist's name and `resolveFight` gives the Duelist.

**Open question for the parent:** while a pair is chosen, should the menu's Study row say something like "Off (pairs)"? Not in the spec, so this part does not do it.

---

### Tasks 4-5


1. **Both entry points accept a boss or a fight.** `analyzeRun`, `summarize`, `advanceFlow` and `leaveSummary` take `BossDef | FightDef` (through `asFight`), not `FightDef` only. The Shared block names `FightDef`; a `FightDef` works exactly as named. Accepting a plain boss keeps `app.ts`, `tests/ashen-hound.test.ts`, `tests/tremor-brute.test.ts` and every other existing caller compiling and unedited. Task 6 (app wiring) may pass a `FightDef` straight in.
2. **Order dependency.** Task 4 needs Task 2 (`resolveFight`, `applyDialsToFight`, the `hound-and-sage` id) and Task 3 (`STATS_SCHEMA_VERSION` is already 6 and `docs/stats.md` has a Version 6 entry). Task 4 documents the new `analysis` fields in `docs/stats.md` but does not touch the constant. Step 1 of Task 4 checks that the bump is there.
3. **One existing test fixture is edited.** `FightSummary` gains a required `bosses`, so the `base` literal in `tests/summary-text.test.ts` needs `bosses: [...]` to typecheck. No existing assertion changes.
4. **Which boss began an attack.** Only one boss is ever in `attack` mode, and `startAttack` sets `attackTick` to 0 on the update it pushes the warning event, so the boss that is in `attack` with `attackTick === 0` is the one. If a counter cancelled it on that same update (`tryCounter` runs after `updateBosses`), it is in `stagger` and its `before` state still had `pendingAttackId` set; that is the fallback. A test covers each.
5. **Distance bands use the nearest boss still standing** (the primary boss once all are down), the same idea as the sword. An attack's own start `distance` is measured to the boss that made it.
6. **Shot matching.** Shots are matched with `owner`; `shotHits` carries no owner, so its match on `(attackId, originTick)` relies on the turn rule (two bosses never start attacks on the same update). A downed boss's or a phase-changing boss's shots are cleared only for that boss's attacks.
7. **Summary shape for a pair.** Hits of the primary boss stay keyed by the plain attack id (a one-boss tracker is unchanged); a partner's are keyed `<index>:<id>`. `mostDangerousAttack.name` reads `<Boss>'s <Attack>` only in a fight of two or more. The summary screen shows one health line per boss and leaves the "Phase reached" line out for a pair, because the tracker follows the primary boss only.
8. **Engine observation for Task 10, not changed here.** `resolveBossHits` in `src/game/step.ts` cuts a partner's hit windows with the partner's own `arena.covers` (through `bossDefFor`), while the player and shots use the primary boss's arena. The analyzer mirrors the game, so its numbers agree with it. The Hound and the Sage have no arena, so the first pair is not affected.

---

### Tasks 6-8


Where the current code differs from, or adds to, the Shared interfaces block:

1. **Task 5 signatures are consumed by Task 6.** Task 6 calls `advanceFlow(flow, before, after, fight, frame)` and `leaveSummary(flow, state, fight)` with a `FightDef`, as Task 5 defines them. Tasks 1-5 must be done before Task 6.
2. **`drawFrame`, `spawnEffects` and `bossFigure` keep accepting a plain `BossDef`.** `drawFrame(..., source: BossDef | FightDef, ...)` and `spawnEffects(..., source: BossDef | FightDef, ...)` go through `asFight`, the same way `step` does, so every existing render, effects and loop-replay test passes unedited. `bossFigure(state, boss, colors, index = 0)` gets an optional index for the same reason.
3. **Tasks 6, 7 and 8 leave the app green between them.** Task 6 passes `fight.bosses[0]!` to `drawFrame` and `spawnEffects` (only the primary is drawn until Task 7). Task 7 switches the `drawFrame` call to `fight`. Task 8 switches the `spawnEffects` call to `fight` and wires the boss flash. A pair is not selectable until Task 9, so nobody sees the in-between states.
4. **New file `src/ui/fight-setup.ts`** (Task 6): `setUpFight(bossId, seed, dials, study): FightSetup` with `{ fight, unfair, study, recordBossId }`. It is the one place that turns the Boss row choice into a fight (resolve, dials, study forced to 0 for pairs, the id to record). It uses `resolveFight` and `applyDialsToFight` from Tasks 1-2. For a pair, `resolveFight(...).unfair` must be `false` (Task 6 tests it).
5. **New helper `studyLabelFor(bossId, value)` in `src/ui/prefs.ts`** (Task 6): the Study row shows `Off (pairs)` for a pair id (uses `pairById` from Task 1) and `studyLabel` otherwise. `menuRows` uses it.
6. **New look files:** `src/ui/look/duo.ts` (Task 7: `healthBars`, `turnHolder`, `turnMarker`, `fallenFigure`) and `src/ui/look/who.ts` (Task 8: `struckBoss`, `fellBosses`, `phasedBoss`). New tunables: `LOOK.hud`, `LOOK.turnMarker`, `LOOK.fallen` in `look/tuning.ts`. No new dependency. Neither file imports `render.ts`.
7. **New optional field `FrameLook.flashBoss?: number`** (Task 7): which boss flashes white on a hit. Left out, every boss flashes (old behaviour). Task 8 wires it from the app with `flashBossFor(events, before, after, current)` in `src/ui/feedback.ts`.
8. **Health bar colour.** A lone boss keeps the red bar (`COLORS.bossHp`). In a pair each bar takes its boss's mood accent colour (`moodFor(def.id).accent`), which is decision 8's "in its boss's colour".
9. **A pair's record id.** Solo fights keep recording the boss's own id (`'generated'` for a generated boss). A fight with partners records the Boss row id (the pair id). This is `recordBossId` in `setUpFight`.
10. **A fallen boss is drawn as a low, dimmed heap** (`fallenFigure`), and its hit boxes, warnings and shockwave ring are not drawn (the engine already lands it in `gap` with no attack). The `'bossDown'` burst uses the same burst and big ring as `'bossDefeated'`.
11. **Audio.** `'bossDown'` reuses the `'bossDefeated'` beep (decision 10 says feedback is shared). `audio.ts` has no tests (it needs a browser `AudioContext`); this is covered by a manual check line.

---

### Task 10


- **No skilled-bot win test for the pair.** The generator's skilled bot (`skilledInput`, `runSkilled` in `src/bosses/generate/fairness.ts`) is not exported and reads only `s.boss` and one `BossDef`; it cannot play a fight with a partner. No other bot in `tests/` does either. This task therefore limits the fairness bar to: an idle player loses (every preset, corners, and with one boss already down), the turn rule holds over long real runs, both bosses get turns, and a player who cannot die and only chases and swings can win. It does not claim that a dodging player can win. Extending `checkFairness` to pairs stays out (the design says so; it goes in the backlog).
- **Pair health rounding.** The tests only assume `resolveFight('hound-and-sage', seed).fight.bosses` keeps each boss's `id`, and that each `maxHp` is an integer of at least 1 and below the solo boss's. They do not pin how Task 1/2 round `maxHp * healthScale`. They also do not assert `unfair` for a pair.
- **The study.** The design (`specs/2026-09-29-two-boss-fights-design.md`) says each boss shows its attacks in turn; this plan (decision 6) switches the study off for pairs. The SPEC entry below records both: the per-boss study as LOCKED in the design and deferred, the switch-off as DEFAULT. The backlog entry lists it as left out.
- **Stale sentences in `docs/phone-testing.md`** that list the Boss row choices are fixed by Task 9 (Step 6b). This task only adds the new section.
- **Pair file name.** Steps that mention "the pair file" mean whatever file Task 1 created for `HOUND_AND_SAGE` (probably `src/bosses/hound-and-sage.json`). Adjust the path if Task 1 named it differently.
- **`GAME_VERSION`.** Changing the pair file's numbers after the owner has recorded and exported pair fights changes how those fights replay. Step 11 says to bump it in that case.

---

## Task 1: The pair file format, its parser and the first pair

A pair is a small JSON file that names two existing bosses, a health scale for each, and how much angrier the survivor gets. This task adds the format, the checker (`parsePair`, in the style of `parseBoss`), the first pair file (Hound and Sage), a registry checked at load, the docs section, and the small split of `src/bosses/index.ts` that keeps the registry free of an import loop.

**Files:**
- Create: `src/bosses/pair.ts`
- Create: `src/bosses/hound-and-sage.json`
- Create: `src/bosses/pairs.ts`
- Create: `src/bosses/roster.ts` (by `git mv src/bosses/index.ts src/bosses/roster.ts`, then trimmed)
- Create: `src/bosses/index.ts` (new, small; re-exports the roster)
- Modify: `docs/bosses.md` (section 1 wording, new section "5a. Pairs")
- Test: `tests/pair-parse.test.ts` (create)

**Interfaces:**
- Consumes: `BossDef` (`src/bosses/schema.ts`); `EnrageDef` (`src/game/fight.ts`, type only); `BOSSES` (`src/bosses/roster.ts`).
- Produces (`src/bosses/pair.ts`): `interface PairMember { boss: string; healthScale: number }`, `interface PairDef { id: string; name: string; bosses: readonly [PairMember, PairMember]; enrage: EnrageDef | null }`, `class PairFormatError extends Error`, `parsePair(data: unknown, boss: (id: string) => BossDef | undefined): PairDef`.
- Produces (`src/bosses/pairs.ts`): `HOUND_AND_SAGE: PairDef`, `PAIRS: readonly PairDef[]`, `pairById(id: string): PairDef | undefined`.
- Produces (`src/bosses/roster.ts`): everything `src/bosses/index.ts` exported before except `bossById`, `BossChoice`, `BOSS_CHOICES`, `bossChoiceName`; `src/bosses/index.ts` re-exports all of it, so no import elsewhere changes.

**The rules `parsePair` checks** (each failure throws `PairFormatError`, message `Pair data error at <path>: <what>`, like `BossFormatError`):

| Path | Rule |
|---|---|
| `pair` | an object |
| `pair.id` | non-empty text; must not be `'generated'` and must not be the id of a boss (a pair id is stored where a boss id is stored, so the two must never collide) |
| `pair.name` | non-empty text |
| `pair.bosses` | a list of exactly two |
| `pair.bosses[i]` | an object |
| `pair.bosses[i].boss` | non-empty text naming a boss the lookup knows; the two must differ |
| `pair.bosses[i].healthScale` | a number from 0.2 to 2 |
| `pair.enrage` | missing or `null` means no enrage; otherwise an object |
| `pair.enrage.gapScale` | a number from 0.1 to 1 (waits get shorter, never longer) |
| `pair.enrage.walkScale` | a number from 1 to 3 (walking gets faster, never slower) |

- [ ] **Step 1: Write the failing tests**

Create `tests/pair-parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSSES, VESPER_SAGE, bossById } from '../src/bosses';
import { PairFormatError, parsePair } from '../src/bosses/pair';
import rawPair from '../src/bosses/hound-and-sage.json';
import { HOUND_AND_SAGE, PAIRS, pairById } from '../src/bosses/pairs';
import type { BossDef } from '../src/bosses/schema';

const strict = (id: string): BossDef | undefined => BOSSES.find((b) => b.id === id);

const member = (boss: string, healthScale = 0.6) => ({ boss, healthScale });

const pairWith = (over: Record<string, unknown>) => ({
  id: 'test-pair',
  name: 'Test Pair',
  bosses: [member('ashen-hound'), member('vesper-sage')],
  enrage: { gapScale: 0.6, walkScale: 1.3 },
  ...over,
});

function errorOf(data: unknown): string {
  try {
    parsePair(data, strict);
  } catch (error) {
    expect(error).toBeInstanceOf(PairFormatError);
    expect((error as Error).name).toBe('PairFormatError');
    return (error as Error).message;
  }
  throw new Error('expected parsePair to throw');
}

describe('parsePair', () => {
  it('accepts the real Hound and Sage file', () => {
    const pair = parsePair(rawPair, strict);
    expect(pair).toEqual({
      id: 'hound-and-sage',
      name: 'Hound and Sage',
      bosses: [
        { boss: 'ashen-hound', healthScale: 0.6 },
        { boss: 'vesper-sage', healthScale: 0.6 },
      ],
      enrage: { gapScale: 0.6, walkScale: 1.3 },
    });
  });

  it('reads a missing or null enrage as no enrage', () => {
    const noKey = { id: 'p', name: 'P', bosses: [member('ashen-hound'), member('vesper-sage')] };
    expect(parsePair(noKey, strict).enrage).toBeNull();
    expect(parsePair(pairWith({ enrage: null }), strict).enrage).toBeNull();
  });

  it('names the exact place of a problem', () => {
    expect(errorOf('nope')).toBe('Pair data error at pair: expected an object');
    expect(errorOf(pairWith({ id: undefined }))).toBe('Pair data error at pair.id: expected a non-empty text');
    expect(errorOf(pairWith({ name: '' }))).toBe('Pair data error at pair.name: expected a non-empty text');
  });

  it('refuses a pair id that is a boss id or "generated"', () => {
    expect(errorOf(pairWith({ id: 'ember-duelist' }))).toContain('pair.id');
    expect(errorOf(pairWith({ id: 'ember-duelist' }))).toContain('already used');
    expect(errorOf(pairWith({ id: 'generated' }))).toContain('already used');
  });

  it('needs exactly two bosses', () => {
    expect(errorOf(pairWith({ bosses: 'x' }))).toBe('Pair data error at pair.bosses: expected a list');
    expect(errorOf(pairWith({ bosses: [member('ashen-hound')] }))).toBe(
      'Pair data error at pair.bosses: expected exactly two bosses',
    );
    expect(
      errorOf(pairWith({ bosses: [member('ashen-hound'), member('vesper-sage'), member('ember-duelist')] })),
    ).toContain('exactly two');
  });

  it('refuses a boss id that does not exist (it never falls back to the Duelist)', () => {
    expect(bossById('nobody').id).toBe('ember-duelist');
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('nobody')] }))).toBe(
      'Pair data error at pair.bosses[1].boss: no boss has the id "nobody"',
    );
  });

  it('refuses the same boss twice', () => {
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('ashen-hound')] }))).toBe(
      'Pair data error at pair.bosses[1].boss: must be a different boss from the first ("ashen-hound")',
    );
  });

  it('keeps the health scale between 0.2 and 2', () => {
    expect(errorOf(pairWith({ bosses: [member('ashen-hound', 0.1), member('vesper-sage')] }))).toBe(
      'Pair data error at pair.bosses[0].healthScale: must be at least 0.2',
    );
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), member('vesper-sage', 2.5)] }))).toBe(
      'Pair data error at pair.bosses[1].healthScale: must be at most 2',
    );
    expect(errorOf(pairWith({ bosses: [member('ashen-hound'), { boss: 'vesper-sage' }] }))).toBe(
      'Pair data error at pair.bosses[1].healthScale: expected a number',
    );
    expect(parsePair(pairWith({ bosses: [member('ashen-hound', 0.2), member('vesper-sage', 2)] }), strict).bosses).toEqual([
      { boss: 'ashen-hound', healthScale: 0.2 },
      { boss: 'vesper-sage', healthScale: 2 },
    ]);
  });

  it('checks the enrage numbers', () => {
    expect(errorOf(pairWith({ enrage: 'angry' }))).toBe('Pair data error at pair.enrage: expected an object');
    expect(errorOf(pairWith({ enrage: { gapScale: 1.5, walkScale: 1.3 } }))).toBe(
      'Pair data error at pair.enrage.gapScale: must be at most 1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.05, walkScale: 1.3 } }))).toBe(
      'Pair data error at pair.enrage.gapScale: must be at least 0.1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6, walkScale: 0.5 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: must be at least 1',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6, walkScale: 4 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: must be at most 3',
    );
    expect(errorOf(pairWith({ enrage: { gapScale: 0.6 } }))).toBe(
      'Pair data error at pair.enrage.walkScale: expected a number',
    );
  });

  it('ignores fields it does not know, like the boss checker', () => {
    expect(parsePair(pairWith({ note: 'hello' }), strict).id).toBe('test-pair');
  });
});

describe('the pair registry', () => {
  it('lists Hound and Sage, the Hound first (the Hound is the primary boss)', () => {
    expect(PAIRS).toEqual([HOUND_AND_SAGE]);
    expect(HOUND_AND_SAGE.id).toBe('hound-and-sage');
    expect(HOUND_AND_SAGE.name).toBe('Hound and Sage');
    expect(HOUND_AND_SAGE.bosses.map((m) => m.boss)).toEqual([ASHEN_HOUND.id, VESPER_SAGE.id]);
  });

  it('finds a pair by id and returns undefined for anything else', () => {
    expect(pairById('hound-and-sage')).toBe(HOUND_AND_SAGE);
    expect(pairById('ember-duelist')).toBeUndefined();
    expect(pairById('generated')).toBeUndefined();
    expect(pairById('nobody')).toBeUndefined();
  });

  it('never uses the id of a boss, and never repeats an id', () => {
    const bossIds = new Set(BOSSES.map((b) => b.id));
    const seen = new Set<string>();
    for (const pair of PAIRS) {
      expect(bossIds.has(pair.id)).toBe(false);
      expect(pair.id).not.toBe('generated');
      expect(seen.has(pair.id)).toBe(false);
      seen.add(pair.id);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/pair-parse.test.ts`
Expected: FAIL, "Failed to resolve import '../src/bosses/pair'" (the file does not exist yet).

- [ ] **Step 3: Split the boss list out of `src/bosses/index.ts`**

Run: `git mv src/bosses/index.ts src/bosses/roster.ts`

In `src/bosses/roster.ts`, delete everything from the line `/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */` to the end of the file (that is `bossById`, `BossChoice`, `BOSS_CHOICES` and `bossChoiceName`). The file must end with the closing `];` of the `BOSSES` list. The imports at the top stay as they are.

Create the new `src/bosses/index.ts`:

```ts
import { BOSSES, EMBER_DUELIST } from './roster';
import type { BossDef } from './schema';

export * from './roster';

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}

/** One choice in the menu's Boss row: a named boss, or `'generated'` for a freshly generated one. */
export interface BossChoice {
  id: string;
  name: string;
}

/** Every choice the menu's Boss row offers, in menu order: the named bosses, then `'Generated'`. */
export const BOSS_CHOICES: readonly BossChoice[] = [
  ...BOSSES.map((b) => ({ id: b.id, name: b.name })),
  { id: 'generated', name: 'Generated' },
];

/** The display name for a boss choice id; an unknown id falls back to the Duelist's name, matching `bossById`. */
export function bossChoiceName(id: string): string {
  return BOSS_CHOICES.find((c) => c.id === id)?.name ?? EMBER_DUELIST.name;
}
```

- [ ] **Step 4: Create the parser `src/bosses/pair.ts`**

```ts
import type { EnrageDef } from '../game/fight';
import type { BossDef } from './schema';

/** One of the two bosses of a pair: which boss, and how much of its health it keeps in this pair (1 is as written in the boss file). */
export interface PairMember {
  boss: string;
  healthScale: number;
}

/** Two existing bosses that fight together. `bosses[0]` is the primary boss (its arena and backdrop are used). `enrage` is how much angrier the survivor gets when its partner falls, or null for no change. */
export interface PairDef {
  id: string;
  name: string;
  bosses: readonly [PairMember, PairMember];
  enrage: EnrageDef | null;
}

export class PairFormatError extends Error {
  constructor(path: string, message: string) {
    super(`Pair data error at ${path}: ${message}`);
    this.name = 'PairFormatError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new PairFormatError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Obj;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty text');
  return value;
}

function num(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  if (value < min) fail(path, `must be at least ${min}`);
  if (value > max) fail(path, `must be at most ${max}`);
  return value;
}

const HEALTH_SCALE = { min: 0.2, max: 2 };
const GAP_SCALE = { min: 0.1, max: 1 };
const WALK_SCALE = { min: 1, max: 3 };

function parseMember(data: unknown, path: string, boss: (id: string) => BossDef | undefined): PairMember {
  const o = object(data, path);
  const id = text(o.boss, `${path}.boss`);
  if (boss(id) === undefined) fail(`${path}.boss`, `no boss has the id "${id}"`);
  const healthScale = num(o.healthScale, `${path}.healthScale`, HEALTH_SCALE.min, HEALTH_SCALE.max);
  return { boss: id, healthScale };
}

function parseEnrage(data: unknown, path: string): EnrageDef {
  const o = object(data, path);
  return {
    gapScale: num(o.gapScale, `${path}.gapScale`, GAP_SCALE.min, GAP_SCALE.max),
    walkScale: num(o.walkScale, `${path}.walkScale`, WALK_SCALE.min, WALK_SCALE.max),
  };
}

/**
 * Checks a pair file and returns it, or throws a `PairFormatError` naming the first problem.
 * `boss` looks a boss up by id and must return `undefined` for an unknown id (not fall back to another boss).
 */
export function parsePair(data: unknown, boss: (id: string) => BossDef | undefined): PairDef {
  const o = object(data, 'pair');
  const id = text(o.id, 'pair.id');
  if (id === 'generated' || boss(id) !== undefined) {
    fail('pair.id', `"${id}" is already used by a boss (a pair id is stored where a boss id is)`);
  }
  const name = text(o.name, 'pair.name');
  const members = list(o.bosses, 'pair.bosses');
  if (members.length !== 2) fail('pair.bosses', 'expected exactly two bosses');
  const first = parseMember(members[0], 'pair.bosses[0]', boss);
  const second = parseMember(members[1], 'pair.bosses[1]', boss);
  if (second.boss === first.boss) {
    fail('pair.bosses[1].boss', `must be a different boss from the first ("${first.boss}")`);
  }
  const enrage = o.enrage === undefined || o.enrage === null ? null : parseEnrage(o.enrage, 'pair.enrage');
  return { id, name, bosses: [first, second], enrage };
}
```

- [ ] **Step 5: Create the first pair file and the registry**

`src/bosses/hound-and-sage.json`:

```json
{
  "id": "hound-and-sage",
  "name": "Hound and Sage",
  "bosses": [
    { "boss": "ashen-hound", "healthScale": 0.6 },
    { "boss": "vesper-sage", "healthScale": 0.6 }
  ],
  "enrage": { "gapScale": 0.6, "walkScale": 1.3 }
}
```

`src/bosses/pairs.ts`:

```ts
import houndAndSageRaw from './hound-and-sage.json';
import { parsePair, type PairDef } from './pair';
import { BOSSES } from './roster';
import type { BossDef } from './schema';

const knownBoss = (id: string): BossDef | undefined => BOSSES.find((boss) => boss.id === id);

/** The Ashen Hound and the Vesper Sage together. Checked at load like a boss file: a broken file fails here with a message naming the exact place. */
export const HOUND_AND_SAGE = parsePair(houndAndSageRaw, knownBoss);

/** Every pair the menu offers, in menu order. */
export const PAIRS: readonly PairDef[] = [HOUND_AND_SAGE];

/** The pair with this id, or `undefined` (a boss id, `'generated'` and any unknown id are not pairs). */
export function pairById(id: string): PairDef | undefined {
  return PAIRS.find((pair) => pair.id === id);
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run tests/pair-parse.test.ts tests/bosses-index.test.ts`
Expected: PASS (the new file, and the untouched boss-list tests through the new `index.ts`).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Document the format and the file split in `docs/bosses.md`**

Use the Edit tool, three edits.

1. In section 1 (the bullet about `index.ts`), replace
   `- \`src/bosses/index.ts\` imports the file and runs it through \`parseBoss\``
   with
   `- \`src/bosses/roster.ts\` imports the file and runs it through \`parseBoss\``
   (only those words change; leave the rest of that bullet as it is), and after that bullet's sentence about the exports add: ` \`src/bosses/index.ts\` re-exports the roster and adds \`bossById\` and the menu's \`BOSS_CHOICES\`; nothing else imports \`roster.ts\` directly except \`pairs.ts\`, which is why the list lives in its own file.`

2. In "Adding a boss", step 2, replace
   `Load and export it in \`src/bosses/index.ts\` the same way`
   with
   `Load and export it in \`src/bosses/roster.ts\` the same way`.

3. Insert a new section before the line `## 6. Ideas not built yet`:

```markdown
## 5a. Pairs

A pair puts two existing bosses in the same fight (bosses take turns; the sword hurts the nearest one; both must fall; the survivor is enraged). A pair is a data file, `src/bosses/<pair-id>.json`, checked at load by `parsePair` (`src/bosses/pair.ts`) with the same kind of message as a boss file (`Pair data error at pair.bosses[1].boss: ...`, a `PairFormatError`). `src/bosses/pairs.ts` loads each pair and lists it in `PAIRS`; the menu's Boss row offers each pair after the named bosses and before `'generated'`.

```json
{
  "id": "hound-and-sage",
  "name": "Hound and Sage",
  "bosses": [
    { "boss": "ashen-hound", "healthScale": 0.6 },
    { "boss": "vesper-sage", "healthScale": 0.6 }
  ],
  "enrage": { "gapScale": 0.6, "walkScale": 1.3 }
}
```

| Field | Rule |
|---|---|
| `id` | Non-empty. It is stored wherever a boss id is stored (the menu choice, a fight record's `bossId`), so it must not be the id of a boss or `generated`. |
| `name` | Non-empty. Shown in the Boss row. |
| `bosses` | Exactly two entries. The first is the **primary boss**: the fight uses its arena and its backdrop, and it is the boss the game state calls `boss` (the other is in `partners`). The two must be different bosses, and each must exist in `BOSSES` (an unknown id is an error; it never falls back to the Duelist). A pair cannot contain a generated boss. |
| `bosses[i].boss` | The id of an existing boss file. |
| `bosses[i].healthScale` | From 0.2 to 2. The boss's `maxHp` is multiplied by it (rounded, at least 1) before the difficulty dials. Bosses were tuned for solo fights, so a pair usually scales each one down. Example: the Hound has 24 health and the Sage 20, so at 0.6 they have 14 and 12 in the pair. |
| `enrage` | Optional (`null` or missing means none). When one boss falls, the other switches to a boosted copy of itself. `gapScale` (0.1 to 1) multiplies each phase's `gap` (rounded, at least 1), so waits get shorter; `walkScale` (1 to 3) multiplies each phase's `walkSpeed` and `retreatSpeed`. |

A pair adds no attacks and no arena of its own. To use one, `resolveFight(id, seed)` (`src/bosses/resolve.ts`) turns a pair id into a fight: each boss with its health scaled, plus the enrage. A boss id or `generated` gives a fight of one boss, exactly as before. The difficulty dials apply to both bosses at once (`applyDialsToFight`). The pair is not judged for fairness by the generator's checker; each pair is hand-tuned and checked with scripted players, like the Ashen Hound.

To add a pair: create `src/bosses/<id>.json`, load it in `src/bosses/pairs.ts` (`parsePair(raw, knownBoss)`) and add it to `PAIRS`, then add a test like the ones for Hound and Sage in `tests/pair-parse.test.ts`. The Boss row picks it up with no other change.

```

Also grep for other mentions: run `grep -rn "bosses/index" docs README.md CLAUDE.md` and change any sentence that says boss files are loaded in `index.ts` to say `roster.ts`.

- [ ] **Step 8: Full check and commit**

Run: `npm test` then `npm run typecheck` then `npm run build` then `npm run check:dist`
Expected: all pass (the pair file is not imported by the game yet, so the build output is unchanged in behavior).

```bash
git add src/bosses/roster.ts src/bosses/index.ts src/bosses/pair.ts src/bosses/pairs.ts src/bosses/hound-and-sage.json tests/pair-parse.test.ts docs/bosses.md
git commit -m "feat: pair file format, parsePair and the Hound and Sage pair"
```

---

## Task 2: `resolveFight` and the difficulty dials for a whole fight

`resolveFight(id, seed)` turns a boss id or a pair id into a fight: one boss for a boss id or `'generated'` (exactly what `resolveBoss` gives), two scaled bosses plus the enrage for a pair id. `applyDialsToFight` applies the difficulty dials to every boss of a fight and rebuilds the enraged copies. A fight of one boss must play bit-for-bit like before.

**Files:**
- Modify: `src/bosses/resolve.ts`
- Modify: `src/game/difficulty.ts`
- Test: `tests/resolve-fight.test.ts` (create)
- Test: `tests/difficulty-fight.test.ts` (create)

**Interfaces:**
- Consumes: `pairById` (`src/bosses/pairs.ts`), `bossById` (`src/bosses/index.ts`), `resolveBoss` (same file), `makeFight`, `FightDef`, `EnrageDef` (`src/game/fight.ts`), `applyDials` (`src/game/difficulty.ts`).
- Produces: `resolveFight(id: string, seed: number, checkFairness?): { fight: FightDef; unfair: boolean }` (interface `ResolvedFight`); `applyDialsToFight(fight: FightDef, dials: Dials): FightDef`.

- [ ] **Step 1: Write the failing tests for the dials**

Create `tests/difficulty-fight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { enrageBoss, makeFight } from '../src/game/fight';

const ENRAGE = { gapScale: 0.6, walkScale: 1.3 };
const HARD: Dials = presetDials('hard');

describe('applyDialsToFight', () => {
  it('applies the dials to every boss, as applyDials does to one', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    const dialed = applyDialsToFight(fight, HARD);
    expect(dialed.bosses).toHaveLength(2);
    expect(dialed.bosses[0]).toEqual(applyDials(ASHEN_HOUND, HARD));
    expect(dialed.bosses[1]).toEqual(applyDials(VESPER_SAGE, HARD));
  });

  it('keeps the enrage and rebuilds the enraged copies from the dialed bosses', () => {
    const dialed = applyDialsToFight(makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE), HARD);
    expect(dialed.enrage).toEqual(ENRAGE);
    expect(dialed.enraged[0]).toEqual(enrageBoss(dialed.bosses[0]!, ENRAGE));
    expect(dialed.enraged[1]).toEqual(enrageBoss(dialed.bosses[1]!, ENRAGE));
    expect(dialed.enraged[0]).not.toEqual(enrageBoss(ASHEN_HOUND, ENRAGE));
  });

  it('applies the health dial on top of a scaled health', () => {
    const scaled = { ...ASHEN_HOUND, maxHp: 14 };
    const dialed = applyDialsToFight(makeFight([scaled]), { ...NORMAL_DIALS, health: 2 });
    expect(dialed.bosses[0]!.maxHp).toBe(28);
  });

  it('leaves a fight of one boss with no enrage as the same boss applyDials gives', () => {
    const dialed = applyDialsToFight(makeFight([EMBER_DUELIST]), HARD);
    expect(dialed.bosses).toHaveLength(1);
    expect(dialed.bosses[0]).toEqual(applyDials(EMBER_DUELIST, HARD));
    expect(dialed.enrage).toBeNull();
    expect(dialed.enraged).toEqual(dialed.bosses);
  });

  it('with Normal dials gives back equal bosses', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    expect(applyDialsToFight(fight, NORMAL_DIALS)).toEqual(fight);
  });

  it('does not change the fight it is given', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    const before = JSON.stringify(fight);
    applyDialsToFight(fight, HARD);
    expect(JSON.stringify(fight)).toBe(before);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/difficulty-fight.test.ts`
Expected: FAIL, `applyDialsToFight` is not exported (it reads as "applyDialsToFight is not a function").

- [ ] **Step 3: Add `applyDialsToFight` to `src/game/difficulty.ts`**

Edit the imports: replace the line `import { nextRandom } from './rng';` with

```ts
import { makeFight, type FightDef } from './fight';
import { nextRandom } from './rng';
```

(`fight.ts` imports only a type from the bosses folder, so there is no import loop.) Then add this function directly after the `applyDials` function:

```ts
/** Applies the dials to every boss of a fight, then rebuilds the enraged copies so the enrage is applied on top of the dials. */
export function applyDialsToFight(fight: FightDef, dials: Dials): FightDef {
  return makeFight(
    fight.bosses.map((boss) => applyDials(boss, dials)),
    fight.enrage,
  );
}
```

- [ ] **Step 4: Run and see the dial tests pass**

Run: `npx vitest run tests/difficulty-fight.test.ts tests/difficulty.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `resolveFight`**

Create `tests/resolve-fight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import type { FairnessResult } from '../src/bosses/generate/fairness';
import { HOUND_AND_SAGE } from '../src/bosses/pairs';
import { resolveBoss, resolveFight } from '../src/bosses/resolve';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { enrageBoss, makeFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { withInput } from './helpers';

const alwaysFair = (): FairnessResult => ({ fair: true, reasons: [] });
const neverFair = (): FairnessResult => ({ fair: false, reasons: ['forced'] });

/** A deterministic player: runs at the boss, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

describe('resolveFight: a boss id', () => {
  it('is a fight of the same boss as resolveBoss gives', () => {
    for (const id of ['ember-duelist', 'ashen-hound']) {
      const { fight, unfair } = resolveFight(id, 1);
      expect(unfair).toBe(false);
      expect(fight).toEqual(makeFight([resolveBoss(id, 1).boss]));
      expect(fight.bosses).toHaveLength(1);
      expect(fight.enrage).toBeNull();
    }
    expect(resolveFight('ember-duelist', 1).fight.bosses[0]).toBe(EMBER_DUELIST);
  });

  it('falls back to the Duelist for an unknown id, like resolveBoss', () => {
    const { fight, unfair } = resolveFight('a-pair-that-was-removed', 1);
    expect(unfair).toBe(false);
    expect(fight.bosses).toEqual([EMBER_DUELIST]);
  });

  it('gives the same generated boss as resolveBoss, and passes the unfair flag on', () => {
    const fair = resolveFight('generated', 12345, alwaysFair);
    expect(fair.unfair).toBe(false);
    expect(fair.fight.bosses).toEqual([resolveBoss('generated', 12345, alwaysFair).boss]);
    const unfair = resolveFight('generated', 12345, neverFair);
    expect(unfair.unfair).toBe(true);
    expect(unfair.fight.bosses).toEqual([resolveBoss('generated', 12345, neverFair).boss]);
    expect(unfair.fight.bosses).toHaveLength(1);
  });
});

describe('resolveFight: a pair id', () => {
  it('is the two bosses, primary first, with the enrage of the pair file', () => {
    const { fight, unfair } = resolveFight('hound-and-sage', 1);
    expect(unfair).toBe(false);
    expect(fight.bosses.map((b) => b.id)).toEqual(['ashen-hound', 'vesper-sage']);
    expect(fight.enrage).toEqual(HOUND_AND_SAGE.enrage);
    expect(fight.enraged[0]).toEqual(enrageBoss(fight.bosses[0]!, HOUND_AND_SAGE.enrage!));
    expect(fight.enraged[1]).toEqual(enrageBoss(fight.bosses[1]!, HOUND_AND_SAGE.enrage!));
  });

  it('scales each maxHp by its healthScale (rounded, at least 1) and touches nothing else', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const [hound, sage] = fight.bosses;
    expect(hound!.maxHp).toBe(Math.max(1, Math.round(ASHEN_HOUND.maxHp * HOUND_AND_SAGE.bosses[0].healthScale)));
    expect(sage!.maxHp).toBe(Math.max(1, Math.round(VESPER_SAGE.maxHp * HOUND_AND_SAGE.bosses[1].healthScale)));
    expect(hound!.maxHp).toBeLessThan(ASHEN_HOUND.maxHp);
    expect(sage!.maxHp).toBeLessThan(VESPER_SAGE.maxHp);
    expect({ ...hound!, maxHp: 0 }).toEqual({ ...ASHEN_HOUND, maxHp: 0 });
    expect({ ...sage!, maxHp: 0 }).toEqual({ ...VESPER_SAGE, maxHp: 0 });
  });

  it('does not change the boss files, and gives the same fight every time', () => {
    const before = JSON.stringify([ASHEN_HOUND, VESPER_SAGE]);
    const a = resolveFight('hound-and-sage', 1);
    const b = resolveFight('hound-and-sage', 999);
    expect(JSON.stringify([ASHEN_HOUND, VESPER_SAGE])).toBe(before);
    expect(b).toEqual(a);
  });

  it('applies the health dial on top of the scaled health', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const dialed = applyDialsToFight(fight, { ...NORMAL_DIALS, health: 2 });
    expect(dialed.bosses[0]!.maxHp).toBe(fight.bosses[0]!.maxHp * 2);
    expect(dialed.bosses[1]!.maxHp).toBe(fight.bosses[1]!.maxHp * 2);
  });

  it('starts a fight with the partner in place, and the study skipped', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const state = createInitialState(fight, 1, 2);
    expect(state.partners).toHaveLength(1);
    expect(state.boss.hp).toBe(fight.bosses[0]!.maxHp);
    expect(state.partners[0]!.hp).toBe(fight.bosses[1]!.maxHp);
    expect(state).toEqual(createInitialState(fight, 1, 0));
  });
});

describe('a solo fight through resolveFight replays bit-identically to resolveBoss', () => {
  const cases: { id: string; dials: Dials; seed: number }[] = [
    { id: 'ember-duelist', dials: NORMAL_DIALS, seed: 7 },
    { id: 'ember-duelist', dials: presetDials('hard'), seed: 123456 },
    { id: 'ashen-hound', dials: presetDials('hard'), seed: 5 },
    { id: 'vesper-sage', dials: presetDials('easy'), seed: 99 },
  ];

  it.each(cases)('$id at seed $seed', ({ id, dials, seed }) => {
    const boss = applyDials(resolveBoss(id, seed).boss, dials);
    const fight = applyDialsToFight(resolveFight(id, seed).fight, dials);
    let a = createInitialState(boss, seed, 0);
    let b = createInitialState(fight, seed, 0);
    expect(b).toEqual(a);
    for (let n = 1; n <= 900; n++) {
      a = step(a, scripted(n), boss);
      b = step(b, scripted(n), fight);
      expect(b).toEqual(a);
    }
  });

  it('a generated boss too (fairness check injected, so it is quick)', () => {
    const seed = 42;
    const boss = applyDials(resolveBoss('generated', seed, alwaysFair).boss, NORMAL_DIALS);
    const fight = applyDialsToFight(resolveFight('generated', seed, alwaysFair).fight, NORMAL_DIALS);
    let a = createInitialState(boss, seed, 1);
    let b = createInitialState(fight, seed, 1);
    for (let n = 1; n <= 900; n++) {
      const frame = n <= 400 ? NO_INPUT : scripted(n);
      a = step(a, frame, boss);
      b = step(b, frame, fight);
    }
    expect(b).toEqual(a);
  });
});
```

- [ ] **Step 6: Run and see it fail**

Run: `npx vitest run tests/resolve-fight.test.ts`
Expected: FAIL, `resolveFight` is not exported from `../src/bosses/resolve` ("resolveFight is not a function").

- [ ] **Step 7: Add `resolveFight` to `src/bosses/resolve.ts`**

Edit the imports at the top. Replace

```ts
import { bossById } from './index';
import { nextRandom } from '../game/rng';
import type { BossDef } from './schema';
```

with

```ts
import { makeFight, type FightDef } from '../game/fight';
import { nextRandom } from '../game/rng';
import { bossById } from './index';
import { pairById } from './pairs';
import type { BossDef } from './schema';
```

Append at the end of the file:

```ts
export interface ResolvedFight {
  fight: FightDef;
  /** Same meaning as `ResolvedBoss.unfair`; a pair is never unfair. */
  unfair: boolean;
}

/** A copy of the boss with its health scaled for a pair (rounded, at least 1). The dials apply on top later. */
function scaleHealth(boss: BossDef, scale: number): BossDef {
  return { ...boss, maxHp: Math.max(1, Math.round(boss.maxHp * scale)) };
}

/**
 * Resolves an id to the fight to play. A pair id gives its two bosses (health scaled) and its enrage.
 * Any other id (a boss id, `'generated'`, or an unknown one) gives a fight of the one boss `resolveBoss`
 * gives, so a solo fight is exactly what it was before pairs existed. `checkFairness` is only overridden by tests.
 */
export function resolveFight(
  id: string,
  seed: number,
  checkFairness: typeof realCheckFairness = realCheckFairness,
): ResolvedFight {
  const pair = pairById(id);
  if (pair === undefined) {
    const { boss, unfair } = resolveBoss(id, seed, checkFairness);
    return { fight: makeFight([boss]), unfair };
  }
  const bosses = pair.bosses.map((member) => scaleHealth(bossById(member.boss), member.healthScale));
  return { fight: makeFight(bosses, pair.enrage), unfair: false };
}
```

- [ ] **Step 8: Run the tests and the type check**

Run: `npx vitest run tests/resolve-fight.test.ts tests/difficulty-fight.test.ts tests/resolve.test.ts tests/pair-parse.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Full check and commit**

Run: `npm test` then `npm run typecheck` then `npm run build` then `npm run check:dist`
Expected: all pass. (The build now includes the pair file through `resolve.ts`; `check:dist` confirms no inline script, style or `data:` URI and that every emitted file is in the offline precache list.)

```bash
git add src/bosses/resolve.ts src/game/difficulty.ts tests/resolve-fight.test.ts tests/difficulty-fight.test.ts
git commit -m "feat: resolveFight and applyDialsToFight for fights of one or two bosses"
```

---

## Task 3: Recording and replaying a fight of any size; schema version 6

A record still stores the seed, the boss id (now possibly a pair id), the dials, the study and the input. Replaying a record goes through `resolveFight` and `applyDialsToFight`, so a pair record replays to the same final state and a one-boss record replays as before. The record shape gains nothing new at the top level, but the analysis will (Task 4), so the schema version goes from 5 to 6 here and `docs/stats.md` is updated in the same commit. Records of versions 1 to 5 stay valid.

**Files:**
- Modify: `src/stats/record.ts`
- Modify: `docs/stats.md`
- Modify: `tests/record.test.ts` (three `5` to `6`)
- Modify: `tests/export.test.ts` (one `5` to `6`)
- Test: `tests/record-pair.test.ts` (create)

**Interfaces:**
- Consumes: `resolveFight` (`src/bosses/resolve.ts`), `applyDialsToFight` (`src/game/difficulty.ts`), `createInitialState(fight, seed, study)` (`src/game/state.ts`), `step(state, frame, fight)`.
- Produces: `STATS_SCHEMA_VERSION = 6`; `replayFinalState(record)` accepts a pair id as `record.bossId`. The record's field list is unchanged (`FightMeta`, `FightRecord`). For a pair the app stores `study: 0` (Task 6), and replay ignores a study value for a fight with partners.

- [ ] **Step 1: Write the failing tests**

Create `tests/record-pair.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bossById } from '../src/bosses';
import { resolveFight } from '../src/bosses/resolve';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import {
  buildRecord,
  recordUpdate,
  replayFinalState,
  startRecording,
  STATS_SCHEMA_VERSION,
  type FightMeta,
  type Recording,
} from '../src/stats/record';
import { withInput } from './helpers';

const metaOf = (over: Partial<FightMeta> = {}): FightMeta => ({
  bossId: 'hound-and-sage',
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 7,
  study: 0,
  playedAt: '2026-09-29T10:00:00.000Z',
  ...over,
});

/** A deterministic player: runs at the bosses, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
    moveX: n % 200 < 100 ? 1 : -1,
  });
}

/** Plays a fight live through the fight functions (the way the app does), recording every update. */
function playLiveFight(
  meta: FightMeta,
  updates: number,
  inputFor: (n: number) => InputFrame,
): { state: GameState; rec: Recording } {
  const fight = applyDialsToFight(resolveFight(meta.bossId, meta.seed).fight, meta.dials);
  let state = createInitialState(fight, meta.seed, meta.study);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = inputFor(n);
    state = step(state, frame, fight);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  return { state, rec };
}

/** Plays a one-boss fight the old way (one boss, no fight object), so it does not depend on the new code. */
function playLiveSolo(
  meta: FightMeta,
  updates: number,
  inputFor: (n: number) => InputFrame,
): { state: GameState; rec: Recording } {
  const boss = applyDials(bossById(meta.bossId), meta.dials);
  let state = createInitialState(boss, meta.seed, meta.study);
  let rec = startRecording(meta);
  for (let n = 1; n <= updates; n++) {
    const frame = inputFor(n);
    state = step(state, frame, boss);
    rec = recordUpdate(rec, frame);
    if (state.phase !== 'fight') break;
  }
  return { state, rec };
}

describe('the schema version', () => {
  it('is 6, and a record of a pair carries the pair id as its boss id', () => {
    expect(STATS_SCHEMA_VERSION).toBe(6);
    const record = buildRecord(startRecording(metaOf()), 'left', 1, null);
    expect(record.schemaVersion).toBe(6);
    expect(record.bossId).toBe('hound-and-sage');
    expect(record.study).toBe(0);
  });
});

describe('replaying a pair fight', () => {
  it('reaches the identical final state (Normal)', () => {
    const { state, rec } = playLiveFight(metaOf(), 1500, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(record.ticks).toBeGreaterThan(300);
    expect(state.partners).toHaveLength(1);
    expect(replayFinalState(record)).toEqual(state);
  });

  it('reaches the identical final state (Hard, another seed, through JSON)', () => {
    const meta = metaOf({ presetId: 'hard', dials: presetDials('hard'), seed: 123456 });
    const { state, rec } = playLiveFight(meta, 1500, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    const copy = JSON.parse(JSON.stringify(record)) as typeof record;
    expect(replayFinalState(copy)).toEqual(state);
  });

  it('replays a pair fight that ends with the player defeated', () => {
    const meta = metaOf({ presetId: 'hard', dials: { ...presetDials('hard'), damage: 3 }, seed: 99 });
    const { state, rec } = playLiveFight(meta, 3000, () => NO_INPUT);
    expect(state.phase).toBe('defeated');
    const replayed = replayFinalState(buildRecord(rec, 'defeat', 1, null));
    expect(replayed).toEqual(state);
  });

  it('is really two bosses: the replay has a partner, and it is not the Hound alone', () => {
    const { rec } = playLiveFight(metaOf(), 600, scripted);
    const replayed = replayFinalState(buildRecord(rec, 'left', 1, null));
    expect(replayed.partners).toHaveLength(1);
    const solo = replayFinalState({ ...buildRecord(rec, 'left', 1, null), bossId: 'ashen-hound' });
    expect(solo.partners).toHaveLength(0);
  });

  it('ignores a study value: a fight with partners has no study', () => {
    const { state, rec } = playLiveFight(metaOf(), 900, scripted);
    const record = buildRecord(rec, 'left', 1, null);
    expect(replayFinalState({ ...record, study: 2 })).toEqual(state);
    expect(replayFinalState({ ...record, study: 1 })).toEqual(state);
  });
});

describe('older records still replay', () => {
  it.each(['ember-duelist', 'ashen-hound', 'vesper-sage'])('a version-5 record of %s replays to the same final state', (bossId) => {
    const meta = metaOf({ bossId, presetId: 'hard', dials: presetDials('hard'), seed: 5, study: 1 });
    const { state, rec } = playLiveSolo(meta, 1500, scripted);
    const record = { ...buildRecord(rec, 'left', 1, null), schemaVersion: 5 };
    expect(replayFinalState(record)).toEqual(state);
  });

  it('a record with no study field (version 1) replays as study 0', () => {
    const meta = metaOf({ bossId: 'ember-duelist', study: 0 });
    const { state, rec } = playLiveSolo(meta, 900, scripted);
    const { study: _study, ...oldRecord } = buildRecord(rec, 'left', 1, null);
    expect(replayFinalState(oldRecord)).toEqual(state);
  });
});
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/record-pair.test.ts`
Expected: FAIL. The schema test fails with `expected 5 to be 6`; the pair replays fail with `Expected` / `Received` differences (the current `replayFinalState` resolves `hound-and-sage` to the Duelist).

- [ ] **Step 3: Change `src/stats/record.ts`**

Imports. Replace `import { resolveBoss } from '../bosses/resolve';` with `import { resolveFight } from '../bosses/resolve';`. In the `../game/difficulty` import list, replace `applyDials,` with `applyDialsToFight,` (`applyDials` is used nowhere else in this file; keep `changedDials`, `presetDials` and the types).

Replace `export const STATS_SCHEMA_VERSION = 5;` with `export const STATS_SCHEMA_VERSION = 6;`.

Replace the two lines that build the boss and the state and the loop in `replayFinalState`. The function becomes:

```ts
export function replayFinalState(record: {
  bossId: string;
  dials: Dials;
  seed: number;
  study?: 0 | 1 | 2;
  input: readonly InputRun[];
}): GameState {
  const fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials);
  let state = createInitialState(fight, record.seed, record.study ?? 0);
  for (const frame of decodeInputs(record.input)) state = step(state, frame, fight);
  return state;
}
```

Keep the existing signature comment above `replayFinalState` if there is one, and add to it one line: `A pair id as bossId replays both bosses; a fight with partners has no study, so a study value is ignored for it.` Do not change `GAME_VERSION` (`'0.8.0'`): no existing boss replays differently.

- [ ] **Step 4: Update the two existing tests that pin the schema number**

In `tests/record.test.ts` make three edits: `carries the study rounds and is schema version 5` becomes `carries the study rounds and is schema version 6`; `expect(STATS_SCHEMA_VERSION).toBe(5);` becomes `expect(STATS_SCHEMA_VERSION).toBe(6);`; `expect(record.schemaVersion).toBe(5);` becomes `expect(record.schemaVersion).toBe(6);`.

In `tests/export.test.ts` change `expect(parsed.schemaVersion).toBe(5);` to `expect(parsed.schemaVersion).toBe(6);`.

- [ ] **Step 5: Run and see it pass**

Run: `npx vitest run tests/record-pair.test.ts tests/record.test.ts tests/export.test.ts tests/duelist-golden.test.ts tests/loop-replay.test.ts`
Expected: PASS (the golden test and the replay tests are unedited).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Update `docs/stats.md`**

Use the Edit tool, seven edits.

1. Section 4, the `schemaVersion` row of the export table: replace `Version of this format (see section 9). Currently 5.` with `Version of this format (see section 9). Currently 6.`

2. Section 5, the `schemaVersion` row: replace `(5 for records written by the current game; 1, 2, 3 and 4 for older ones, see section 9)` with `(6 for records written by the current game; 1 to 5 for older ones, see section 9)`.

3. Section 5, the `bossId` row: replace `The boss file's id, for example \`"ember-duelist"\`.` with `The boss file's id, for example \`"ember-duelist"\`, or the id of a pair (\`"hound-and-sage"\`, two bosses in one fight, \`docs/bosses.md\` section 5a).` and replace `the boss must be reconstructed with \`resolveBoss(record.bossId, record.seed)\`, the same function the app uses to start the fight — never looked up by name (\`bossById\`), which knows nothing about \`"generated"\`.` with `the fight must be reconstructed with \`resolveFight(record.bossId, record.seed)\`, the same function the app uses to start the fight — never looked up by name (\`bossById\`), which knows nothing about \`"generated"\` or a pair id.`

4. Section 5, the `study` row: replace `A record of schema version 1 has no \`study\` field, and that means 0. |` with `A record of schema version 1 has no \`study\` field, and that means 0. A fight with two bosses has no study: the app stores 0, and a replay ignores any value. |`

5. Section 8, step 2: replace the whole step, from `2. \`boss = applyDials(resolveBoss(record.bossId, record.seed), record.dials)\`.` to the end of that line, with:
   `2. \`fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials)\`. Use \`resolveFight\`, not \`bossById\`: a \`'generated'\` record needs the seed to rebuild the same boss (section 9's M5e note), and a pair id needs the pair file (\`bossById\` alone would silently fall back to the Ember Duelist). For a boss id or \`'generated'\` the fight is one boss, identical to the old \`applyDials(resolveBoss(...))\`, so a record of schema version 1 to 5 replays exactly as before.`

6. Section 8, step 3 and 4: replace `3. \`state = createInitialState(boss, record.seed, record.study ?? 0)\`.` with `3. \`state = createInitialState(fight, record.seed, record.study ?? 0)\`.` and add at the end of that same step, after `so it replays with 0.`, the sentence ` A fight with two bosses has no study, so the value is ignored for it.` In step 4 replace `\`state = step(state, frame, boss)\`` with `\`state = step(state, frame, fight)\``.

7. Section 9, two edits. (a) Replace `The schema version is 5 in the export document and in every record the current game writes.` (the last sentence of the Version 5 bullet) with `The schema version was 5 in the export document and in every record written before version 6.` (b) Insert this bullet immediately before the bullet that starts `- **Game version 0.4.0** goes with schema 3.`:

   `- **Version 6** (two bosses in one fight, game version stays 0.8.0) makes a fight with several bosses recordable. \`bossId\` may now be a pair id, and the fight is rebuilt with \`resolveFight\` (section 8). The record has the same fields as in version 5. A fight with partners has no study, so its record stores \`study: 0\`. The analysis gains \`bosses\` (one entry per boss: \`id\`, \`name\`, \`maxHp\`, \`hpLeft\`, \`phaseReached\`, \`phaseCount\`, \`damageDealt\`) and each attack occurrence gains \`boss\` (0 for the primary boss, 1 for the partner); the existing top-level boss fields stay, with \`bossMaxHp\`, \`bossHpLeft\` and \`damageDealt\` summed over all bosses and \`phaseReached\` and \`phaseCount\` those of the primary boss (section 7). Records and files of versions 1 to 5 remain valid and readable: they read as a fight of one boss (an analysis stored in an old record has no \`bosses\` and no \`boss\`, which means one boss and boss 0), and replaying them gives exactly the same fight as before. The schema version is 6 in the export document and in every record the current game writes.`

- [ ] **Step 7: Full check and commit**

Run: `npm test` then `npm run typecheck` then `npm run build` then `npm run check:dist`
Expected: all pass. (`tests/analyze.test.ts` and the store tests still pass because `analyzeFight` is not changed by this task; see contract note 4.)

```bash
git add src/stats/record.ts docs/stats.md tests/record.test.ts tests/export.test.ts tests/record-pair.test.ts
git commit -m "feat: replay a record through resolveFight so a pair fight replays exactly; schema version 6"
```

---

## Task 4: The analyzer measures a fight of any size

**Files:**
- Modify: `src/stats/analyze.ts`
- Modify: `docs/stats.md`
- Create: `tests/analyze-pair.test.ts`
- Test: `tests/analyze-pair.test.ts`, plus the existing `tests/analyze.test.ts`, `tests/stats-shots.test.ts`, `tests/ashen-hound.test.ts`, `tests/tremor-brute.test.ts`, `tests/loop-replay.test.ts` (all unedited, must still pass)

**Interfaces:**
- Consumes: `FightDef`, `asFight` (`src/game/fight.ts`); `bossAt`, `bossCount`, `isDowned` (`src/game/state.ts`); `bossDefFor` (`src/game/turns.ts`); `resolveFight` (`src/bosses/resolve.ts`, Task 2); `applyDialsToFight` (`src/game/difficulty.ts`, Task 2); `STATS_SCHEMA_VERSION` = 6 (Task 3).
- Produces: `AttackOccurrence.boss: number`; `BossAnalysis { id; name; maxHp; hpLeft; phaseReached; phaseCount; damageDealt }`; `Analysis.bosses: BossAnalysis[]`; `analyzeRun(source: BossDef | FightDef, initial, frames, studyRounds)`; `analyzeFight` resolves a pair id to a fight of two.

- [ ] **Step 1: Check the schema bump from Task 3 is in place.**

Run: `grep -n "STATS_SCHEMA_VERSION = 6" src/stats/record.ts`
Expected: one matching line. If there is none, stop: Task 3 has not been done.

- [ ] **Step 2: Write the failing tests.**

Create `tests/analyze-pair.test.ts` with exactly:

```ts
import { describe, expect, it } from 'vitest';
import { resolveFight } from '../src/bosses/resolve';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDialsToFight, NORMAL_DIALS } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRecording, analyzeRun } from '../src/stats/analyze';
import { recordUpdate, startRecording, type FightMeta } from '../src/stats/record';
import { solo, standAt, windupUpdates } from './boss-helpers';
import { dummy, pair, unit } from './duo-helpers';
import { DUELIST, withInput } from './helpers';

const named = (boss: BossDef, id: string): BossDef => ({ ...boss, id, name: id.toUpperCase() });
const idle = (count: number): InputFrame[] => Array.from({ length: count }, () => NO_INPUT);
const swingThenIdle = (idles: number): InputFrame[] => [withInput({ attackPressed: true }), ...idle(idles)];

/** A fresh fight with the player standing at `x` (the same spot on the previous and the current update). */
function stand(fight: FightDef, x: number): GameState {
  const s = createInitialState(fight);
  s.player.x = x;
  s.player.prevX = x;
  return s;
}

describe('a fight of one boss', () => {
  it('reports one boss whose numbers are the fight numbers, and every attack as the primary boss', () => {
    const boss = solo('slam');
    const a = analyzeRun(boss, standAt(boss, 120), idle(120));
    expect(a.bosses).toEqual([
      {
        id: boss.id,
        name: boss.name,
        maxHp: boss.maxHp,
        hpLeft: boss.maxHp,
        phaseReached: 1,
        phaseCount: boss.phases.length,
        damageDealt: 0,
      },
    ]);
    expect(a.bossMaxHp).toBe(boss.maxHp);
    expect(a.attacks.length).toBeGreaterThan(0);
    expect(a.attacks.every((x) => x.boss === 0)).toBe(true);
  });
});

describe('a fight of two bosses', () => {
  it('names the boss of every attack and measures the start distance to that boss', () => {
    const fight = pair(named(unit(5, 200), 'first'), named(unit(5, 1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 300), idle(500));
    const byBoss = (index: number) => a.attacks.filter((x) => x.boss === index);
    expect(byBoss(0).length).toBeGreaterThan(1);
    expect(byBoss(1).length).toBeGreaterThan(1);
    expect(byBoss(0).every((x) => x.distance === 100)).toBe(true);
    expect(byBoss(1).every((x) => x.distance === 700)).toBe(true);
  });

  it('never has two attacks going at once: each begins after the previous one ended', () => {
    const fight = pair(named(unit(5, 200), 'first'), named(unit(5, 1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 300), idle(500));
    for (let i = 1; i < a.attacks.length; i++) {
      const previous = a.attacks[i - 1]!;
      expect(a.attacks[i]!.startTick).toBeGreaterThanOrEqual(previous.startTick + previous.windupTicks);
    }
  });

  it('measures the distance bands to the nearest boss that still stands', () => {
    const fight = pair(named(dummy(200), 'first'), named(dummy(1000), 'second'));
    const a = analyzeRun(fight, stand(fight, 900), idle(60));
    expect(a.behavior.updatesClose).toBe(60);
    expect(a.behavior.updatesFar).toBe(0);
  });

  it('sums the health of both bosses and keeps the primary boss phase numbers at the top', () => {
    const fight = pair(named(dummy(1000, 5), 'first'), named(dummy(650, 1), 'second'));
    const a = analyzeRun(fight, stand(fight, 600), swingThenIdle(30));
    expect(a.bosses.map((b) => [b.id, b.maxHp, b.hpLeft, b.damageDealt])).toEqual([
      ['first', 5, 5, 0],
      ['second', 1, 0, 1],
    ]);
    expect(a.bossMaxHp).toBe(6);
    expect(a.bossHpLeft).toBe(5);
    expect(a.damageDealt).toBe(1);
    expect(a.phaseReached).toBe(1);
    expect(a.phaseCount).toBe(fight.bosses[0]!.phases.length);
    expect(a.swings).toBe(1);
    expect(a.swingsThatHit).toBe(1);
  });

  it('counts the damage of both bosses once both are down', () => {
    const fight = pair(named(dummy(700, 1), 'first'), named(dummy(650, 1), 'second'));
    const a = analyzeRun(fight, stand(fight, 600), [...swingThenIdle(25), ...swingThenIdle(25)]);
    expect(a.bossHpLeft).toBe(0);
    expect(a.damageDealt).toBe(2);
    expect(a.bosses.map((b) => b.hpLeft)).toEqual([0, 0]);
    expect(a.swingsThatHit).toBe(2);
  });

  it('cuts short the attack of a boss that falls while its shot is still flying', () => {
    const fight = pair(named(dummy(1000, 5), 'first'), named(unit(1, 650, 1), 'second'));
    let s = stand(fight, 600);
    const inputs: InputFrame[] = [];
    for (let n = 0; n < 200; n++) {
      const partner = s.partners[0]!;
      const press = partner.mode === 'attack' && partner.attackTick === 25;
      const frame = press ? withInput({ attackPressed: true }) : NO_INPUT;
      inputs.push(frame);
      s = step(s, frame, fight);
      if (s.events.includes('bossDown')) break;
    }
    const a = analyzeRun(fight, stand(fight, 600), [...inputs, ...idle(60)]);
    expect(a.attacks).toHaveLength(1);
    expect(a.attacks[0]).toMatchObject({ boss: 1, attackId: 'shoot', outcome: 'interrupted' });
  });
});

describe('an attack of the partner countered on its first update', () => {
  it('is still credited to the partner', () => {
    const slam = solo('slam');
    const quick: BossDef = {
      ...slam,
      id: 'second',
      startX: 1000,
      attacks: slam.attacks.map((atk) =>
        atk.id === 'slam'
          ? { ...atk, windup: DUELIST.counter.window, hits: [{ ...atk.hits[0]!, from: 12, to: 18 }] }
          : atk,
      ),
    };
    const fight = pair(named(dummy(300, 5), 'first'), quick);
    let probe = stand(fight, 880);
    const states: GameState[] = [];
    for (let n = 0; n < 120; n++) {
      probe = step(probe, NO_INPUT, fight);
      states.push(probe);
    }
    const first = windupUpdates(states)[0]!;
    const inputs = Array.from({ length: first + 5 }, (_, i) =>
      i + 1 === first ? withInput({ attackPressed: true }) : NO_INPUT,
    );
    const a = analyzeRun(fight, stand(fight, 880), inputs);
    expect(a.counters).toBe(1);
    expect(a.attacks[0]).toMatchObject({ boss: 1, attackId: 'slam', startTick: first, outcome: 'countered' });
  });
});

describe('analysing a stored fight of the first pair', () => {
  const meta: FightMeta = {
    bossId: 'hound-and-sage',
    presetId: 'normal',
    dials: { ...NORMAL_DIALS },
    seed: 7,
    study: 0,
    playedAt: '2026-09-29T10:00:00.000Z',
  };
  const recording = (() => {
    let rec = startRecording(meta);
    for (let n = 0; n < 600; n++) rec = recordUpdate(rec, NO_INPUT);
    return rec;
  })();

  it('measures both bosses, with the health the fight really started with', () => {
    const a = analyzeRecording(recording);
    const fight = applyDialsToFight(resolveFight(meta.bossId, meta.seed).fight, meta.dials);
    expect(a.bosses.map((b) => b.id)).toEqual(fight.bosses.map((b) => b.id));
    expect(a.bosses.map((b) => b.maxHp)).toEqual(fight.bosses.map((b) => b.maxHp));
    expect(a.bossMaxHp).toBe(fight.bosses.reduce((total, b) => total + b.maxHp, 0));
    expect(a.attacks.length).toBeGreaterThan(0);
    expect(a.attacks.every((x) => x.boss === 0 || x.boss === 1)).toBe(true);
  });

  it('is the same on every run and survives JSON', () => {
    const a = analyzeRecording(recording);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(analyzeRecording(recording)).toEqual(a);
  });
});
```

Run: `npx vitest run tests/analyze-pair.test.ts`
Expected: FAIL. The fight-of-two tests fail (the analyzer reads only one boss and `bosses` is undefined); the fight-of-one test fails on `bosses`.

- [ ] **Step 3.1: The imports.**

In `src/stats/analyze.ts`, replace:

```ts
import { resolveBoss } from '../bosses/resolve';
```

with:

```ts
import { resolveFight } from '../bosses/resolve';
```

- [ ] **Step 3.2: The imports.**

In `src/stats/analyze.ts`, replace:

```ts
import { applyDials } from '../game/difficulty';
```

with:

```ts
import { applyDialsToFight } from '../game/difficulty';
import { asFight, type FightDef } from '../game/fight';
```

- [ ] **Step 3.3: The imports.**

In `src/stats/analyze.ts`, replace:

```ts
import { createInitialState, type GameState, type PlayerState } from '../game/state';
```

with:

```ts
import { bossAt, bossCount, createInitialState, isDowned, type GameState, type PlayerState } from '../game/state';
import { bossDefFor } from '../game/turns';
```

- [ ] **Step 3.4: The occurrence type.**

In `src/stats/analyze.ts`, replace:

```ts
export interface AttackOccurrence {
  attackId: string;

```

with:

```ts
export interface AttackOccurrence {
  attackId: string;
  /** Which boss of the fight made the attack: 0 is the primary boss, 1 its partner. Always 0 in a fight of one. */
  boss: number;

```

- [ ] **Step 3.5: The analysis type: a new type just above `Analysis`.**

In `src/stats/analyze.ts`, replace:

```ts
export interface Analysis {
  ticks: number;
```

with:

```ts
/** What one boss of the fight did. A fight of one boss has one entry. */
export interface BossAnalysis {
  id: string;
  name: string;
  /** Health at the start, with the Health dial and the pair's health scale applied. */
  maxHp: number;
  hpLeft: number;
  /** 1-based: the highest phase this boss reached. */
  phaseReached: number;
  phaseCount: number;
  damageDealt: number;
}

export interface Analysis {
  ticks: number;
```

- [ ] **Step 3.6: The fields of `Analysis`.**

In `src/stats/analyze.ts`, replace:

```ts
  phaseReached: number;
  phaseCount: number;
  bossHpLeft: number;
  bossMaxHp: number;
  damageDealt: number;
  /** Health actually lost
```

with:

```ts
  /** The primary boss's phase reached and phase count; the others are in `bosses`. */
  phaseReached: number;
  phaseCount: number;
  /** Summed over every boss of the fight. */
  bossHpLeft: number;
  bossMaxHp: number;
  damageDealt: number;
  bosses: BossAnalysis[];
  /** Health actually lost
```

- [ ] **Step 3.7: The attack being watched.**

In `src/stats/analyze.ts`, replace:

```ts
interface OpenAttack {
  attackId: string;
```

with:

```ts
interface OpenAttack {
  attackId: string;
  boss: number;
```

- [ ] **Step 3.8: `occurrence()`.**

In `src/stats/analyze.ts`, replace:

```ts
    attackId: open.attackId,
    phase: open.phase,
```

with:

```ts
    attackId: open.attackId,
    boss: open.boss,
    phase: open.phase,
```

- [ ] **Step 3.9: Two new helpers just above the doc comment of `analyzeRun`.**

In `src/stats/analyze.ts`, replace:

```ts
/**
 * Replays a fight through the real game and measures it.
```

with:

```ts
/** Distance from the player to the nearest boss still standing (to the primary once every boss is down). */
function nearestDistance(s: GameState): number {
  let nearest = Infinity;
  for (let i = 0; i < bossCount(s); i++) {
    if (!isDowned(s, i)) nearest = Math.min(nearest, Math.abs(s.player.x - bossAt(s, i).x));
  }
  return nearest === Infinity ? Math.abs(s.player.x - s.boss.x) : nearest;
}

/**
 * The boss whose attack began on this update. Only one boss attacks at a time, and a boss that starts an attack is
 * at attack time 0. One countered on that very update is already staggered but was waiting with its attack chosen.
 */
function attackerOf(before: GameState, after: GameState): number {
  for (let i = 0; i < bossCount(after); i++) {
    const b = bossAt(after, i);
    if (b.mode === 'attack' && b.attackTick === 0) return i;
  }
  for (let i = 0; i < bossCount(after); i++) {
    if (bossAt(before, i).pendingAttackId !== null && bossAt(after, i).mode === 'stagger') return i;
  }
  return 0;
}

/**
 * Replays a fight through the real game and measures it.
```

- [ ] **Step 3.10: The signature (a plain boss is still accepted).**

In `src/stats/analyze.ts`, replace:

```ts
export function analyzeRun(
  boss: BossDef,
  initial
```

with:

```ts
export function analyzeRun(
  source: BossDef | FightDef,
  initial
```

- [ ] **Step 3.11: The start of `analyzeRun`.**

In `src/stats/analyze.ts`, replace:

```ts
  let state = initial;
  const attacks
```

with:

```ts
  const fight = asFight(source);
  let state = initial;
  const attacks
```

- [ ] **Step 3.12: The phase tracking.**

In `src/stats/analyze.ts`, replace:

```ts
  let maxPhase = state.boss.phase;

```

with:

```ts
  const maxPhases = Array.from({ length: bossCount(state) }, (_, i) => bossAt(state, i).phase);

```

- [ ] **Step 3.13: `observeShots`, the shots of this boss's attack.**

In `src/stats/analyze.ts`, replace:

```ts
    const mine = after.shots.filter((x) => x.attackId === attack.attackId && x.originTick === attack.startTick);
```

with:

```ts
    const mine = after.shots.filter(
      (x) => (x.owner ?? 0) === attack.boss && x.attackId === attack.attackId && x.originTick === attack.startTick,
    );
```

- [ ] **Step 3.14: `observeShots`, when an attack's shots are removed: only its own boss's phase change or fall does it.**

In `src/stats/analyze.ts`, replace:

```ts
    if (events.includes('phaseChange') || events.includes('bossDefeated') || events.includes('playerDefeated')) {
      attack.shotsCleared = true;
```

with:

```ts
    const owner = bossAt(after, attack.boss);
    const changedPhase = owner.phase !== bossAt(before, attack.boss).phase;
    if (
      (events.includes('phaseChange') && changedPhase) ||
      events.includes('bossDefeated') ||
      events.includes('playerDefeated') ||
      (isDowned(after, attack.boss) && !isDowned(before, attack.boss))
    ) {
      attack.shotsCleared = true;
```

- [ ] **Step 3.15: `observe`, the hit boxes of the attacking boss (the same definition the game hurts the player with).**

In `src/stats/analyze.ts`, replace:

```ts
    const boxes = activeHitBoxes(after.boss, boss);
    const real = playerBox(after.player);
    const bare = boss.arena === undefined ? boxes : activeHitBoxes(after.boss, boss, { ignoreCover: true });
```

with:

```ts
    const owner = bossAt(after, attack.boss);
    const def = bossDefFor(after, fight, attack.boss);
    const boxes = activeHitBoxes(owner, def);
    const real = playerBox(after.player);
    const bare = def.arena === undefined ? boxes : activeHitBoxes(owner, def, { ignoreCover: true });
```

- [ ] **Step 3.16: `observe`, the recovery window.**

In `src/stats/analyze.ts`, replace:

```ts
      after.boss.mode === 'attack' &&
      t >= attack.recoveryFrom
```

with:

```ts
      owner.mode === 'attack' &&
      t >= attack.recoveryFrom
```

- [ ] **Step 3.17: The main loop.**

In `src/stats/analyze.ts`, replace:

```ts
state = step(before, frame, boss);
```

with:

```ts
state = step(before, frame, fight);
```

- [ ] **Step 3.18: The main loop, phases and the distance bands.**

In `src/stats/analyze.ts`, replace:

```ts
    maxPhase = Math.max(maxPhase, after.boss.phase);
    const distance = Math.abs(after.player.x - after.boss.x);
```

with:

```ts
    maxPhases.forEach((reached, i) => {
      maxPhases[i] = Math.max(reached, bossAt(after, i).phase);
    });
    const distance = nearestDistance(after);
```

- [ ] **Step 3.19: The main loop, closing an attack.**

In `src/stats/analyze.ts`, replace:

```ts
    if (open !== null && (started || after.boss.mode !== 'attack')) {
```

with:

```ts
    if (open !== null && (started || bossAt(after, open.boss).mode !== 'attack')) {
```

- [ ] **Step 3.20: The main loop, which boss began the attack.**

In `src/stats/analyze.ts`, replace:

```ts
    const id = after.boss.attackId ?? before.boss.pendingAttackId;
    const def = started ? boss.attacks.find((a) => a.id === id) : undefined;
```

with:

```ts
    const index = started ? attackerOf(before, after) : 0;
    const id = bossAt(after, index).attackId ?? bossAt(before, index).pendingAttackId;
    const def = started ? bossDefFor(after, fight, index).attacks.find((a) => a.id === id) : undefined;
```

- [ ] **Step 3.21: The main loop, the new open attack.**

In `src/stats/analyze.ts`, replace:

```ts
      open = {
        attackId: def.id,
        phase: after.boss.phase + 1,
```

with:

```ts
      open = {
        attackId: def.id,
        boss: index,
        phase: bossAt(after, index).phase + 1,
```

- [ ] **Step 3.22: The main loop, the start distance is to the attacking boss.**

In `src/stats/analyze.ts`, replace:

```ts
        distance,
        actionAtStart
```

with:

```ts
        distance: Math.abs(after.player.x - bossAt(after, index).x),
        actionAtStart
```

- [ ] **Step 3.23: The main loop, an attack cancelled on its first update.**

In `src/stats/analyze.ts`, replace:

```ts
      if (after.boss.mode !== 'attack') {
        finish(open, false);
        open = null;
      }
```

with:

```ts
      if (bossAt(after, index).mode !== 'attack') {
        finish(open, false);
        open = null;
      }
```

- [ ] **Step 3.24: The end of `analyzeRun`, the per-boss numbers.**

In `src/stats/analyze.ts`, replace:

```ts
  const studyTicks = state.study.active ? studyUpdates : state.study.endTick;
  return {
```

with:

```ts
  const studyTicks = state.study.active ? studyUpdates : state.study.endTick;
  const bosses: BossAnalysis[] = fight.bosses.map((def, i) => ({
    id: def.id,
    name: def.name,
    maxHp: def.maxHp,
    hpLeft: bossAt(state, i).hp,
    phaseReached: maxPhases[i]! + 1,
    phaseCount: def.phases.length,
    damageDealt: def.maxHp - bossAt(state, i).hp,
  }));
  const sum = (pick: (b: BossAnalysis) => number): number => bosses.reduce((total, b) => total + pick(b), 0);
  return {
```

- [ ] **Step 3.25: The returned analysis.**

In `src/stats/analyze.ts`, replace:

```ts
    phaseReached: maxPhase + 1,
    phaseCount: boss.phases.length,
    bossHpLeft: state.boss.hp,
    bossMaxHp: boss.maxHp,
    damageDealt: boss.maxHp - state.boss.hp,
```

with:

```ts
    phaseReached: maxPhases[0]! + 1,
    phaseCount: fight.bosses[0]!.phases.length,
    bossHpLeft: sum((b) => b.hpLeft),
    bossMaxHp: sum((b) => b.maxHp),
    damageDealt: sum((b) => b.damageDealt),
    bosses,
```

- [ ] **Step 3.26: `analyzeFight`: a pair id gives a fight of two.**

In `src/stats/analyze.ts`, replace:

```ts
  const boss = applyDials(resolveBoss(record.bossId, record.seed).boss, record.dials);
  const study = record.study ?? 0;
  return analyzeRun(boss, createInitialState(boss, record.seed, study), decodeInputs(record.input), study);
```

with:

```ts
  const fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials);
  const study = record.study ?? 0;
  return analyzeRun(fight, createInitialState(fight, record.seed, study), decodeInputs(record.input), study);
```

- [ ] **Step 4: Run the new and the existing analyzer tests.**

Run: `npx vitest run tests/analyze-pair.test.ts tests/analyze.test.ts tests/stats-shots.test.ts tests/ashen-hound.test.ts tests/tremor-brute.test.ts tests/loop-replay.test.ts`
Expected: all pass, with no existing test edited.

- [ ] **Step 5: Document the new fields in `docs/stats.md`.**

Read section 7 and section 9 of `docs/stats.md` first, then make these three edits.

(a) In the 7.1 table, replace these five rows:

```
| `phaseReached` | number | Highest boss phase reached, 1-based. |
| `phaseCount` | number | How many phases the boss has. |
| `bossHpLeft` | number | Boss health at the end. |
| `bossMaxHp` | number | Boss health at the start, with the Health dial applied. |
| `damageDealt` | number | `bossMaxHp - bossHpLeft`. |
```

with:

```
| `phaseReached` | number | Highest phase the primary boss reached, 1-based. In a fight of two bosses the partner's is in `bosses`. |
| `phaseCount` | number | How many phases the primary boss has. |
| `bossHpLeft` | number | Boss health at the end, summed over every boss of the fight. |
| `bossMaxHp` | number | Boss health at the start, with the Health dial applied (and a pair's health scale), summed over every boss of the fight. |
| `damageDealt` | number | `bossMaxHp - bossHpLeft`. |
| `bosses` | array | One entry per boss of the fight, the primary boss first (7.1a). A fight of one boss has one entry. Added in schema version 6. |
```

(b) Directly below the 7.1 table (before the heading `### 7.2 An attack occurrence (each entry of `attacks`)`), add:

```
### 7.1a A boss (each entry of `bosses`)

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The boss's id in its boss file. |
| `name` | string | Its name. |
| `maxHp` | number | Its health at the start, with the Health dial and the pair's health scale applied. |
| `hpLeft` | number | Its health at the end (0 for a boss that fell). |
| `phaseReached` | number | The highest phase this boss reached, 1-based. |
| `phaseCount` | number | How many phases this boss has. |
| `damageDealt` | number | `maxHp - hpLeft`. |

In a fight of two bosses the `behavior` distance bands (7.3) are measured to the nearest boss that still stands, and an attack's `distance` (7.2) to the boss that made it.
```

(c) In the 7.2 table, add this row directly below the `attackId` row:

```
| `boss` | number | Which boss of the fight made the attack: 0 is the primary boss, 1 its partner. Always 0 in a fight of one boss. Added in schema version 6; an analysis stored in an older record does not have it, and every attack in it is the primary boss's. |
```

Section 9 needs no edit here: Task 3 already wrote the whole "Version 6" bullet, including the analysis additions.

- [ ] **Step 6: Run the whole suite and the typecheck.**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add src/stats/analyze.ts docs/stats.md tests/analyze-pair.test.ts
git commit -m "feat: the analysis measures each boss of a fight and names the boss of every attack"
```

---

## Task 5: The summary shows both bosses

**Files:**
- Modify: `src/game/summary.ts`
- Modify: `src/ui/fight-flow.ts`
- Modify: `src/ui/summary-text.ts`
- Modify: `tests/summary-text.test.ts` (one fixture line, and one new `describe` at the end)
- Create: `tests/summary-pair.test.ts`, `tests/fight-flow-pair.test.ts`
- Test: those three test files, plus the existing `tests/summary.test.ts`, `tests/fight-flow.test.ts`, `tests/loop-replay.test.ts` (unedited, must still pass)

**Interfaces:**
- Consumes: `FightDef`, `asFight`, `makeFight` (`src/game/fight.ts`); `bossAt`, `bossCount` (`src/game/state.ts`).
- Produces: `summarize(tracker, state, source: BossDef | FightDef, result)`; `FightSummary.bosses: { name: string; hpLeft: number; maxHp: number }[]`; `advanceFlow(flow, before, after, source: BossDef | FightDef, frame)`; `leaveSummary(flow, state, source: BossDef | FightDef)`; the tracker key `<index>:<attackId>` for a partner's hits; `summaryLines` for a pair.

- [ ] **Step 1: Write the failing tests.**

Create `tests/summary-pair.test.ts` with exactly:

```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { makeFight, type FightDef } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { createTracker, summarize, trackUpdate, type SummaryTracker } from '../src/game/summary';
import { solo, updatesWith } from './boss-helpers';
import { dummy, pair } from './duo-helpers';
import { DUELIST } from './helpers';

const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
const slammer = (id: string, name: string, startX: number): BossDef => ({ ...solo('slam'), id, name, startX });

/** The player stands at `x` with plenty of health while the fight runs `count` idle updates, tracked as the app does. */
function play(fight: FightDef, x: number, count: number): { tracker: SummaryTracker; last: GameState; hits: number } {
  let previous = createInitialState(fight);
  previous.player.x = x;
  previous.player.prevX = x;
  previous.player.health = 1000;
  let tracker = createTracker();
  let hits = 0;
  for (let n = 0; n < count; n++) {
    const next = step(previous, NO_INPUT, fight);
    tracker = trackUpdate(tracker, next, previous);
    hits += updatesWith([next], 'playerHit').length;
    previous = next;
  }
  return { tracker, last: previous, hits };
}

describe('the summary of a fight of two bosses', () => {
  const fight = pair(
    { ...dummy(300, 18), id: 'first', name: 'First' },
    { ...dummy(900, 12), id: 'second', name: 'Second' },
  );
  const state = createInitialState(fight);
  state.partners[0]!.hp = 4;
  const summary = summarize(createTracker(), state, fight, 'left');

  it('lists each boss with its health left and its own maximum', () => {
    expect(summary.bosses).toEqual([
      { name: 'First', hpLeft: 18, maxHp: 18 },
      { name: 'Second', hpLeft: 4, maxHp: 12 },
    ]);
  });

  it('sums the health at the top and takes the phase count from the primary boss', () => {
    expect(summary.bossHpLeft).toBe(22);
    expect(summary.bossMaxHp).toBe(30);
    expect(summary.phaseCount).toBe(fight.bosses[0]!.phases.length);
  });
});

describe('the summary of a fight of one boss', () => {
  it('has one boss entry and the same numbers whether it is given the boss or a fight of one', () => {
    const { tracker, last } = play(makeFight([DUELIST]), 300, 30);
    const summary = summarize(tracker, last, DUELIST, 'left');
    expect(summary.bosses).toEqual([{ name: DUELIST.name, hpLeft: DUELIST.maxHp, maxHp: DUELIST.maxHp }]);
    expect(summarize(tracker, last, makeFight([DUELIST]), 'left')).toEqual(summary);
  });
});

describe('hits in a fight of two bosses', () => {
  it("counts a hit by the primary boss's attack under the attack id and names the boss in the summary", () => {
    const fight = pair(slammer('first', 'First', 1000), { ...dummy(300), id: 'second', name: 'Second' });
    const { tracker, last, hits } = play(fight, 880, 200);
    expect(hits).toBeGreaterThan(1);
    expect(tracker.hitsByAttack).toEqual({ slam: hits });
    expect(summarize(tracker, last, fight, 'defeat').mostDangerousAttack).toEqual({
      id: 'slam',
      name: `First's ${slam.name}`,
      hits,
    });
  });

  it("counts a hit by the partner's attack apart from the primary boss's attack of the same id", () => {
    const fight = pair({ ...dummy(300), id: 'first', name: 'First' }, slammer('second', 'Second', 1000));
    const { tracker, last, hits } = play(fight, 880, 200);
    expect(hits).toBeGreaterThan(1);
    expect(tracker.hitsByAttack).toEqual({ '1:slam': hits });
    expect(summarize(tracker, last, fight, 'defeat').mostDangerousAttack).toEqual({
      id: 'slam',
      name: `Second's ${slam.name}`,
      hits,
    });
  });

  it("gives a tie to the primary boss's attack", () => {
    const fight = pair(slammer('first', 'First', 1000), slammer('second', 'Second', 300));
    const tied: SummaryTracker = { hitsByAttack: { slam: 2, '1:slam': 2 }, hitsTaken: 4, phaseReached: 1 };
    expect(summarize(tied, createInitialState(fight), fight, 'defeat').mostDangerousAttack!.name).toBe(
      `First's ${slam.name}`,
    );
  });
});
```

Create `tests/fight-flow-pair.test.ts` with exactly:

```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { NORMAL_DIALS } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import type { FightMeta } from '../src/stats/record';
import { advanceFlow, leaveSummary, startFlow, type FinishedFight } from '../src/ui/fight-flow';
import { dummy, pair } from './duo-helpers';
import { withInput } from './helpers';

const META: FightMeta = {
  bossId: 'hound-and-sage',
  presetId: 'normal',
  dials: { ...NORMAL_DIALS },
  seed: 1,
  study: 0,
  playedAt: '2026-09-29T10:00:00.000Z',
};

const fight: FightDef = pair(
  { ...dummy(700, 1), id: 'first', name: 'First' },
  { ...dummy(650, 1), id: 'second', name: 'Second' },
);

/** The player stands at x = 600 and swings on updates 1 and 27 (a swing takes 16 updates); the first swing downs the nearer boss, the second the other. */
const inputFor = (n: number): InputFrame => (n === 1 || n === 27 ? withInput({ attackPressed: true }) : NO_INPUT);

describe('the fight flow with two bosses', () => {
  const played = (() => {
    let flow = startFlow(META);
    let state = createInitialState(fight);
    state.player.x = 600;
    state.player.prevX = 600;
    const finishes: Array<{ update: number; finished: FinishedFight }> = [];
    const states = [state];
    for (let n = 1; n <= 60 && flow.ended === null; n++) {
      const before = state;
      const frame = inputFor(n);
      state = step(state, frame, fight);
      states.push(state);
      const result = advanceFlow(flow, before, state, fight, frame);
      flow = result.flow;
      if (result.finished !== null) finishes.push({ update: n, finished: result.finished });
    }
    return { flow, finishes, state, states };
  })();

  it('does not end the fight when only one boss falls', () => {
    const afterFirst = played.states[26]!;
    expect(afterFirst.phase).toBe('fight');
    expect(afterFirst.partners[0]!.hp).toBe(0);
    expect(afterFirst.boss.hp).toBe(1);
  });

  it('ends it as a victory when the last boss falls, once, with both bosses in the summary', () => {
    expect(played.finishes).toHaveLength(1);
    expect(played.finishes[0]!.update).toBe(27 + 3);
    expect(played.finishes[0]!.finished.result).toBe('victory');
    expect(played.flow.ended!.bosses).toEqual([
      { name: 'First', hpLeft: 0, maxHp: 1 },
      { name: 'Second', hpLeft: 0, maxHp: 1 },
    ]);
    expect(played.flow.ended!.bossHpLeft).toBe(0);
  });

  it('gives the left summary of a fight of two bosses when the player leaves', () => {
    const flow = startFlow(META);
    const summary = leaveSummary(flow, createInitialState(fight), fight);
    expect(summary.result).toBe('left');
    expect(summary.bosses.map((b) => b.hpLeft)).toEqual([1, 1]);
  });
});
```

In `tests/summary-text.test.ts`, add one line to the `base` literal, directly above its `mostDangerousAttack` line:

```ts
  bosses: [{ name: 'Ember Duelist', hpLeft: 0, maxHp: 30 }],
```

Then append this at the end of the same file:

```ts
describe('summaryLines for a pair', () => {
  const pairSummary: FightSummary = {
    ...base,
    phaseCount: 2,
    bossHpLeft: 4,
    bossMaxHp: 30,
    bosses: [
      { name: 'Ashen Hound', hpLeft: 0, maxHp: 18 },
      { name: 'Vesper Sage', hpLeft: 4, maxHp: 12 },
    ],
    mostDangerousAttack: { id: 'single-bolt', name: "Vesper Sage's Single Bolt", hits: 1 },
  };

  it('shows the health of each boss by name and leaves out the phase line', () => {
    expect(summaryLines(pairSummary).lines).toEqual([
      'Time: 1:12',
      'Hits taken: 3',
      'Ashen Hound health left: 0 of 18',
      'Vesper Sage health left: 4 of 12',
      "Hurt you most: Vesper Sage's Single Bolt (1 hit)",
    ]);
  });
});
```

Run: `npx vitest run tests/summary-pair.test.ts tests/fight-flow-pair.test.ts tests/summary-text.test.ts`
Expected: FAIL (`summary.bosses` is undefined, the partner's hits are counted under the plain id, the pair lines are missing).

- [ ] **Step 2.1: The imports.**

In `src/game/summary.ts`, replace:

```ts
import type { GameState } from './state';
```

with:

```ts
import { asFight, type FightDef } from './fight';
import { bossAt, bossCount, type GameState } from './state';
```

- [ ] **Step 2.2: Two helpers just above `createTracker`.**

In `src/game/summary.ts`, replace:

```ts
export const createTracker
```

with:

```ts
/** Hits by the primary boss's attacks are counted under the attack id; a partner's under `<index>:<id>`. */
const attackKey = (index: number, id: string): string => (index === 0 ? id : `${index}:${id}`);

/**
 * The attack that is hurting the player: the one going on now or, when it ended on the very update that hit, on the
 * update before. Only one boss attacks at a time.
 */
function hurtingAttack(state: GameState, previous: GameState): string {
  for (let index = 0; index < bossCount(state); index++) {
    const id = bossAt(state, index).attackId ?? bossAt(previous, index).attackId;
    if (id !== null) return attackKey(index, id);
  }
  return 'unknown';
}

export const createTracker
```

- [ ] **Step 2.3: `trackUpdate`.**

In `src/game/summary.ts`, replace:

```ts
    // The attack may end on the very update that hits, so fall back to the previous state.
    const id = state.boss.attackId ?? previous.boss.attackId ?? 'unknown';
    hitsByAttack
```

with:

```ts
    const id = hurtingAttack(state, previous);
    hitsByAttack
```

- [ ] **Step 2.4: `FightSummary`.**

In `src/game/summary.ts`, replace:

```ts
  phaseReached: number;
  phaseCount: number;
  hitsTaken: number;
  bossHpLeft: number;
  bossMaxHp: number;
  mostDangerousAttack
```

with:

```ts
  /** The primary boss's phase reached and phase count. */
  phaseReached: number;
  phaseCount: number;
  hitsTaken: number;
  /** Summed over every boss of the fight. */
  bossHpLeft: number;
  bossMaxHp: number;
  /** One entry per boss, in fight order (the primary boss first). */
  bosses: { name: string; hpLeft: number; maxHp: number }[];
  mostDangerousAttack
```

- [ ] **Step 2.5: `summarize`, the worst attack over every boss.**

In `src/game/summary.ts`, replace:

```ts
  boss: BossDef,
  result: FightResult,
): FightSummary {
  let worst: { id: string; name: string; hits: number } | null = null;
  // Strict ">" keeps the attack listed first in the boss file on a tie.
  for (const attack of boss.attacks) {
    const hits = tracker.hitsByAttack[attack.id] ?? 0;
    if (hits > (worst?.hits ?? 0)) worst = { id: attack.id, name: attack.name, hits };
  }
```

with:

```ts
  source: BossDef | FightDef,
  result: FightResult,
): FightSummary {
  const fight = asFight(source);
  let worst: { id: string; name: string; hits: number } | null = null;
  // Strict ">" keeps the attack listed first (the primary boss's before its partner's) on a tie.
  for (const [index, boss] of fight.bosses.entries()) {
    for (const attack of boss.attacks) {
      const hits = tracker.hitsByAttack[attackKey(index, attack.id)] ?? 0;
      if (hits <= (worst?.hits ?? 0)) continue;
      const name = fight.bosses.length > 1 ? `${boss.name}'s ${attack.name}` : attack.name;
      worst = { id: attack.id, name, hits };
    }
  }
  const bosses = fight.bosses.map((boss, index) => ({
    name: boss.name,
    hpLeft: bossAt(state, index).hp,
    maxHp: boss.maxHp,
  }));
```

- [ ] **Step 2.6: The returned summary.**

In `src/game/summary.ts`, replace:

```ts
    phaseCount: boss.phases.length,
    hitsTaken: tracker.hitsTaken,
    bossHpLeft: state.boss.hp,
    bossMaxHp: boss.maxHp,
```

with:

```ts
    phaseCount: fight.bosses[0]!.phases.length,
    hitsTaken: tracker.hitsTaken,
    bossHpLeft: bosses.reduce((total, b) => total + b.hpLeft, 0),
    bossMaxHp: bosses.reduce((total, b) => total + b.maxHp, 0),
    bosses,
```

- [ ] **Step 3.1: The imports.**

In `src/ui/fight-flow.ts`, replace:

```ts
import type { InputFrame } from '../engine/input-frame';

```

with:

```ts
import type { InputFrame } from '../engine/input-frame';
import type { FightDef } from '../game/fight';

```

- [ ] **Step 3.2: The signature of `advanceFlow`.**

In `src/ui/fight-flow.ts`, replace:

```ts
  after: GameState,
  boss: BossDef,
  frame: InputFrame,
```

with:

```ts
  after: GameState,
  source: BossDef | FightDef,
  frame: InputFrame,
```

- [ ] **Step 3.3: `advanceFlow`.**

In `src/ui/fight-flow.ts`, replace:

```ts
ended = summarize(tracker, after, boss, result);
```

with:

```ts
ended = summarize(tracker, after, source, result);
```

- [ ] **Step 3.4: `leaveSummary`.**

In `src/ui/fight-flow.ts`, replace:

```ts
export function leaveSummary(flow: FightFlow, state: GameState, boss: BossDef): FightSummary {
  return flow.ended ?? summarize(flow.tracker, state, boss, 'left');
```

with:

```ts
export function leaveSummary(flow: FightFlow, state: GameState, source: BossDef | FightDef): FightSummary {
  return flow.ended ?? summarize(flow.tracker, state, source, 'left');
```

- [ ] **Step 4.1: A new helper above `summaryLines`.**

In `src/ui/summary-text.ts`, replace:

```ts
/** The words of the summary screen. */
```

with:

```ts
/** Health lines: one for the boss of a normal fight, one per boss for a pair. */
function healthLines(summary: FightSummary): string[] {
  if (summary.bosses.length < 2) return [`Boss health left: ${summary.bossHpLeft} of ${summary.bossMaxHp}`];
  return summary.bosses.map((b) => `${b.name} health left: ${b.hpLeft} of ${b.maxHp}`);
}

/** The words of the summary screen. */
```

- [ ] **Step 4.2: The lines of `summaryLines`.**

In `src/ui/summary-text.ts`, replace:

```ts
      `Phase reached: ${summary.phaseReached} of ${summary.phaseCount}`,
      `Hits taken: ${summary.hitsTaken}`,
      `Boss health left: ${summary.bossHpLeft} of ${summary.bossMaxHp}`,
```

with:

```ts
      // The phase reached follows the primary boss only, so it is left out for a pair.
      ...(summary.bosses.length < 2 ? [`Phase reached: ${summary.phaseReached} of ${summary.phaseCount}`] : []),
      `Hits taken: ${summary.hitsTaken}`,
      ...healthLines(summary),
```

- [ ] **Step 5: Run the new and the existing summary tests.**

Run: `npx vitest run tests/summary-pair.test.ts tests/fight-flow-pair.test.ts tests/summary-text.test.ts tests/summary.test.ts tests/fight-flow.test.ts tests/loop-replay.test.ts`
Expected: all pass, with no existing assertion edited.

- [ ] **Step 6: Run the whole suite and the typecheck.**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: no errors. (`src/ui/app.ts` still passes a boss to `advanceFlow`, `leaveSummary` and `summarize`; that keeps compiling until Task 6 passes the fight.)

- [ ] **Step 7: Commit.**

```bash
git add src/game/summary.ts src/ui/fight-flow.ts src/ui/summary-text.ts tests/summary-text.test.ts tests/summary-pair.test.ts tests/fight-flow-pair.test.ts
git commit -m "feat: the summary tracks and shows each boss of a fight"
```

## Task 6: App wiring (one `FightDef` for the whole fight)

**Files:**
- Create: `src/ui/fight-setup.ts`
- Modify: `src/ui/prefs.ts` (add `studyLabelFor`)
- Modify: `src/ui/menu-model.ts` (Study row uses `studyLabelFor`)
- Modify: `src/ui/app.ts` (hold a `FightDef`)
- Test: `tests/fight-setup.test.ts`

**Interfaces:**
- Consumes: `resolveFight(id, seed): { fight: FightDef; unfair: boolean }` (`src/bosses/resolve.ts`, Task 2); `applyDialsToFight(fight, dials): FightDef` (`src/game/difficulty.ts`, Task 2); `pairById(id)` (`src/bosses/pairs.ts`, Task 1); `advanceFlow(flow, before, after, fight, frame)` and `leaveSummary(flow, state, fight)` (`src/ui/fight-flow.ts`, Task 5); `createInitialState(source, seed, study)` and `step(state, input, source)` (plan 1).
- Produces: `FightSetup { fight: FightDef; unfair: boolean; study: StudySetting; recordBossId: string }` and `setUpFight(bossId: string, seed: number, dials: Dials, study: StudySetting): FightSetup`; `studyLabelFor(bossId: string, value: StudySetting): string`.

Every solo behaviour stays as it is: a solo `setUpFight` gives the same boss as `applyDials(resolveBoss(id, seed).boss, dials)`, the same study, and the boss's own id for the record.

- [ ] **Step 1: Write the failing test**

Create `tests/fight-setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { resolveBoss } from '../src/bosses/resolve';
import { applyDials, NORMAL_DIALS, presetDials } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { createMenu, menuRows } from '../src/ui/menu-model';
import { setUpFight } from '../src/ui/fight-setup';
import { DEFAULT_PREFS, studyLabelFor } from '../src/ui/prefs';

describe('setUpFight: one boss', () => {
  it('gives the same boss as resolving and applying the dials by hand, with the study as chosen', () => {
    const dials = presetDials('hard');
    const setup = setUpFight(EMBER_DUELIST.id, 7, dials, 2);
    expect(setup.fight.bosses).toHaveLength(1);
    expect(setup.fight.enrage).toBeNull();
    expect(setup.fight.bosses[0]).toEqual(applyDials(resolveBoss(EMBER_DUELIST.id, 7).boss, dials));
    expect(setup.study).toBe(2);
    expect(setup.unfair).toBe(false);
    expect(setup.recordBossId).toBe(EMBER_DUELIST.id);
  });

  it('records a generated boss under its own id, as before', () => {
    const setup = setUpFight('generated', 5, { ...NORMAL_DIALS }, 1);
    expect(setup.fight.bosses).toHaveLength(1);
    expect(setup.recordBossId).toBe(setup.fight.bosses[0]!.id);
    expect(setup.study).toBe(1);
  });

  it('starts a state with no partners and the study the player asked for', () => {
    const setup = setUpFight(EMBER_DUELIST.id, 3, { ...NORMAL_DIALS }, 1);
    const state = createInitialState(setup.fight, 3, setup.study);
    expect(state.partners).toEqual([]);
    expect(state.study.active).toBe(true);
  });
});

describe('setUpFight: a pair', () => {
  it('gives both bosses in order, the pair id for the record, and no study', () => {
    const setup = setUpFight('hound-and-sage', 7, { ...NORMAL_DIALS }, 2);
    expect(setup.fight.bosses.map((b) => b.id)).toEqual([ASHEN_HOUND.id, VESPER_SAGE.id]);
    expect(setup.recordBossId).toBe('hound-and-sage');
    expect(setup.study).toBe(0);
    expect(setup.unfair).toBe(false);
    const state = createInitialState(setup.fight, 7, setup.study);
    expect(state.partners).toHaveLength(1);
    expect(state.study.active).toBe(false);
    expect(state.study.queue).toEqual([]);
  });

  it('applies the dials to both bosses', () => {
    const easy = setUpFight('hound-and-sage', 7, presetDials('easy'), 0).fight;
    const hard = setUpFight('hound-and-sage', 7, presetDials('hard'), 0).fight;
    expect(easy.bosses[0]!.maxHp).toBeLessThan(hard.bosses[0]!.maxHp);
    expect(easy.bosses[1]!.maxHp).toBeLessThan(hard.bosses[1]!.maxHp);
  });

  it('is the same fight for the same seed and dials', () => {
    const a = setUpFight('hound-and-sage', 11, { ...NORMAL_DIALS }, 1);
    const b = setUpFight('hound-and-sage', 11, { ...NORMAL_DIALS }, 1);
    expect(a).toEqual(b);
  });
});

describe('the Study row', () => {
  it('shows the stored setting for a boss and "Off (pairs)" for a pair', () => {
    expect(studyLabelFor(EMBER_DUELIST.id, 0)).toBe('Off');
    expect(studyLabelFor(EMBER_DUELIST.id, 1)).toBe('Once');
    expect(studyLabelFor(EMBER_DUELIST.id, 2)).toBe('Twice');
    expect(studyLabelFor('generated', 2)).toBe('Twice');
    expect(studyLabelFor('hound-and-sage', 2)).toBe('Off (pairs)');
  });

  it('is what the menu shows, without touching the stored setting', () => {
    const prefs = { ...DEFAULT_PREFS, bossId: 'hound-and-sage', study: 2 as const };
    const menu = createMenu(prefs);
    expect(menuRows(menu).find((r) => r.id === 'study')!.value).toBe('Off (pairs)');
    expect(menu.prefs.study).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/fight-setup.test.ts`
Expected: FAIL. `Failed to resolve import "../src/ui/fight-setup"`.

- [ ] **Step 3: Create `src/ui/fight-setup.ts`**

```ts
import { resolveFight } from '../bosses/resolve';
import { applyDialsToFight, type Dials } from '../game/difficulty';
import type { FightDef } from '../game/fight';
import type { StudySetting } from './prefs';

/** Everything the app needs to start a fight from the Boss row choice. */
export interface FightSetup {
  fight: FightDef;
  /** True for a generated boss that could not be checked as fair (the app shows a banner). */
  unfair: boolean;
  /** The study the fight really runs with: a pair has none. */
  study: StudySetting;
  /** The id the record stores: the pair id for a pair, the boss's own id otherwise (`'generated'` for a generated boss). */
  recordBossId: string;
}

export function setUpFight(bossId: string, seed: number, dials: Dials, study: StudySetting): FightSetup {
  const resolved = resolveFight(bossId, seed);
  const fight = applyDialsToFight(resolved.fight, dials);
  const paired = fight.bosses.length > 1;
  return {
    fight,
    unfair: resolved.unfair,
    study: paired ? 0 : study,
    recordBossId: paired ? bossId : fight.bosses[0]!.id,
  };
}
```

- [ ] **Step 4: Add `studyLabelFor` to `src/ui/prefs.ts`**

Add this import next to the other imports at the top of the file:

```ts
import { pairById } from '../bosses/pairs';
```

Add this function right after `studyLabel`:

```ts
/** The text of the menu's Study row: a pair has no study, so the row says so instead of the stored setting. */
export function studyLabelFor(bossId: string, value: StudySetting): string {
  return pairById(bossId) !== undefined ? 'Off (pairs)' : studyLabel(value);
}
```

- [ ] **Step 5: Use it in `src/ui/menu-model.ts`**

Change the import line

```ts
import { isCustom, nextStudy, selectPreset, studyLabel, type Prefs } from './prefs';
```

to

```ts
import { isCustom, nextStudy, selectPreset, studyLabelFor, type Prefs } from './prefs';
```

and the Study row in `menuRows`

```ts
    { id: 'study', label: 'Study', value: studyLabel(model.prefs.study) },
```

to

```ts
    { id: 'study', label: 'Study', value: studyLabelFor(model.prefs.bossId, model.prefs.study) },
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run tests/fight-setup.test.ts tests/menu-model.test.ts tests/prefs.test.ts`
Expected: PASS (the existing menu and prefs tests are unedited: their boss is the Duelist, so the row still reads `Once`).

- [ ] **Step 7: Wire `src/ui/app.ts`**

Imports. Replace the first two lines

```ts
import { resolveBoss } from '../bosses/resolve';
import type { BossDef } from '../bosses/schema';
```

with

```ts
import { resolveFight } from '../bosses/resolve';
```

Change

```ts
import { applyDials, redoDials, type Dials, type RedoChange } from '../game/difficulty';
```

to

```ts
import { redoDials, type Dials, type RedoChange } from '../game/difficulty';
import type { FightDef } from '../game/fight';
```

and add, next to the other `./` imports (after the `./fight-flow` import):

```ts
import { setUpFight } from './fight-setup';
```

State. Replace

```ts
  // The boss as adjusted by the dials for the current fight.
  let boss: BossDef = resolveBoss(prefs.bossId, 1).boss;
  // True when `boss` is a generated boss that couldn't be verified as fair (shown as a banner).
  let bossUnfair = false;
  let state: GameState = createInitialState(boss);
```

with

```ts
  // The bosses of the current fight, as adjusted by the dials (one boss, or a pair).
  let fight: FightDef = resolveFight(prefs.bossId, 1).fight;
  // True when the fight is a generated boss that couldn't be verified as fair (shown as a banner).
  let bossUnfair = false;
  let state: GameState = createInitialState(fight);
```

and in the placeholder flow replace `    bossId: boss.id,` with `    bossId: fight.bosses[0]!.id,`.

Leaving a fight: replace `showSummary(leaveSummary(flow, state, boss));` with `showSummary(leaveSummary(flow, state, fight));`.

Starting a fight. Replace

```ts
    const resolved = resolveBoss(prefs.bossId, seed);
    boss = applyDials(resolved.boss, dials);
    bossUnfair = resolved.unfair;
    state = createInitialState(boss, seed, prefs.study);
    flow = startFlow({
      bossId: boss.id,
      presetId: prefs.presetId,
      dials,
      seed,
      study: prefs.study,
      playedAt: new Date().toISOString(),
    });
```

with

```ts
    const setup = setUpFight(prefs.bossId, seed, dials, prefs.study);
    fight = setup.fight;
    bossUnfair = setup.unfair;
    state = createInitialState(fight, seed, setup.study);
    flow = startFlow({
      bossId: setup.recordBossId,
      presetId: prefs.presetId,
      dials,
      seed,
      study: setup.study,
      playedAt: new Date().toISOString(),
    });
```

The backdrop comes from the primary boss (decision 5). Replace `const mood = moodFor(boss.id, seed);` with `const mood = moodFor(fight.bosses[0]!.id, seed);`.

Drawing (Task 7 draws the whole fight; until then only the primary). Replace `drawFrame(context, width, height, state, boss, alpha, feedback, {` with `drawFrame(context, width, height, state, fight.bosses[0]!, alpha, feedback, {`.

The run loop. Replace `state = step(state, frameInput, boss);` with `state = step(state, frameInput, fight);`, `const advanced = advanceFlow(flow, before, state, boss, frameInput);` with `const advanced = advanceFlow(flow, before, state, fight, frameInput);`, and `fx = spawnEffects(fx, before, state, boss, settings.effects);` with `fx = spawnEffects(fx, before, state, fight.bosses[0]!, settings.effects);` (Task 8 passes `fight`).

The study note needs no change: for a pair `state.study` is inactive with `endTick` 0 and `bossUnfair` is false, so `studyBanner` returns `null`.

- [ ] **Step 8: Run the full checks**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all PASS. `noUnusedLocals` would flag a leftover `applyDials`, `resolveBoss` or `BossDef` import in `app.ts`; remove any it names.

- [ ] **Step 9: Manual check (tests cannot cover the DOM)**

Run `npm run dev`. Play one fight of the Ember Duelist and one of a generated boss; the menu Study row still cycles Off / Once / Twice; the study, the unfair banner and the summary work as before. (A pair is not selectable until Task 9.)

- [ ] **Step 10: Commit**

```bash
git add src/ui/fight-setup.ts src/ui/prefs.ts src/ui/menu-model.ts src/ui/app.ts tests/fight-setup.test.ts
git commit -m "feat: the app holds a fight (one boss or a pair); pairs have no study"
```

---

## Task 7: Drawing a pair (both bosses, two health bars, turn marker)

**Files:**
- Create: `src/ui/look/duo.ts`
- Modify: `src/ui/look/tuning.ts` (add `hud`, `turnMarker`, `fallen`; fix the header comment)
- Modify: `src/ui/render.ts`
- Modify: `src/ui/app.ts` (pass the fight to `drawFrame`)
- Test: `tests/look-duo.test.ts`, `tests/render-duo.test.ts`

**Interfaces:**
- Consumes: `FightDef`, `asFight` (`src/game/fight.ts`); `bossAt`, `bossCount`, `allBosses`, `isDowned` (`src/game/state.ts`); `holdsTurn` (`src/game/turns.ts`); `bossDrawBox`, `Rect` (`src/ui/look/pose.ts`); `moodFor` (`src/ui/look/moods.ts`); `bossFigure` and `drawPrimitives` (`src/ui/look/figures.ts`); `shot.owner` (plan 1).
- Produces (`src/ui/look/duo.ts`): `HealthBar { index; name; back: Rect; fill: Rect; ticks: Rect[]; nameX; nameY; color: string | null; dim: boolean }`; `healthBars(state, fight): HealthBar[]`; `turnHolder(state, fight): number | null`; `TurnMarker { boss: number; points: [number, number][] }`; `turnMarker(state, fight): TurnMarker | null`; `fallenFigure(cx, facing, width, height, colors: { body: string; accent: string }): Primitive[]`. `drawFrame(ctx, w, h, state, source: BossDef | FightDef, alpha, feedback, look?)`; `FrameLook.flashBoss?: number`.

Everything here is look-only: nothing reads or writes the simulation, so a fight plays the same. Cost per frame is a few rectangles, one triangle and one heap shape; nothing is blurred.

- [ ] **Step 1: Write the failing look tests**

Create `tests/look-duo.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { asFight, makeFight } from '../src/game/fight';
import { WORLD } from '../src/game/params';
import { createInitialState, type ShotState } from '../src/game/state';
import { fallenFigure, healthBars, turnHolder, turnMarker } from '../src/ui/look/duo';
import type { Primitive } from '../src/ui/look/figures';
import { moodFor } from '../src/ui/look/moods';
import { bossDrawBox } from '../src/ui/look/pose';
import { LOOK } from '../src/ui/look/tuning';
import { dummy, pair, unit } from './duo-helpers';

const M = LOOK.turnMarker;

describe('healthBars', () => {
  it('draws one bar for a lone boss exactly where the single bar always was', () => {
    const state = createInitialState(EMBER_DUELIST);
    const bars = healthBars(state, asFight(EMBER_DUELIST));
    expect(bars).toHaveLength(1);
    const bar = bars[0]!;
    const left = WORLD.width - 24 - 260;
    expect(bar.back).toEqual({ x: left, y: 24, w: 260, h: 14 });
    expect(bar.fill).toEqual({ x: left, y: 24, w: 260, h: 14 });
    expect(bar.nameX).toBe(WORLD.width - 24);
    expect(bar.nameY).toBe(46);
    expect(bar.name).toBe(EMBER_DUELIST.name);
    expect(bar.color).toBeNull();
    expect(bar.dim).toBe(false);
    expect(bar.ticks).toEqual(
      EMBER_DUELIST.phases.slice(1).map((p) => ({ x: left + 260 * p.startsAtHpFraction - 1, y: 20, w: 3, h: 22 })),
    );
  });

  it('shrinks the fill with the health and never below zero', () => {
    const state = createInitialState(EMBER_DUELIST);
    const fight = asFight(EMBER_DUELIST);
    state.boss.hp = EMBER_DUELIST.maxHp / 2;
    expect(healthBars(state, fight)[0]!.fill.w).toBeCloseTo(130);
    state.boss.hp = -5;
    expect(healthBars(state, fight)[0]!.fill.w).toBe(0);
  });

  it('puts STUDY in front of the name while the study runs', () => {
    const state = createInitialState(EMBER_DUELIST);
    state.study = { active: true, queue: [], endTick: 0 };
    expect(healthBars(state, asFight(EMBER_DUELIST))[0]!.name).toBe(`STUDY  ${EMBER_DUELIST.name}`);
  });

  it('stacks a bar for each boss of a pair, primary on top, each in its boss colour', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = VESPER_SAGE.maxHp / 4;
    const [first, second] = healthBars(state, fight);
    expect(first!.name).toBe(ASHEN_HOUND.name);
    expect(second!.name).toBe(VESPER_SAGE.name);
    expect(second!.back.y).toBe(first!.back.y + LOOK.hud.barStep);
    expect(second!.nameY).toBe(second!.back.y + LOOK.hud.nameDrop);
    expect(second!.back.x).toBe(first!.back.x);
    expect(first!.fill.w).toBe(260);
    expect(second!.fill.w).toBeCloseTo(65);
    expect(first!.color).toBe(moodFor(ASHEN_HOUND.id).accent);
    expect(second!.color).toBe(moodFor(VESPER_SAGE.id).accent);
    expect(second!.ticks).toEqual(
      VESPER_SAGE.phases.slice(1).map((p) => ({
        x: second!.back.x + 260 * p.startsAtHpFraction - 1,
        y: second!.back.y - LOOK.hud.tickRise,
        w: LOOK.hud.tickWidth,
        h: LOOK.hud.tickHeight,
      })),
    );
  });

  it('dims the bar of a fallen boss only', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);
    const state = createInitialState(fight, 1);
    expect(healthBars(state, fight).map((b) => b.dim)).toEqual([false, false]);
    state.partners[0]!.hp = 0;
    expect(healthBars(state, fight).map((b) => b.dim)).toEqual([false, true]);
    expect(healthBars(state, fight)[1]!.fill.w).toBe(0);
  });
});

describe('the turn marker', () => {
  const fight = pair(unit(30, 400), dummy(800));
  const bolt = (owner: number): ShotState => ({
    kind: 'bolt',
    attackId: 'shoot',
    originTick: 1,
    x: 500,
    lift: 0,
    dir: 1,
    originX: 500,
    size: 30,
    speed: 600,
    climb: 0,
    owner,
  });

  it('is on nobody while both bosses only wait', () => {
    const state = createInitialState(fight, 1);
    expect(turnHolder(state, fight)).toBeNull();
    expect(turnMarker(state, fight)).toBeNull();
  });

  it('is on the boss that attacks or approaches', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    expect(turnHolder(state, fight)).toBe(0);
    state.boss.mode = 'gap';
    state.partners[0]!.mode = 'approach';
    expect(turnHolder(state, fight)).toBe(1);
  });

  it('stays on the boss that owns shots still in the air', () => {
    const state = createInitialState(fight, 1);
    state.shots = [bolt(1)];
    expect(turnHolder(state, fight)).toBe(1);
  });

  it('is never shown in a fight of one boss', () => {
    const solo = asFight(unit(30, 400));
    const state = createInitialState(solo, 1);
    state.boss.mode = 'attack';
    expect(turnHolder(state, solo)).toBeNull();
  });

  it('is hidden once only one boss stands', () => {
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = 0;
    state.boss.mode = 'attack';
    expect(turnHolder(state, fight)).toBeNull();
  });

  it('is a triangle over the boss, its tip pointing down at the gap above the drawn box', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    const marker = turnMarker(state, fight)!;
    const tip = bossDrawBox(state.boss, fight.bosses[0]!).top - M.gap;
    expect(marker.boss).toBe(0);
    expect(marker.points).toEqual([
      [400 - M.halfWidth, tip - M.height],
      [400 + M.halfWidth, tip - M.height],
      [400, tip],
    ]);
  });

  it('pulses: wider and taller at the peak of the pulse', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    state.tick = M.pulseTicks / 4;
    const [left, right] = turnMarker(state, fight)!.points;
    expect(right![0] - left![0]).toBeCloseTo(2 * M.halfWidth * (1 + M.pulse));
  });

  it('never goes above the top of the world, even for a boss hanging high', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    state.boss.lift = 600;
    const marker = turnMarker(state, fight)!;
    const ys = marker.points.map((p) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(M.minTop);
  });
});

describe('fallenFigure', () => {
  const colors = { body: '#123456', accent: '#654321' };
  const extremes = (p: Primitive): { xs: number[]; ys: number[] } =>
    p.kind === 'rect'
      ? { xs: [p.x, p.x + p.w], ys: [p.y, p.y + p.h] }
      : p.kind === 'circle'
        ? { xs: [p.x - p.r, p.x + p.r], ys: [p.y - p.r, p.y + p.r] }
        : { xs: p.points.map((q) => q[0]), ys: p.points.map((q) => q[1]) };

  it('is a low heap on the floor inside the boss width, lower than the boss stood', () => {
    for (const facing of [1, -1] as const) {
      const list = fallenFigure(700, facing, 80, 150, colors);
      expect(list.length).toBeGreaterThan(0);
      const half = (80 * LOOK.fallen.widthScale) / 2;
      for (const p of list) {
        const { xs, ys } = extremes(p);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(700 - half - 0.001);
        expect(Math.max(...xs)).toBeLessThanOrEqual(700 + half + 0.001);
        expect(Math.max(...ys)).toBeLessThanOrEqual(WORLD.floorY + 0.001);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(WORLD.floorY - 150 * LOOK.fallen.heightFraction - 0.001);
      }
    }
  });

  it('uses the colours it is given', () => {
    const list = fallenFigure(700, 1, 80, 150, colors);
    expect(list.map((p) => p.color)).toContain(colors.body);
    expect(list.map((p) => p.color)).toContain(colors.accent);
  });
});

describe('the duo look files', () => {
  it('never import render.ts (no import cycle)', () => {
    const importsRender = (file: string): boolean =>
      /from\s+['"](\.\.?\/)+render['"]/.test(readFileSync(new URL(file, import.meta.url), 'utf8'));
    expect(importsRender('../src/ui/look/duo.ts')).toBe(false);
  });
});
```

Create `tests/render-duo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, QUILL_WARDEN, VESPER_SAGE } from '../src/bosses';
import { asFight, makeFight } from '../src/game/fight';
import { createInitialState, type ShotState } from '../src/game/state';
import { NO_FEEDBACK } from '../src/ui/feedback';
import { NO_EFFECTS } from '../src/ui/look/effects';
import { moodFor } from '../src/ui/look/moods';
import { LOOK } from '../src/ui/look/tuning';
import { drawFrame, type FrameLook } from '../src/ui/render';

interface Call {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  alpha: unknown;
}

/** A recording stand-in for a 2D context: save and restore keep the drawing settings like a real one. */
function fakeContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  const stack: Record<string, unknown>[] = [];
  let depth = 0;
  let minDepth = 0;
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'save') {
          stack.push({ ...target });
          depth++;
        }
        if (key === 'restore') {
          Object.assign(target, stack.pop());
          depth--;
          minDepth = Math.min(minDepth, depth);
        }
        calls.push({ name: key, args, fillStyle: target.fillStyle, alpha: target.globalAlpha });
        if (key === 'createLinearGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, balance: () => depth, minDepth: () => minDepth };
}

const look: FrameLook = { effects: NO_EFFECTS, background: null, motion: true };
const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);

function frame(state: ReturnType<typeof createInitialState>, source: Parameters<typeof drawFrame>[4], withLook?: FrameLook) {
  const f = fakeContext();
  drawFrame(f.ctx, 1280, 720, state, source, 0.5, NO_FEEDBACK, withLook);
  return f;
}

const barBacks = (calls: Call[]): number =>
  calls.filter((c) => c.name === 'fillRect' && c.fillStyle === '#3a3a4a' && c.args[2] === LOOK.hud.barWidth).length;

describe('drawFrame with a pair', () => {
  it('draws without throwing, with and without the full look, and keeps save and restore balanced', () => {
    const state = createInitialState(fight, 1);
    for (const l of [undefined, look]) {
      const f = frame(state, fight, l);
      expect(f.balance()).toBe(0);
      expect(f.minDepth()).toBe(0);
    }
  });

  it('draws one health bar for each boss', () => {
    expect(barBacks(frame(createInitialState(fight, 1), fight, look).calls)).toBe(2);
    expect(barBacks(frame(createInitialState(ASHEN_HOUND, 1), asFight(ASHEN_HOUND), look).calls)).toBe(1);
  });

  it('draws a lone boss the same whether it is given as a boss or as a fight of one', () => {
    const state = createInitialState(ASHEN_HOUND, 1);
    const asBoss = frame(state, ASHEN_HOUND, look).calls;
    const asOne = frame(state, asFight(ASHEN_HOUND), look).calls;
    expect(JSON.stringify(asOne)).toBe(JSON.stringify(asBoss));
  });

  it('draws a fallen partner as a dimmed heap in its own colour', () => {
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = 0;
    const { calls } = frame(state, fight, look);
    const heap = calls.some(
      (c) =>
        c.name === 'fillRect' && c.alpha === LOOK.fallen.alpha && c.fillStyle === moodFor(VESPER_SAGE.id).bodyColor,
    );
    expect(heap).toBe(true);
  });

  it('draws the turn marker only while a boss holds the turn', () => {
    const idle = createInitialState(fight, 1);
    const holding = createInitialState(fight, 1);
    holding.boss.mode = 'attack';
    const marks = (calls: Call[]): number =>
      calls.filter((c) => c.name === 'fill' && c.fillStyle === LOOK.turnMarker.color).length;
    expect(marks(frame(idle, fight, look).calls)).toBe(0);
    expect(marks(frame(holding, fight, look).calls)).toBe(1);
  });

  it('gives each shot the colours of the boss that fired it', () => {
    const mixed = makeFight([ASHEN_HOUND, QUILL_WARDEN]);
    const bolt = (owner: number | undefined): ShotState => ({
      kind: 'bolt',
      attackId: 'x',
      originTick: 1,
      x: 500,
      lift: 0,
      dir: 1,
      originX: 500,
      size: 30,
      speed: 600,
      climb: 0,
      ...(owner === undefined ? {} : { owner }),
    });
    const quillCore = LOOK.palette['quill-warden']!.core;
    const withShot = (owner: number | undefined) => {
      const state = createInitialState(mixed, 1);
      state.shots = [bolt(owner)];
      return frame(state, mixed, look).calls.some((c) => c.name === 'fill' && c.fillStyle === quillCore);
    };
    expect(withShot(1)).toBe(true);
    expect(withShot(0)).toBe(false);
    expect(withShot(undefined)).toBe(false);
  });

  it('flashes only the boss named in the frame look', () => {
    const state = createInitialState(fight, 1);
    const flashing = { ...NO_FEEDBACK, bossFlashTicks: 3 };
    const whites = (flashBoss: number | undefined): number => {
      const f = fakeContext();
      drawFrame(f.ctx, 1280, 720, state, fight, 0.5, flashing, { ...look, flashBoss });
      return f.calls.filter((c) => c.name === 'fillRect' && c.fillStyle === '#ffffff').length;
    };
    expect(whites(0)).toBeGreaterThan(0);
    expect(whites(1)).toBeGreaterThan(0);
    expect(whites(0)).toBe(whites(1));
    expect(whites(undefined)).toBeGreaterThan(whites(0));
  });
});
```

The last test relies on the figure of a boss whose body is drawn white under a flash; both bosses are drawn from primitives, so flashing one boss adds the same number of white rectangles as flashing the other, and flashing none of them draws fewer than flashing all. Because `whites(undefined)` flashes both, it must be larger than either single flash.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/look-duo.test.ts tests/render-duo.test.ts`
Expected: FAIL. `Failed to resolve import "../src/ui/look/duo"`.

- [ ] **Step 3: Add the tunables to `src/ui/look/tuning.ts`**

In the header comment, change the line

```
 * - The health bars, the black bars round the screen, the arena fill, the white hit flash and the white slash box are
 *   in `render.ts`.
```

to

```
 * - The black bars round the screen, the arena fill, the white hit flash and the white slash box are in `render.ts`.
 *   The health bars' size and spacing are in `hud` below; their red is in `render.ts`.
```

Add these blocks before the `// ---- Floor, platforms and cover` comment (after the `palette` block):

```ts
  // ---- Health bars: one per boss, stacked at the top right (a lone boss has the first one only) ----
  hud: {
    /** Gap to the right edge and to the top, world units. */
    margin: 24,
    barTop: 24,
    barWidth: 260,
    barHeight: 14,
    /** How far the next bar sits below the one above it. */
    barStep: 52,
    /** The phase tick starts this far above its bar and is this tall and wide. */
    tickRise: 4,
    tickHeight: 22,
    tickWidth: 3,
    /** The name sits this far below the top of its bar. */
    nameDrop: 22,
    /** How dim the bar and name of a fallen boss are (1 is not dimmed). */
    fallenAlpha: 0.35,
  },

  // ---- The turn marker: a pulsing triangle over the boss that holds the turn (fights with two bosses only) ----
  turnMarker: {
    color: '#fff6b0',
    alpha: 0.9,
    /** Half the width and the height of the triangle at rest, world units. */
    halfWidth: 12,
    height: 14,
    /** How far the tip stays above the top of the boss's drawn box. */
    gap: 30,
    /** The marker never goes higher than this (a boss hanging near the top of the world). */
    minTop: 8,
    /** How much it swells at the peak of the pulse (0.25 is a quarter bigger) and how long a pulse takes, in ticks. */
    pulse: 0.25,
    pulseTicks: 40,
  },

  // ---- A beaten boss of a pair, drawn as a low heap ----
  fallen: {
    /** The heap's height as a fraction of the boss's height, and its width as a multiple of the boss's width. */
    heightFraction: 0.25,
    widthScale: 1.15,
    /** How dim the heap is (1 is not dimmed). */
    alpha: 0.5,
  },
```

- [ ] **Step 4: Create `src/ui/look/duo.ts`**

```ts
import type { FightDef } from '../../game/fight';
import { WORLD } from '../../game/params';
import { allBosses, bossAt, bossCount, isDowned, type GameState } from '../../game/state';
import { holdsTurn } from '../../game/turns';
import type { Primitive } from './figures';
import { moodFor } from './moods';
import { bossDrawBox, type Rect } from './pose';
import { LOOK } from './tuning';

/**
 * The look of a fight with two bosses: the stacked health bars, the marker over the boss that holds the turn, and the
 * heap a beaten boss leaves. Pure and look-only: nothing here changes how a fight plays. A fight of one boss gets the
 * one bar it always had and no marker.
 */

export interface HealthBar {
  index: number;
  name: string;
  back: Rect;
  fill: Rect;
  ticks: Rect[];
  nameX: number;
  nameY: number;
  /** The colour of the fill, or null for the plain red of a lone boss. */
  color: string | null;
  /** A fallen boss: its bar and name are drawn dim. */
  dim: boolean;
}

export function healthBars(state: GameState, fight: FightDef): HealthBar[] {
  const h = LOOK.hud;
  const left = WORLD.width - h.margin - h.barWidth;
  const paired = fight.bosses.length > 1;
  return fight.bosses.map((def, index) => {
    const top = h.barTop + index * h.barStep;
    const fraction = Math.max(0, Math.min(1, bossAt(state, index).hp / def.maxHp));
    return {
      index,
      name: !paired && state.study.active ? `STUDY  ${def.name}` : def.name,
      back: { x: left, y: top, w: h.barWidth, h: h.barHeight },
      fill: { x: left, y: top, w: h.barWidth * fraction, h: h.barHeight },
      ticks: def.phases.slice(1).map((phase) => ({
        x: left + h.barWidth * phase.startsAtHpFraction - 1,
        y: top - h.tickRise,
        w: h.tickWidth,
        h: h.tickHeight,
      })),
      nameX: WORLD.width - h.margin,
      nameY: top + h.nameDrop,
      color: paired ? moodFor(def.id).accent : null,
      dim: isDowned(state, index),
    };
  });
}

/** The boss that holds the turn, or null: in a fight of one, or once only one boss still stands, there is no turn to show. */
export function turnHolder(state: GameState, fight: FightDef): number | null {
  if (fight.bosses.length < 2) return null;
  const standing = allBosses(state).filter((_, index) => !isDowned(state, index)).length;
  if (standing < 2) return null;
  for (let index = 0; index < bossCount(state); index++) {
    if (holdsTurn(state, index)) return index;
  }
  return null;
}

export interface TurnMarker {
  boss: number;
  /** A triangle, tip down, as world points. */
  points: [number, number][];
}

export function turnMarker(state: GameState, fight: FightDef): TurnMarker | null {
  const boss = turnHolder(state, fight);
  if (boss === null) return null;
  const m = LOOK.turnMarker;
  const b = bossAt(state, boss);
  const { top } = bossDrawBox(b, fight.bosses[boss]!);
  const pulse = 1 + m.pulse * Math.sin((Math.PI * 2 * state.tick) / m.pulseTicks);
  const half = m.halfWidth * pulse;
  const height = m.height * pulse;
  const tip = Math.max(m.minTop + height, top - m.gap);
  return {
    boss,
    points: [
      [b.x - half, tip - height],
      [b.x + half, tip - height],
      [b.x, tip],
    ],
  };
}

/** What is left of a beaten boss: a low body on the floor with the head at the end it was facing. Draw it dimmed (`LOOK.fallen.alpha`). */
export function fallenFigure(
  cx: number,
  facing: 1 | -1,
  width: number,
  height: number,
  colors: { body: string; accent: string },
): Primitive[] {
  const f = LOOK.fallen;
  const w = width * f.widthScale;
  const h = height * f.heightFraction;
  const r = Math.min(LOOK.bossHeadRadius, h / 2);
  return [
    { kind: 'rect', x: cx - w / 2, y: WORLD.floorY - h, w, h, color: colors.body },
    { kind: 'circle', x: cx + facing * (w / 2 - r), y: WORLD.floorY - r, r, color: colors.accent },
  ];
}
```

- [ ] **Step 5: Run the look tests and watch them pass**

Run: `npx vitest run tests/look-duo.test.ts`
Expected: PASS.

- [ ] **Step 6: Change `src/ui/render.ts`**

Imports. Replace

```ts
import type { ArcState, BossState, EruptionState, GameState } from '../game/state';
```

with

```ts
import { asFight, type FightDef } from '../game/fight';
import { bossAt, isDowned, type ArcState, type BossState, type EruptionState, type GameState } from '../game/state';
```

and add after the `./look/effects` import:

```ts
import { fallenFigure, healthBars, turnMarker } from './look/duo';
```

`FrameLook`: add the field

```ts
  /** The boss that flashes white after a hit; left out, every boss flashes. */
  flashBoss?: number;
```

`drawShots`: replace the signature and its first line

```ts
function drawShots(ctx: CanvasRenderingContext2D, state: GameState, bossId: string): void {
  const look = { ...LOOK.shot, ...attackPalette(bossId) };
```

with

```ts
function drawShots(ctx: CanvasRenderingContext2D, state: GameState, bossIds: readonly string[]): void {
  const looks = bossIds.map((id) => ({ ...LOOK.shot, ...attackPalette(id) }));
```

and, as the first line inside `for (const shot of state.shots) {`, add

```ts
    const look = looks[shot.owner ?? 0] ?? looks[0]!;
```

`drawBoss`: replace the whole function (from `function drawBoss(` to its closing brace, just before `function drawPlayer(`) with

```ts
function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  fight: FightDef,
  index: number,
  feedback: FeedbackState,
  mood: Mood | null,
  flashBoss: number | undefined,
): void {
  const boss = fight.bosses[index]!;
  const b = bossAt(state, index);
  // A partner has its own colours; the primary's are the arena's mood.
  const own = index === 0 || mood === null ? mood : moodFor(boss.id);

  if (isDowned(state, index)) {
    const colors =
      own === null
        ? { body: LOOK.bossBodyEmber, accent: LOOK.bossBodyEmber }
        : { body: own.bodyColor, accent: own.accent };
    drawPrimitives(ctx, fallenFigure(b.x, b.facing, boss.width, boss.height, colors), LOOK.fallen.alpha);
    return;
  }

  const look = bossLook(b, boss, own?.bodyColor);
  const pulse = 0.55 + 0.35 * Math.sin(state.tick / 6);
  const attack =
    b.mode === 'attack' && b.attackId !== null
      ? boss.attacks.find((a) => a.id === b.attackId)
      : undefined;

  // Where a leap will land: a flat bar on the floor over the side and reach of the shockwave (one-sided, like the
  // real hit), or a small dim marker when the landing hurts nobody.
  const ring = landingRing(b, boss);
  if (ring !== null) {
    ctx.save();
    ctx.fillStyle = BOSS_COLORS.red;
    for (const span of landingSpans(ring)) {
      if (ring.harmless) {
        ctx.globalAlpha = 0.3;
        ctx.fillRect(span.left, WORLD.floorY - 3, span.right - span.left, 3);
      } else {
        ctx.globalAlpha = pulse;
        ctx.fillRect(span.left, WORLD.floorY - 6, span.right - span.left, 6);
      }
    }
    ctx.restore();
  }
  // A soft shadow on the floor shows how high the airborne boss is.
  if (b.lift > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS.bars;
    ctx.beginPath();
    const shrink = 1 - Math.min(0.5, b.lift / 600);
    ctx.ellipse(b.x, WORLD.floorY, (boss.width / 2) * shrink, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const { top, height } = bossDrawBox(b, boss);
  const left = b.x - boss.width / 2;

  const flashing = flashBoss === undefined || flashBoss === index;
  const bodyColor = bossBodyColor(look, flashing ? feedback : { ...feedback, bossFlashTicks: 0 });
  if (own !== null) {
    drawPrimitives(
      ctx,
      bossFigure(state, boss, { body: bodyColor, accent: look.glow ?? own.accent, glow: look.glow }, index),
    );
  } else {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(left, top, boss.width, height);
  }
  if (look.glow !== null) {
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = look.glow;
    ctx.lineWidth = 8;
    ctx.strokeRect(left - 4, top - 4, boss.width + 8, height + 8);
    ctx.globalAlpha = 1;
  }

  if (own === null) {
    // The arm shows the pose of the attack being performed; when waiting it hangs at the side.
    const shoulderY = top + height * 0.3;
    const arm =
      attack !== undefined
        ? armRect(attack.pose, b.facing, b.x, shoulderY)
        : { x: b.x + b.facing * 18 - 8, y: shoulderY, w: 16, h: 50 };
    ctx.fillStyle = look.glow ?? '#e8965a';
    ctx.fillRect(arm.x, arm.y, arm.w, arm.h);
    // A small notch on the side the boss faces.
    ctx.fillStyle = COLORS.arena;
    ctx.fillRect(b.x + b.facing * (boss.width / 2 - 14) - 5, top + 24, 10, 10);
  }

  for (const box of activeHitBoxes(b, boss)) {
    if (own === null) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = look.glow ?? COLORS.bossHp;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
      continue;
    }
    // The real reach as a faint box, and a shape that suits the strike inside it.
    ctx.globalAlpha = LOOK.slash.boxAlpha;
    ctx.fillStyle = look.glow ?? COLORS.bossHp;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
    drawPrimitives(ctx, slashShape(box, box.x + box.w / 2 >= b.x ? 1 : -1, attackPalette(boss.id)), LOOK.slash.shapeAlpha);
  }
}

/** The pulsing triangle over the boss that holds the turn (a fight with two bosses only). */
function drawTurnMarker(ctx: CanvasRenderingContext2D, state: GameState, fight: FightDef): void {
  const marker = turnMarker(state, fight);
  if (marker === null) return;
  drawPrimitives(ctx, [{ kind: 'poly', points: marker.points, color: LOOK.turnMarker.color }], LOOK.turnMarker.alpha);
}
```

`drawHud`: replace the whole function with

```ts
function drawHud(ctx: CanvasRenderingContext2D, state: GameState, fight: FightDef): void {
  for (let i = 0; i < PLAYER.maxHealth; i++) {
    ctx.globalAlpha = i < state.player.health ? 1 : 0.25;
    ctx.fillStyle = COLORS.hud;
    ctx.fillRect(24 + i * 30, 24, 22, 22);
  }
  for (const bar of healthBars(state, fight)) {
    ctx.globalAlpha = bar.dim ? LOOK.hud.fallenAlpha : 1;
    ctx.fillStyle = COLORS.hudBack;
    ctx.fillRect(bar.back.x, bar.back.y, bar.back.w, bar.back.h);
    ctx.fillStyle = bar.color ?? COLORS.bossHp;
    ctx.fillRect(bar.fill.x, bar.fill.y, bar.fill.w, bar.fill.h);
    ctx.fillStyle = COLORS.hud;
    for (const tick of bar.ticks) ctx.fillRect(tick.x, tick.y, tick.w, tick.h);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(bar.name, bar.nameX, bar.nameY);
  }
  ctx.globalAlpha = 1;
}
```

`drawFrame`: change the signature line `boss: BossDef,` to `source: BossDef | FightDef,`, and replace its first line

```ts
  const mood = look === undefined ? null : moodFor(boss.id, state.seed);
```

with

```ts
  const fight = asFight(source);
  const primary = fight.bosses[0]!;
  const mood = look === undefined ? null : moodFor(primary.id, state.seed);
```

Then replace the block

```ts
  drawArena(ctx, boss, mood);
  drawBoss(ctx, state, boss, feedback, mood);
  drawShots(ctx, state, boss.id);
  drawPlayer(ctx, state, alpha, feedback, mood);
  if (look !== undefined) drawEffects(ctx, look.effects);
  drawHud(ctx, state, boss);
```

with

```ts
  drawArena(ctx, primary, mood);
  for (let index = 0; index < fight.bosses.length; index++) {
    drawBoss(ctx, state, fight, index, feedback, mood, look?.flashBoss);
  }
  drawShots(ctx, state, fight.bosses.map((def) => def.id));
  drawPlayer(ctx, state, alpha, feedback, mood);
  if (look !== undefined) {
    drawTurnMarker(ctx, state, fight);
    drawEffects(ctx, look.effects);
  }
  drawHud(ctx, state, fight);
```

- [ ] **Step 7: `bossFigure` needs the boss index (Task 8 finishes its inside)**

`drawBoss` now calls `bossFigure(state, boss, colors, index)`. So that this task compiles and every fight still draws, make the minimal signature change now in `src/ui/look/figures.ts`. Replace

```ts
import type { GameState } from '../../game/state';
```

with

```ts
import { bossAt, type GameState } from '../../game/state';
```

replace `function bossPose(state: GameState, boss: BossDef): BossPose {` and its first line `  const b = state.boss;` with

```ts
function bossPose(state: GameState, boss: BossDef, index: number): BossPose {
  const b = bossAt(state, index);
```

and in `bossFigure` change the parameter list and the call:

```ts
export function bossFigure(
  state: GameState,
  boss: BossDef,
  colors: { body: string; accent: string; glow: string | null },
  index = 0,
): Primitive[] {
  const bp = bossPose(state, boss, index);
```

Also update the doc comment of `bossFigure`: add at its end "`index` is which boss of the fight to draw (0 is the primary)."

- [ ] **Step 8: Pass the fight from the app**

In `src/ui/app.ts` change `drawFrame(context, width, height, state, fight.bosses[0]!, alpha, feedback, {` to `drawFrame(context, width, height, state, fight, alpha, feedback, {`.

- [ ] **Step 9: Run the render tests, then everything**

Run: `npx vitest run tests/look-duo.test.ts tests/render-duo.test.ts tests/look-wiring.test.ts tests/render-arena.test.ts tests/render-leap.test.ts tests/look-figures.test.ts`
Expected: PASS. Then run: `npm test && npm run typecheck && npm run build && npm run check:dist`. Expected: all PASS.

- [ ] **Step 10: Manual check (needs eyes; a pair is selectable after Task 9)**

Only after Task 9: on the PC and on the S21, start Hound and Sage. Check that both bosses are readable, the two bars do not cover the play area, the marker is easy to see against both backdrops, and a fallen boss reads as beaten. Until then, play a solo fight and confirm the single bar looks the same as before.

- [ ] **Step 11: Commit**

```bash
git add src/ui/look/duo.ts src/ui/look/tuning.ts src/ui/look/figures.ts src/ui/render.ts src/ui/app.ts tests/look-duo.test.ts tests/render-duo.test.ts
git commit -m "feat: draw both bosses of a pair, two health bars and a turn marker"
```

---

## Task 8: Effects and feedback for a pair

**Files:**
- Create: `src/ui/look/who.ts`
- Modify: `src/ui/look/effects.ts`
- Modify: `src/ui/feedback.ts`
- Modify: `src/ui/audio.ts`
- Modify: `src/ui/app.ts`
- Test: `tests/look-who.test.ts`, `tests/look-effects-duo.test.ts`, `tests/look-figures-duo.test.ts`, `tests/feedback-duo.test.ts`

**Interfaces:**
- Consumes: `FightDef`, `asFight` (`src/game/fight.ts`); `bossAt`, `bossCount`, `isDowned` (`src/game/state.ts`); `bossFigure(state, boss, colors, index)` (Task 7); the `'bossDown'` event (plan 1); `FrameLook.flashBoss` (Task 7).
- Produces: `struckBoss(before, after): number`, `fellBosses(before, after): number[]`, `phasedBoss(before, after): number` (`src/ui/look/who.ts`); `spawnEffects(fx, before, after, source: BossDef | FightDef, enabled)`; `flashBossFor(events, before, after, current): number` (`src/ui/feedback.ts`); `'bossDown'` shares the freeze, shake and flash of `'bossDefeated'`.

Every one-boss result is unchanged: with no partner, every boss index is 0, and the burst, the ring and the landing use the same numbers in the same order.

- [ ] **Step 1: Write the failing tests**

Create `tests/look-who.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/state';
import { fellBosses, phasedBoss, struckBoss } from '../src/ui/look/who';
import { dummy, pair, unit } from './duo-helpers';

const fight = pair(unit(30, 400), dummy(800));
const start = () => createInitialState(fight, 1);
const after = (change: (s: ReturnType<typeof start>) => void) => {
  const s = structuredClone(start());
  change(s);
  return s;
};

describe('struckBoss', () => {
  it('is the boss whose health dropped', () => {
    expect(struckBoss(start(), after((s) => { s.partners[0]!.hp -= 3; }))).toBe(1);
    expect(struckBoss(start(), after((s) => { s.boss.hp -= 3; }))).toBe(0);
  });

  it('is the boss that was just staggered by a counter', () => {
    expect(struckBoss(start(), after((s) => { s.partners[0]!.mode = 'stagger'; }))).toBe(1);
  });

  it('falls back to the primary when nothing changed', () => {
    expect(struckBoss(start(), start())).toBe(0);
  });
});

describe('fellBosses', () => {
  it('lists the bosses that reached zero health in this update only', () => {
    expect(fellBosses(start(), after((s) => { s.partners[0]!.hp = 0; }))).toEqual([1]);
    const down = after((s) => { s.partners[0]!.hp = 0; });
    expect(fellBosses(down, structuredClone(down))).toEqual([]);
  });
});

describe('phasedBoss', () => {
  it('is the boss that moved to a later phase', () => {
    expect(phasedBoss(start(), after((s) => { s.partners[0]!.phase += 1; }))).toBe(1);
    expect(phasedBoss(start(), start())).toBe(0);
  });
});
```

Create `tests/look-effects-duo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bossBox } from '../src/game/geometry';
import { WORLD } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { NO_EFFECTS, spawnEffects, type EffectsState, type Particle } from '../src/ui/look/effects';
import { LOOK } from '../src/ui/look/tuning';
import { dummy, pair, unit } from './duo-helpers';

const fight = pair(unit(30, 400), dummy(800));
const fresh = (): GameState => createInitialState(fight, 1);
const later = (events: GameEvent[], change: (s: GameState) => void): GameState => {
  const s = structuredClone(fresh());
  s.events = events;
  change(s);
  return s;
};
const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const partnerCentre = (s: GameState) => centre(bossBox(s.partners[0]!, fight.bosses[1]!));
const kinds = (fx: EffectsState, kind: Particle['kind']): Particle[] => fx.particles.filter((p) => p.kind === kind);

describe('spawnEffects in a pair', () => {
  it('bursts at the partner when it goes down, with the big ring, and no shockwave', () => {
    const after = later(['bossDown'], (s) => {
      s.partners[0]!.hp = 0;
      s.partners[0]!.lift = 0;
    });
    const before = fresh();
    before.partners[0]!.lift = 90;
    const fx = spawnEffects(NO_EFFECTS, before, after, fight, true);
    const c = partnerCentre(after);
    const bursts = kinds(fx, 'burst');
    expect(bursts).toHaveLength(LOOK.burstOnDefeat);
    expect(bursts.every((p) => p.x === c.x && p.y === c.y)).toBe(true);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.growth).toBe(LOOK.bigRingGrowthPerTick);
  });

  it('bursts at the primary when the primary goes down', () => {
    const after = later(['bossDown'], (s) => {
      s.boss.hp = 0;
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = centre(bossBox(after.boss, fight.bosses[0]!));
    expect(kinds(fx, 'burst').every((p) => p.x === c.x && p.y === c.y)).toBe(true);
  });

  it('puts the counter ring on the boss that was staggered', () => {
    const after = later(['counter'], (s) => {
      s.partners[0]!.mode = 'stagger';
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = partnerCentre(after);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
  });

  it('puts the phase ring on the boss that changed phase', () => {
    const after = later(['phaseChange'], (s) => {
      s.partners[0]!.phase = 1;
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = partnerCentre(after);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.color).toBe(LOOK.phaseRing);
  });

  it("raises the partner's landing dust and shockwave at the partner", () => {
    const before = fresh();
    before.partners[0]!.lift = 100;
    const after = later([], () => {});
    const fx = spawnEffects(NO_EFFECTS, before, after, fight, true);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(after.partners[0]!.x);
    expect(fx.rings[0]!.y).toBe(WORLD.floorY);
    expect(kinds(fx, 'dust').length).toBeGreaterThan(0);
  });

  it('is unchanged for a boss given on its own', () => {
    const solo = unit(30, 400);
    const before = createInitialState(solo, 1);
    const after = structuredClone(before);
    after.events = ['bossDefeated'];
    after.boss.hp = 0;
    const a = spawnEffects(NO_EFFECTS, before, after, solo, true);
    const b = spawnEffects(NO_EFFECTS, before, after, { bosses: [solo], enrage: null, enraged: [solo] }, true);
    expect(b).toEqual(a);
    expect(kinds(a, 'burst')).toHaveLength(LOOK.burstOnDefeat);
  });
});
```

Create `tests/look-figures-duo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, VESPER_SAGE } from '../src/bosses';
import { makeFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { bossFigure, type Primitive } from '../src/ui/look/figures';

const COLORS = { body: '#c8642a', accent: '#e8965a', glow: null as string | null };
const xsOf = (list: Primitive[]): number[] =>
  list.flatMap((p) => (p.kind === 'rect' ? [p.x, p.x + p.w] : p.kind === 'circle' ? [p.x - p.r, p.x + p.r] : p.points.map((q) => q[0])));

describe('bossFigure for a boss of a pair', () => {
  const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);

  it('draws the boss it is asked for, where that boss stands', () => {
    const state = createInitialState(fight, 1);
    state.boss.x = 300;
    state.partners[0]!.x = 950;
    const hound = xsOf(bossFigure(state, ASHEN_HOUND, COLORS, 0));
    const sage = xsOf(bossFigure(state, VESPER_SAGE, COLORS, 1));
    expect(Math.max(...hound)).toBeLessThan(600);
    expect(Math.min(...sage)).toBeGreaterThan(700);
  });

  it('draws the primary exactly as it draws a boss fighting alone', () => {
    const paired = createInitialState(fight, 1);
    const alone = createInitialState(ASHEN_HOUND, 1);
    paired.boss.x = alone.boss.x = 300;
    expect(bossFigure(paired, ASHEN_HOUND, COLORS)).toEqual(bossFigure(alone, ASHEN_HOUND, COLORS));
    expect(bossFigure(paired, ASHEN_HOUND, COLORS, 0)).toEqual(bossFigure(alone, ASHEN_HOUND, COLORS));
  });
});
```

Create `tests/feedback-duo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../src/game/params';
import { createInitialState, type GameEvent } from '../src/game/state';
import { NO_FEEDBACK, applyEvents, flashBossFor, freezeFor } from '../src/ui/feedback';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { dummy, pair, unit } from './duo-helpers';

describe('a boss going down', () => {
  it('freezes the loop as long as a defeat does', () => {
    expect(freezeFor(['bossDown'])).toBe(FEEDBACK.freezeOnBossDefeated);
    expect(freezeFor(['bossDown'], { ...DEFAULT_SETTINGS, freeze: false })).toBe(0);
  });

  it('shakes the screen and flashes the boss like a defeat', () => {
    const fb = applyEvents(NO_FEEDBACK, ['bossDown']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('honours the Shake and Flashes settings', () => {
    const noShake = applyEvents(NO_FEEDBACK, ['bossDown'], { ...DEFAULT_SETTINGS, shake: false, flash: true });
    expect(noShake.shakeTicks).toBe(0);
    expect(noShake.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    const noFlash = applyEvents(NO_FEEDBACK, ['bossDown'], { ...DEFAULT_SETTINGS, shake: true, flash: false });
    expect(noFlash.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(noFlash.bossFlashTicks).toBe(0);
  });
});

describe('flashBossFor', () => {
  const fight = pair(unit(30, 400), dummy(800));
  const before = createInitialState(fight, 1);
  const hurt = (index: number) => {
    const after = structuredClone(before);
    (index === 0 ? after.boss : after.partners[0]!).hp -= 3;
    return after;
  };

  it('names the boss that was struck when a hit, a counter or a fall happens', () => {
    for (const event of ['bossHit', 'counter', 'bossDefeated', 'bossDown'] as GameEvent[]) {
      expect(flashBossFor([event], before, hurt(1), 0)).toBe(1);
      expect(flashBossFor([event], before, hurt(0), 1)).toBe(0);
    }
  });

  it('keeps the current boss when nothing struck a boss', () => {
    expect(flashBossFor(['dash', 'playerHit'], before, before, 1)).toBe(1);
    expect(flashBossFor([], before, before, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/look-who.test.ts tests/look-effects-duo.test.ts tests/look-figures-duo.test.ts tests/feedback-duo.test.ts`
Expected: FAIL. `who` cannot be resolved; `flashBossFor` is not exported. (`look-figures-duo` may already pass: Task 7 gave `bossFigure` its `index`.)

- [ ] **Step 3: Create `src/ui/look/who.ts`**

```ts
import { bossAt, bossCount, type GameState } from '../../game/state';

/**
 * Which boss of a fight an update happened to, worked out from the two states around it (the events do not say). Look-only
 * helpers: each falls back to the primary boss (0) when nothing matches, so a fight of one always answers 0.
 */

function firstBoss(after: GameState, test: (index: number) => boolean): number {
  for (let index = 0; index < bossCount(after); index++) {
    if (test(index)) return index;
  }
  return 0;
}

/** The boss the sword just hurt or staggered: its health dropped, or it entered the stagger. */
export function struckBoss(before: GameState, after: GameState): number {
  return firstBoss(after, (index) => {
    const was = bossAt(before, index);
    const now = bossAt(after, index);
    return now.hp < was.hp || (now.mode === 'stagger' && was.mode !== 'stagger');
  });
}

/** Every boss that reached zero health in this update. */
export function fellBosses(before: GameState, after: GameState): number[] {
  const fell: number[] = [];
  for (let index = 0; index < bossCount(after); index++) {
    if (bossAt(before, index).hp > 0 && bossAt(after, index).hp <= 0) fell.push(index);
  }
  return fell;
}

/** The boss that moved on to a later phase in this update. */
export function phasedBoss(before: GameState, after: GameState): number {
  return firstBoss(after, (index) => bossAt(after, index).phase > bossAt(before, index).phase);
}
```

- [ ] **Step 4: Change `src/ui/look/effects.ts`**

Imports. Replace

```ts
import type { GameState } from '../../game/state';
import { nextRandom } from '../../game/rng';
import { LOOK } from './tuning';
```

with

```ts
import { asFight, type FightDef } from '../../game/fight';
import { bossAt, bossCount, isDowned, type BossState, type GameState } from '../../game/state';
import { nextRandom } from '../../game/rng';
import { fellBosses, phasedBoss, struckBoss } from './who';
import { LOOK } from './tuning';
```

Replace everything from `function shockwaveGrowth(` through the end of `spawnEffects` (that is `shockwaveGrowth`, `newest` and `spawnEffects`, keeping the doc comments) with:

```ts
function shockwaveGrowth(landing: BossState, boss: BossDef): number {
  const attack = landing.attackId === null ? undefined : boss.attacks.find((a) => a.id === landing.attackId);
  if (attack === undefined || attack.hits.length === 0) return LOOK.shockwaveGrowthPerTick;
  const reach = Math.max(...attack.hits.map((hit) => hit.x1));
  // The ring is drawn for `shockwaveLifeTicks - 1` growth steps before it is removed.
  const steps = Math.max(1, LOOK.shockwaveLifeTicks - 1);
  const capped = Math.max(0, reach - LOOK.ringStartRadius) / steps;
  return Math.min(LOOK.shockwaveGrowthPerTick, capped);
}

/** Keeps the newest `max` items (the list is oldest first). */
const newest = <T>(items: T[], max: number): T[] => (items.length > max ? items.slice(items.length - max) : items);

/**
 * The effects for what happened in one update (`before` to `after`), added to `fx`. With `enabled` false it
 * returns `fx` itself and spawns nothing. Never goes over `LOOK.maxParticles` / `LOOK.maxRings`: the oldest go.
 * Works for a boss on its own or a fight of several: each effect is placed on the boss it happened to.
 */
export function spawnEffects(
  fx: EffectsState,
  before: GameState,
  after: GameState,
  source: BossDef | FightDef,
  enabled: boolean,
): EffectsState {
  if (!enabled) return fx;
  const fight = asFight(source);
  const out = new Spawner(fx.rng);
  const player = centreOf(playerBox(after.player));
  const bossCentre = (index: number): { x: number; y: number } =>
    centreOf(bossBox(bossAt(after, index), fight.bosses[index]!));
  let fallen = false;

  for (const event of after.events) {
    switch (event) {
      case 'bossHit': {
        const c = centreOf(attackBox(after.player));
        out.sparks(LOOK.sparksOnBossHit, c.x, c.y, LOOK.spark);
        out.smallRing(c.x, c.y, LOOK.spark);
        break;
      }
      case 'counter': {
        const c = bossCentre(struckBoss(before, after));
        out.sparks(LOOK.sparksOnCounter, c.x, c.y, LOOK.counterRing, LOOK.spark);
        out.normalRing(c.x, c.y, LOOK.counterRing);
        break;
      }
      case 'playerHit':
        out.sparks(LOOK.sparksOnPlayerHit, player.x, player.y, LOOK.hurtSpark);
        out.smallRing(player.x, player.y, LOOK.hurtSpark);
        break;
      case 'dash': {
        // Puffs left along the path the dash starts on, from the player back to where it began.
        const dir = after.player.dashDir;
        for (let i = 0; i < LOOK.trailOnDash; i++) out.trail(after.player.x - dir * i * LOOK.dashTrailSpacing, player.y);
        if (after.player.onGround) out.dust(LOOK.dustOnDash, after.player.x, after.player.y, PLAYER.width);
        break;
      }
      case 'bossDown':
      case 'bossDefeated': {
        if (fallen) break;
        fallen = true;
        const fell = fellBosses(before, after);
        for (const index of fell.length > 0 ? fell : [0]) {
          const c = bossCentre(index);
          out.burst(c.x, c.y);
          out.bigRing(c.x, c.y, LOOK.burst);
        }
        break;
      }
      case 'playerDefeated':
        out.burst(player.x, player.y);
        break;
      case 'phaseChange': {
        const c = bossCentre(phasedBoss(before, after));
        out.normalRing(c.x, c.y, LOOK.phaseRing);
        break;
      }
      case 'studyHit':
        out.sparks(LOOK.sparksOnStudyHit, player.x, player.y, LOOK.hurtSpark);
        break;
      default:
        break;
    }
  }

  // Landings are read from the two states: no event marks them.
  if (!before.player.onGround && after.player.onGround && before.player.vy > HARD_LANDING_SPEED) {
    out.dust(LOOK.dustOnLand, after.player.x, after.player.y, PLAYER.width);
  }
  for (let index = 0; index < bossCount(after); index++) {
    const was = bossAt(before, index);
    const now = bossAt(after, index);
    // A boss that falls lands too, but its heap is no danger zone: no shockwave for it.
    if (was.lift > 0 && now.lift === 0 && !isDowned(after, index)) {
      const def = fight.bosses[index]!;
      out.dust(LOOK.dustOnLand * 2, now.x, WORLD.floorY, def.width);
      out.ring(now.x, WORLD.floorY, shockwaveGrowth(was, def), LOOK.shockwaveLifeTicks, LOOK.ringWidth, LOOK.shockwave);
    }
  }

  if (out.particles.length === 0 && out.rings.length === 0) return fx;
  return {
    particles: newest([...fx.particles, ...out.particles], LOOK.maxParticles),
    rings: newest([...fx.rings, ...out.rings], LOOK.maxRings),
    rng: out.rng,
  };
}
```

(`newest` and the tail of `spawnEffects` are unchanged from the file; they are repeated here so the block replaces cleanly. The `BossDef` import at the top of the file stays: it is still used.)

- [ ] **Step 5: Change `src/ui/feedback.ts`**

Add the imports next to the existing ones:

```ts
import { struckBoss } from './look/who';
```

and change `GameState` in `import type { GameEvent } from '../game/state';` to `import type { GameEvent, GameState } from '../game/state';`.

In `freezeFor` replace

```ts
    if (event === 'bossDefeated') freeze = Math.max(freeze, FEEDBACK.freezeOnBossDefeated);
```

with

```ts
    if (event === 'bossDefeated' || event === 'bossDown') freeze = Math.max(freeze, FEEDBACK.freezeOnBossDefeated);
```

In `applyEvents` replace

```ts
    if (event === 'bossHit' || event === 'counter' || event === 'bossDefeated') {
```

with

```ts
    if (event === 'bossHit' || event === 'counter' || event === 'bossDefeated' || event === 'bossDown') {
```

Add at the end of the file:

```ts
/** The boss that flashes white: the one just struck by a hit, a counter or a fall, otherwise the one that already was. */
export function flashBossFor(
  events: readonly GameEvent[],
  before: GameState,
  after: GameState,
  current: number,
): number {
  const struck = events.some((e) => e === 'bossHit' || e === 'counter' || e === 'bossDefeated' || e === 'bossDown');
  return struck ? struckBoss(before, after) : current;
}
```

- [ ] **Step 6: Change `src/ui/audio.ts`**

Replace

```ts
        if (event === 'bossDefeated') beep(523, 320, 'triangle', 0.2);
```

with

```ts
        if (event === 'bossDefeated' || event === 'bossDown') beep(523, 320, 'triangle', 0.2);
```

- [ ] **Step 7: Wire `src/ui/app.ts`**

Change the feedback import

```ts
import { NO_FEEDBACK, advanceFeedback, applyEvents, freezeFor, type FeedbackState } from './feedback';
```

to

```ts
import { NO_FEEDBACK, advanceFeedback, applyEvents, flashBossFor, freezeFor, type FeedbackState } from './feedback';
```

Next to `let feedback: FeedbackState = NO_FEEDBACK;` add:

```ts
  // Which boss flashes white after a hit (0 is the primary; only a pair has another).
  let flashBoss = 0;
```

In `startFight`, next to `feedback = NO_FEEDBACK;` add `flashBoss = 0;`.

In `draw`, add `flashBoss,` to the look object:

```ts
    drawFrame(context, width, height, state, fight, alpha, feedback, {
      effects: fx,
      background,
      motion: settings.effects,
      flashBoss,
    });
```

In `runFight`, replace

```ts
      feedback = applyEvents(feedback, state.events, settings);
      fx = spawnEffects(fx, before, state, fight.bosses[0]!, settings.effects);
```

with

```ts
      feedback = applyEvents(feedback, state.events, settings);
      flashBoss = flashBossFor(state.events, before, state, flashBoss);
      fx = spawnEffects(fx, before, state, fight, settings.effects);
```

- [ ] **Step 8: Check nothing else in `src/ui` reads only the primary boss**

Run: `grep -rnE "\b(state|before|after)\.boss\b" src/ui`
Expected: no output. (Every remaining boss read in `src/ui` now goes through `bossAt` or a `FightDef`.)

- [ ] **Step 9: Run the new tests, then everything**

Run: `npx vitest run tests/look-who.test.ts tests/look-effects-duo.test.ts tests/look-figures-duo.test.ts tests/feedback-duo.test.ts tests/look-effects.test.ts tests/feedback.test.ts tests/loop-replay.test.ts`
Expected: PASS (`look-effects.test.ts`, `feedback.test.ts` and `loop-replay.test.ts` are unedited). Then run: `npm test && npm run typecheck && npm run build && npm run check:dist`. Expected: all PASS.

- [ ] **Step 10: Manual check (sound and feel cannot be tested)**

Only after Task 9: on the PC and on the S21 fight Hound and Sage. Beat one boss: the screen shakes, freezes and flashes only that boss, a burst comes from that boss, and the low beep sounds. The other boss goes on. Confirm the frame rate on the S21 stays smooth while the burst plays.

- [ ] **Step 11: Commit**

```bash
git add src/ui/look/who.ts src/ui/look/effects.ts src/ui/feedback.ts src/ui/audio.ts src/ui/app.ts tests/look-who.test.ts tests/look-effects-duo.test.ts tests/look-figures-duo.test.ts tests/feedback-duo.test.ts
git commit -m "feat: effects, flash and knockdown feedback for each boss of a pair"
```

## Task 9: The Boss row offers the pair

The last step: the pair becomes something the player can choose. `BOSS_CHOICES` gets one entry per pair (after the named bosses, before Generated), `bossChoiceName` finds pair names, and an unknown or old boss id in the saved menu choice still falls back. This task comes after the screen and app wiring (Tasks 6 to 8), so choosing the pair starts a working two-boss fight.

**Files:**
- Modify: `src/bosses/index.ts`
- Modify: `docs/bosses.md` (section 1 step 4)
- Modify: `docs/phone-testing.md` (lines 32, 108, 302, 312: stale lists of the Boss row choices)
- Test: `tests/bosses-index.test.ts` (add a describe)
- Test: `tests/menu-model.test.ts` (add tests)
- Test: `tests/prefs.test.ts` (add tests)

`src/ui/menu-model.ts` and `src/ui/prefs.ts` need **no code change**: the Boss row and its left/right stepping already read `BOSS_CHOICES` and `bossChoiceName`, and `parsePrefs` keeps any stored id as text (an existing test pins that). The tests below prove it for a pair and for a removed pair.

**Interfaces:**
- Consumes: `PAIRS` and `HOUND_AND_SAGE` (`src/bosses/pairs.ts`), `resolveFight` (`src/bosses/resolve.ts`).
- Produces: `BOSS_CHOICES` with the entries in this order: the ten named bosses, `{ id: 'hound-and-sage', name: 'Hound and Sage' }`, `{ id: 'generated', name: 'Generated' }`. `bossChoiceName('hound-and-sage')` is `'Hound and Sage'`; an unknown id is still the Duelist's name.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bosses-index.test.ts` (add the new imports at the top: `BOSS_CHOICES, bossChoiceName` from `'../src/bosses'`, and `PAIRS` from `'../src/bosses/pairs'`):

```ts
describe('the Boss row choices', () => {
  it('are the named bosses, then each pair, then Generated', () => {
    expect(BOSS_CHOICES.map((c) => c.id)).toEqual([
      ...BOSSES.map((b) => b.id),
      ...PAIRS.map((p) => p.id),
      'generated',
    ]);
    expect(BOSS_CHOICES.map((c) => c.id)).toContain('hound-and-sage');
    expect(BOSS_CHOICES[BOSS_CHOICES.length - 1]).toEqual({ id: 'generated', name: 'Generated' });
    expect(BOSS_CHOICES[BOSSES.length]).toEqual({ id: 'hound-and-sage', name: 'Hound and Sage' });
  });

  it('never repeat an id', () => {
    const ids = BOSS_CHOICES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('give the name of a boss, a pair and Generated, and the Duelist name for an unknown id', () => {
    expect(bossChoiceName('ashen-hound')).toBe('Ashen Hound');
    expect(bossChoiceName('hound-and-sage')).toBe('Hound and Sage');
    expect(bossChoiceName('generated')).toBe('Generated');
    expect(bossChoiceName('a-pair-that-was-removed')).toBe(EMBER_DUELIST.name);
  });
});
```

Append to `tests/menu-model.test.ts` (the `at`, `press` and `menuRows` helpers and the imports are already there; add `resolveFight` is not needed here):

```ts
describe('the Boss row with a pair', () => {
  const valueOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'boss')!.value;
  const withBoss = (bossId: string): MenuModel => at('boss', createMenu({ ...DEFAULT_PREFS, bossId }));

  it('right from the last named boss lands on the pair, and right again on Generated', () => {
    const lastNamed = BOSS_CHOICES[BOSS_CHOICES.findIndex((c) => c.id === 'hound-and-sage') - 1]!;
    let m = withBoss(lastNamed.id);
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('hound-and-sage');
    expect(valueOf(m)).toBe('Hound and Sage');
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('generated');
    m = press(m, 'left', 'left');
    expect(m.prefs.bossId).toBe(lastNamed.id);
  });

  it('shows an old or unknown boss id as the Duelist, and the next step goes to the second choice', () => {
    const m = withBoss('a-pair-that-was-removed');
    expect(valueOf(m)).toBe(EMBER_DUELIST.name);
    expect(press(m, 'right').prefs.bossId).toBe(BOSS_CHOICES[1]!.id);
  });

  it('keeps the choice of a pair when other rows change', () => {
    const m = press(withBoss('hound-and-sage'), 'down', 'right');
    expect(m.prefs.bossId).toBe('hound-and-sage');
  });
});
```

Check the action name for moving down in `MenuAction` (`grep -n "MenuAction" src/ui/menu-model.ts`); use the real name if it is not `'down'`.

Append to `tests/prefs.test.ts` (add `import { resolveFight } from '../src/bosses/resolve';` at the top):

```ts
describe('a pair as the saved boss choice', () => {
  it('is kept through save and load', () => {
    const storage = new MemoryStorage();
    savePrefs(storage, { ...DEFAULT_PREFS, bossId: 'hound-and-sage' });
    expect(loadPrefs(storage).bossId).toBe('hound-and-sage');
    expect(resolveFight(loadPrefs(storage).bossId, 1).fight.bosses).toHaveLength(2);
  });

  it('a stored id that is no longer a pair or a boss gives a fight of the Duelist', () => {
    const parsed = parsePrefs('{"bossId":"a-pair-that-was-removed"}');
    expect(parsed.bossId).toBe('a-pair-that-was-removed');
    expect(resolveFight(parsed.bossId, 1).fight.bosses).toEqual([EMBER_DUELIST]);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/bosses-index.test.ts tests/menu-model.test.ts tests/prefs.test.ts`
Expected: FAIL. `BOSS_CHOICES` does not contain `hound-and-sage` ("expected [...] to contain 'hound-and-sage'") and the menu tests show `Ember Duelist` where `Hound and Sage` is expected. The prefs tests that only need `resolveFight` may already pass.

- [ ] **Step 3: Add the pair to the choices in `src/bosses/index.ts`**

Add `import { PAIRS } from './pairs';` above `import { BOSSES, EMBER_DUELIST } from './roster';` and replace the `BOSS_CHOICES` definition and its comment with:

```ts
/** Every choice the menu's Boss row offers, in menu order: the named bosses, then each pair, then `'Generated'`. */
export const BOSS_CHOICES: readonly BossChoice[] = [
  ...BOSSES.map((b) => ({ id: b.id, name: b.name })),
  ...PAIRS.map((p) => ({ id: p.id, name: p.name })),
  { id: 'generated', name: 'Generated' },
];
```

Update the comment on `BossChoice` to `One choice in the menu's Boss row: a named boss, a pair (two bosses in one fight), or 'generated' for a freshly generated one.` `bossChoiceName` needs no change (it reads `BOSS_CHOICES`).

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run tests/bosses-index.test.ts tests/menu-model.test.ts tests/prefs.test.ts`
Expected: PASS. The existing menu tests ("left and right cycle every boss choice ... and wrap", "the Boss row shows the name of each boss as it is chosen") pass unedited because they loop over `BOSS_CHOICES`.

- [ ] **Step 5: Look for anything else that lists the choices**

Run: `grep -rn "BOSS_CHOICES\|bossChoiceName" src tests tools docs`
Expected: users are `src/ui/menu-model.ts`, `tests/menu-model.test.ts` and the tests above; none of them hard-codes the number of choices or the text "Generated" as the last-but-one row. If a UI text or test does (for example a hint that says "the Boss row cycles N bosses"), update it now.

- [ ] **Step 6: Update `docs/bosses.md`**

In section 1, "Adding a boss", step 4, replace `so a boss added to \`BOSSES\` can be chosen from the menu with no other change.` with `so a boss added to \`BOSSES\` can be chosen from the menu with no other change. Each pair (section 5a) is offered after the named bosses and before \`'generated'\`, and a pair added to \`PAIRS\` is offered the same way.` and in the same step replace `a fight or a replay resolves the stored id through \`resolveBoss\` instead, section 3b` with `a fight or a replay resolves the stored id through \`resolveFight\` instead (a pair id gives two bosses, any other id one, section 5a and 3b)`.

- [ ] **Step 6b: Make the phone checklist stop listing the Boss row choices**

`docs/phone-testing.md` still says the Boss row has two or three choices (it predates the other bosses). Make each of these four sentences true whatever the number of bosses:

Line 32: replace `On the Boss row they switch between the two bosses, the Ember Duelist and the Ashen Hound (from the last one it goes round to the first).` with `On the Boss row they switch between the bosses, the pairs and Generated, in the order the row lists them (from the last one it goes round to the first).`

Line 108: replace `- [ ] The Boss row switches between the Ember Duelist and the Ashen Hound with left and right, and the menu remembers the choice after closing and reopening the app.` with `- [ ] The Boss row switches between the choices with left and right, and the menu remembers the choice after closing and reopening the app.`

Line 302: replace `(it cycles Ember Duelist, Ashen Hound, Generated and back)` with `(it is the last choice on the row, and one more press goes back to the first)` and `the same as on the other two bosses` with `the same as on the other bosses`.

Line 312: replace `- [ ] The Boss row cycles Ember Duelist, Ashen Hound, Generated and back to Ember Duelist.` with `- [ ] Generated is the last choice on the Boss row, and one more press goes back to the Ember Duelist.`

Check:

```bash
grep -n "two bosses, the Ember\|between the Ember Duelist and the Ashen\|cycles Ember Duelist\|other two bosses" docs/phone-testing.md
```

Expected: no output. Add `docs/phone-testing.md` to the `git add` in Step 7.

- [ ] **Step 7: Full check and commit**

Run: `npm test` then `npm run typecheck` then `npm run build` then `npm run check:dist`
Expected: all pass.

Then test on the PC by hand: `npm run dev`, open http://localhost:5173, focus the Boss row and press right until it reads "Hound and Sage", then start a fight and check both bosses appear (this is the check for the screen work of Tasks 6 to 8; the phone checklist is Task 10).

```bash
git add src/bosses/index.ts tests/bosses-index.test.ts tests/menu-model.test.ts tests/prefs.test.ts docs/bosses.md docs/phone-testing.md
git commit -m "feat: offer the Hound and Sage pair in the Boss row"
```

## Task 10: Docs, phone checklist, and checking and tuning the first pair

**Files:**
- Modify: `docs/SPEC.md` (sections 7, 9, 11 and 12)
- Modify: `docs/phone-testing.md` (new section before "Redo after a fight")
- Modify: `docs/backlog.md` (new section at the end)
- Create: `tests/hound-and-sage.test.ts`
- Cross-check only (owned by other tasks): `docs/stats.md`, `docs/bosses.md`

**Interfaces:**
- Consumes: `HOUND_AND_SAGE` (`src/bosses/pairs.ts`); `resolveFight` (`src/bosses/resolve.ts`); `applyDialsToFight`, `presetDials`, `NORMAL_DIALS` (`src/game/difficulty.ts`); `FightDef` (`src/game/fight.ts`); `holdsTurn` (`src/game/turns.ts`); `allBosses`, `isDowned`, `createInitialState` (`src/game/state.ts`); `step` (`src/game/step.ts`); `GEN.fairnessCapTicks` (`src/bosses/generate/tuning.ts`, 3000 updates); `withInput` (`tests/helpers.ts`).
- Produces: nothing new in `src/`. One new test file and the documentation.

- [ ] **Step 1: Check that the other tasks documented the pair fields**

Run:

```bash
grep -n "Currently 6\|schemaVersion.*6" docs/stats.md | head
grep -n "hound-and-sage" docs/stats.md docs/bosses.md | head
grep -n '`bosses`' docs/stats.md | head
grep -n '`boss`' docs/stats.md | head
grep -n "Pair" docs/bosses.md | head
```

Expected: `docs/stats.md` says the current schema version is 6 (sections 4 and 5 and the versioning list in section 9), describes the `boss` field of an attack occurrence (section 7.2) and the `bosses` array of the analysis (section 7.1), and says a pair fight's `bossId` is the pair id. `docs/bosses.md` has a section on the pair file format. If any of these is missing, do not write it here: it belongs to the task that made the change (Tasks 3, 4 and 1). Go back to that task, fix it there, and come back.

- [ ] **Step 2: Add the SPEC entries**

Edit `docs/SPEC.md` four times.

First, section 7. Replace

```
## 8. Feel (v1)
```

with

```
- **Pairs of bosses** (built 2026-09-29): two of the bosses above can fight together as one named pair; the first is the Ashen Hound and the Vesper Sage ("Hound and Sage"). A pair adds no attacks of its own. The rules, the status tags and the numbers are in section 11, "Two bosses in one fight".

## 8. Feel (v1)
```

Second, section 9. Replace

```
- Browser storage can be cleared by Android, so export regularly.
```

with

```
- **Two-boss fights** (schema version 6, **DEFAULT** until the owner has played a pair; format in `docs/stats.md`): a pair fight is recorded like any other fight, with the pair's id (for example `"hound-and-sage"`) as `bossId`. Each attack occurrence says which boss made it (`boss`: 0 for the first-listed boss, 1 for its partner), and the analysis has one entry per boss (`bosses`) next to the totals over both bosses. One-boss fights and older records read as before.
- Browser storage can be cleared by Android, so export regularly.
```

Third, section 11. The last bullet of the section (Backgrounds, step 1) is followed by a blank line and the heading `## 12. Open points`. Insert the new bullet on the line right after that Backgrounds bullet, keeping the blank line before the heading. With the Edit tool: `old_string` is a newline, a blank line and then `## 12. Open points` (in the file: an end of line, an empty line, the heading), and `new_string` is an end of line, the bullet below, an empty line and the heading. The bullet to insert (one single line, two spaces of indent, like the bullets around it):

```
  - **Two bosses in one fight** (built 2026-09-29, awaiting the owner's play test; design in `docs/superpowers/specs/2026-09-29-two-boss-fights-design.md`, plans in `docs/superpowers/plans/2026-09-29-two-boss-fights-engine.md` and `docs/superpowers/plans/2026-09-29-two-boss-fights-play-a-pair.md`, pair file format in `docs/bosses.md`, stats in `docs/stats.md` schema version 6, checklist in `docs/phone-testing.md`, "Two bosses in one fight"; what is left out is in `docs/backlog.md`). **LOCKED** (owner, 2026-09-29): two bosses fight the player in the same fight, to train reading two threats at once and positioning between two enemies. The bosses **take turns**: a boss may not start an attack while the other holds the turn, and the turn lasts through the whole attack, the shots it fired and its chain. Each boss has **its own health bar** and **both must fall** to win. The sword **hurts only the nearest boss in reach**, one boss per swing. When one boss falls, the **survivor is enraged** (shorter waits, faster walking). A pair is a **named pair file built from two existing bosses**, and each pair is its own choice on the Boss row; **generated bosses stay solo**. The difficulty dials apply to both bosses at once. The **first pair is the Ashen Hound and the Vesper Sage** (owner's choice). Each boss showing its attacks in turn in the study was also agreed, and is **deferred** (see below). **DEFAULT** (proposed by Claude, not yet approved): if both bosses are ready in the same update, the one that has waited longer goes first, then the first-listed; the pair's id and name (`hound-and-sage`, "Hound and Sage"); each boss's health scale, 0.6 for both (applied before the difficulty dial); the enrage strength, waits times 0.6 and walking speed times 1.3; the arena and backdrop of the first-listed boss (the Hound, so a flat floor); the study is switched off for pair fights until a per-boss study is built (the fight is recorded with `study: 0`); two health bars stacked at the top right, the first-listed boss above, each in its boss's colour with its name and a fallen boss's bar dimmed; a small pulsing triangle above the boss that holds the turn; the same shake, flash and freeze for a knocked-down boss as for a defeated one. **Every pair number is a first guess**: the health scales and the enrage strength are checked only with scripted players (an idle player must lose, the turn rule must hold, a player who cannot die and only chases and swings must be able to win; `tests/hound-and-sage.test.ts`) and are to be tuned from the owner's play test.

## 12. Open points
```

Fourth, section 12. Replace

```
- Final parameter list per boss (grows while building).
```

with

```
- Final parameter list per boss (grows while building).
- The numbers of the first pair (Hound and Sage): each boss's health scale (0.6) and the enrage strength (waits times 0.6, walking times 1.3) are first guesses, to be tuned from the owner's play test.
```

Check the result reads right:

```bash
grep -n "Two bosses in one fight\|Pairs of bosses\|Two-boss fights\|numbers of the first pair" docs/SPEC.md | cut -c1-90
```

Expected: four lines, one in each of sections 7, 9, 11 and 12 (in that order).

- [ ] **Step 3: Add the phone checklist**

In `docs/phone-testing.md`, replace the line

```
## Redo after a fight
```

with the section below followed by that same line:

```
## Two bosses in one fight (Hound and Sage)
A new choice on the **Boss** row, after the single bosses and before Generated: **Hound and Sage**. The Ashen Hound (a low, fast beast that dashes and leaps) and the Vesper Sage (a caster that keeps its distance and fires bolts and lobbed arcs) fight you together, on the Hound's flat floor. The point of the mode is to read two threats at once: who is about to attack, and where to stand between them.

### What to expect
- **Two health bars** at the top right, stacked: the Hound's on top and the Sage's under it, each in its boss's colour with its name. You have to bring both to zero.
- **Turns**: the two bosses never attack at the same time. While one is walking up to an attack, attacking, or has its bolts still in the air, the other waits (it may still walk about). A small pulsing triangle above one boss shows who holds the turn, so you can tell who is about to attack.
- **Your sword** hurts only the nearest boss in reach, one boss per swing. Counters work on whichever boss you counter.
- **When one boss falls**: it drops out of the fight, its shots disappear, its health bar dims, and the other boss gets angrier: it waits less between attacks and walks faster. The fight ends when both are at zero.
- **Study** is not used with this pair: Fight starts the real fight straight away, whatever the Study row says. Easy, Normal, Hard and Tweak change both bosses at once.
- The health numbers and the angry-survivor numbers are first guesses. Please say what they feel like.

### Checklist
- [ ] Hound and Sage is on the Boss row (after the single bosses, before Generated), the menu remembers it after closing and reopening the app, and Fight starts it.
- [ ] Both bosses are on screen at the start and stay in view during the fight, including when one is in a corner and the other is next to you. Neither hides behind the other for long.
- [ ] The two health bars are readable at arm's length on the phone: you can tell which is which by colour and name, and read how much is left on each without stopping to look.
- [ ] The turn marker is easy to see without being distracting, and it moves to the other boss when the turn changes. You can tell who is about to attack from it before the warning starts.
- [ ] You never see the two bosses attack at the same time. One boss's bolts do not overlap with the other boss's attack.
- [ ] A swing near both bosses hits only the nearer one, and the health bar of that boss goes down.
- [ ] When the first boss falls, its bar dims, its shots vanish, and the survivor is clearly quicker (shorter waits, faster walking), but its warnings are still long enough to react to.
- [ ] The fight ends in victory only when both bars are at zero.
- [ ] After a win, a loss and leaving with the top button, the summary appears and shows the health left of each boss.
- [ ] Stats save and export. In the file, that fight's `bossId` says `"hound-and-sage"`, `study` is 0, and the analysis has two entries in `bosses`.
- [ ] Redo and Fight again work on the pair the same way as on a single boss.
- [ ] The phone stays smooth (no stutter) with both bosses, their effects and the turn marker on screen.

### Questions about the pair
- On Normal, is the fight too short, too long or about right? (Each boss has 60% of its usual health, so the whole fight is about as long as one solo boss and a half.)
- Is it clear whom to hit first and where to stand? Did you catch yourself watching only one boss?
- Is the angry survivor too easy, right, or a wall?
- Did one of the two bosses feel like it did most of the work?
- Did the Sage's bolts and the Hound's rushes ever feel like they came at once, even though only one boss attacks at a time?

## Redo after a fight
```

Check:

```bash
grep -n "^## Two bosses in one fight\|^## Redo after a fight" docs/phone-testing.md
```

Expected: two lines, the new section first.

- [ ] **Step 4: Add the backlog entry**

Append to the end of `docs/backlog.md` (leave one blank line before it):

```markdown

## Two-boss fights, left out (raised 2026-09-29)
Built: two bosses in one fight as a named pair, first pair Hound and Sage (`docs/SPEC.md` section 11, "Two bosses in one fight"; checklist in `docs/phone-testing.md`). Not built:
- **A study for pairs**: each boss showing its attacks in turn (agreed in the design). The first version switches the study off for pair fights and records `study: 0`.
- **More pairs**: only Hound and Sage exists. A new pair is a small file plus the same checks in `tests/hound-and-sage.test.ts`; bosses were tuned for solo fights, so each pair needs its own health scales and enrage strength.
- **Generated pairs, and "any two bosses" chosen from the menu**: generated bosses stay solo, and every pair is its own file.
- **Bosses attacking at the same time**: a later step could allow overlap as a difficulty dial, or in a pair's second stage.
- **Bosses that move with or shield each other, or share attacks.**
- **A fairness check for pairs in the generator**: `checkFairness` and its skilled bot (`src/bosses/generate/fairness.ts`) work on one boss and read only the primary. Pairs are checked by `tests/hound-and-sage.test.ts` (an idle player loses, the turn rule holds, both bosses get turns, a player who cannot die and only chases and swings can win); there is no scripted player that dodges a pair, so "a good player can win without being hit" is not checked for pairs.
```

- [ ] **Step 5: Commit the docs**

```bash
git status --short
git add docs/SPEC.md docs/phone-testing.md docs/backlog.md
git commit -m "docs: two-boss fights in the spec, phone checklist for Hound and Sage, backlog of what is left out"
```

Expected: `git status --short` lists only those three files; the commit succeeds. No attribution line in the message.

- [ ] **Step 6: Write the pair checks**

Create `tests/hound-and-sage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, VESPER_SAGE } from '../src/bosses';
import { GEN } from '../src/bosses/generate/tuning';
import { HOUND_AND_SAGE } from '../src/bosses/pairs';
import { resolveFight } from '../src/bosses/resolve';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DT } from '../src/engine/time';
import { NORMAL_DIALS, applyDialsToFight, presetDials, type PresetId } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { PLAYER, WORLD } from '../src/game/params';
import { allBosses, createInitialState, isDowned, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { holdsTurn } from '../src/game/turns';
import { withInput } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const PRESETS: PresetId[] = ['easy', 'normal', 'hard'];
const LONG_RUN = 3600;
const CHASE_CAP = 10800;

const pairFight = (seed: number, preset: PresetId = 'normal'): FightDef =>
  applyDialsToFight(resolveFight(HOUND_AND_SAGE.id, seed).fight, presetDials(preset));

function stand(fight: FightDef, seed: number, x: number, health?: number): GameState {
  const s = createInitialState(fight, seed);
  s.player.x = x;
  s.player.prevX = x;
  if (health !== undefined) s.player.health = health;
  return s;
}

/** Runs `bot` until the fight ends or `cap` updates pass; `each` sees every state. */
function play(
  fight: FightDef,
  start: GameState,
  cap: number,
  bot: (s: GameState) => InputFrame,
  each: (s: GameState) => void = () => {},
): GameState {
  let s = start;
  for (let n = 0; n < cap && s.phase === 'fight'; n++) {
    s = step(s, bot(s), fight);
    each(s);
  }
  return s;
}

/** Runs at the nearest boss still standing and swings once close enough; never dashes, jumps or dodges. */
function chaser(s: GameState): InputFrame {
  const p = s.player;
  const perUpdate = PLAYER.runSpeed * DT;
  const live = allBosses(s).filter((_, i) => !isDowned(s, i));
  let target = live[0]!;
  for (const b of live) if (Math.abs(b.x - p.x) < Math.abs(target.x - p.x)) target = b;
  const dx = target.x - p.x;
  return withInput({
    moveX: Math.max(-1, Math.min(1, dx / perUpdate)),
    attackPressed: Math.abs(dx) < PLAYER.attack.reach && p.attackTick < 0,
  });
}

describe('the Hound and Sage pair file', () => {
  it('is found by id and fights the Hound first, then the Sage, each with less health than alone', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    expect(HOUND_AND_SAGE.id).toBe('hound-and-sage');
    expect(fight.bosses.map((b) => b.id)).toEqual([ASHEN_HOUND.id, VESPER_SAGE.id]);
    expect(fight.bosses[0]!.maxHp).toBeGreaterThanOrEqual(1);
    expect(fight.bosses[0]!.maxHp).toBeLessThan(ASHEN_HOUND.maxHp);
    expect(fight.bosses[1]!.maxHp).toBeGreaterThanOrEqual(1);
    expect(fight.bosses[1]!.maxHp).toBeLessThan(VESPER_SAGE.maxHp);
    expect(fight.enrage).not.toBeNull();
  });

  it('is the same fight at Normal difficulty as the file gives', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    expect(applyDialsToFight(fight, NORMAL_DIALS)).toEqual(fight);
  });

  it('makes the survivor wait at least a quarter of a second and leaves its warnings unchanged', () => {
    const fight = resolveFight('hound-and-sage', 1).fight;
    fight.enraged.forEach((boss, i) => {
      for (const phase of boss.phases) expect(phase.gap).toBeGreaterThanOrEqual(15);
      expect(boss.attacks.map((a) => a.windup)).toEqual(fight.bosses[i]!.attacks.map((a) => a.windup));
    });
  });
});

describe('an idle player always loses to the pair', () => {
  it('at every preset and seed, within the same cap the boss generator uses', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        const fight = pairFight(seed, preset);
        const end = play(fight, createInitialState(fight, seed), GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `${preset} seed ${seed}`).toBe('defeated');
      }
    }
  });

  it('standing still in either corner', () => {
    for (const x of [30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const fight = pairFight(seed);
        const end = play(fight, stand(fight, seed, x), GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `x ${x} seed ${seed}`).toBe('defeated');
      }
    }
  });

  it('after the Sage has fallen and the Hound is enraged, and the other way round', () => {
    for (const fallen of [0, 1]) {
      for (const seed of [1, 2, 3, 4]) {
        const fight = pairFight(seed);
        const start = createInitialState(fight, seed);
        allBosses(start)[fallen]!.hp = 0;
        const end = play(fight, start, GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `fallen ${fallen} seed ${seed}`).toBe('defeated');
      }
    }
  });
});

describe('the turn rule over whole runs of the real pair', () => {
  /** A player who cannot be beaten and never moves, so the bosses keep attacking for a full minute. */
  function watch(seed: number, x: number) {
    const fight = pairFight(seed);
    let bothAttacking = 0;
    let bothHolding = 0;
    const attackStarts = [0, 0];
    let last = allBosses(createInitialState(fight, seed)).map((b) => b.mode);
    const end = play(fight, stand(fight, seed, x, 1_000_000), LONG_RUN, () => NO_INPUT, (s) => {
      const bosses = allBosses(s);
      if (bosses.filter((b) => b.mode === 'attack').length > 1) bothAttacking++;
      if (bosses.filter((_, i) => holdsTurn(s, i)).length > 1) bothHolding++;
      bosses.forEach((b, i) => {
        if (b.mode === 'attack' && last[i] !== 'attack') attackStarts[i]!++;
      });
      last = bosses.map((b) => b.mode);
    });
    return { end, bothAttacking, bothHolding, attackStarts };
  }

  it('never has two bosses attacking, or two holding the turn, on the same update', () => {
    for (const x of [PLAYER.startX, 30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const r = watch(seed, x);
        expect(r.bothAttacking, `attacking, x ${x} seed ${seed}`).toBe(0);
        expect(r.bothHolding, `holding, x ${x} seed ${seed}`).toBe(0);
      }
    }
  });

  it('gives each boss its turn: both attack again and again, neither starves', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = watch(seed, PLAYER.startX);
      expect(r.end.phase).toBe('fight');
      expect(r.attackStarts[0], `Hound, seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(r.attackStarts[1], `Sage, seed ${seed}`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('the pair can be beaten', () => {
  it('a player who cannot die, chases the nearest boss and swings ends in victory with both bosses at zero', () => {
    for (const seed of [1, 2, 3, 4]) {
      const fight = pairFight(seed);
      const end = play(fight, stand(fight, seed, PLAYER.startX, 1_000_000), CHASE_CAP, chaser);
      expect(end.phase, `seed ${seed}`).toBe('victory');
      expect(allBosses(end).every((b) => b.hp <= 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run the pair checks**

```bash
npx vitest run tests/hound-and-sage.test.ts
```

Expected: 1 file passed, 9 tests passed, in a few seconds. These are checks of finished work, so they should pass at once. **If one fails, do not loosen it.** A failure means the real pair does something the design does not allow (two bosses attacking together, a boss that never gets a turn, an idle player who survives, a fight nobody can win). Read the message (it names the preset, seed or position), find the cause in Tasks 1-9 or in the pair numbers, and fix that; if the fix is a change of a pair number, tell the owner.

Then check the file is type-correct:

```bash
npm run typecheck
```

Expected: no output errors.

- [ ] **Step 8: Commit the checks**

```bash
git add tests/hound-and-sage.test.ts
git commit -m "test: idle player loses, turns hold and both bosses act in the Hound and Sage fight"
```

- [ ] **Step 9: Run the whole suite and the build**

```bash
npm test
npm run typecheck
npm run build
npm run check:dist
```

Expected: `npm test` passes every file (the Ember Duelist golden test and every replay test unedited); typecheck is clean; the build finishes and writes `dist/` with `dist/sw.js`; `check:dist` passes (CSP meta tag present, no inline script or style, no `data:` URI, every file in the precache list). Then:

```bash
git status --short
```

Expected: nothing to commit, and no exported stats file or player data in the tree. If the build or `check:dist` fails, fix the cause in the task that introduced it; do not edit the check.

- [ ] **Step 10: The owner plays the pair and reports the feel**

Tell the owner, in plain words:

> The Hound and Sage pair is built. On the phone, open the game, set the Boss row to "Hound and Sage", the Difficulty row to Normal, and fight it a few times (the checklist is in `docs/phone-testing.md`, section "Two bosses in one fight"). Please tell me: is the fight too short, too long or about right? Is it clear which boss is about to attack, and can you read both health bars? Is the angry survivor too easy, right or too hard?
>
> Two numbers in the pair file are first guesses and I want your feel before I tune them: how much health each boss has (60% of its normal health) and how much angrier the survivor gets (waits 40% shorter, walks 30% faster). I have checked the pair with computer players, not with a person, so the feel is still unknown.

What the computer players showed (measured while drafting this task on a hand-built copy of the pair with these same numbers, at Normal unless said; quote them only if the real pair file still has the numbers 0.6, 0.6, 0.6 and 1.3, otherwise re-measure first):
- A player who does nothing is defeated after 7 to 10 seconds on Normal (9 to 12 on Easy, 4 to 6 on Hard).
- A player who only runs at the nearest boss and swings, never dodging, wins 7 of 8 seeds on Normal, after taking 3 or 4 of its 5 hits; on Easy it wins every seed; on Hard it loses every seed. Raising the health scale to 0.8 makes it lose all 8 on Normal, and at full health (1.0) it loses 7 of 8. So the health scale decides a lot. At 0.6 the fight is quick: a solo Hound or Sage at full health dies to that same player in about 8 to 9 seconds, the pair in about 11 to 13.
- Both bosses take turns: over a full minute the Hound starts about 22 to 26 attacks and the Sage 16 to 19, and never together.

The owner's reply decides the numbers. Do not tune them without it.

- [ ] **Step 11: Apply the owner's tuning, if any**

If the owner asks for different numbers, change them in the pair file (health scales and `enrage`), run `npx vitest run tests/hound-and-sage.test.ts` (all 9 must still pass), then:
- If the owner had already exported pair fights recorded with the old numbers, bump `GAME_VERSION` in `src/stats/record.ts` (they no longer replay exactly) and add one line about it to the version list in `docs/stats.md` section 9.
- Update the numbers written in `docs/SPEC.md` (section 11 entry and section 12 open point) and in the "Questions about the pair" text of `docs/phone-testing.md` (the 60% figure).
- If the owner is happy with the numbers, change the SPEC tags for those numbers from DEFAULT to LOCKED and remove the section 12 open point.
- Re-run Step 9 and commit with a plain message such as `tune: Hound and Sage health scale 0.7`.

- [ ] **Step 12: Hand over**

Report to the owner: what was built, that everything is committed on the branch or on `main` (whichever the work was done on) and nothing is pushed, and that **the owner decides whether to push**. Do not run `git push`.

# Stats format

What the game records about every fight, how it is stored and exported, and what each field means. Everything here matches `src/stats/record.ts` (the record and the versions), `src/stats/input-log.ts` (the input encoding), `src/stats/analyze.ts` (every measurement), `src/stats/store.ts` (storage) and `src/stats/export.ts` (the export file). If you change any of those, update this file and the tests. The design behind it is in `docs/superpowers/specs/2026-09-20-m3b-design.md`; the study phase (schema version 2) is in `docs/superpowers/specs/2026-09-21-m5b-study-phase-design.md`.

## 1. Purpose and privacy

- Every fight that ran is saved on the device, in the browser's IndexedDB (database `boss-trainer`, store `fights`, key `id`). A fight that is left before its first update ran is not saved.
- Nothing is uploaded. There is no backend and no account. The Stats screen has an **Export** row that builds one file and hands it to the phone's share sheet (or saves it as a download on a PC). The player then sends the file wherever they choose, for example to Claude for analysis.
- Android can clear browser data, so export now and then. Delete on the Stats screen removes every saved fight from the device (it asks twice).
- Exports are never committed. `.gitignore` covers `*.stats.json`, `*.stats.csv`, `/stats/`, `/stats-export/` and `/exports/` (SPEC section 4, rule 6).
- CSV is not built (SPEC section 9, still open).

## 2. The main idea: record the input, measure by replay

The game is deterministic. A fight is fully described by the boss, the difficulty dials, the seed, the study setting (0, 1 or 2 rounds, section 7.5) and the input given to each update. So a record stores exactly that (small and exact), and the measurements in `analysis` are produced by replaying the fight through the real game (`analyzeFight`). The analysis is computed when the fight ends and stored in the record. Because it is only a function of the rest of the record, it can be recomputed or extended later from old files.

## 3. Units

- **1 update = 1000/60 ms** (16.67 ms). The game runs 60 updates per second (`TICK_RATE` in `src/engine/time.ts`). Fields ending in `Ticks` (and `ticks`, `startTick` and so on) count updates.
- The short freeze on impact (hit freeze) pauses updates and is **not counted**: the fight only advances when an update runs, and only updates are recorded.
- Fields ending in `Ms` are `ticks * 1000 / 60`, rounded to 0.1 ms.
- Ticks are numbered from 1: the first update of a fight is tick 1 (`tick` is the count after the update ran). Tick 0 is the state before any update.
- Distances and x positions are world units (the arena is 1280 wide and the floor is at y = 640; see `docs/bosses.md`). Distance between the player and the boss is measured centre to centre along x.
- Health is in health points. The player starts with 5 (`PLAYER.maxHealth`); some attacks cost more than 1 (the Damage dial).

## 4. The export file

A single JSON document (written without indentation), named `boss-trainer-YYYY-MM-DD.stats.json` where the date is the UTC date of the export (for example `boss-trainer-2026-09-21.stats.json`). The name always ends in `.stats.json`, which git ignores.

| Field | Type | Meaning |
|---|---|---|
| `format` | string | Always `"boss-trainer-stats"`. |
| `schemaVersion` | number | Version of this format (see section 9). Currently 2. |
| `exportedAt` | string | ISO 8601 date-time (UTC) when the file was built. |
| `gameVersion` | string | `GAME_VERSION` of the game that built the file (see section 9). Each fight also carries its own. |
| `fights` | array | Every saved fight, oldest first (by `playedAt`, then `id`). Each is a fight record (section 5). |

## 5. A fight record

One entry of `fights`. Every field is always present in a record written by the current game (a record of schema version 1 lacks `study`, see section 9).

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | The format version this record was written with (2 for records written by the current game; 1 for older ones, see section 9). |
| `gameVersion` | string | The game version it was played on. A replay is only valid with the same version (section 8). |
| `id` | string | `<playedAt>#<seed in hexadecimal>`. Unique key of the record. |
| `playedAt` | string | ISO 8601 date-time (UTC) when the fight began. |
| `attempt` | number | The number of fights saved on the device when this one was saved, plus one. So it counts fights across all bosses and difficulties, and starts again from 1 after "Delete all fights". It is not per boss or per preset. |
| `bossId` | string | The boss file's id, for example `"ember-duelist"`. |
| `presetId` | string | The preset the fight began from: `"easy"`, `"normal"` or `"hard"`. |
| `dials` | object | The seven difficulty dials actually used, as numbers where 1 is the boss file as written: `speed`, `frequency`, `readability`, `health`, `damage`, `range`, `variety` (ranges and meanings in `src/game/difficulty.ts`). |
| `changedDials` | string[] | The dial ids whose value differs from the preset `presetId` (empty when the fight is that preset unchanged). |
| `seed` | number | The seed of the fight's random generator, an unsigned 32-bit integer. |
| `study` | number | The study setting the fight was played with: the number of study rounds before the real fight, 0 (Off), 1 (Once) or 2 (Twice). See section 7.5. A record of schema version 1 has no `study` field, and that means 0. |
| `result` | string | `"victory"`, `"defeat"` or `"left"` (the player left with the top button while the fight was still going). |
| `ticks` | number | How many updates ran, the study included. A win or loss counts up to and including the update that ended it; the pause after it (before the game would restart) is not part of the fight. |
| `input` | array | The input of every update, run-length encoded (section 6). |
| `analysis` | object | The measurements (section 7). |

## 6. The `input` encoding

`input` is an array of runs. Each run is `[packed, count]`: the same input was given to `count` updates in a row. Expanding every run in order gives one entry per update, `ticks` entries in all.

`packed` is a small integer with this bit layout (`src/stats/input-log.ts`):

| Bit(s) | Value | Meaning |
|---|---|---|
| 0-1 (`packed & 3`) | 0, 1 or 2 | Move direction plus one: 0 is left, 1 is none, 2 is right. `moveX = (packed & 3) - 1`. The pattern 3 is invalid (the game never writes it); on replay it is read as right (+1). |
| 2 (`4`) | 0 or 1 | Jump button held. |
| 3 (`8`) | 0 or 1 | Jump pressed on this update. |
| 4 (`16`) | 0 or 1 | Attack pressed on this update. |
| 5 (`32`) | 0 or 1 | Dash pressed on this update. |

Menu-only fields (up and down, confirm, alt) are not part of a fight and are not stored. Examples: `[1, 40]` is 40 updates of no input; `[2, 12]` is 12 updates of holding right; `[13, 1]` is one update of jump pressed and held with no direction (`1 + 4 + 8`); `[18, 1]` is one update of holding right and pressing attack (`2 + 16`).

## 7. The `analysis` object

Computed by `analyzeFight` by replaying the record. Nothing here is guessed: a value the analyzer cannot measure exactly is `null`.

### 7.1 The fight

| Field | Type | Meaning |
|---|---|---|
| `ticks` | number | Updates the whole session ran, the study included (same as the record's `ticks`). |
| `seconds` | number | `ticks / 60` (not rounded): the **whole session**, the study included. |
| `fightSeconds` | number | The real fight only: `(ticks - study.ticks) / 60` (not rounded). Equal to `seconds` when there was no study. |
| `phaseReached` | number | Highest boss phase reached, 1-based. |
| `phaseCount` | number | How many phases the boss has. |
| `bossHpLeft` | number | Boss health at the end. |
| `bossMaxHp` | number | Boss health at the start, with the Health dial applied. |
| `damageDealt` | number | `bossMaxHp - bossHpLeft`. |
| `damageTaken` | number | Health the player actually lost. A blow larger than the health left counts only what was left (a 2-health hit on 1 health counts 1). The study takes no health, so it never counts here. |
| `hitsTaken` | number | How many times the player was hit (a count of hits, not of health). A demonstration that reaches the player in the study (`studyHit`) is not counted here; it is counted in `study.hits`. |
| `bossHitTicks` | number[] | The tick of each hit the player landed on the boss. The boss cannot be hurt in the study, so every entry is from the real fight. |
| `playerHitTicks` | number[] | The tick of each hit the boss landed on the player (real hits only, never a `studyHit`). |
| `swings` | number | Attack swings started by the player. |
| `swingsThatHit` | number | Swings that hit the boss (at most one hit per swing). |
| `accuracy` | number or null | `swingsThatHit / swings`; `null` when the player never swung. |
| `counters` | number | Counters landed. |
| `dashes` | number | Dashes started. |
| `jumps` | number | Jumps started (the player leaving the ground upward; a hop and a full jump both count once). |
| `attacks` | array | One entry per boss attack occurrence (7.2), the study's demonstrations included (flagged by `study`). |
| `study` | object | The study phase (7.5). |
| `behavior` | object | 7.3. |

### 7.2 An attack occurrence (each entry of `attacks`)

One boss attack, from the moment its warning began. Entries are in the order the attacks began.

| Field | Type | Meaning |
|---|---|---|
| `attackId` | string | The attack's id in the boss file (for example `"sweep"`). |
| `phase` | number | The boss phase (1-based) when the warning began. |
| `startTick` | number | The tick on which the warning began. This is attack time 0. |
| `windupTicks` | number | The length of the warning (the attack's windup, after the Warning length dial). |
| `firstDangerTick` | number | The first tick on which the attack could hurt: `startTick` plus the start of its earliest hit window. |
| `distance` | number | Distance to the player when the warning began, in world units, rounded to 0.1. |
| `playerActionAtStart` | string | What the player was doing then (see below). |
| `outcome` | string | `"hit"`, `"countered"`, `"dodged"` or `"interrupted"` (see below). For a demonstration in the study, `"hit"` means it reached the player (a `studyHit`); it took no health. |
| `evasion` | string or null | How a dodged attack was avoided: `"dash"`, `"jump"` or `"distance"`. `null` unless `outcome` is `"dodged"`. Exact rule: `"dash"` means the dash carried the player through a dangerous box; `"jump"` means the player was in the air above a box that would have hit them on the ground; everything else is `"distance"`. That includes a dash or jump that got the player clear before the boxes went live, so an early evasive dash has no `marginTicks` and counts as `"distance"`. |
| `reactionTicks`, `reactionMs` | number or null | See below. |
| `marginTicks`, `marginMs` | number or null | See below. |
| `damageTaken` | number | Health this attack actually took from the player; 0 when it did not hit. Always 0 for a demonstration in the study. |
| `playerActionWhenHit` | string or null | What the player was doing when hit; `null` when not hit. Also set for a demonstration that reached the player. |
| `study` | boolean | `true` for a demonstration in the study, `false` for an attack of the real fight. Decided on the update the attack's warning began: an attack that began in the study is a demonstration for its whole length, even if it ends on the update the study ends. |

**Player action** (`playerActionAtStart`, `playerActionWhenHit`) is one of, checked in this order: `"dashing"` (in a dash), `"attacking"` (in a swing), `"airborne"` (off the ground), `"running"` (on the ground with a direction held), `"idle"`. It is read from the state after that update and the input given to it.

**Outcome.** The attack's "last dangerous update" is the last update of its latest hit window. In order:
1. `"countered"`: the player countered it (it was cancelled and the boss staggered). This wins over everything else.
2. `"hit"`: it hurt the player (in the study: it reached the player, see 7.5).
3. `"dodged"`: it lived to its last dangerous update without hurting the player and without being countered. This holds even if the fight ended during the attack's recovery.
4. `"interrupted"`: it was cut short before its last dangerous update, without a hit or a counter: the fight ended or was left, or a phase change cancelled it. It says nothing about the player's skill.

**Evasion** (only for `"dodged"`), judged against the hit boxes that were really dangerous on each update of the attack:
- `"dash"`: only when the dash carried the player through a dangerous box (the player was dashing while their real box overlapped a dangerous box; the dash made them invulnerable).
- `"jump"`: only when the player was in the air, not dashing, and not touching a dangerous box, while the same box would have hit them had they been standing on the floor at the same x.
- `"distance"`: everything else (the player was simply out of reach, or moved out of it on the ground).
A dash takes priority over a jump when both happened.

**Dodge action.** A dash or a jump the player started during the attack, at attack time up to and including the end of the last dangerous update. The first one is what `reactionTicks` and `marginTicks` measure. A dash or jump started before the warning began does not count.

**`reactionTicks`** (and `reactionMs`): from `startTick` to the first dodge action, if that action began no later than `firstDangerTick`. `null` when the player made no dodge action, or made the first one after `firstDangerTick`. It is measured whatever the outcome (a hit or a `"distance"` dodge can also have one).

**`marginTicks`** (and `marginMs`): `firstDangerTick` minus the tick the first dodge action began. Set only when the player made a dodge action **and** the outcome is `"hit"`, or `"dodged"` by `"dash"` or `"jump"`; otherwise `null`. A small positive number is a late, tight dodge; a large one is an early dodge. **Negative means the dodge began after the first dangerous update** (too late for a hit; a dash that still carried the player through a later part of the attack).

### 7.3 `behavior`

| Field | Type | Meaning |
|---|---|---|
| `updatesClose` | number | Updates spent at a distance below 160 from the boss, over the **whole session** (study included). |
| `updatesMid` | number | Updates at 160 to 400 (both included), whole session. |
| `updatesFar` | number | Updates above 400, whole session. The three add up to `ticks`. |
| `studyUpdatesClose` | number | How many of `updatesClose` happened in the study. |
| `studyUpdatesMid` | number | How many of `updatesMid` happened in the study. |
| `studyUpdatesFar` | number | How many of `updatesFar` happened in the study. The three add up to `study.ticks`. |
| `positionEvery` | number | 6: the player's x is sampled once every 6 updates (10 per second). |
| `positions` | number[] | The player's x, rounded, on ticks 6, 12, 18 and so on (`positions[i]` is the tick `6 * (i + 1)`), over the **whole session**. |
| `punish` | object | Punish windows (below). |

**Punish windows.** When an attack was not countered, its recovery is a chance to hit the boss. Attacks of the study (`study` true) never open a window: the boss cannot be hurt in the study. The window opens when the attack reaches its recovery (windup plus active updates).
- `opened`: windows that opened. Always `taken + missed`.
- `taken`: windows in which the player hit the boss.
- `missed`: windows that closed without a hit.
A window is counted only when it closed (the attack ended and the boss moved on) or was hit. If the fight ended or was left while a window was still open and unhit, it is not counted: the player did not get the chance to use it.

Known limitation: a window is also not counted when the player's punishing hit lands on the very first update of the recovery and that hit triggers a phase change (the phase change cancels the attack on that same update, so the window never registers as open). This is rare and the analyzer does not correct for it.

**Not measured yet: "greedy" attacks** (SPEC section 9: the player attacks when they should not). They are still not measured, and this is "not measured yet", not "impossible". At the preset difficulties (a custom "Warning length" of about 0.7 makes the Hound's bite warn for only 15 updates, so this can change), no boss exists yet where a swing started in a punish window can overlap the next danger window: the player's swing lasts 16 updates (3 startup, 4 active, 9 recovery), and the earliest a following attack can hurt is 22 updates after its warning starts (the Ashen Hound's bite; its slip warns for 18 but never hurts, and the Ember Duelist's attacks all warn for 24 or more). Even a swing started on the last update of a recovery has therefore ended by then. This was checked by hand against the two boss files, not proven for every possible boss. They will be added, with a `schemaVersion` bump, when a boss can make them happen.

### 7.4 Attacks that move the boss

Some attacks move the boss (a dash, a leap, or a move that only repositions). The fields in 7.2 still work, but they mean different things for these attacks, so read them with care.
- `windupTicks` is always the length of the warning. For a leap (the Hound's pounce) the dangerous moment is the shockwave at the landing, not the take-off: `firstDangerTick` is the start plus the `from` of the first hit window, which for the Hound is exactly the landing. The pounce's `reactionTicks` can therefore be up to 52 for the Hound (crouch and flight together), so it is not comparable with a slam's.
- An attack with no hit windows (a reposition-only attack such as the Hound's slip) has no danger window: the analyzer falls back to the whole active part (from `windupTicks` to `windupTicks` plus `active`). Such an attack always scores `"dodged"` with evasion `"distance"` (it cannot hurt, and nothing can dash through it), unless it was cut short, when it is `"interrupted"`.
- Compare reaction times per attack id, never across kinds of attack.

### 7.5 The study phase

With the menu's Study row on Once or Twice, a fight begins with a study (schema version 2). The boss demonstrates every attack of its **first phase**, once per round, each round in its own random order, using its normal warning, speed and pause. Nothing can hurt the player and the boss cannot be hurt; counters do nothing. The real fight begins on the update after the study ends, with everything else unchanged (the boss at full health, in its normal waiting pause). The attacks shown are the ones the boss has in its first phase **after the dials are applied**, so a low Variety dial removes attacks from the study too. Because of that, the number of demonstrations per round is not fixed, and `study.rounds` is passed in from the record rather than inferred.

`analysis.study`:

| Field | Type | Meaning |
|---|---|---|
| `rounds` | number | The record's `study` (0, 1 or 2). Taken from the record, not worked out from the fight. |
| `ticks` | number | How many updates the study took: the tick on which its last demonstration finished (the tick of the `studyEnd` event). The real fight is every update after that. If the fight was left while the study was still on, the number of updates played. 0 when there was no study. |
| `attacks` | number | Demonstrations shown: the number of entries in `attacks` with `study` true. |
| `hits` | number | `studyHit` events: how many times a demonstration reached the player. Normally at most one per demonstration (the short untouchability after a hit stops one attack from counting twice). |

How to read a study fight:
- **Compare the study with the real fight** by filtering `attacks` on `study`: the same fields (`outcome`, `evasion`, `reactionTicks`, `marginTicks`, `distance`, `playerActionAtStart`) are measured the same way in both. A demonstration that reached the player has outcome `"hit"`, `damageTaken` 0 and `playerActionWhenHit` set.
- **Fight-level totals are for the real fight in what they measure about damage**: `hitsTaken`, `damageTaken`, `playerHitTicks` and `damageDealt` count real events only (a `studyHit` is in none of them).
- **The behaviour numbers cover the whole session**, not only the real fight: `swings`, `dashes`, `jumps`, `counters` (0 in the study anyway), `updatesClose/Mid/Far` and `positions` all include the study. To get the real fight, subtract: `updatesClose - studyUpdatesClose` (same for Mid and Far), and for `positions` drop the first entries: `positions[i]` is tick `6 * (i + 1)`, so the study part is the entries whose tick is at most `study.ticks`. `swings` and `dashes` are not split by study; take them from the input if you need it.
- **Time**: `seconds` is the whole session and `fightSeconds` is the real fight only, `(ticks - study.ticks) / 60`. In the app's summary the fight time excludes the study and the study time is shown separately; those two are computed from updates in floating point, so `seconds + studySeconds` there is not always exactly `ticks / 60`.
- **The random generator**: the study's random order uses the fight's seeded generator before the fight starts (a shuffle of n attacks draws n - 1 numbers, once per round). So a fight with a study and the same seed and input without one is a different fight from the first real attack on. That is expected, and is why `study` is part of the record.
- **How long it is**: with nobody doing anything, Once took about 420 to 510 updates (7 to 8.5 seconds) and Twice about 770 to 975 (13 to 16 seconds) for the two bosses at Easy, Normal and Hard. A boss whose first phase has no attacks has no study at all (`study.ticks` 0, `study.attacks` 0).

## 8. Replaying a fight

To rebuild a fight exactly (this is what `replayFinalState` and `analyzeFight` do):

1. Use the same game: the record's `gameVersion` must equal the game's `GAME_VERSION`. Attack timings and player numbers live in the code and the boss file, so a different version may replay differently.
2. `boss = applyDials(bossById(record.bossId), record.dials)`.
3. `state = createInitialState(boss, record.seed, record.study ?? 0)`. The third argument is the number of study rounds (a value below 0 counts as 0 and a fraction is rounded down; the game only uses 0, 1 and 2). A record of schema version 1 has no `study`, so it replays with 0.
4. Expand `input` (section 6) into one frame per update. For each frame, `state = step(state, frame, boss)`. The frame's other fields (`moveY`, `confirm`, `alt`) are set to neutral.

After `ticks` steps the state is the one the fight ended in (or the state the study was still running in, if the fight was left during it). A test (`tests/record.test.ts`) checks that a recorded fight and its replay reach the same final state.

## 9. Versioning

- `schemaVersion` (`STATS_SCHEMA_VERSION` in `src/stats/record.ts`) is bumped **whenever the shape changes**: a field added, removed, renamed or given a new meaning, in the export, the record or `analysis`. Bump it and update this document and the tests in the same commit.
- `gameVersion` (`GAME_VERSION` in `src/stats/record.ts`, a string such as `"0.3.0"`) is bumped **when a change to the game numbers or to a boss file changes how a recorded fight replays**. Old records keep their old `gameVersion`, so it is clear which ones cannot be replayed by the current game.
- Adding a new measurement to the analyzer changes the shape, so it also bumps `schemaVersion`.
- **Version 1** was the format of M3b and M5a. **Version 2** (M5b, the study phase) added the record's `study`, the analysis's `study` object, `fightSeconds` and `behavior.studyUpdatesClose/Mid/Far`, and the `study` flag on each attack occurrence. Version-1 records and files remain valid: `study` missing means 0, and replaying or re-analysing one with `record.study ?? 0` gives the same fight as before (with the new fields filled in as for a fight without a study: `study.rounds` 0, `study.ticks` 0, `fightSeconds` equal to `seconds`, every `study` flag false, the study distance bands all 0). An analysis stored inside an old record was computed then and is not rewritten, so it has no `study` block and no `fightSeconds`. The schema version is 2 in the export document and in every record the current game writes.

## 10. Derived later, not stored

These are computed afterwards from many fights or many exports, and are not in the file: the learning curve, fatigue over a session, the hit rate of each attack across attempts, and the distribution of death causes and phases.

## 11. Size and archive

A fight of about 25 seconds is about 9 KB of JSON (input plus analysis); a two-minute fight is about 35 to 40 KB. Export reads every saved fight at once and builds one file, which is fine for hundreds of fights. So export and delete now and then: it keeps the file small and protects you if Android clears the browser data.

## 12. Example: one attack occurrence

A sweep at Normal, in the real fight (so `study` is `false`). The warning began on tick 1284 and lasts 24 updates, so the first dangerous update is 1308. The player dashed on tick 1296, 12 updates (200 ms) after the warning began and 12 updates before the danger, and the dash carried them through the sweep.

```json
{
  "attackId": "sweep",
  "phase": 1,
  "startTick": 1284,
  "windupTicks": 24,
  "firstDangerTick": 1308,
  "distance": 231.4,
  "playerActionAtStart": "running",
  "outcome": "dodged",
  "evasion": "dash",
  "reactionTicks": 12,
  "reactionMs": 200,
  "marginTicks": 12,
  "marginMs": 200,
  "damageTaken": 0,
  "playerActionWhenHit": null,
  "study": false
}
```

## 13. Example: a study occurrence

A sweep in the study of a fight played with Study set to Once. It began on tick 96, inside the study, so `study` is `true`. The player stood still; the sweep reached them, which is a `studyHit`. The occurrence is a `"hit"` with 0 damage, and it is not in `hitsTaken` or `playerHitTicks`.

```json
{
  "attackId": "sweep",
  "phase": 1,
  "startTick": 96,
  "windupTicks": 24,
  "firstDangerTick": 120,
  "distance": 218.6,
  "playerActionAtStart": "idle",
  "outcome": "hit",
  "evasion": null,
  "reactionTicks": null,
  "reactionMs": null,
  "marginTicks": null,
  "marginMs": null,
  "damageTaken": 0,
  "playerActionWhenHit": "idle",
  "study": true
}
```

Its fight then carries an `analysis.study` block such as `{ "rounds": 1, "ticks": 507, "attacks": 3, "hits": 2 }`, and the record carries `"study": 1`.

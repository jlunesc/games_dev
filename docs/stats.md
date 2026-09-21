# Stats format

What the game records about every fight, how it is stored and exported, and what each field means. Everything here matches `src/stats/record.ts` (the record and the versions), `src/stats/input-log.ts` (the input encoding), `src/stats/analyze.ts` (every measurement), `src/stats/store.ts` (storage) and `src/stats/export.ts` (the export file). If you change any of those, update this file and the tests. The design behind it is in `docs/superpowers/specs/2026-09-20-m3b-design.md`.

## 1. Purpose and privacy

- Every fight that ran is saved on the device, in the browser's IndexedDB (database `boss-trainer`, store `fights`, key `id`). A fight that is left before its first update ran is not saved.
- Nothing is uploaded. There is no backend and no account. The Stats screen has an **Export** row that builds one file and hands it to the phone's share sheet (or saves it as a download on a PC). The player then sends the file wherever they choose, for example to Claude for analysis.
- Android can clear browser data, so export now and then. Delete on the Stats screen removes every saved fight from the device (it asks twice).
- Exports are never committed. `.gitignore` covers `*.stats.json`, `*.stats.csv`, `/stats/`, `/stats-export/` and `/exports/` (SPEC section 4, rule 6).
- CSV is not built (SPEC section 9, still open).

## 2. The main idea: record the input, measure by replay

The game is deterministic. A fight is fully described by the boss, the difficulty dials, the seed and the input given to each update. So a record stores exactly that (small and exact), and the measurements in `analysis` are produced by replaying the fight through the real game (`analyzeFight`). The analysis is computed when the fight ends and stored in the record. Because it is only a function of the rest of the record, it can be recomputed or extended later from old files.

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
| `schemaVersion` | number | Version of this format (see section 9). Currently 1. |
| `exportedAt` | string | ISO 8601 date-time (UTC) when the file was built. |
| `gameVersion` | string | `GAME_VERSION` of the game that built the file (see section 9). Each fight also carries its own. |
| `fights` | array | Every saved fight, oldest first (by `playedAt`, then `id`). Each is a fight record (section 5). |

## 5. A fight record

One entry of `fights`. Every field is always present.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | The format version this record was written with. |
| `gameVersion` | string | The game version it was played on. A replay is only valid with the same version (section 8). |
| `id` | string | `<playedAt>#<seed in hexadecimal>`. Unique key of the record. |
| `playedAt` | string | ISO 8601 date-time (UTC) when the fight began. |
| `attempt` | number | The number of fights saved on the device when this one was saved, plus one. So it counts fights across all bosses and difficulties, and starts again from 1 after "Delete all fights". It is not per boss or per preset. |
| `bossId` | string | The boss file's id, for example `"ember-duelist"`. |
| `presetId` | string | The preset the fight began from: `"easy"`, `"normal"` or `"hard"`. |
| `dials` | object | The seven difficulty dials actually used, as numbers where 1 is the boss file as written: `speed`, `frequency`, `readability`, `health`, `damage`, `range`, `variety` (ranges and meanings in `src/game/difficulty.ts`). |
| `changedDials` | string[] | The dial ids whose value differs from the preset `presetId` (empty when the fight is that preset unchanged). |
| `seed` | number | The seed of the fight's random generator, an unsigned 32-bit integer. |
| `result` | string | `"victory"`, `"defeat"` or `"left"` (the player left with the top button while the fight was still going). |
| `ticks` | number | How many updates ran. A win or loss counts up to and including the update that ended it; the pause after it (before the game would restart) is not part of the fight. |
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
| `ticks` | number | Updates the fight ran (same as the record's `ticks`). |
| `seconds` | number | `ticks / 60` (not rounded). |
| `phaseReached` | number | Highest boss phase reached, 1-based. |
| `phaseCount` | number | How many phases the boss has. |
| `bossHpLeft` | number | Boss health at the end. |
| `bossMaxHp` | number | Boss health at the start, with the Health dial applied. |
| `damageDealt` | number | `bossMaxHp - bossHpLeft`. |
| `damageTaken` | number | Health the player actually lost. A blow larger than the health left counts only what was left (a 2-health hit on 1 health counts 1). |
| `hitsTaken` | number | How many times the player was hit (a count of hits, not of health). |
| `bossHitTicks` | number[] | The tick of each hit the player landed on the boss. |
| `playerHitTicks` | number[] | The tick of each hit the boss landed on the player. |
| `swings` | number | Attack swings started by the player. |
| `swingsThatHit` | number | Swings that hit the boss (at most one hit per swing). |
| `accuracy` | number or null | `swingsThatHit / swings`; `null` when the player never swung. |
| `counters` | number | Counters landed. |
| `dashes` | number | Dashes started. |
| `jumps` | number | Jumps started (the player leaving the ground upward; a hop and a full jump both count once). |
| `attacks` | array | One entry per boss attack occurrence (7.2). |
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
| `outcome` | string | `"hit"`, `"countered"`, `"dodged"` or `"interrupted"` (see below). |
| `evasion` | string or null | How a dodged attack was avoided: `"dash"`, `"jump"` or `"distance"`. `null` unless `outcome` is `"dodged"`. Exact rule: `"dash"` means the dash carried the player through a dangerous box; `"jump"` means the player was in the air above a box that would have hit them on the ground; everything else is `"distance"`. That includes a dash or jump that got the player clear before the boxes went live, so an early evasive dash has no `marginTicks` and counts as `"distance"`. |
| `reactionTicks`, `reactionMs` | number or null | See below. |
| `marginTicks`, `marginMs` | number or null | See below. |
| `damageTaken` | number | Health this attack actually took from the player; 0 when it did not hit. |
| `playerActionWhenHit` | string or null | What the player was doing when hit; `null` when not hit. |

**Player action** (`playerActionAtStart`, `playerActionWhenHit`) is one of, checked in this order: `"dashing"` (in a dash), `"attacking"` (in a swing), `"airborne"` (off the ground), `"running"` (on the ground with a direction held), `"idle"`. It is read from the state after that update and the input given to it.

**Outcome.** The attack's "last dangerous update" is the last update of its latest hit window. In order:
1. `"countered"`: the player countered it (it was cancelled and the boss staggered). This wins over everything else.
2. `"hit"`: it hurt the player.
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
| `updatesClose` | number | Updates spent at a distance below 160 from the boss. |
| `updatesMid` | number | Updates at 160 to 400 (both included). |
| `updatesFar` | number | Updates above 400. The three add up to `ticks`. |
| `positionEvery` | number | 6: the player's x is sampled once every 6 updates (10 per second). |
| `positions` | number[] | The player's x, rounded, on ticks 6, 12, 18 and so on (`positions[i]` is the tick `6 * (i + 1)`). |
| `punish` | object | Punish windows (below). |

**Punish windows.** When an attack was not countered, its recovery is a chance to hit the boss. The window opens when the attack reaches its recovery (windup plus active updates).
- `opened`: windows that opened. Always `taken + missed`.
- `taken`: windows in which the player hit the boss.
- `missed`: windows that closed without a hit.
A window is counted only when it closed (the attack ended and the boss moved on) or was hit. If the fight ended or was left while a window was still open and unhit, it is not counted: the player did not get the chance to use it.

Known limitation: a window is also not counted when the player's punishing hit lands on the very first update of the recovery and that hit triggers a phase change (the phase change cancels the attack on that same update, so the window never registers as open). This is rare and the analyzer does not correct for it.

**Not measured yet: "greedy" attacks** (SPEC section 9: the player attacks when they should not). They cannot happen against the Ember Duelist, whose recovery is longer than the player's swing and whose attacks all warn for 24 updates or more. They will be added, with a `schemaVersion` bump, when a boss can make them happen.

## 8. Replaying a fight

To rebuild a fight exactly (this is what `replayFinalState` and `analyzeFight` do):

1. Use the same game: the record's `gameVersion` must equal the game's `GAME_VERSION`. Attack timings and player numbers live in the code and the boss file, so a different version may replay differently.
2. `boss = applyDials(bossById(record.bossId), record.dials)`.
3. `state = createInitialState(boss, record.seed)`.
4. Expand `input` (section 6) into one frame per update. For each frame, `state = step(state, frame, boss)`. The frame's other fields (`moveY`, `confirm`, `alt`) are set to neutral.

After `ticks` steps the state is the one the fight ended in. A test (`tests/record.test.ts`) checks that a recorded fight and its replay reach the same final state.

## 9. Versioning

- `schemaVersion` (`STATS_SCHEMA_VERSION` in `src/stats/record.ts`) is bumped **whenever the shape changes**: a field added, removed, renamed or given a new meaning, in the export, the record or `analysis`. Bump it and update this document and the tests in the same commit.
- `gameVersion` (`GAME_VERSION` in `src/stats/record.ts`, a string such as `"0.3.0"`) is bumped **when a change to the game numbers or to a boss file changes how a recorded fight replays**. Old records keep their old `gameVersion`, so it is clear which ones cannot be replayed by the current game.
- Adding a new measurement to the analyzer changes the shape, so it also bumps `schemaVersion`.

## 10. Derived later, not stored

These are computed afterwards from many fights or many exports, and are not in the file: the learning curve, fatigue over a session, the hit rate of each attack across attempts, and the distribution of death causes and phases.

## 11. Size and archive

A fight of about 25 seconds is about 9 KB of JSON (input plus analysis); a two-minute fight is about 35 to 40 KB. Export reads every saved fight at once and builds one file, which is fine for hundreds of fights. So export and delete now and then: it keeps the file small and protects you if Android clears the browser data.

## 12. Example: one attack occurrence

A sweep at Normal. The warning began on tick 1284 and lasts 24 updates, so the first dangerous update is 1308. The player dashed on tick 1296, 12 updates (200 ms) after the warning began and 12 updates before the danger, and the dash carried them through the sweep.

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
  "playerActionWhenHit": null
}
```

# Stats format

What the game records about every fight, how it is stored and exported, and what each field means. Everything here matches `src/stats/record.ts` (the record and the versions), `src/stats/input-log.ts` (the input encoding), `src/stats/analyze.ts` (every measurement), `src/stats/store.ts` (storage) and `src/stats/export.ts` (the export file). If you change any of those, update this file and the tests. The design behind it is in `docs/superpowers/specs/2026-09-20-m3b-design.md`; the study phase (schema version 2) is in `docs/superpowers/specs/2026-09-21-m5b-study-phase-design.md`; the arena measurements (schema version 3) are in `docs/superpowers/specs/2026-09-21-m5c-arena-design.md`.

## 1. Purpose and privacy

- Every fight that ran is saved on the device, in the browser's IndexedDB (database `boss-trainer`, store `fights`, key `id`). A fight that is left before its first update ran is not saved.
- Nothing is uploaded. There is no backend and no account. The Stats screen has an **Export** row that builds one file and hands it to the phone's share sheet (or saves it as a download on a PC). A **Fights to export** row sets how many of the newest fights the file holds (1, 2, 3, 5, 10, 20, 50 or all; it starts at 5), so the file can stay small enough to send. The player then sends the file wherever they choose, for example to Claude for analysis.
- Android can clear browser data, so export now and then. Delete on the Stats screen removes every saved fight from the device (it asks twice).
- Exports are never committed. `.gitignore` covers `*.stats.txt`, `*.stats.json`, `*.stats.csv`, `/stats/`, `/stats-export/` and `/exports/` (SPEC section 4, rule 6).
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

A single JSON document (written without indentation) saved as a plain text file, named `boss-trainer-YYYY-MM-DD.stats.txt` where the date is the UTC date of the export (for example `boss-trainer-2026-09-21.stats.txt`). The name always ends in `.stats.txt`, which git ignores. The content is JSON; it has a `.txt` name only because chat apps (the Claude app, for one) refuse `.json` attachments. Exports made before this change are named `.stats.json`, have the same content and stay valid.

| Field | Type | Meaning |
|---|---|---|
| `format` | string | Always `"boss-trainer-stats"`. |
| `schemaVersion` | number | Version of this format (see section 9). Currently 8. |
| `exportedAt` | string | ISO 8601 date-time (UTC) when the file was built. |
| `gameVersion` | string | `GAME_VERSION` of the game that built the file (see section 9). Each fight also carries its own. |
| `fights` | array | Every saved fight, oldest first (by `playedAt`, then `id`). Each is a fight record (section 5). |

## 5. A fight record

One entry of `fights`. Every field is always present in a record written by the current game (a record of schema version 1 lacks `study`, and the analysis stored in a record of version 1 or 2 lacks `behavior.updatesOnPlatform`, see section 9).

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | The format version this record was written with (8 for records written by the current game; 1 to 7 for older ones, see section 9). |
| `gameVersion` | string | The game version it was played on. A replay is only valid with the same version (section 8). |
| `id` | string | `<playedAt>#<seed in hexadecimal>`. Unique key of the record. |
| `playedAt` | string | ISO 8601 date-time (UTC) when the fight began. |
| `attempt` | number | The number of fights saved on the device when this one was saved, plus one. So it counts fights across all bosses and difficulties, and starts again from 1 after "Delete all fights". It is not per boss or per preset. |
| `bossId` | string | The boss file's id, for example `"ember-duelist"`, or the id of a pair (`"hound-and-sage"`, two bosses in one fight, `docs/bosses.md` section 5a). `"generated"` means the boss was built at random (`docs/bosses.md`, "The boss generator"): there is no file to look up, and the fight must be reconstructed with `resolveFight(record.bossId, record.seed)`, the same function the app uses to start the fight — never looked up by name (`bossById`), which knows nothing about `"generated"` or a pair id. |
| `presetId` | string | The preset the fight began from: `"easy"`, `"normal"` or `"hard"`. |
| `dials` | object | The seven difficulty dials actually used, as numbers where 1 is the boss file as written: `speed`, `frequency`, `readability`, `health`, `damage`, `range`, `variety` (ranges and meanings in `src/game/difficulty.ts`). |
| `changedDials` | string[] | The dial ids whose value differs from the preset `presetId` (empty when the fight is that preset unchanged). |
| `seed` | number | The seed of the fight's random generator, an unsigned 32-bit integer. |
| `study` | number | The study setting the fight was played with: the number of study rounds before the real fight, 0 (Off), 1 (Once) or 2 (Twice). See section 7.5. A record of schema version 1 has no `study` field, and that means 0. A fight with two bosses has no study: the app stores 0, and a replay ignores any value. |
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
| 6-7 (`packed >> 6`) | 0, 1 or 2 | Vertical aim (schema version 5): 0 none, 1 up held, 2 down held. It picks the direction of a swing that starts on this update (see SPEC 5). The pattern 3 is invalid and is read as none. A `packed` from an older record is below 64, so it reads as no aim and replays as before. |

Menu-only fields (confirm and alt) are not part of a fight and are not stored. Examples: `[1, 40]` is 40 updates of no input; `[2, 12]` is 12 updates of holding right; `[13, 1]` is one update of jump pressed and held with no direction (`1 + 4 + 8`); `[18, 1]` is one update of holding right and pressing attack (`2 + 16`); `[81, 1]` is one update of pressing attack while holding up with no direction (`1 + 16 + 64`).

## 7. The `analysis` object

Computed by `analyzeFight` by replaying the record. Nothing here is guessed: a value the analyzer cannot measure exactly is `null`.

### 7.1 The fight

| Field | Type | Meaning |
|---|---|---|
| `ticks` | number | Updates the whole session ran, the study included (same as the record's `ticks`). |
| `seconds` | number | `ticks / 60` (not rounded): the **whole session**, the study included. |
| `fightSeconds` | number | The real fight only: `(ticks - study.ticks) / 60` (not rounded). Equal to `seconds` when there was no study. |
| `phaseReached` | number | Highest phase the primary boss reached, 1-based. In a fight of two bosses the partner's is in `bosses`. |
| `phaseCount` | number | How many phases the primary boss has. |
| `bossHpLeft` | number | Boss health at the end, summed over every boss of the fight. |
| `bossMaxHp` | number | Boss health at the start, with the Health dial applied (and a pair's health scale), summed over every boss of the fight. |
| `damageDealt` | number | `bossMaxHp - bossHpLeft`. |
| `bosses` | array | One entry per boss of the fight, the primary boss first (7.1a). A fight of one boss has one entry. Added in schema version 6. |
| `damageTaken` | number | Health the player actually lost. A blow larger than the health left counts only what was left (a 2-health hit on 1 health counts 1). The study takes no health, so it never counts here. |
| `hitsTaken` | number | How many times the player was hit (a count of hits, not of health). A demonstration that reaches the player in the study (`studyHit`) is not counted here; it is counted in `study.hits`. |
| `bossHitTicks` | number[] | The tick of each hit the player landed on the boss. The boss cannot be hurt in the study, so every entry is from the real fight. |
| `playerHitTicks` | number[] | The tick of each hit the boss landed on the player (real hits only, never a `studyHit`). |
| `swings` | number | Attack swings started by the player. |
| `swingsThatHit` | number | Swings that hit the boss (at most one hit per swing). |
| `accuracy` | number or null | `swingsThatHit / swings`; `null` when the player never swung. |
| `counters` | number | Counters landed. |
| `dashes` | number | Dashes started. |
| `dashUse` | object | What the dashes of the **real fight** (the study excluded) achieved (7.1b). Added in schema version 7. |
| `jumps` | number | Jumps started (the player leaving the ground upward; a hop and a full jump both count once). |
| `swingTicks`, `dashTicks`, `jumpTicks` | number[] | The update each swing, dash and jump began on, over the **whole session** (study included), in order. `swingTicks.length` is `swings`. Added in schema version 8; they draw the timeline of the fight details (7.6). |
| `attacks` | array | One entry per boss attack occurrence (7.2), the study's demonstrations included (flagged by `study`). |
| `study` | object | The study phase (7.5). |
| `behavior` | object | 7.3. |

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

### 7.1b Dash use (`dashUse`)

Every dash begun in the real fight is counted once. A dash is **during an attack** when an attack of the real fight was live: from the update after its warning began to the update after the last dangerous one (for an attack with shots, until its last shot is gone); a dash on the very first update of a warning counts as travel. When several attacks are live (a pair), the dash belongs to the one whose warning began first. Dashes begun in the study are not counted.

| Field | Meaning |
|---|---|
| `escaped` | Dashes during an attack that was dodged with evasion `"dash"`. |
| `hitAnyway` | Dashes during an attack that hit the player. |
| `notNeeded` | Dashes during an attack that was dodged another way (`"distance"`, `"jump"`, `"platform"` or `"cover"`): the player was already safe, or something else saved them. |
| `other` | Dashes during an attack that was countered or cut short. |
| `travel` | Dashes with no attack live, by what they did to the distance to the nearest standing boss from just before the dash starts to 11 updates later (the last update of the run, if that comes first): `closer` or `farther` when it changed by more than 40 world units (`TRAVEL_DASH_CHANGE` in `src/stats/analyze.ts`), otherwise `even`. |

If one attack has two dashes during it, each counts. The seven counters (`escaped`, `hitAnyway`, `notNeeded`, `other`, `travel.closer`, `travel.farther`, `travel.even`) add up to the dashes of the real fight. Direction is never judged: a dash into an attack can be the right dodge, so `travel` only says where the player ended up, not whether it made sense.

### 7.2 An attack occurrence (each entry of `attacks`)

One boss attack, from the moment its warning began. Entries are in the order the attacks began.

| Field | Type | Meaning |
|---|---|---|
| `attackId` | string | The attack's id in the boss file (for example `"sweep"`). |
| `boss` | number | Which boss of the fight made the attack: 0 is the primary boss, 1 its partner. Always 0 in a fight of one boss. Added in schema version 6; an analysis stored in an older record does not have it, and every attack in it is the primary boss's. |
| `phase` | number | The boss phase (1-based) when the warning began. |
| `startTick` | number | The tick on which the warning began. This is attack time 0. |
| `windupTicks` | number | The length of the warning (the attack's windup, after the Warning length dial, plus the updates the attack spent frozen on the end of its wind-up when it has a `hold`, `docs/bosses.md`). |
| `firstDangerTick` | number | The first tick on which the attack could hurt: `startTick` plus the start of its earliest hit window (plus the hold, if it had one). |
| `distance` | number | Distance to the player when the warning began, in world units, rounded to 0.1. |
| `playerActionAtStart` | string | What the player was doing then (see below). |
| `outcome` | string | `"hit"`, `"countered"`, `"dodged"` or `"interrupted"` (see below). For a demonstration in the study, `"hit"` means it reached the player (a `studyHit`); it took no health. |
| `evasion` | string or null | How a dodged attack was avoided: `"dash"`, `"jump"`, `"platform"`, `"cover"` or `"distance"`. `null` unless `outcome` is `"dodged"`. The exact rules and their priority are under "Evasion" below. `"platform"` and `"cover"` only happen against a boss with an arena. A dash or jump that got the player clear before the boxes went live is not a `"dash"` or `"jump"`: an early evasive dash has no `marginTicks` and counts as `"distance"`. |
| `reactionTicks`, `reactionMs` | number or null | See below. |
| `marginTicks`, `marginMs` | number or null | See below. |
| `damageTaken` | number | Health this attack actually took from the player; 0 when it did not hit. Always 0 for a demonstration in the study. |
| `playerActionWhenHit` | string or null | What the player was doing when hit; `null` when not hit. Also set for a demonstration that reached the player. |
| `shotsFired` | number | How many shots (bolts, arcs and floor eruptions) the attack fires; 0 for an attack without shots. See 7.4. |
| `swingAtDanger` | boolean | `true` when a player swing (start-up, active or recovery) was in progress on the update `firstDangerTick` (the attack could first hurt), whether or not the attack then hurt the player. `false` for an attack that never reached its danger (countered, or cut short). A demonstration in the study can also carry `true`; only `behavior.greedySwings` and `behavior.greedyHits` leave the study out. Added in schema version 7; an analysis stored in an older record does not have it. |
| `study` | boolean | `true` for a demonstration in the study, `false` for an attack of the real fight. Decided on the update the attack's warning began: an attack that began in the study is a demonstration for its whole length, even if it ends on the update the study ends. |

**Player action** (`playerActionAtStart`, `playerActionWhenHit`) is one of, checked in this order: `"dashing"` (in a dash), `"attacking"` (in a swing), `"airborne"` (off the ground), `"running"` (on the ground with a direction held), `"idle"`. It is read from the state after that update and the input given to it.

**Outcome.** The attack's "last dangerous update" is the last update of its latest hit window. In order:
1. `"countered"`: the player countered it (it was cancelled and the boss staggered). This wins over everything else.
2. `"hit"`: it hurt the player (in the study: it reached the player, see 7.5).
3. `"dodged"`: it lived to its last dangerous update without hurting the player and without being countered. This holds even if the fight ended during the attack's recovery.
4. `"interrupted"`: it was cut short before its last dangerous update, without a hit or a counter: the fight ended or was left, or a phase change cancelled it. It says nothing about the player's skill.

**Evasion** (only for `"dodged"`; schema version 3 added `"platform"` and `"cover"`). It is judged on every update the attack was live (at least one hit window active) and remembered for the whole attack. Two lists of boxes are compared: the **cut** boxes (the hit windows that were really dangerous, after any cover cut them) and the **bare** boxes (what the same windows would cover with no cover at all; for a boss with no arena the two lists are the same). Each is asked about two versions of the player: the player **where they are**, and a copy of the player standing **on the floor at the same x**. "Reaches" means the box overlaps that player's body. For each update:
- `"dash"`: the player is dashing and a cut box reaches them where they are (the dash made them invulnerable: the i-frames were really needed, so this uses the boxes that existed).
- `"jump"`: no cut and no bare box reaches the player where they are, a bare box would have reached the floor copy, and the player is in the air (not standing on anything) and not dashing. Height saved them.
- `"platform"`: the same test as `"jump"` (no cut and no bare box reaches the player, a bare box would have reached the floor copy, and the player is not dashing), but the player is **standing on a raised surface**: on the ground (`onGround`) with their feet more than 1 unit above the floor. **Any raised surface counts**: a platform or the top of a cover.
- `"cover"`: no cut box reaches the player where they are, no cut box reaches the floor copy either, and a bare box would have reached one of them. The cover cut the attack away from where the player is or where they stood.
- `"distance"`: none of the above. The player was simply out of reach, or moved out of it on the ground.

**Priority** when more than one of these was true at some point during the attack: `"dash"`, then `"jump"`, then `"platform"`, then `"cover"`, then `"distance"`. The rules are symmetric on purpose: a player who is both high up and behind a cover is judged by the height first, and is never called `"distance"` when something in the arena did the work. **Expected with the shipped arena.** `"cover"` exists in the format, but it is expected to read 0 (or be very rare) in the exported stats of the Ashen Hound's arena as it is now. A probe on the shipped arena (wall 100 high, 40 seeds of 1800 updates) showed that a player standing still behind the wall is hit exactly as often as with the wall removed (496 hits either way): the boss walks through the wall (the rush is carried through it, the pounce lands on the player's take-off spot) and the bite (window top 110) passes over a 100-high wall. The wall cuts hit windows (1020 of 9261 window-updates in the probe) but the attack then lands anyway. `"cover"` will appear when a boss can be blocked by cover (`docs/backlog.md`).

For a boss with no arena (the Ember Duelist) the cut and bare lists are the same, so `"platform"` and `"cover"` cannot happen and the result is exactly what schema version 2 gave: re-analysing an old Duelist record gives the same evasions.

**Dodge action.** A dash or a jump the player started during the attack, at attack time up to and including the end of the last dangerous update. The first one is what `reactionTicks` and `marginTicks` measure. A dash or jump started before the warning began does not count.

**`reactionTicks`** (and `reactionMs`): from `startTick` to the first dodge action, if that action began no later than `firstDangerTick`. `null` when the player made no dodge action, or made the first one after `firstDangerTick`. It is measured whatever the outcome (a hit or a `"distance"` dodge can also have one).

**`marginTicks`** (and `marginMs`): `firstDangerTick` minus the tick the first dodge action began. Set only when the player made a dodge action **and** the outcome is `"hit"`, or `"dodged"` by `"dash"` or `"jump"`; otherwise `null`. A small positive number is a late, tight dodge; a large one is an early dodge. **Negative means the dodge began after the first dangerous update** (too late for a hit; a dash that still carried the player through a later part of the attack).

### 7.3 `behavior`

| Field | Type | Meaning |
|---|---|---|
| `updatesClose` | number | Updates spent at a distance below 160 from the boss (in a fight of two, the nearest boss still standing, see 7.1a), over the **whole session** (study included). |
| `updatesMid` | number | Updates at 160 to 400 (both included), whole session. |
| `updatesFar` | number | Updates above 400, whole session. The three add up to `ticks`. |
| `studyUpdatesClose` | number | How many of `updatesClose` happened in the study. |
| `studyUpdatesMid` | number | How many of `updatesMid` happened in the study. |
| `studyUpdatesFar` | number | How many of `updatesFar` happened in the study. The three add up to `study.ticks`. |
| `positionEvery` | number | 6: the player's x is sampled once every 6 updates (10 per second). |
| `positions` | number[] | The player's x, rounded, on ticks 6, 12, 18 and so on (`positions[i]` is the tick `6 * (i + 1)`), over the **whole session**. |
| `punish` | object | Punish windows (below). |
| `updatesOnPlatform` | number | Updates, over the **whole session** (study included), on which the player stood on a raised surface: on the ground (`onGround`) with the feet more than 1 unit above the floor. It counts platforms and the tops of covers, the same test as the `"platform"` evasion. 0 for a boss with no arena. Added in schema version 3; an analysis stored in an older record does not have it. |
| `greedySwings` | number | Attacks of the real fight (the study excluded) with `swingAtDanger` true. Added in schema version 7. |
| `greedyHits` | number | Of those, how many hit the player. Added in schema version 7. |
| `realUpdatesInReach` | number | Updates of the real fight on which the player was within swing reach of a boss still standing: centre-to-centre distance at most `PLAYER.width / 2 + PLAYER.attack.reach + boss width / 2` (154 for the Ember Duelist). Added in schema version 7. |
| `realMeanDistance` | number | Mean distance to the nearest boss still standing over the real fight, rounded to 0.1; 0 when there were no real updates. Added in schema version 7. |

**Punish windows.** When an attack was not countered, its recovery is a chance to hit the boss. Attacks of the study (`study` true) never open a window: the boss cannot be hurt in the study. The window opens when the attack reaches its recovery (windup plus active updates).
- `opened`: windows that opened. Always `taken + missed`.
- `taken`: windows in which the player hit the boss.
- `missed`: windows that closed without a hit.
- `windows` (schema version 7): one entry per counted window, in the order they closed, so `windows.length` is `opened`. Each is `{ attackId, boss, startTick, ticks, distanceAtOpen, closestDistance, swung, hit, reachable, replyTicks, hitTicks }`: the attack and boss it followed; the update the window opened and how many updates the boss stayed in its recovery; the distance to that boss when it opened and the smallest while it was open (rounded to 0.1); whether the player began a swing inside it (`swung`) and hit the boss in it (`hit`); and `reachable`, whether the player could have run from `distanceAtOpen` into swing reach before it closed (`distanceAtOpen` minus the swing reach is at most running speed times the window length). `replyTicks` (schema version 8) is the reply time: the updates from the window opening (the boss's attack ended and its recovery began) to the update the player began a swing in it, `null` when the player began none. `hitTicks` (schema version 8) is the updates from the opening to the first hit the player landed in it, `null` when none.
A window is counted only when it closed (the attack ended and the boss moved on) or was hit. If the fight ended or was left while a window was still open and unhit, it is not counted: the player did not get the chance to use it.

Known limitation: a window is also not counted when the player's punishing hit lands on the very first update of the recovery and that hit triggers a phase change (the phase change cancels the attack on that same update, so the window never registers as open). This is rare and the analyzer does not correct for it.

**Greedy swings** (schema version 7; SPEC section 9: the player attacks when they should not). An attack occurrence has `swingAtDanger` when a player swing was in progress on the update the attack could first hurt (a swing lasts 16 updates: 3 start-up, 4 active, 9 recovery), hit or not. `behavior.greedySwings` counts them in the real fight and `behavior.greedyHits` counts those that also hit the player. With the normal warning lengths the usual case is a swing begun during the last 16 updates of the attack's own warning; a short warning (the Warning length dial) makes it more likely.

### 7.4 Attacks that move the boss

Some attacks move the boss (a dash, a leap, or a move that only repositions). The fields in 7.2 still work, but they mean different things for these attacks, so read them with care.
- `windupTicks` is always the length of the warning. For a leap (the Hound's pounce) the dangerous moment is the shockwave at the landing, not the take-off: `firstDangerTick` is the start plus the `from` of the first hit window, which for the Hound is exactly the landing. The pounce's `reactionTicks` can therefore be up to 52 for the Hound (crouch and flight together), so it is not comparable with a slam's.
- An attack with no hit windows (a reposition-only attack such as the Hound's slip) has no danger window: the analyzer falls back to the whole active part (from `windupTicks` to `windupTicks` plus `active`). Such an attack always scores `"dodged"` with evasion `"distance"` (it cannot hurt, and nothing can dash through it), unless it was cut short, when it is `"interrupted"`.
- Compare reaction times per attack id, never across kinds of attack.

**Attacks with shots.** A bolt or an arc can still be flying after its attack has ended, so an attack with shots (`shotsFired` above 0) is resolved only when its last shot is gone:

- A shot that reaches the player is a hit **for the attack that fired it**, even if the boss has already started another attack. If any of its shots lands, the attack is `"hit"` with the damage taken.
- The attack is `"dodged"` only when every shot has been fired and has gone (left the arena, been stopped by cover, or burst) without hurting the player.
- If the fight ends, a phase changes or the run stops while a shot is still flying, the attack is `"interrupted"`. A phase change and the end of the fight remove every shot.
- The danger window (`firstDangerTick` and the end of danger) covers the shots: a bolt from the update it fires, an arc from the update it lands until its burst ends, an eruption from the update its blast goes off until the blast ends. Eruptions are shots for the stats: `shotsFired` counts them and the schema version stays 4.
- Evasion for shots: `"dash"` if the player was dashing through a shot, `"jump"` if they were in the air where a shot would have hit them standing on the floor, `"platform"` if they were on a raised surface for the same reason, otherwise `"distance"`. A bolt stopped by cover is also `"distance"` (the analysis does not report `"cover"` for shots).
- Occurrences are listed in the order their warnings began, not the order they were resolved.

### 7.5 The study phase

With the menu's Study row on Once or Twice, a fight begins with a study (schema version 2). The boss demonstrates every attack of its **first phase**, once per round, each round in its own random order, using its normal warning, speed and pause. Nothing can hurt the player and the boss cannot be hurt; counters do nothing. The real fight begins on the update after the study ends, with everything else unchanged (the boss at full health, in its normal waiting pause). When the study ends, any leftover hit invulnerability the player got from a `studyHit` in the last demonstration is cleared, so the real fight starts clean (`endStudy` in `src/game/boss.ts`). The attacks shown are the ones the boss has in its first phase **after the dials are applied**, so a low Variety dial removes attacks from the study too. Because of that, the number of demonstrations per round is not fixed, and `study.rounds` is passed in from the record rather than inferred.

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
- **Time**: warning: before schema 2, `seconds` was the time of the fight; now `seconds` is the whole session, the study included, and `fightSeconds` is the number that matches the summary screen. A script written against older exports must switch to `fightSeconds` if it wants the fight only. `seconds` is the whole session and `fightSeconds` is the real fight only, `(ticks - study.ticks) / 60`. In the app's summary the fight time excludes the study and the study time is shown separately; those two are computed from updates in floating point, so `seconds + studySeconds` there is not always exactly `ticks / 60`.
- **The random generator**: the study's random order uses the fight's seeded generator before the fight starts (a shuffle of n attacks draws n - 1 numbers, once per round). So a fight with a study and the same seed and input without one is a different fight from the first real attack on. That is expected, and is why `study` is part of the record.
- **How long it is**: with a standing player (60 seeds, both bosses, Easy, Normal and Hard), Once took about 370 to 540 updates (6 to 9 seconds) and Twice about 710 to 1040 updates (12 to 17.5 seconds). A boss whose first phase has no attacks has no study at all (`study.ticks` 0, `study.attacks` 0).

### 7.6 Fight details (derived, not stored)

After a fight (not one left during the study) the summary offers a **Fight details** screen: a recommendation sentence on top, four key numbers and several plots. Everything is computed on the spot from that one fight's `analysis` by `fightDetails` in `src/stats/details.ts` (cut-offs and targets in `src/stats/details-tuning.ts`, words in `src/ui/details-text.ts`, drawing in `src/ui/details-view.ts` and `src/ui/details-plots.ts`) and is **not** stored in the record or the export, so it can be reworded or re-tuned without a schema change. It replaces the text "Work on:" insights of schema version 7.

Everything is for the real fight only (the study is excluded).

| Number | How it is counted |
|---|---|
| Attacks avoided | Attacks with outcome `"dodged"` or `"countered"`, over those plus the ones that hit (`"interrupted"` attacks are not counted). Split by `evasion` (a countered attack is its own part) for the bar "How you avoided attacks". |
| Swings that hit | `swingsThatHit` over `swings`, from the real fight. |
| Attacks replied to | Of the *answerable* attacks (countered ones, plus punish windows of at least 12 updates, since a shorter opening cannot be answered), the countered ones and the windows with a swing (`replyTicks` not null). |
| Reply time | The median `replyTicks` over the windows with a swing, shown in bins of 15, 30, 45, 60 and 90 updates, split into swings that hit the boss in the window and those that did not, and per attack. |
| Dodge timing | For dodged attacks and attacks that hit after a dash or jump began, how long before danger the dodge began (`marginTicks`) in bins of 0, 6, 12, 24 and 48 updates; the first bin is a dodge that began after the danger did. |
| Where you stood | Updates of the real fight in the close, middle and far distance bands. Shown as a plot only. |
| Per minute | Swings, dashes and jumps that began in the real fight, over the fight's minutes. |
| Timeline | The updates (counted from the start of the real fight) of swings, hits landed (`bossHitTicks`) and hits taken (`playerHitTicks`). |

**The recommendation** is one sentence naming the one number furthest below its target (a share of the target missed): attacks avoided (target 70%), swings that hit (50%), attacks replied to (60%) or the median reply time (target 30 updates, 0.5 s; its shortfall is capped at 100%). A number is judged only with enough cases behind it (6 attacks, 5 swings, 6 answerable attacks, 3 replies). When every judged number is at its target it says nothing stands out; when none can be judged it says there are too few attacks. A tie goes in the order above. The sentence quotes the number and its target. The targets are first guesses and meant to be tuned.

**Old records.** The reply and timeline numbers need schema version 8: an analysis from an older record has no `replyTicks` and no `swingTicks`, so a record of version 7 or earlier shows its details only after being re-analysed by replay (section 8).

**What this cannot tell you.**
- One fight is a small sample. The recommendation is a hint to practise, not a verdict.
- A travel dash and an early dodge dash are told apart only by whether an attack was live.
- Movement direction is never graded.
- The distance plot is not part of the recommendation: standing far away is only a plot.

## 8. Replaying a fight

To rebuild a fight exactly (this is what `replayFinalState` and `analyzeFight` do):

1. Use the same game: the record's `gameVersion` must equal the game's `GAME_VERSION`. Attack timings and player numbers live in the code and the boss file, so a different version may replay differently.
2. `fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials)`. Use `resolveFight`, not `bossById`: a `'generated'` record needs the seed to rebuild the same boss (section 9's M5e note), and a pair id needs the pair file (`bossById` alone would silently fall back to the Ember Duelist). For a boss id or `'generated'` the fight is one boss, identical to the old `applyDials(resolveBoss(...))`, so a record of schema version 1 to 5 replays exactly as before.
3. `state = createInitialState(fight, record.seed, record.study ?? 0)`. The third argument is the number of study rounds (a value is clamped to 0 to 2 and a fraction is rounded down; the game only uses 0, 1 and 2). A record of schema version 1 has no `study`, so it replays with 0. A fight with two bosses has no study, so the value is ignored for it.
4. Expand `input` (section 6) into one frame per update. For each frame, `state = step(state, frame, fight)`. The frame's other fields (`moveY`, `confirm`, `alt`) are set to neutral.

After `ticks` steps the state is the one the fight ended in (or the state the study was still running in, if the fight was left during it). A test (`tests/record.test.ts`) checks that a recorded fight and its replay reach the same final state.

## 9. Versioning

- `schemaVersion` (`STATS_SCHEMA_VERSION` in `src/stats/record.ts`) is bumped **whenever the shape changes**: a field added, removed, renamed or given a new meaning, in the export, the record or `analysis`. Bump it and update this document and the tests in the same commit.
- `gameVersion` (`GAME_VERSION` in `src/stats/record.ts`, a string such as `"0.4.0"`) is bumped **when a change to the game numbers or to a boss or pair file changes how a recorded fight replays**. Old records keep their old `gameVersion`, so it is clear which ones cannot be replayed by the current game.
- Adding a new measurement to the analyzer changes the shape, so it also bumps `schemaVersion`.
- **Version 1** was the format of M3b and M5a. **Version 2** (M5b, the study phase) added the record's `study`, the analysis's `study` object, `fightSeconds` and `behavior.studyUpdatesClose/Mid/Far`, and the `study` flag on each attack occurrence. Version-1 records and files remain valid: `study` missing means 0, and replaying or re-analysing one with `record.study ?? 0` gives the same fight as before (with the new fields filled in as for a fight without a study: `study.rounds` 0, `study.ticks` 0, `fightSeconds` equal to `seconds`, every `study` flag false, the study distance bands all 0). An analysis stored inside an old record was computed then and is not rewritten, so it has no `study` block and no `fightSeconds`. **Version 3** (M5c, the arena) added the evasion values `"platform"` and `"cover"` (a change of meaning: an attack that used to be `"distance"` or `"jump"` can now be one of them, see 7.2) and `behavior.updatesOnPlatform`. Version-1 and version-2 records and files remain valid and readable: the record itself has the same fields as in version 2, and an analysis stored inside an old record was computed then and is not rewritten (it has no `updatesOnPlatform`). **Version 4** (projectiles) added `shotsFired` to each attack occurrence and changed the meaning of `outcome` for attacks with shots (resolved when the last shot is gone, see 7.4). No boss before the Vesper Sage has shots, so an older record or analysis reads exactly as before (an older analysis has no `shotsFired`, which means 0). The schema version is 4 in the export document and in every record written before game version 0.7.0. **Version 5** (game version 0.7.0, up and down swings) added bits 6-7 to the packed input (the vertical aim, section 6); nothing else changed. Records of versions 1 to 4 stay valid and replay exactly as before (they have no aim). The schema version was 5 in the export document and in every record written before version 6.
- **Version 6** (two bosses in one fight, game version stays 0.8.0) makes a fight with several bosses recordable. `bossId` may now be a pair id, and the fight is rebuilt with `resolveFight` (section 8). The record has the same fields as in version 5. A fight with partners has no study, so its record stores `study: 0`. The analysis gains `bosses` (one entry per boss: `id`, `name`, `maxHp`, `hpLeft`, `phaseReached`, `phaseCount`, `damageDealt`) and each attack occurrence gains `boss` (0 for the primary boss, 1 for the partner); the existing top-level boss fields stay, with `bossMaxHp`, `bossHpLeft` and `damageDealt` summed over all bosses and `phaseReached` and `phaseCount` those of the primary boss (section 7). Records and files of versions 1 to 5 remain valid and readable: they read as a fight of one boss (an analysis stored in an old record has no `bosses` and no `boss`, which means one boss and boss 0), and replaying them gives exactly the same fight as before. The schema version is 6 in the export document and in every record the current game writes.
- **Version 7** (fight insights, game version stays 0.10.0) adds measurements only; nothing in the game or the input encoding changes. The analysis gains `dashUse` (7.1b), `behavior.greedySwings`, `behavior.greedyHits`, `behavior.realUpdatesInReach`, `behavior.realMeanDistance` and `behavior.punish.windows` (7.3); each attack occurrence gains `swingAtDanger` (7.2). Records and files of versions 1 to 6 remain valid and replay exactly as before; an analysis stored inside an old record was computed then and is not rewritten, so it has none of the new fields (re-analysing the record by replay, section 8, fills them in and leaves every old number unchanged). The schema version is 7 in the export document and in every record the current game writes.
- **Version 8** (fight details, game version stays 0.10.0) adds measurements only; nothing in the game or the input encoding changes. Each entry of `behavior.punish.windows` gains `replyTicks` and `hitTicks` (7.3), and the analysis gains `swingTicks`, `dashTicks` and `jumpTicks` (7.1). Records and files of versions 1 to 7 remain valid and replay exactly as before; re-analysing them by replay fills the new fields in. The schema version is 8 in the export document and in every record the current game writes. The text insights of version 7 are gone; their measurements stay.
- **Game version 0.4.0** goes with schema 3. Giving the Ashen Hound an arena (ledges to stand on, cover that cuts its hit windows) changes how Hound fights play out, so **Hound records made by 0.3.0 (or earlier) no longer replay exactly** with the current game. Their stored `analysis` was computed at the time and stays valid as data, but replaying or re-analysing them now gives a different fight. **Ember Duelist records still replay exactly** (it has no arena, and `tests/duelist-golden.test.ts` is unchanged). So for an old Hound file, trust its stored `analysis`, not a fresh replay (section 8 says a replay is only valid with the same game version).
- **The boss generator (M5e, still game version 0.4.0, no bump for it).** `bossId: "generated"` has no file, so its replay stability is a different promise from a named boss's: a `"generated"` record's replay is only guaranteed to match while the generator's algorithm and its tuning (`src/bosses/generate/`) are unchanged, in addition to `GAME_VERSION` itself. A future change to the generator (a tuning number, or the algorithm) will need a `GAME_VERSION` bump exactly like a change to a named boss file would, so old `"generated"` records stay identifiable as no-longer-exact. A version-1, version-2 or version-3 record with a real boss id (`"ember-duelist"` or `"ashen-hound"`) is unaffected by anything about the generator.
- **Game version 0.5.0: generated arenas (M6a).** Drawing an arena is one more random choice the generator makes, so it reorders the whole random stream: a `"generated"` record made by game version 0.4.0 no longer reproduces the same boss (arena included) from its seed. As with the 0.4.0 bump, only `"generated"` records are affected; the Ember Duelist and Ashen Hound are unchanged.
- **Game version 0.5.1: the Vesper Sage without its cover.** The Sage's middle wall was removed because it kept the player on one side of the arena, so Vesper Sage records made by 0.5.0 no longer replay exactly. Every other boss is unchanged.
- **Game version 0.6.0: the variety pass.** The Quill Warden, Cinder Golem, Veil Dancer, Gale Reaver and Brass Sentinel gained new attacks (hovering leaps, strikes on both sides, aimed bolts) and bolt heights are measured above the boss's feet, so records of those five bosses made by 0.5.1 no longer replay exactly. The schema stays 4 (the export's shape is unchanged; `shotsFired` counts the new bolts). Other bosses, including the Ember Duelist, replay as before.
- **Game version 0.7.0: up and down swings.** The player can swing up and down (owner request). Records made by 0.6.1 or earlier still replay exactly (they carry no aim); a new record replays only with 0.7.0 or later. The schema goes to 5 (section 6).
- **Game version 0.7.1: the pogo.** A downward swing that hits the boss bounces the player up, so a record made by 0.7.0 that contains a downward hit no longer replays exactly. Schema stays 5.
- **Game version 0.8.0: shots and eruptions in generated bosses.** A generated boss now picks each attack from strike, dash, leap, shot (bolts, aimed or backward bolts, lobbed arcs) and eruption, so the same seed makes a different boss than in 0.7.1. A record of a generated fight made by 0.7.1 or earlier no longer replays exactly; records of hand-built bosses are unaffected. Schema stays 5 (`shotsFired` already counts every kind of shot).
- **Game version 0.9.0: boss identity, Round 1.** Nine hand-built bosses (all but the Ember Duelist) had attacks removed, added or re-weighted (`docs/bosses.md` section 3a-sexies), so records of those bosses made by 0.8.0 or earlier no longer replay exactly, and the removed attack ids (`updraft-dive`, `retreating-gust`, `charging-bash`, `brass-cannon`, `piston-drop`, `ground-charge`, `feather-volley`, `sky-lance`, `snap-plunge`, `rending-dash`, `phantom-step`, `falling-veil`) appear only in old exports. Stats are kept per attack id, so per-attack comparisons across the change are only meaningful for the ids that still exist; new ids (`feint`, `late-herald`, `brass-snap`, `backwards-vault`, `rising-swipe`, `long-strafe`, `floor-wave`, `uppercut`, `twin-cut`, `lob-and-low`) start fresh. The Ember Duelist and generated bosses are unaffected. Schema stays 6.
- **Game version 0.10.0: boss identity, Rounds 2 and 3.** New mechanics changed how the hand-built bosses fight (`docs/bosses.md` section 3a-septies): every hand-built solo boss except the Ember Duelist and the Gale Reaver gained anger from not being hit (`temper`; the Trainee test boss and the Hound and Sage pair have none), four answer a hit (`reaction`), the Sentinel has a shield, and the Hound, Reaver, Warden, Golem, Kite, Brute, Dancer and Sage have new attacks. Records made by 0.9.0 or earlier of those bosses no longer replay exactly. New attack ids (`skitter`, `gale-carry`, `gale-recoil`, `snap-piercer`, `kiln-crack`, `row-quake`, `crossfire`, `tempest-pass`, `blink-away`, `shadow-cut`, `float-away`) start fresh in per-attack stats. An attack with a `hold` reports the hold in `windupTicks` and `firstDangerTick`. The Ember Duelist and generated bosses are unaffected. Schema stays 6.
- **Game version 0.6.1: the Ashen Hound without its arena.** The Hound's two platforms and its cover were removed (owner request), so Hound records made by 0.6.0 or earlier no longer replay exactly (their stored analysis stays valid). The schema stays 4. Every other boss replays as before.

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
  "shotsFired": 0,
  "swingAtDanger": false,
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
  "shotsFired": 0,
  "swingAtDanger": false,
  "study": true
}
```

Its fight then carries an `analysis.study` block such as `{ "rounds": 1, "ticks": 507, "attacks": 3, "hits": 2 }`, and the record carries `"study": 1`.

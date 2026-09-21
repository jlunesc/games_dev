# M5b Design: the study phase

Second step of M5. The idea comes from the owner (2026-09-21): the trainer is for skills that carry over to other games, so before the real fight there can be a **learning phase without damage** in which the player sees what the boss can do. Owner decisions (2026-09-21): the study shows **the first phase's attacks only** (later-phase attacks are discovered in the real fight), and it is a **menu setting with three values: Off, Once, Twice** (remembered; default **Once**). Everything else is **DELEGATED**.

## What the player sees
- A new menu row **Study** (between Difficulty and Tweak difficulty) cycling Off, Once, Twice with left and right (and the bottom button or a tap). Off starts the real fight straight away, as today.
- With Once or Twice, the fight starts in the study: a banner says "Study: watch what it can do. Nothing can hurt you." The boss performs each attack of its first phase in random order, one after another, with its normal warning and speed and its normal pause between attacks. Once shows each attack one time, Twice shows the whole set two times (each round in a new random order). The player can move, jump, dash and swing freely to practise dodging; the boss cannot be hurt and the counter does not work in the study.
- An attack that would have hurt shows the usual red flash on the player but costs nothing.
- When the last demonstration is over, the banner says "The fight begins!" for two seconds and the real fight goes on from there: the boss (at full health, unchanged) is in its normal waiting pause before its first real attack. The player is where they were; their health is full because nothing could hurt them.
- Leaving the study with the top button ends the fight as "left".
- The summary's time counts only the real fight (as before, in game updates); if the study lasted, a line "Study time" shows it. A fight left during the study says so.

## Simulation (`src/game/`)
- `GameState` gains `study: { active: boolean; queue: string[]; endTick: number }`. `createInitialState(boss, seed, studyRounds = 0)`: the queue is the ids of the first phase's attacks (list order), repeated `studyRounds` times, each round shuffled with a Fisher-Yates using the fight's seeded generator (the only place the generator is used for this); `active` is true when the queue is not empty; `endTick` is 0. With `studyRounds` 0 nothing changes and the generator is not touched, so every existing fight, record and the Duelist golden test stay identical.
- While `study.active`: when the boss's waiting pause is over it starts the next id of the queue (no random choice, no chains); a player swing does nothing to the boss (no `bossHit`, no phase change) and the counter does not trigger; a hit that would land raises the event `studyHit` (and gives the usual hit invulnerability) instead of hurting. When an attack finishes and the queue is empty the study ends: `active = false`, `endTick = tick`, event `studyEnd`, and the boss goes back to waiting as after any attack.
- New events `studyHit` and `studyEnd`. Feedback: `studyHit` flashes the player like a hit but with no freeze and no shake; a soft low sound.

## Recording and stats (schema version 2)
- The record gains `study` (0, 1 or 2 rounds). Old version-1 records have no `study` and replay as 0. `STATS_SCHEMA_VERSION` becomes 2 and `docs/stats.md` is updated; `replayFinalState` and `analyzeFight` use `record.study ?? 0`.
- The analysis gains `study: { rounds, ticks, attacks, hits }` (`ticks` is the study's length, `attacks` how many demonstrations, `hits` the number of `studyHit` events) and each attack occurrence gains `study: boolean`. In the study an occurrence's outcome uses `studyHit` like a hit (so `hit`/`dodged`/`interrupted` are measured the same way, with `damageTaken` 0). The fight-level numbers `hitsTaken`, `damageTaken`, `playerHitTicks` count only real hits; behaviour numbers (swings, dashes, jumps, positions, distance bands) cover the whole session; punish windows are not counted for study attacks (the boss cannot be hurt). This lets the owner's analysis compare how they dodge each attack in the study with the real fight.

## Menu, settings, app
- `Prefs` gains `study: 0 | 1 | 2` (default 1; an invalid or missing stored value becomes 1). The menu model gains the row.
- `app.ts` passes the setting to `createInitialState` and to the record's meta; a pure helper decides the banner text from the state; leaving during the study works through the existing hold-to-leave and summary paths.

## Tests
Simulation: with `studyRounds` 0 nothing changes (golden test); with 1 the boss performs exactly each first-phase attack once in an order that depends on the seed, never a later-phase attack (Duelist: no shockwave... the Duelist's phase 1 has slam, sweep, lunge), then the study ends exactly once with `studyEnd`; with 2 each twice, in two shuffled rounds; no damage or health loss and no `bossHit`, phase change or counter during the study; `studyHit` fires for an attack that would land; after the study the normal behaviour resumes and real hits hurt. Determinism: the same seed gives the same order. Record/replay: a fight with study 1 and 2 replays to the identical final state through `replayFinalState`, through the emulated app loop, and its analysis has the study block and flagged occurrences; a version-1 record (no `study`) still replays. Summary: time excludes the study. Menu: the Study row cycles and wraps; prefs parse/default. Banner helper: texts and timing.

## Out of scope
A study that adapts to what the player got wrong, a study for later phases, slow-motion demonstrations, and the arena and generator steps.

## Done when
Tests pass, CI is green and deployed, and the owner has played with Study Off, Once and Twice on the phone, and stats from a study fight export and replay correctly.

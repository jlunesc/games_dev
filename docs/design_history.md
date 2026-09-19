# Boss Trainer: Design History and Discussion Log

This file records **everything discussed** while designing the project: what was decided, what was considered and dropped, why, what the research found, and what is still open. It is background context.

- `SPEC.md` is the source of truth for what to build. If the two files ever disagree, the spec wins.
- Claude Code does not load this file automatically. Read it when the reasoning behind a decision matters.

**Status tags**: LOCKED (owner decided), DELEGATED (owner had no preference, Claude decided), DEFAULT (proposed, not yet approved), OPEN, DEFERRED (postponed on purpose), DISCARDED.

---

## 1. Origin and goal

The owner wants to build a repository of simple games that help them improve at other games, mainly **boss fights**: learning attack patterns and reading telegraphs. Target games:

- Metroidvanias, mainly Hollow Knight and Grime (the main focus).
- Later, Doom and Risk of Rain 2 (3D). The owner has a lot of trouble with 3D games, and Risk of Rain 2 feels impossible to play.

Constraints stated by the owner:
- Programming language: agnostic at the start. Later: since Claude writes all the code, they prefer something **safe**.
- The games must run on a **Samsung Galaxy S21** (Android).
- Development and tests happen on a **PC first**, then the game is used on the phone, where the owner plays and recovers the stats.
- **It must be fun to play as a real game.** The owner clarified that "real game" means a proper game feel, not a sterile drill.
- **Security is important** (section 3.7).

## 2. How the conversation unfolded

1. **First brainstorm.** Claude suggested web games (HTML5 canvas with JavaScript or TypeScript), hosted for free and installed on the phone as a web app. It also listed skill-drill ideas and a repo structure (see section 5). It asked which games the owner wants to improve at and their programming comfort level.
2. **Working-style preference.** The owner asked that brainstorming not start with a full plan, and that the specification be built together, step by step. This became the way of working for the rest of the session.
3. **Scoping.** Focus on 2D metroidvania boss fights first. 3D deferred. The 8BitDo controller was mentioned.
4. **Framing the session.** Implementation choices were parked until the design was clearer.
5. **The core concept.** The owner proposed a **parametrizable boss** whose attack speed and other traits can be tuned, fights against it, exported stats from each match, and joint analysis to refine the mechanics. This replaced the idea of first diagnosing where the owner loses fights.
6. **A battery of bosses** with different styles and phases, each tunable.
7. **Stats list** for v1.
8. **Development discussion**: language, running on the phone (browser vs APK), internet needs, safety, security rules, how the move to an APK would work later.
9. **Player and fight rules**: moves, dash, health, death, menu, difficulty, summary screen.
10. **Feel**: visual style, hit feedback, sound.
11. **Boss research** on Grime and Metroid, then **three boss sketches**, and the first boss.
12. **Remaining topics**, then the **handoff to Claude Code** through `SPEC.md` and `CLAUDE.md`.

## 3. Decisions, with alternatives and reasons

### 3.1 Concept: a boss battery inside one game
- **Chosen (LOCKED)**: one game with a growing **battery of bosses**, each defined by tunable parameters. Fight, export the stats, analyze together, refine.
- **Considered at the start**: a repo of many small games, each isolating one skill, with a shared mini-engine and a common stats layer. The owner's own concept was more direct and replaced it. A repo with several games remains possible later, for example for 3D drills.
- **Why**: stats from real fights show where the owner loses, so we do not have to guess.

### 3.2 Scope: 2D first
- **Chosen (LOCKED)**: 2D boss fights first (Hollow Knight, Grime style).
- **DEFERRED**: 3D drills for Doom and Risk of Rain 2. Much of the difficulty there is in controls and camera, and touch controls differ a lot from a controller or mouse. Claude asked what exactly makes Risk of Rain 2 feel impossible (aiming while moving, tracking enemies out of view, camera, motion sickness, too much happening at once). This was **not answered yet**, and the answer would decide whether a 3D drill is worth building.
- **Input**: controller only, with the owner's Bluetooth 8BitDo. **Touch controls are not planned.** Skill transfer depends on input type: touch trains timing and pattern recognition but not controller muscle memory.

### 3.3 How to find weaknesses
- **Chosen (LOCKED)**: exported stats and joint analysis.
- **DISCARDED**: starting with a diagnosis discussion. Claude proposed three skills to drill (reading telegraphs, dodging and spacing, punishing) and asked where the owner loses fights. The owner's stats-driven approach made this unnecessary.

### 3.4 Boss parameters
- **Chosen (LOCKED)**: one **flat list** of tunable parameters per boss: attack speed, frequency, wind-up duration, recovery, gap between attacks, combo length, predictability (fixed vs random order), HP ("tankiness"), number of phases and thresholds.
- **DISCARDED**: Claude proposed splitting parameters into "boss level" and "attack level". The owner found the split artificial and useless, so it was dropped.

### 3.5 Language
- **Chosen (LOCKED)**: **TypeScript in strict mode** to start.
- **Considered**: **Rust** (strict compiler, error messages help the coding loop). Not chosen for now because Android packaging needs extra tooling and each change builds more slowly, which matters when tuning boss timings. Rust could also target the browser through WebAssembly. Kept as a possible later move.
- **Mentioned**: Godot as an alternative game engine in the first reply. Not investigated further.
- **Why TypeScript**: instant feedback in the browser, minimal setup, strict mode catches many mistakes, and the design stays portable. Rust's extra safety matters less for a small offline game with no server and few dependencies, since the locked security rules already cover the main risks.
- **Portability rule**: bosses as data files, a fixed and documented stats format, and the spec as the source of truth, so a later rewrite would mostly translate the engine and not redesign the game.

### 3.5b Build and test tooling
- **Chosen (LOCKED)**: **Vite** (build and dev server) and **Vitest** (tests), with TypeScript strict. The offline service worker is written by hand and generated at build time by a small in-repo build plugin (`tools/precache-plugin.ts`). No PWA plugin.
- **Considered**: **esbuild plus `node:test`** (fewer moving parts, but no dev server or hot reload, and we would build that ourselves); **`tsc` only** (no bundler, so no hashed asset names, no dev server, and imports would need extra handling in the browser).
- **Why**: Vite and Vitest share one config and give fast feedback on the PC, which matters when tuning boss timings. A PWA plugin would add many transitive dependencies for a service worker of about fifty lines, and the security rules ask for few dependencies. Writing the worker ourselves also keeps its caching behavior easy to read and test.

### 3.6 Delivery on the phone
- **Chosen (LOCKED)**: an installable **web app (PWA)** first. It caches its files at the first visit, then runs from the home screen **fully offline**, with controller support through the browser Gamepad API.
- **DEFERRED**: a real **APK**. Constraints researched:
  - One-time setup on the PC: Android SDK and NDK (or a Docker image that bundles them), Java, and a signing key.
  - The owner installs the file by hand (sideloading) and allows installs from outside the Play Store.
  - Updates mean rebuilding, transferring and reinstalling the file, signed with the same key.
  - The signing key must be kept private.
- **Route to an APK later, for a web game**:
  - **Capacitor**: wraps the built web files inside an Android shell. The game ships inside the app and needs no hosting.
  - **Bubblewrap (Trusted Web Activity)**: packages a hosted PWA and opens it fullscreen. It needs a live HTTPS site and a web manifest, and does not work with local files. The web app updates on its own.
  - **TypeScript**: both routes work with no code changes.
  - **Rust compiled to WebAssembly**: the same wrappers apply. There is a community crate for using Capacitor from Rust, but its author calls it early stage. One WebAssembly project reported a loading hang inside Capacitor's WebView that worked in a normal browser. More places for surprises than TypeScript.
  - **Native Rust route** (not pursued): macroquad supports PC, HTML5 and Android from the same code, with a Docker-based APK build that is slow because it builds each Android target. Bevy has more moving parts: since version 0.15 it uses GameActivity with cargo-ndk and Gradle, and contributors themselves call the Android examples confusing.
  - **Not verified**: whether the 8BitDo controller works through the Gamepad API inside the wrapper. Test early when the time comes.
- **Why the web app first**: simpler setup and automatic updates. The APK can be added if something feels missing. The owner first found the APK explanation too technical, so it was simplified to "app file vs installable web app", and the web app was accepted.
- **Stats storage caveat**: Android can clear a browser app's stored data (wiped site data, low storage), so stats must be exported regularly and not left to pile up.

### 3.7 Hosting, privacy and security
- **Chosen (LOCKED)**: **public hosting is fine**, with strong emphasis on security. Host: **GitHub Pages (LOCKED)**. The Content Security Policy is a `<meta>` tag because Pages cannot set response headers, so `frame-ancestors` cannot be enforced. Accepted.
- **Considered for privacy**: a private repository or private hosting (may need a paid plan, not verified), or copying the built game onto the phone directly. Installing a PWA normally requires HTTPS, so serving it from the PC over home wifi would not work without extra setup. The public option makes this unnecessary.
- **Nothing about the owner goes to the internet**: only the game files are hosted. No accounts, no server, no uploads. Stats stay on the devices and leave only when the owner exports them.
- **LOCKED security rules**: no backend, accounts or uploads; no third-party scripts or trackers; few dependencies, pinned, with vulnerability alerts and an audit step; strict Content Security Policy; two-factor authentication on the GitHub account (the account is the real target, since whoever controls it could change the game installed on the phone); exported stats never committed to the public repo.
- **To-do (later)**: have an agent test the game's security.
- **Note**: CLAUDE.md is guidance, not enforcement. Where possible, back the rules with automated checks in the repo.

### 3.8 Player moves and dash
- **Chosen (LOCKED)**: start simple: move left and right, jump, one short-range attack, dash. No healing in v1. Add moves only when a boss needs them to be fair.
- **Dash (LOCKED)**: the dash makes the player **invulnerable** for its duration. This is more forgiving and trains when to dash.
- **DISCARDED**: a dash without invulnerability (stricter, trains reading and positioning). It was also floated as a possible setting so both could be compared on the same boss, but the owner chose invulnerable as the default.

### 3.9 Health
- **Chosen (LOCKED)**: **hit-based**. **DEFAULT**: 5 hits (adjustable setting) and a short invulnerability window after being hit so one attack cannot hit several times.
- **DISCARDED**: a health bar with varying damage. More nuanced but harder to read at a glance. Hit-based also gives one clean event per hit in the stats and matches Hollow Knight.

### 3.10 Death and restarting
- **Chosen (LOCKED)**: dying returns the owner to the **menu**. Every attempt starts from the beginning of the fight.
- **DISCARDED**: restarting from the phase reached. It would make practice on hard late phases faster, but the owner prefers the menu flow. This also means each attempt is one clean record in the stats.

### 3.11 Menu, difficulty, summary
- **LOCKED**: a menu to pick a boss and a difficulty, then the fight starts right away. The menu remembers the last boss and difficulty.
- **LOCKED**: difficulty as **presets** (Easy, Normal, Hard, etc.), with any individual parameter tweakable on top. Each attempt's log records the preset and every changed value. Preset names and values are OPEN.
- **LOCKED**: a short **summary screen** after each fight (result, time, phase reached, hits taken, most dangerous attack), then back to the menu.
- **DISCARDED**: going straight back to the menu with no summary.

### 3.12 Visual style
- **Chosen (LOCKED)**: start with a **geometric style** (simple shapes, strong colors, glows, very readable telegraphs) and upgrade later. Art stays separate from fight logic so a boss can be restyled without changing how it fights.
- **Considered**: pixel art from the start (closer to Hollow Knight, but slower to produce and iterate on). Postponed.

### 3.13 Hit feedback and sound
- **DELEGATED** (owner had no strong opinion): brief freeze on impact, small screen shake, flash on the boss when hit, clear flash on the player when hurt; simple sound effects generated in code (hit, dash, telegraph cue); no music in v1. All switchable off in settings.
- **Not chosen**: staying silent in v1.
- **Reasoning**: an audio cue on a telegraph gives a second way to read it, which also helps training.

### 3.14 Bosses
- **LOCKED**: bosses are designed as in **real games**, inspired by Hollow Knight, Metroid, Ori and Grime. **Inspiration only, no copying**: original names, art and patterns. The battery grows over time.
- **Archetypes saved for later**: melee duelist, heavy bruiser, zoner, summoner, trickster. Which to implement first was left open, then settled by the first-boss decision below.
- **Sketches (working names, original)**:
  1. **Ember Duelist**: melee duelist that trains telegraph reading. The pose of its weapon arm picks the attack (raised = overhead slam, sideways = sweep, pulled back = lunge). One attack flashes gold and can be countered for a stagger. Phase 2 at about 66% HP adds a fourth attack and longer chains.
  2. **Veiled Lantern**: trains patience and not being greedy. Takes damage only while its lantern is open, briefly after some attacks. Leaves lingering embers. Nearly invisible in phase 2 except for the lantern.
  3. **Moulter**: trains adapting. Three forms, each needing a different response: counter, dash through, then keep moving through bomb patterns.
- **First boss (DELEGATED)**: Ember Duelist. The owner said they did not mind, and Claude picked the simplest sketch that exercises attacks, phases, the counter and the stats log.

### 3.15 Controller
- **Chosen (LOCKED)**: a Bluetooth 8BitDo controller through the browser Gamepad API.
- **OPEN**: button layout. 8BitDo pads report buttons differently depending on their mode (for example Android, X-input and Switch modes), so an early test on the S21 is planned.

### 3.16 Passing the context to Claude Code
- Memory saved in claude.ai and Claude Code's memory are separate systems. Users have requested that they be linked (GitHub issues), and no supported way was found.
- **Chosen**: hand the context over through files in the repo: `docs/SPEC.md` (full spec) and `CLAUDE.md` (short project instructions that point to it). Claude Code reads CLAUDE.md at the start of every session. Docs note that long CLAUDE.md files use more context and may reduce adherence, so the detail lives in the spec.
- This file is extra context and is deliberately not referenced from CLAUDE.md, to avoid loading it every session.

## 4. Stats (v1)

The owner asked for as much information as possible, as a first version to complete while testing. The full list is in `SPEC.md` section 9. In short: per fight (boss, parameters, result, duration, phase reached, HP, damage, accuracy), per boss attack occurrence (type, phase, timing, distance, outcome, reaction time, dodge margin, what the player was doing), player behavior (input log, positions, range time, punish windows, heals), and derived measures (hit rate per attack, learning curve, fatigue, death causes).

## 5. Ideas floated but not adopted (yet)

**From the first reply (skill-drill ideas, now covered by the boss battery and the stats)**: dodge timing, pattern reading, spacing and kiting, bullet-hell-lite movement, punish windows, resource management, reaction and tracking.

**Mechanics from the Grime and Metroid research (candidates, none locked)**
- Two attack classes told apart by a color cue: counterable and must-dodge.
- Phases at HP thresholds with a signature opening attack, and extra attacks in later phases.
- A pose that reveals the attack, so the telegraph is part of the body.
- Hidden or rarely exposed weak points and limited damage windows.
- Twin bosses alternating a shared attack set to split attention.
- Form changes where each form needs a different tactic, and a final survive-only phase where the boss cannot be damaged.
- Arena as a mechanic: cover, switches that change the arena, hazards, a shrinking safe area.
- Lingering hazards on the ground.
- Punishing greed, for example hitting the boss spawns extra dangers in a harder pass.
- A harder second pass that adds patterns (fits the difficulty presets).
- A dash budget (limited dashes) so that greedy attacking has a cost. OPEN whether the dash gets a cooldown or stamina.
- A setting for whether failure restarts from the phase reached or from the start (the owner chose menu and full restart, section 3.10).

## 6. Research notes

**Grime.** The Fandom wiki could not be read (access error), so the English NamuWiki was used, which is machine-translated. It lists 11 main bosses, 4 more in DLC and 6 mini-bosses. All main bosses have phases, and a second playthrough adds patterns. Enemies in Grime glow red before attacks that cannot be absorbed. Three boss pages were read (Mother of Whispers, Vulture, Fidus), and the owner later pasted the Whispering Mothers page. Mechanics noted: counterable versus must-dodge attacks, phase 2 starting below 70% HP with a large area opener, twin bodies alternating five patterns, a second creature that must be killed while the main boss keeps attacking, a phase where the boss cannot be damaged, an arena object usable as cover, a shrinking arena, greed punished in the harder pass, a "keep enough to dash" strategy, and a rule that dying in phase 2 sends the player back to phase 1.

**Metroid (Dread and Super Metroid).**
- The tail pose of one boss tells which attack is coming, and its head moves between low, middle and high, so the player crouches, stands or jumps to hit it.
- A later phase makes it nearly invisible with a glowing spot to hit.
- Another boss can only be hurt through an eye it rarely opens.
- One boss changes form three times: parry the first, slide under the second, avoid bomb volleys in the third.
- One fight uses switches to lower the water and expose the weak spot; another lets the player electrocute the boss with wall turrets while it holds them.
- A flash marks an attack that can be countered for a follow-up.
- Fireballs that hit the ground keep damaging for a while.

**Controller and browser.** Android supports a wide range of game controllers, and the browser Gamepad API works with Bluetooth controllers. The exact behavior of the 8BitDo on the S21 is still to be tested.

## 7. Questions asked and not answered

- Which games cause the most trouble (asked at the start; the metroidvania focus came from the owner's later answer).
- The owner's programming comfort level (moot: Claude writes the code).
- What exactly makes Risk of Rain 2 so hard (decides whether a 3D drill is worth building).
- What makes a boss fight fun and not just frustrating in Hollow Knight or Grime (the owner said "we will see when we start").
- Which Grime and Metroid mechanics should go on the list for the first bosses (the owner asked for research and boss sketches first, and later left the choices to Claude).

## 8. Working preferences observed

- Build the specification together, one decision at a time. No full plan up front.
- The owner prefers to be told the reasoning in plain terms, and asked for a simpler explanation when it got too technical.
- The owner is comfortable delegating decisions they do not care about (sound, first boss) and wants those decisions recorded.
- Security matters, and the game must remain fun.
- Note on memory: the brainstorming preference was saved inside the Project's memory only, because the session was attached to a Project. To make it apply globally, ask again from a regular chat outside the Project.

## 9. Sources consulted

- Grime boss list: https://en.namu.wiki/w/GRIME/%EB%B3%B4%EC%8A%A4
- Vulture: https://en.namu.wiki/w/%EB%B2%8C%EC%B2%98(GRIME)
- Fidus of Balance: https://en.namu.wiki/w/%EA%B7%A0%ED%98%95%EC%9D%98%20%ED%94%BC%EB%91%90%EC%8A%A4
- Mother of Whispers: https://en.namu.wiki/w/%EC%86%8D%EC%82%AD%EC%9E%84%EC%9D%98%20%EB%AA%A8%EC%B2%B4
- Grime Wiki, Prey: https://grimegame.fandom.com/wiki/Prey
- Metroid Dread boss guide: https://www.pastemagazine.com/games/metroid-dread/metroid-dread-boss-guide
- Metroid Dread boss battles: https://gamefaqs.gamespot.com/switch/323656-metroid-dread/faqs/79592/boss-battles
- Metroid Dread bosses, ranked: https://www.dualshockers.com/metroid-dread-hardest-boss-fights/
- Metroid Dread bosses (form changes): https://glamorous-z.neocities.org/MetroidDread2
- Super Metroid boss guide: https://www.thegamer.com/super-metroid-main-boss-guide/
- Super Metroid bosses: https://omegametroid.com/super-metroid-walkthrough/bosses/
- Macroquad on Android: https://macroquad.rs/articles/android/ and https://mq.agical.se/release-android.html
- Bevy 0.14 to 0.15 migration guide: https://bevy.org/learn/migration-guides/0-14-to-0-15/
- Bevy Android examples discussion: https://github.com/bevyengine/bevy/discussions/22597
- Capacitor Android docs: https://capacitorjs.com/docs/v3/android
- Capacitor guide: https://dev.to/narottam04/convert-your-website-into-an-android-app-using-capacitor--5bh2
- Bubblewrap: https://github.com/googlechromelabs/bubblewrap
- Bubblewrap limitations: https://github.com/Lewismwaz/website-to-apk-bubblewrap
- Bubblewrap and PWA updates: https://www.thinktecture.com/en/pwa/twa-bubblewrap/
- Rust bindings for Capacitor: https://docs.rs/crate/capacitor_bindings/latest
- WebAssembly and Capacitor WebView issue: https://docs.rs/crate/miden-client-web/0.14.5
- Android game controllers: https://developer.android.com/training/game-controllers
- How Claude Code remembers your project: https://code.claude.com/docs/en/memory
- Request to link claude.ai memory and Claude Code: https://github.com/anthropics/claude-code/issues/14228
- Request to read Project knowledge from Claude Code: https://github.com/anthropics/claude-code/issues/25833

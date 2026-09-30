# Backlog: ideas for later

Ideas from the owner, not decided and not scheduled. Nothing here is in `docs/SPEC.md` yet, except the study phase (M5b), the arena (M5c) and the looks (M5d), which are built and recorded in the spec; when one is picked up, it goes through the normal design conversation and then into the spec with a status tag.

## Playable character types (raised 2026-09-20)
Choose a character type by its moves, in the style of games such as Hollow Knight or Blasphemous, so the trainer matches the game being practiced for. Different types would change the player's moves and feel (for example a faster, lighter fighter versus a slower, heavier one with longer reach).

Notes for the design: the player's numbers already live in one data file (`src/game/params.ts`), so a character type could later be a named set of those values plus any extra moves. The spec says extra moves are added only when a boss needs them to be fair, so this needs its own design pass.

## Environmental complexity (raised 2026-09-20)
Things happening in the background of the arena that can hurt the player, on top of the boss's own attacks: falling objects, moving hazards, and so on. The spec already lists related mechanics as candidates (arena as a mechanic, lingering hazards, shrinking safe area).

**Partly built in M5c** (awaiting the owner's play test): platforms and cover are done (`docs/SPEC.md` section 11, format and rules in `docs/bosses.md`). Ideas that are **not built**, only listed:
- **A boss blocked by cover (top arena item, raised after the M5c review)**: the real fix for the weak wall. A probe on the shipped arena (wall 100 high, 40 seeds x 1800 updates) showed that a player standing still behind the wall takes exactly as many hits as with the wall removed (496 vs 496), because the Hound walks through the wall (the rush is carried through it, the pounce lands on the player's take-off spot) and the bite (window top 110) passes over it. The wall does cut hit windows (1020 of 9261 window-updates) but the attack lands anyway, so the `cover` evasion is expected to stay at 0 or rare until the boss is stopped by cover or walks around it.
- **Platforms the boss uses**: the boss stands on, jumps to or fights from platforms (today it ignores the arena and walks through it).
- **Hazards**: falling objects and moving hazards with their own timing.
- **Moving or destroyable pieces**: platforms that move, cover that breaks.
- **A narrower foot test for ledges**: today any overlap of the 48-wide body lands the player on a ledge, so a body can hang over an edge with up to 47 units off it. A test on the feet only (or the body's centre) would fix that.
- **Arena pieces chosen at random for a generated boss**: the generator (M5e, built) does not build an arena at all yet; see below.

## Random variation of enemies (raised 2026-09-20)
Randomly tweak an enemy's properties within set ranges, so a fight does not feel exactly the same every time (for example attack speed or the gap between attacks varies a little on each attempt).

Notes for the design:
- The simulation is deterministic on purpose (same inputs, same result). Randomness would have to come from a seeded random number generator whose seed is recorded with each attempt, so any fight can be replayed exactly and the stats stay meaningful.
- The spec's tunable boss parameters already include "predictability (fixed vs random order)"; ranges per parameter would extend that.
- The M2 boss data format should be able to hold a range where it now holds a single value, even though M2 uses single values.

## Export only new fights / pagination of the store (raised in the M3b review)
Export reads every saved fight at once; fine for hundreds, would matter for thousands.

## Issues noticed by the owner while testing M3b on the phone (raised 2026-09-21)
Written down only; nothing changed yet.
- **"Custom (from Normal)" shows in the Difficulty row when the menu first opens.** The owner expected plain "Normal" at the start. Possible cause, not yet checked: the phone still holds tweaked values saved during earlier testing (choices are remembered on the device), or a stored value is slightly off the preset. To investigate: does a fresh install show "Normal"?
- **The menu screens have no Back button on screen.** Tweak difficulty, Settings, Stats (and the summary) can only be left with the controller's top button, so touch-only use cannot go back. A "Back" row or button on each of those screens would fix it (the Stats screen already has a Back row; check the others).

## Study phase, then the real fight (raised 2026-09-21, built as M5b)
**Built in M5b** (awaiting the owner's play test; `docs/SPEC.md` section 11, checklist in `docs/phone-testing.md`, stats in `docs/stats.md`). The owner decided that the study shows the first phase's attacks only, and that it is a menu setting: Off, Once or Twice (default Once). In the study the boss shows each first-phase attack once per round in a random order with damage off, then "The fight begins!"; the stats mark the study (schema version 2) so it can be compared with the real fight.

Ideas that are **not built**, only listed:
- **Adaptive study**: show again the attacks the player got wrong (or was hit by most) instead of a fixed set.
- **Study for later phases**: demonstrate the attacks a boss only uses in phase 2 and later (today they are discovered in the real fight).
- **Slow-motion demonstrations**: show the attacks slower than in the real fight, so the warning is easier to read.
- **Split the behaviour stats by study**: the swings, dashes, jumps, distance bands and positions cover the whole session, with the study part given only for the distance bands (`study.ticks`, `behavior.studyUpdatesClose/Mid/Far`); a full split (swings, dashes and jumps per part, a separate positions timeline) could be added with a schema bump if the analysis needs it.
- **Hittable boss in the study**: let the player practise punishes in the study (asked in the play-test questions).

Order of the next steps (owner, 2026-09-21): the study phase (M5b, built), the arena (M5c, built), the visual pass (M5d, built), the generator (M5e, built). All four now await the owner's play test.

## Nicer visuals within the geometric style (raised 2026-09-21, built as M5d)
**Built in M5d** (awaiting the owner's look on the phone; `docs/SPEC.md` section 11, checklist and tweak guide in `docs/phone-testing.md`): a layered background with a mood per boss, impact effects and particles, animated figures for the player, the Ember Duelist and the Ashen Hound (and a generic one for any other boss; every hand-made boss has since got its own, see slice D below), and the Effects switch in Settings. All numbers are in `src/ui/look/tuning.ts`.

Look ideas that are **not built**, only listed:
- **Clearer attack warnings**: a stronger, earlier or more distinct sign that an attack is coming (a ring pulse or a flash when a warning starts, a brighter ground marker, a sound cue), so the pose and glow are not the only telegraph. Not chosen by the owner for M5d. Related: the Hound has no arm, so its body shows the attack pose (jaw open for the bite, rearing for the rush and the slip, crouch for the pounce); if these are hard to read, stronger versions or a separate sign would help. The sound part is now covered by the attack sounds (M7, "Sound, left out" below).
- **A HUD redesign**: the hearts and the boss health bar are still the plain rectangles from M1. Not chosen by the owner for M5d.
- **Effects specific to each boss's attacks**: for example embers thrown by the Duelist's slam, a dust line along the floor for the Hound's rush, a trail behind the Duelist's lunge. M5d has only the general effects (sparks, rings, dust, dash trail, bursts).
- **Sprite art later**: replacing the geometric shapes with pixel-art sprites (a possible upgrade kept open by the locked style, `docs/SPEC.md` section 8). Art is separate from fight logic, so this can be done without touching how a fight plays.
- **Lean and animation refinements**: the figures only lean into the windup and swing; ideas are a follow-through after an attack, squash and stretch on landing, an anticipation pose for the player's dash, turning animations.
- **Nicer arena pieces**: textures or patterns on the ledges and the wall beyond the outline and the edge glow.

### Original note
The owner wants nicer visuals, **within the locked geometric style** (`docs/SPEC.md` section 8): not necessarily new assets, but a better-looking result from shapes, color, glow and motion. Planned as **M5d** (now built), after the arena (M5c, built) and before the generator (M5e). The owner's choices for it (2026-09-21): a **layered background**, **impact effects and particles**, and **better boss and player shapes**. The arena's platforms and cover are drawn plainly today (rectangles with a lighter top edge); the pass can make them nicer too.

Notes for the design:
- Art is kept separate from fight logic (SPEC section 8) and everything drawn lives in `src/ui/render.ts` and `src/ui/look/`, so a visual pass should not change how a fight plays; the Ember Duelist golden test (`tests/duelist-golden.test.ts`) would show it if it did.
- The readability of telegraphs (pose, glow, the landing bar of a leap) comes first; anything decorative must not hide them. The owner's play test of the Ashen Hound will say whether the red landing bar is readable enough.

## Backgrounds (original M6 item 5)
**Step 1 done 2026-09-29 (awaiting the owner's look on the phone): varied backdrops for generated bosses.** Each generated fight gets a backdrop and body colour invented from its seed (`src/ui/look/generated-mood.ts`, checklist in `docs/phone-testing.md` "Generated backdrops"). The owner chose, one decision at a time: work on **both** generated and hand-built backdrops, **generated first**, and **built from random colours** (not a set of hand-made themes). Look only; the fight and the recording do not depend on it. **Step 2 done 2026-09-29 (awaiting the owner's look on the phone): richer backdrops.** The owner said "do as you want" and set one constraint: the game must not be overloaded, it has to run on the phone. So everything is cheap and capped (all numbers in `LOOK` in `src/ui/look/tuning.ts`): a **glow** (moon, sun or horizon light) and **mist bands** that drift like one more layer are drawn once into the cached backdrop pictures; **rain or wind streaks** (28 and 14) go in one stroke; a **dim lightning flash** (Storm Kite only, at most one flash every 7 seconds, never above 14% brightness) is one fill. Each hand-built boss got some of these (Storm Kite: rain, lightning, cloud; Gale Reaver: wind and cloud; the Veil Dancer, Vesper Sage, Brass Sentinel, Ashen Hound and Quill Warden a moon or sun, and so on), and generated fights get a random glow, mist about 6 times in 10, and rain or wind about 1 time in 4. The Effects switch in Settings turns off the mist drift, the streaks and the lightning (the glow is part of the sky and stays). Not built: lightning bolts you can see, snow or ash, weather that reacts to the fight.

## The boss generator (raised 2026-09-22, built as M5e)
**Built in M5e** (awaiting the owner's play test on the phone; `docs/SPEC.md` section 11, mechanism and format in `docs/bosses.md` section 3b, checklist in `docs/phone-testing.md`): a "Generated" entry in the Boss row that assembles a boss at random from the same hit/move/leap primitives a hand-written boss file uses, checked for fairness before every fight and rebuilt fresh from that fight's seed each time.

Ideas that are **not built**, only listed:
- ~~Generated arenas~~ **Built in M6a** (`docs/SPEC.md` section 11, design in `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`): a generated boss sometimes has 1 to 3 platforms or cover now, heights spread apart on purpose, checked by a new, generic camp-safety fairness check.
- **A second phase**: a generated boss is one phase only.
- **A saved roster of generated bosses**: today a generated boss only exists for the fight it was built for (rebuilt from the seed); there is no way to keep one and fight it again on purpose, or to name and share one.
- **Using play stats to steer generation**: picking tuned ranges, or which primitives to draw from, based on what the exported stats say about the player (for example leaning the generator towards attack shapes that read badly for the owner). Today generation is uniform random inside fixed ranges (`src/bosses/generate/tuning.ts`), with no memory of past fights. **Pulled forward as M6 roadmap Phase 2** (`docs/SPEC.md` section 11, design in `docs/superpowers/specs/2026-09-22-m6-roadmap-design.md`) — no longer just an idea, it's the next major design after Phase 1's five hand-built bosses produce real data to design it from.
- **Exposing the Trainee on its own**: a hand-built, generous boss (`src/bosses/trainee.json`) that used to be the generator's fallback when fairness kept failing. Since M6a replaced that fallback with a banner (`docs/bosses.md`, "Retry, then use the first candidate anyway, with a banner"), it is no longer used anywhere at all — still exported and tested, just unreachable in play. It is not offered in the menu by itself.

## M6 roadmap Phase 1: five hand-built archetype bosses (built 2026-09-28)
Five new hand-built bosses (`src/bosses/*.json`, wired into `BOSSES`/the menu's Boss row), one per
archetype named in the M6 roadmap design (`docs/superpowers/specs/2026-09-22-m6-roadmap-design.md`):
**Quill Warden** (zoner — fights from range, punishes an unsafe approach), **Cinder Golem** (heavy
bruiser — slow with long, very readable telegraphs and a big punish window), **Veil Dancer**
(trickster — fakes and repositions more than it damages), **Gale Reaver** (rushdown — fast, closes
distance, chains attacks with little gap) and **Brass Sentinel** (counter-bait — mostly counterable
attacks, rewarding precise counter timing and range over dodging). Each is single-phase, arena-free,
and stays within or close to the generator's playtested `GEN` ranges (`src/bosses/generate/tuning.ts`)
except where the archetype's brief explicitly called for going past them (the Warden's poke reach).

## Slice A left out: more on projectiles, and the slices after it (raised 2026-09-28)
Slice A (`docs/superpowers/specs/2026-09-28-projectiles-design.md`) built straight bolts, lobbed arcs and the Vesper Sage. Left out on purpose:
- ~~Shots in generated bosses~~ **Built 2026-09-29 (game version 0.8.0)**: bolts (aimed and backward too) and lobbed arcs, `docs/bosses.md` section 3b. The fairness check stays cheap: the skilled bot is not taught to dodge them.
- **Cutting or deflecting a shot.** Today the swing does nothing to a shot (dodge only). Slicing a bolt, or knocking it back at the boss, is a possible addition.
- **More shot paths:** homing orbs and rolling ground waves.
- **Shots and platforms.** Platforms affect no shot. A bolt that a platform blocks, or a ceiling, is not built.

The next slices, each its own design conversation (they came out of the owner's wish for different attacks, movements and shapes):
- **Slice B: flying and hovering (done 2026-09-29, awaiting the owner's play test).** Folded into the variety pass for the five older bosses: a leap can hover (`hang`), a strike can hurt on both sides (`both`), bolts can fire backward or aimed at the player, and each boss got new attacks that use them (`docs/bosses.md` section 3a-quater). **Rest of slice B done 2026-09-29 (awaiting the owner's play test):** the Storm Kite hangs in the air between attacks (`flight`) and comes down in a plunge or a swoop across the arena (`dive`), `docs/bosses.md` section 3a-quinquies. Still not built: hovering, flying or diving in generated bosses (a later round).
- **Slice C** (ground hazards) is built, see the next section.
- **Slice D: new figures for the five existing bosses (done 2026-09-29, awaiting the owner's look on the phone).** Look-only (`src/ui/look/figures.ts`, colours in `tuning.ts`, body colours in `moods.ts`). The Cinder Golem is a walking furnace, the Quill Warden a heron-like lancer with a quill crest that fans open in the warning, the Veil Dancer a masked dancer in a gown whose veils flare, the Gale Reaver a forward-leaning runner in a torn cloak with a curved blade, and the Brass Sentinel an armoured knight with a tower shield and a mace. The owner left the looks to the assistant, so every look is a first guess. Only the generic block figure remains, for a boss without a figure of its own (generated bosses).

## Slice C left out: more ground hazards (raised 2026-09-29)
Slice C (`docs/superpowers/specs/2026-09-29-eruptions-design.md`) built marked floor eruptions and the Tremor Brute. Left out on purpose:
- **Lingering zones.** Ground that stays dangerous for seconds (fire, poison) instead of a short blast.
- **Rolling ground waves** and **marches of eruptions** that travel outward from the boss.
- ~~Eruptions in generated bosses~~ **Built 2026-09-29 (game version 0.8.0)**, together with shots.
- **Eruptions and the arena.** They ignore platforms and cover today; a platform that a blast cannot reach, or a blast that reshapes the arena (the "piece tied to an attack" idea in "Dynamic arena pieces" below), is not built.
- **Eruptions that follow the player** or a mark that moves before it goes off.

Slices B and D are done (see above).

## Dynamic arena pieces (raised 2026-09-22)
Platforms or cover that are not just static: appearing/disappearing, appearing in reaction to a
specific incoming attack, or constantly moving. Raised while reviewing the M6a generated-arenas
design (`docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`), which stays static-only.

- **A piece tied to a specific attack** (e.g. cover that rises just before an explosion, so reaching
  it in time is the skill): not really an arena feature on its own — it is closer to an attack
  feature, since the terrain and the attack's timing are the same design. Owner's call (2026-09-22):
  fold this into the next design instead, the new attack primitives (M6, item 3), rather than build it
  as part of arenas.
- **Constantly moving platforms**: held back, not folded anywhere yet. Bigger and riskier than the
  above: the physics today assumes a surface does not move (a player just lands on a fixed top), so
  this needs the player to move with the platform, and it would turn the new camp-safety fairness
  check (M6a) from a yes/no question into a timing question, which is a materially harder thing to
  verify is fair, not just harder to build.

## Dash duration can't cover the longest generated hit window (raised 2026-09-22, found while diagnosing M6a's fallback rate)
A generated attack's active hit window can last up to `GEN.activeMax` (20 updates), but the player's
dash grants only 11 updates of invulnerability (`src/game/params.ts`). A single scripted dash timed to
the start of the window (the fairness checker's skilled-bot evasion, and the same idea a real player
would use) cannot survive the full window regardless of position or timing — it's a genuine gap
between two tuning numbers, not new to M6a. It stayed hidden before M6a because the skilled bot (and a
real player) could usually reposition between attacks on a bare arena; it surfaced while diagnosing the
M6a arena fallback rate because cover can pin the bot somewhere it can't otherwise avoid triggering a
long window. Not fixed as part of M6a (owner's call, 2026-09-22: this predates arenas and deserves its
own look). Ideas not evaluated yet: lower `GEN.activeMax` to fit inside the dash's 11 updates, raise the
dash's invulnerability duration, or give the skilled bot (and real players, implicitly) a way to survive
a long window other than a single dash (e.g. two dashes in sequence, or backing out of range first).

## Fairness checker cost for arenas (raised 2026-09-22, M6a)
Adding the camp-safety check (one extra idle-bot run per arena piece per fairness seed) made
`checkFairness` cost about 200-250ms per call, up from near-instant, once arenas were wired into
`generateBoss`. `resolveBoss` calls it up to 3 times per fight start (its retry-then-fallback loop),
so picking "Generated" and pressing Fight could add up to roughly 750ms of delay in the worst case.
Not addressed as part of M6a (owner's call: fix the correctness problem it was measuring, leave this
for later). Ideas not explored yet: cache/reuse partial results across the three retry attempts, lower
`GEN.fairnessCapTicks` specifically for the camp-safety sub-check (it likely resolves much faster than
a full fight once the boss can reach the piece), or run the check lazily/async so it doesn't block the
menu.

## Performance measurement (raised 2026-09-22)
No performance data is saved today: the stats record gameplay (inputs, hits, dodges, timing), never frame time, dropped frames, memory or CPU/GPU cost. The owner asked after playing M5d whether the looks were expensive on the phone; the only answer available was the design-time estimate from M5d's review (well under 1% of a 60Hz frame budget, extrapolated from Node micro-benchmarks, not measured on the device).

Idea: sample real performance during a fight, either shown live (a small debug overlay: frame time, dropped frames) or included in the exported stats (so it can be studied alongside the gameplay data, e.g. correlated with the number of active particles or which boss/arena was in play). Not designed yet: what to sample, at what cost to sample it (the measurement must not itself slow the game), and whether it needs its own settings switch.

## Up and down swings, left out (raised 2026-09-29)
Built: hold up (ground or air) or down (air only) and press attack (SPEC section 11, "Up and down swings"). The pogo bounce off the boss was added right after (2026-09-29). Not built: bouncing off spikes or hazards, an up or down counter, a swing that changes the boss's attacks (bosses that can only be hit from above or below), and the fairness bots (`src/bosses/generate/fairness.ts`) using up and down swings.

## Two-boss fights, left out (raised 2026-09-29)
Built: two bosses in one fight as a named pair (`docs/SPEC.md` section 11, "Two bosses in one fight"; checklists in `docs/phone-testing.md`). Four pairs exist: **Hound and Sage** (built 2026-09-29), **Golem and Kite**, **Brute and Dancer** and **Warden and Brute** (built 2026-09-30). All have DEFAULT numbers awaiting the owner's phone playtest. Not built:
- **A study for pairs**: each boss showing its attacks in turn (agreed in the design). The first version switches the study off for pair fights and records `study: 0`.
- **More pairs**: see "Pair candidates" below.
- **Generated pairs, and "any two bosses" chosen from the menu**: generated bosses stay solo, and every pair is its own file.
- **Bosses attacking at the same time**: a later step could allow overlap as a difficulty dial, or in a pair's second stage.
- **Bosses that move with or shield each other, or share attacks.**
- **A fairness check for pairs in the generator**: `checkFairness` and its skilled bot (`src/bosses/generate/fairness.ts`) work on one boss and read only the primary. Pairs are checked by `tests/hound-and-sage.test.ts` and the same file for each other pair (an idle player loses, the turn rule holds, both bosses get turns, a player who cannot die and only chases and swings can win); there is no scripted player that dodges a pair, so "a good player can win without being hit" is not checked for pairs.
- **A partner's arena in hit windows**: `resolveBossHits` in `src/game/step.ts` cuts a partner's hit windows with the partner's own `arena.covers`, while the player and shots use the primary boss's arena. Neither built pair has an arena, so it does not matter yet; a pair of bosses with different arenas would need this settled.

### Pair candidates (proposed by Claude 2026-09-30, owner asked for the list)
Note: in a pair fight the engine switches off three solo-boss mechanics: **temper** (anger from not being hit), **reaction** (answering a hit) and the **shield** (`s.partners.length > 0` checks in `src/game/boss.ts` and `src/game/step.ts`). So a pair boss fights without those parts of its identity. The two remaining pairs below (Brute + Dancer, Warden + Brute) lose only temper and reaction, which is the same as the two pairs already built.
Picked from each boss's attacks so that each pair trains something different from the others. Everything but Sentinel + Reaver is built (the owner said to do whatever is simplest, so the two that need no engine work were built together).

| Pair | Status | What it trains | Why it fits |
|---|---|---|---|
| Hound + Sage | built 2026-09-29 | Reading a fast close fighter and a distant shooter | The owner's choice for the first pair. |
| Golem + Kite | built 2026-09-30 (`src/bosses/golem-and-kite.json`), DEFAULT numbers | Holding your ground against a slow heavy boss while dodging shots from a flying one | The Golem has long windups and 2-damage slams; the Kite hangs above and fires bolts from above and the sides. The Kite can only be hit while low. |
| Sentinel + Reaver | idea, **needs engine work first** | Choosing which boss to face | The Sentinel's shield blocks front hits and the Reaver is fast with quick jabs; with one boss on each side, a swing at the shield would be wasted. **But the shield is switched off in every pair fight today**: `src/game/step.ts` (the block, `s.partners.length === 0`), `src/game/boss.ts` (the slow turn round) and `src/ui/render.ts` (the plate is not drawn) all skip it when there are partners, so a pair Sentinel would just be a Sentinel with no shield. Building this pair means switching the shield on for pairs (a swing at a shielded nearest boss is blocked even if the other boss is open), plus tests and spec text. Owner decision needed first. |
| Brute + Dancer | built 2026-09-30 (`src/bosses/brute-and-dancer.json`), DEFAULT numbers | Jumping floor shockwaves while a boss blinks around | The Brute's quakes and floor waves reach up to 700 units; the Dancer blinks and fires needle fans, so you cannot stand still after a jump. |
| Warden + Brute | built 2026-09-30 (`src/bosses/warden-and-brute.json`), DEFAULT numbers | Reach against close range | The Warden pokes from far away and the Brute has to be near you, so where you stand changes which one is dangerous. |
| Hound + Reaver (or any two fast melee bosses) | not recommended | | Turns cannot overlap, but two fast bosses leave almost no gap to recover in. |

**How a new pair was added (Golem and Kite, then the same for Brute and Dancer and Warden and Brute; use it as the recipe):**
1. `src/bosses/<pair-id>.json` (format in `docs/bosses.md` section 5a): two boss ids (the first is the primary: its floor and backdrop are used), `healthScale` for each, `enrage`. First guess used so far: 0.6 for each boss, enrage `gapScale` 0.6 and `walkScale` 1.3.
2. Load it in `src/bosses/pairs.ts` and add it to `PAIRS`. The Boss row, saved menu choice, fight setup and stats pick it up with no other change. No sound, look or engine change was needed for Golem and Kite (the drawing code is generic for partners, including a flying one).
3. Tests: copy `tests/golem-and-kite.test.ts` (the checks listed above; the shared scripted players are in `tests/pair-helpers.ts`), add the pair to `tests/pair-parse.test.ts` (registry) and update the Boss-row walk in `tests/menu-model.test.ts` ("walks through each pair in order"). Copying the test file with a search-and-replace of the boss and pair names is enough.
4. Docs: a section in `docs/phone-testing.md` (checklist and questions), the tags in `docs/SPEC.md` section 11, and a row in the table above.
5. `GAME_VERSION` needs no bump for a new pair (nothing recorded uses it yet). It does need a bump if a pair file's numbers are changed after fights of that pair were exported.

Scripted-player results for Golem and Kite (8 seeds, a bot that runs at the nearest boss and swings, never dodges; an idle player, for comparison): Easy idle dies in about 12s and the chaser wins 4/8; Normal 10s and 0/8; Hard 7s and 0/8. Hound and Sage on the same measure: Easy 10s and 8/8; Normal 9s and 6/8; Hard 5s and 0/8. So Golem and Kite is expected to feel harder; the owner's play test decides whether the health scales go up. Brute and Dancer: Easy idle dies in about 14s and the chaser wins 8/8; Normal 11s and 4/8; Hard 6s and 0/8. Warden and Brute: Easy 14s and 8/8; Normal 11s and 3/8; Hard 7s and 0/8.

## Sound, left out (raised 2026-09-29)
Built: fight sounds, attack-specific sounds and layered music, all generated in code, with one master Volume (`docs/SPEC.md` section 11, "Sound and music (M7)"; checklist in `docs/phone-testing.md`). Not built:
- **A separate Music switch**: music cannot be turned off alone (OPEN in the spec).
- **Menu and UI sounds**: taps, moving through menus, the summary screen.
- **Music on the summary screen**: today it stops with the win or loss sting.
- **A hand-composed track per boss**: the score is a short chord loop per key, so bosses differ by key, mode and tempo, not by melody.
- **Sound files or samples**, and **reverb or spatial sound**: kept out for the phone's budget and because everything is generated in code.
- **Distinct sounds per boss for the same event** (each boss having its own hit or death sound): sounds vary by attack shape and pair position, not by boss.
- **Sound in the stats or the fairness checks**: sound reads the game only and is not recorded.

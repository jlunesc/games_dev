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
**Built in M5d** (awaiting the owner's look on the phone; `docs/SPEC.md` section 11, checklist and tweak guide in `docs/phone-testing.md`): a layered background with a mood per boss, impact effects and particles, animated figures for the player, the Ember Duelist and the Ashen Hound (and a generic one for any other boss), and the Effects switch in Settings. All numbers are in `src/ui/look/tuning.ts`.

Look ideas that are **not built**, only listed:
- **Clearer attack warnings**: a stronger, earlier or more distinct sign that an attack is coming (a ring pulse or a flash when a warning starts, a brighter ground marker, a sound cue), so the pose and glow are not the only telegraph. Not chosen by the owner for M5d. Related: the Hound has no arm, so its body shows the attack pose (jaw open for the bite, rearing for the rush and the slip, crouch for the pounce); if these are hard to read, stronger versions or a separate sign would help.
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

## The boss generator (raised 2026-09-22, built as M5e)
**Built in M5e** (awaiting the owner's play test on the phone; `docs/SPEC.md` section 11, mechanism and format in `docs/bosses.md` section 3b, checklist in `docs/phone-testing.md`): a "Generated" entry in the Boss row that assembles a boss at random from the same hit/move/leap primitives a hand-written boss file uses, checked for fairness before every fight and rebuilt fresh from that fight's seed each time.

Ideas that are **not built**, only listed:
- **Generated arenas**: a generated boss has no `arena` at all yet (a bare floor, like the Ember Duelist); the M5c arena's own placement rules (no safe camping spot, cover that actually blocks something) would need to be generalized to arbitrary generated attacks first.
- **A second phase**: a generated boss is one phase only.
- **A saved roster of generated bosses**: today a generated boss only exists for the fight it was built for (rebuilt from the seed); there is no way to keep one and fight it again on purpose, or to name and share one.
- **Using play stats to steer generation**: picking tuned ranges, or which primitives to draw from, based on what the exported stats say about the player (for example leaning the generator towards attack shapes that read badly for the owner). Today generation is uniform random inside fixed ranges (`src/bosses/generate/tuning.ts`), with no memory of past fights.
- **Exposing the Trainee (the fallback boss) on its own**: today it only appears when the fairness check fails three times in a row for a seed (measured at about 2% of seeds); it is not offered anywhere in the menu by itself.

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

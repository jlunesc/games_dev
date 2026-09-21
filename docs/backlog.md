# Backlog: ideas for later

Ideas from the owner, not decided and not scheduled. Nothing here is in `docs/SPEC.md` yet, except the study phase (M5b) and the arena (M5c), which are built and recorded in the spec; when one is picked up, it goes through the normal design conversation and then into the spec with a status tag.

## Playable character types (raised 2026-09-20)
Choose a character type by its moves, in the style of games such as Hollow Knight or Blasphemous, so the trainer matches the game being practiced for. Different types would change the player's moves and feel (for example a faster, lighter fighter versus a slower, heavier one with longer reach).

Notes for the design: the player's numbers already live in one data file (`src/game/params.ts`), so a character type could later be a named set of those values plus any extra moves. The spec says extra moves are added only when a boss needs them to be fair, so this needs its own design pass.

## Environmental complexity (raised 2026-09-20)
Things happening in the background of the arena that can hurt the player, on top of the boss's own attacks: falling objects, moving hazards, and so on. The spec already lists related mechanics as candidates (arena as a mechanic, lingering hazards, shrinking safe area).

**Partly built in M5c** (awaiting the owner's play test): platforms and cover are done (`docs/SPEC.md` section 11, format and rules in `docs/bosses.md`). Ideas that are **not built**, only listed:
- **Platforms the boss uses**: the boss stands on, jumps to or fights from platforms (today it ignores the arena and walks through it).
- **Hazards**: falling objects and moving hazards with their own timing.
- **Moving or destroyable pieces**: platforms that move, cover that breaks.
- **A boss blocked by cover**: the real fix for the weak wall (the Hound walks through it, so a rush can end inside the cover and still hit a player behind it). The boss would be stopped by cover or walk around it.
- **A narrower foot test for ledges**: today any overlap of the 48-wide body lands the player on a ledge, so a body can hang over an edge with up to 47 units off it. A test on the feet only (or the body's centre) would fix that.
- **The top of the Hound's wall is a place nothing can reach.** It is 120 high and every Hound window tops out at 110, 100 or 60, so a player standing on it cannot be hurt (nor hit the boss). The play test will say whether that matters; a lower wall or a taller attack would change it. (The platforms were lowered to 90 for the same reason.)
- **Arena pieces chosen at random** (the generator, M5e).

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

Order of the next steps (owner, 2026-09-21): the study phase (M5b, built), the arena (M5c, built), the visual pass (M5d), then the generator (M5e).

## Nicer visuals within the geometric style (raised 2026-09-21)
The owner wants nicer visuals, **within the locked geometric style** (`docs/SPEC.md` section 8): not necessarily new assets, but a better-looking result from shapes, color, glow and motion. Planned as **M5d**, after the arena (M5c, built) and before the generator (M5e). The owner's choices for it (2026-09-21): a **layered background**, **impact effects and particles**, and **better boss and player shapes**. The arena's platforms and cover are drawn plainly today (rectangles with a lighter top edge); the pass can make them nicer too.

Notes for the design:
- Art is kept separate from fight logic (SPEC section 8) and everything drawn lives in `src/ui/render.ts`, so a visual pass should not change how a fight plays; the Ember Duelist golden test (`tests/duelist-golden.test.ts`) would show it if it did.
- The readability of telegraphs (pose, glow, the landing bar of a leap) comes first; anything decorative must not hide them. The owner's play test of the Ashen Hound will say whether the red landing bar is readable enough.

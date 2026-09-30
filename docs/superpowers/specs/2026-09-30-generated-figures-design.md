# Generated boss figures (design, 2026-09-30)

## Goal

Every generated boss gets a new look, not only a new size and colour. Today the `generated` boss is drawn by the
fallback `genericFigure` in `src/ui/look/figures.ts`: a block, a round head, an eye and a weapon arm.

## Decisions (owner, 2026-09-30, one at a time)

- **LOCKED**: a generated boss is built in two steps, a **body plan** picked by the seed, filled with **mix-and-match
  parts** picked by the seed ("Both").
- **LOCKED**: the attacks **loosely hint** at the look (they tilt the odds; the seed still decides). Shots lean towards a
  hood, orbs or a cannon-like arm; eruptions towards spines or a crown; leaps towards strong legs or a coiled body; dashes
  towards a forward-leaning build; strikes towards big arms or a blade.
- **LOCKED**: **generated bosses only**. Every hand-built boss and pair keeps its current figure, unchanged.
- **LOCKED**: a new look **for each generated boss**, and **nothing changes during the fight** (no damage, no wear).
  Motion is the animation every boss already has (breathing, walk bob, lean, the attack pose).
- **DELEGATED** (owner left the rest to Claude): the body plans, the parts and every number.

## Constraints

- Look only. No change to a fight, a recording, the stats or `GAME_VERSION`. The same seed gives the same look.
- Figures stay inside the boss's box plus the usual margin, and fill most of it, because the box is what the sword hits.
- The attack pose arm (`weaponArm`) is always drawn, so every wind-up stays readable.
- Light enough for the phone: flat shapes only, a cap on the shapes per figure, no blur. Every size, count and chance is in
  `src/ui/look/tuning.ts`.
- Colours come from the body, accent and glow the renderer already passes (from `generatedMood`), so the boss stands out.

## Design

`src/ui/look/generated-figure.ts` (new):

- `figureRecipe(seed, boss): Recipe` is a pure function. A recipe is a **plan** (upright, beast, wisp, totem, crawler) and
  a **head**, an **arm style**, a **back piece** and a **trim** (each including "none"). It reads the boss's attacks
  (shots, eruptions, leaps, moves, poses) only to weight the picks.
- `generatedFigure(bp, recipe, colors): Primitive[]` draws the recipe with the existing `BossPose` (breathing, gait, lean,
  attack pose) from `bossPose`.

`figures.ts`: `bossFigure` calls `generatedFigure` for the id `generated` (the seed is `state.seed`, the same one the
backdrop uses). `BossPose`, `weaponArm`, `forwardRect` and `forwardPoly` the new file needs move to `pose.ts`, which exists
for exactly this (shared pose helpers without an import cycle). Nothing else in `figures.ts` changes.

## Tests

- Same seed gives the same recipe and the same shapes.
- Over 200 seeds there are many different recipes, and every plan, head, back and trim shows up.
- Every figure, at every pose and both facings, stays inside the box plus margin, fills most of it, stays under the shape
  cap and mirrors when the boss faces the other way.
- The attack hints tilt the picks (a boss made only of shots gets casters' parts more often than one made of strikes).
- Every hand-built boss figure is exactly as before (the existing figure tests pass unchanged).

## Docs

`docs/SPEC.md` (an entry next to the generated backdrops), `docs/phone-testing.md` (what to look for), `docs/backlog.md`
(what is left out: damage and wear, figures that change during the fight, figures for flying generated bosses).

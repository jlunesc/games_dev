# Slice A: projectiles and a caster boss

Status: built 2026-09-28 (plan in `docs/superpowers/plans/2026-09-28-projectiles.md`), awaiting the owner's play test. The numbers are a first guess.

## Why

The owner played the Phase 1 bosses and found the fights repetitive: every boss attacks with a box in front of it, a floor dash or a leap with a shockwave, and only the Ember Duelist and the Ashen Hound have their own drawn shape (the other five share the generic block figure). The owner wants different attacks, different movement and different shapes, not variations of the Duelist.

That is three gaps, too big for one design. They are taken as slices, each one a new mechanic, a boss built around it and its own figure:

- **Slice A (this document): projectiles**, with one new caster boss and its own shape.
- Slice B: flying and hovering movement.
- Slice C: ground explosions and hazards.
- Slice D: new figures for the five existing bosses (look-only, can go in between).

Each later slice gets its own design conversation. This is the M6 roadmap's Phase 3 (`2026-09-22-m6-roadmap-design.md`), done as slices.

## Decisions (owner, 2026-09-28)

| Question | Decision |
|---|---|
| What can the player do about a projectile? | **Dodge only.** The swing does nothing to a projectile. Cutting or deflecting is a possible later addition. |
| Which paths in the first version? | **Straight bolt** and **lobbed arc.** Homing orbs and rolling ground waves are not in this slice. |
| How do projectiles meet the arena? | **Cover stops straight bolts** (when the cover reaches up to the bolt's bottom edge). Arcs ignore cover. Platforms affect nothing. |
| Which bosses use them? | **One new hand-built caster boss.** The five existing bosses do not change. The generator does not draw shots yet. |

## The mechanic

An attack may have a `shots` list. The wind-up, pose and red glow work exactly as today; shots fire at a chosen update after the wind-up.

- **Straight bolt.** Appears at the boss's front at update `at` (counted like hit windows) and flies in a straight line the way the boss faces, at a chosen height and speed. Disappears at the arena wall or at a cover that stops it. Height is what the player dodges with: low is jumped, chest height is dashed through, high is walked under. A burst is several shots in one attack at different heights.
- **Lobbed arc.** Launched at update `at`, flies up and comes down on a landing x fixed at launch (`player`, `forward` or `back` with a `distance`, the same targeting as a leap). A red mark shows on the floor from launch until landing. It lands with a short burst that hurts.
- **Damage and blinking.** A shot costs the attack's `damage`. The usual hit invulnerability applies.
- **Class.** An attack with shots is `mustDodge` (red). The checker rejects `counterable` with shots.
- **Cover.** A cover stops a straight bolt whose bottom edge is below the cover's height. A bolt above it flies over. Arcs are never stopped.
- **Attack shape.** An attack may have shots and no hit windows (like the Hound's slip, which has no hit windows); the checker's "must have a hit, move or leap" rule gains "or shots".
- **Clean slate.** A phase change and the end of the fight remove every shot in flight. A shot outlives its attack (it can still be flying when the boss starts recovering or choosing its next attack).
- **Deterministic.** Shots are game state advanced once per update by the fixed-timestep loop, so a recorded fight (seed, dials, per-update input) replays exactly.
- **Study phase.** Shots are shown but harmless, like everything else in the study.

## How it fits

- **Difficulty dials.** Speed scales bolt speed (an arc's flight time is not scaled, like a leap's). Readability shifts each shot's `at` with the wind-up. Range scales an arc's `distance` and its landing burst's width. Damage, health, frequency and variety work as they do now. No dial changes a bolt's height, so a height that can be jumped stays one that can be jumped.
- **Stats.** An attack with shots counts as dodged only when all its shots have gone without hitting the player, and as a hit if any lands. This needs the analysis to know which attack a shot came from and to wait for the last shot. The export shape changes, so `schemaVersion` is bumped and `docs/stats.md` is updated. `GAME_VERSION` does not need a bump for old fights (no existing boss uses shots), but the implementation must prove that with the golden tests.
- **Fairness.** The pre-fight check stays the cheap idle-must-lose. The generator does not draw shots in this slice.
- **Format.** `docs/bosses.md` and `tests/boss-parse.test.ts` are updated with the new field.

## The boss: Vesper Sage (working name)

- **Shape.** A tall, thin hooded figure in a triangular robe holding a glowing orb out in front. The orb charges and brightens during the wind-up, which is the cue. It gets its own figure function in `src/ui/look/figures.ts` and its own mood in `src/ui/look/moods.ts`.
- **Behaviour.** Keeps far away (`spacing` about 420 to 620) and backs off if approached, so fighting it means crossing the arena under fire.
- **Attacks (first guess).** Single chest-height bolt; triple volley (low, chest, high); lobbed arc at the player's position; short-range burst that punishes a player who has closed in.
- **Arena (changed 2026-09-29: removed).** The first version had one middle cover so hiding from bolts was a real option, but the owner found it confined the player to one side, so the Sage now has no arena. The original text follows. Cover placed so hiding from bolts is a real option, with heights chosen against the bolt heights so no place is safe from everything (the camping rule in `docs/bosses.md`).
- **Numbers** are a first guess, to be tuned from the owner's play test. Warnings stay above the readability floor (18 updates, 21 for anything that fires after the wind-up).

## Files expected to change

`src/bosses/schema.ts`, `parse.ts` (the field and its checks), `src/game/state.ts` (shot list), `src/game/boss.ts` (firing), `src/game/step.ts` and `geometry.ts` (moving shots, cover, hit test), `src/game/difficulty.ts`, `src/stats/analyze.ts` (dodge or hit resolution), `src/ui/look/figures.ts`, `moods.ts`, the renderer for shots and the arc's floor mark, `src/bosses/vesper-sage.json` plus its entry in `src/bosses/index.ts` and the menu, and the docs and tests above.

## Testing

- Parser tests for the new field (valid, and each rejection).
- Behaviour tests: a bolt flies and hits, a cover stops a low bolt and not a high one, an arc lands where marked and hurts there, a phase change clears shots, a jump or dash dodges what it should.
- Dial tests at every extreme with a shot-carrying boss.
- Stats tests: an attack is dodged only after its last shot is gone, and a hit when any lands.
- The Duelist golden test must not move.
- The real boss file: accepted, correct shape, an idle player loses, and it survives all dial extremes.

## Open items for the plan

- Exact data shape of a shot in the boss file and in state.
- Exact numbers for bolt size, speed and the arc's landing burst.
- Whether `docs/SPEC.md` section 11 gets a new status entry for this slice (it should, tagged DEFAULT until the owner plays it).
- The boss's final name.

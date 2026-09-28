# Slice C: floor eruptions and the Tremor Brute

Status: built 2026-09-29, awaiting the owner's play test. The numbers are a first guess.

**Shape of the data (decided while planning, same behaviour as approved):** an eruption is a third `kind` (`'eruption'`) of entry in an attack's `shots` list, not a separate list. That reuses everything a shot already has: firing at update `at`, outliving its attack, being cleared by a phase change or the end of the fight, the study waiting for it, the dials' timing shift and the stats' attribution. So there is no `eruptionsFired` field and no schema bump: `shotsFired` counts eruptions too, and `schemaVersion` stays 4 (the export's shape does not change).

## Why

Slice A added projectiles. The owner still wants different attacks, movement and shapes (`2026-09-28-projectiles-design.md`, "Why"). Slice C is the ground-hazard slice: danger that appears on the floor after a warning and forces the player to move, not to time a jump.

## Decisions (owner, 2026-09-29)

| Question | Decision |
|---|---|
| What kind of hazard? | **Marked eruptions**: a red mark on the floor, a delay, then a short blast. Lingering zones and rolling waves are not in this slice. |
| Where do the marks go? | **Under and around the player**: aimed at where the player stands when the mark appears, plus marks a set distance to either side. |
| How is a blast avoided? | **Too tall to jump.** Step out of the marked area, or dash through (a dash is untouchable, as always). |
| Which boss? | **One new hand-built boss with its own shape** (the Tremor Brute). The existing bosses and the generator do not change. |
| How does it fight? | **Close-range brute**: it walks up to the player and hits hard in melee. |

## The mechanic

An attack may have `shots` of `kind: "eruption"` (alongside or instead of bolts and arcs). The wind-up, pose and glow work as today; each eruption puts its mark on the floor at update `at` (counted like hit windows, inside the active part: `windup <= at < windup + active`).

| Field | Meaning | Checked |
|---|---|---|
| `kind` | `"eruption"`. | fixed |
| `at` | Update on which the mark appears. | whole number inside the active updates |
| `offset` | Distance from the player's x at update `at` to the middle of the mark. 0 is under the player. Negative is to the left, positive to the right. | number, -800 to 800 |
| `width` | Width of the mark and of the blast. | number, 40 to 600 |
| `delay` | Updates from the mark appearing to the blast going off. | whole number, 8 to 200 |
| `burst` | Updates the blast stays live. | whole number, 3 to 30 |

- **Position.** The middle of the mark is fixed when it appears (player x plus `offset`) and never follows the player. It is kept inside the arena (the mark's edges stay between x = 0 and x = 1280).
- **Blast.** Live for `delay <= age < delay + burst`, where `age` counts updates since the mark appeared. It fills the mark's width from the floor up to `ERUPTION.height` (220, in `src/game/params.ts`). A jump peaks near 163, so a jump does not clear it.
- **Hits.** A blast hurts a player who overlaps it and is not untouchable (blinking after a hit, or dashing). It costs the attack's `damage`. Like an arc's burst it is used up by a hit; a dash lets it keep going.
- **Class and shape.** The rules for shots apply: the attack must be `mustDodge`, and it may have no hit windows.
- **Clean slate.** A phase change and the end of the fight remove every eruption. An eruption outlives its attack.
- **Deterministic.** Eruptions are game state advanced once per update, so a recorded fight replays exactly.
- **Study.** Marks and blasts are shown and hurt nobody (the same `studyHit` as shots). The study waits for the last eruption to end before a demonstration is over.
- **Arena.** Eruptions ignore platforms and cover. A player on a platform is hit if the blast's box reaches their feet (220 tall from the floor).

## How it fits

- **Difficulty dials.** Readability shifts each eruption's `at` with the wind-up and multiplies its `delay` (rounded, at least 8), so the warning changes length. Range multiplies `width` and `offset`. Speed, height and `burst` are not scaled. Damage, health, frequency and variety work as now.
- **Stats.** An attack with eruptions counts as dodged only when all its eruptions are over without hitting the player, and as a hit if any hit. The export shape does not change (`shotsFired` counts eruptions), so `schemaVersion` stays 4; `docs/stats.md` gets a sentence saying so. Stepping out counts as the `distance` evasion; a dash counts as `dash`. `GAME_VERSION` does not change (no existing boss uses eruptions and the Duelist golden test must not move).
- **Fairness.** The pre-fight check is unchanged (an idle player must lose). Tests also require that a player standing still in either corner is hurt.
- **Format.** `docs/bosses.md` and `tests/boss-parse.test.ts` get the new field.
- **Look.** The mark is a red bar on the floor that fills toward the blast, drawn like the arc's floor mark; the blast is a bright column. Tunables go in `src/ui/look/tuning.ts`. Looks never change how a fight plays.

## The boss: Tremor Brute (working name)

- **Shape.** A wide, hunched figure with huge fists and glowing cracks across its back. Before an eruption it slams a fist down and the cracks brighten (the pose cue). It gets its own figure function in `src/ui/look/figures.ts` and its own mood in `src/ui/look/moods.ts` (dark red-brown quarry).
- **Size and health.** 110 wide, 130 tall, 26 health. No arena.
- **Behaviour.** Walks straight at the player and stays close (`spacing` about 90 to 200). Walks slowly, so the player can always move away.
- **Attacks (first guess).**

| Attack | Class | What it does |
|---|---|---|
| Hammer Fist | red | 26 updates of warning, then a box 160 in front, 140 high, live 6 updates. |
| Backhand | gold, counterable | A quicker swing that can be countered. |
| Fissure | red | Three marks: one under the player and one 260 to each side. All go off 36 updates later, 140 wide. There are gaps between them, so the player picks a side. |
| Twin Quake | red | One mark under the player, then a second about 25 updates later aimed at where the player stands by then. |

- **Phases.** Two. The second starts at half health with shorter gaps and short chains.
- **Numbers** are a first guess, to be tuned from the owner's play test. Warnings stay above the readability floor (wind-up 18, 21 for anything that fires after the wind-up; a mark's delay at least 21).

## Testing

- Parser tests for the field (valid, and each rejection).
- Behaviour tests: a mark is fixed when it appears, a blast is live only in its window, a jump does not avoid it, a step out or a dash does, a phase change clears eruptions, the study is harmless and waits.
- Dial tests at every extreme with an eruption-carrying boss.
- Stats tests: an attack is dodged only after its last eruption is over, and a hit when any hits.
- The Duelist golden test must not move.
- The real boss file: accepted, correct shape, an idle player loses, a player standing in a corner is hurt, a knowing bot can win with almost no hits, and it survives all dial extremes.

## Not in this slice

Lingering zones, rolling ground waves, marches of eruptions outward from the boss, eruptions in the generator, and the flying slice (B).

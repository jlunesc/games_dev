# Boss files

How a boss is described, and how to add or tune one. Everything here matches `src/bosses/schema.ts` (the types and their doc comments), `src/bosses/parse.ts` (the checks), `src/game/boss.ts` (the boss's movement and choices) and `src/game/step.ts` (the counter, damage and phase change). If you change any of those, update this file and `tests/boss-parse.test.ts`.

Units: times are in **updates** (the game runs 60 per second, so 60 = 1 second), distances are in world units (the arena is 1280 wide, the floor is at y = 640; the player is 48 wide and 96 tall), speeds are units per second.

## 1. Where boss files live and how they are checked

- One file per boss: `src/bosses/<id>.json`. The Ember Duelist is `src/bosses/ember-duelist.json`.
- `src/bosses/index.ts` imports the file and runs it through `parseBoss` (`src/bosses/parse.ts`) once, when the game loads, and exports the result (`EMBER_DUELIST`). The types are in `src/bosses/schema.ts`.
- The checker throws a `BossFormatError` for the first problem it finds, with a message naming the exact place in the file. Example:

  ```
  Boss data error at boss.attacks[1].hits[0]: must lie inside the active updates
  ```

  Reading it: the second attack (`attacks` counts from 0), its first hit window. A broken file makes the game fail at start (the page stays blank and the message appears in the browser's developer console); the tests also fail with the same message.
- **The checker ignores fields it does not know.** A misspelled optional field (`opening`, `move`) is silently dropped, not reported. After adding an optional field, check that it has an effect.
- **Things the checker does not judge:** whether the boss is fair or fun, whether a hit window can be jumped, whether an attack's `range` is reachable from the `spacing` the boss keeps, whether `startX` is inside the arena. Those are for you to check (section 4).

### Adding a boss
1. Create `src/bosses/<id>.json` with every field below (copy `ember-duelist.json` as a starting point).
2. Load and export it in `src/bosses/index.ts` the same way as the Duelist, with its own import name: `import rawNext from './next-boss.json'; export const NEXT_BOSS = parseBoss(rawNext);`.
3. Add tests: the real file is accepted and has the shape you planned; and behavior tests for anything new about it. `tests/boss-parse.test.ts` (checker) and `tests/step-boss.test.ts`, `tests/step-counter.test.ts`, `tests/step-phases.test.ts` (behavior, with helpers in `tests/boss-helpers.ts` and `tests/helpers.ts`) show the pattern.
4. The app currently starts the Ember Duelist directly (`src/ui/app.ts`). Choosing between several bosses is the menu of milestone M3 (see `docs/SPEC.md`), which needs its own design.
5. Drawing is separate from the boss file. The body colors, the arm poses and the glow live in `src/ui/render.ts`; a boss file only chooses one of the existing poses.

## 2. Every field

### Top level

| Field | Meaning | Checked |
|---|---|---|
| `id` | Short name used in code and file names. | non-empty text |
| `name` | Name shown to the player. | non-empty text |
| `width`, `height` | Size of the boss's body (the box the player's swing has to touch). It stands on the floor. | number, at least 1 |
| `startX` | Horizontal centre where it starts. | number, at least 0 |
| `maxHp` | Health at the start. Each of the player's hits does 1 damage (double while staggered, see `counter`). | whole number, at least 1 |
| `spacing` | `{ min, max }`: the distance from the player it tries to keep while it waits. Farther than `max`: it walks toward the player. Closer than `min`: it backs off. In between: it stands still. It always faces the player while walking. | numbers, `min` at least 0, `max` greater than `min` |
| `approachTimeout` | Most updates it spends walking into an attack's `range`; after that it starts the attack from wherever it is. (It also starts at once when it cannot make progress because it is against the arena wall.) | whole number, at least 1 |
| `predictability` | 0 = pick attacks by weighted random, 1 = go through the phase's list in order. In between: that fraction of the time it follows the list, otherwise weighted random. | number, 0 to 1 |
| `counter` | See below. | |
| `transitionTicks` | Length of the powering-up pause between phases, in which the boss cannot be hurt. | whole number, at least 0 |
| `attacks` | The list of attacks the boss can perform, whatever the phase. | at least one; ids must be unique |
| `phases` | The phases in order. | at least one |

### `counter`
The counter is one setting for the whole boss and only works against attacks whose `class` is `counterable`.

| Field | Meaning | Checked |
|---|---|---|
| `window` | The last `window` updates of a counterable attack's wind-up in which a counter works. | whole number, at least 1; not longer than the `windup` of any counterable attack |
| `range` | How close the player must be (centre to centre). | number, at least 1 |
| `staggerTicks` | How long the boss is staggered (cannot move or attack) after a counter. | whole number, at least 1 |
| `damageMultiplier` | Damage of each player hit while the boss is staggered (normal hits do 1). | number, at least 1 |

A counter happens when the player's attack swing **starts** (the first update of the swing) while the boss is in a counterable attack, inside the window (`windup - window <= t < windup`, with `t` counted as for hit windows below) and within `range`. The attack is cancelled (it does no damage and has no recovery), and any attacks chained after it are dropped. A press too early, too late, too far, or against a `mustDodge` attack is just a normal swing.

### Each attack in `attacks`

| Field | Meaning | Checked |
|---|---|---|
| `id` | Name used by the phases' lists. | non-empty text, unique |
| `name` | Name for people. | non-empty text |
| `pose` | Arm pose during the wind-up, the player's cue: `raised`, `sideways`, `back` or `down`. | one of those four |
| `class` | `counterable` (gold glow, can be countered) or `mustDodge` (red glow). | one of those two |
| `damage` | How many of the player's hits this attack costs when it lands. Optional, 1 when absent. | whole number, at least 1 |
| `windup` | Warning updates before anything hurts. | whole number, at least 1 |
| `active` | Updates during which the attack is live. | whole number, at least 1 |
| `recovery` | Updates after the active part before the boss does anything else. | whole number, at least 0 |
| `range` | `{ min, max }`: the distance from the player (centre to centre) at which it can start this attack. If it is outside, it walks (or backs off) until inside. | numbers, `min` at least 0, `max` greater than `min` |
| `move` (optional) | `{ from, to, speed }`: the boss moves forward (the way it faces) at `speed` units per second while `from <= t < to`. Stops at the arena wall. | `from`, `to` whole numbers; the range must lie inside the active updates; `speed` at least 1 |
| `hits` | The hurt boxes (next section). | at least one |

The whole attack lasts `windup + active + recovery` updates. The boss does not turn during an attack: it faces the way it faced when the attack started.

The gold or red glow is shown from the start of the wind-up until the end of the active part; it goes out during the recovery.

### Hit windows (each entry of `hits`)
Times are in updates counted from the first update of the attack (`t = 0`). A hit window is live for `from <= t < to`.

| Field | Meaning | Checked |
|---|---|---|
| `from`, `to` | Live from update `from` up to but not including `to`. | whole numbers; `to` after `from`; must lie inside the active updates: `windup <= from` and `to <= windup + active` |
| `x0`, `x1` | Near and far edge of the box, measured from the boss's **centre**, in the direction the boss **faces**. | numbers, `x1` greater than `x0` |
| `bottom`, `top` | Bottom and top edge, as heights above the floor. | `bottom` at least 0, `top` greater than `bottom` |

A box hurts the player when it overlaps the player's body and the player is not untouchable (after a hit, or during a dash).

**Worked example: the slam** (`x0` 0, `x1` 150, `bottom` 0, `top` 180). The box starts at the boss's centre, so it also covers the ground under the boss's own body: a player who runs into the boss and stands on it is hit. (An `x0` of 40, the body's edge, would leave a safe pocket in the middle of the boss.) The box reaches 150 from the centre, so it sticks out 110 units past the body (the boss is 80 wide, so its body edge is 40 from its centre), and it goes from the floor up to 180 high. If the boss stands at x = 900 and faces left, the box covers x = 750 to 900; facing right, x = 900 to 1050. Jumping reaches only about 150 units, so a 180-high box cannot be jumped: the player has to dash through it or stay out of reach.

For comparison, the sweep is `x0` 0, `x1` 250, `top` 100: a long, low box that a jump clears (the player's feet must be above `top`).

### Each phase in `phases`
The phases are listed in order. **A phase does not inherit anything from the one before:** every phase field is given in every phase.

| Field | Meaning | Checked |
|---|---|---|
| `name` | Name for people. | non-empty text |
| `startsAtHpFraction` | The phase begins when health falls to this fraction of `maxHp` or below. The first phase must be 1; each later one lower than the one before. Example: 0.66 with `maxHp` 30 begins at 19.8, so at 19 health or fewer. | number, above 0 up to 1 |
| `attacks` | The attacks it may choose in this phase: a list of `{ id, weight }`. `id` must be an attack from the top-level `attacks`. `weight` is relative to the others (weights 3, 3, 2 give 3/8, 3/8, 2/8; they need not add to 100). | at least one; `weight` above 0 |
| `opening` (optional) | The attack it starts with when this phase begins (after the powering-up pause), instead of waiting a gap. | must be an existing attack id |
| `gap` | Updates it waits (walking and keeping its distance) after an attack, or after being staggered, before choosing its next attack. | whole number, at least 0 |
| `maxChain` | With a chain, how many attacks are performed in a row in total. 1 means no chaining. | whole number, at least 1 |
| `chainChance` | The chance (0 to 1) that the attack it is about to start is followed straight away by more. | number, 0 to 1 |
| `walkSpeed` | Speed when walking toward the player, units per second. | number, at least 1 |
| `retreatSpeed` | Speed when backing off, units per second. | number, at least 1 |

## 3. How the boss behaves

The boss is always in one of five modes (`BossState.mode` in `src/game/state.ts`). Its code is `src/game/boss.ts`.

- **`gap`** (waiting): it faces the player and walks or backs off to stay between `spacing.min` and `spacing.max`. After the phase's `gap` updates it chooses an attack, decides whether a chain follows (below) and goes to `approach`.
- **`approach`**: it faces the player and walks toward them (at `walkSpeed`) if farther than the attack's `range.max`, or backs off (at `retreatSpeed`) if closer than `range.min`. As soon as the distance is inside the range, `approachTimeout` updates have passed, or it could not move at all this update (it is pinned against the arena wall), the attack starts. The start of an attack is the moment the warning event (gold or red) fires, which also drives the sound.
- **`attack`**: the wind-up (the cue), the active part (hit windows and `move` run) and the recovery, then it goes back to `gap`, or straight to `approach` for the next attack of a chain.
- **`stagger`**: after a counter. It cannot move, attack or turn for `counter.staggerTicks` updates and takes `damageMultiplier` damage per hit. Then it goes back to `gap`.
- **`transition`**: powering up between phases. It cannot be hurt (the player's swings pass through) and does nothing for `transitionTicks` updates. Then it starts the new phase's `opening` attack (walking into range first), or goes to `gap` if there is no `opening`.

**Choosing an attack** (from the current phase's `attacks`):
1. It never picks the same attack a third time in a row (if the last two attacks it started were both this one, it is left out; if that would leave nothing, the rule is skipped).
2. With probability `predictability` it follows the phase's list in order (the list order, not the weights), continuing from where it left off, still skipping an attack the first rule forbids. Otherwise it picks by weight.
3. The random numbers come from a seeded generator kept in the game state. The same seed gives the same fight for the same inputs. The app picks a new random seed for each fight (`newSeed` in `src/ui/app.ts`); after a victory or a defeat the game derives the next seed from the last one.

**Chaining:** when it commits to an attack (at the end of `gap`, and for an `opening`), it rolls once against `chainChance`. If the roll succeeds it will perform `maxChain` attacks in total: after the attack's recovery it chooses the next attack the same way but skips the `gap` (it still walks into range and still shows the full wind-up). With `maxChain` 1 nothing ever chains. A counter or a phase change cancels the rest of a chain.

**The phase change:** it is checked when the player's hit lands. If health is at or below `maxHp * startsAtHpFraction` of the *next* phase, the boss immediately drops whatever it was doing (the attack in progress does not finish) and goes to `transition` (event `phaseChange`). One phase change per hit: if one hit (for example a double-damage hit) falls below two thresholds, the second phase change happens on the next hit. At 0 health the fight is won instead ("Victory", then a new fight starts 60 updates later).

**The player's side** (`src/game/params.ts`): 5 health, hit blinking for 60 updates, a dash of 11 updates that is untouchable for its whole length, a jump that rises roughly 150 units when the button is held.

## 4. What can be tuned safely, and what to check afterwards

All times are in updates (60 = 1 second); speeds are units per second.

| Change | What it does | Check afterwards |
|---|---|---|
| Larger `spacing` (both numbers) | The boss stays farther away. | Every attack's `range` must still be reachable: the boss walks into range first, so a far spacing means longer walks (up to `approachTimeout`) before each attack. Compare with the counter `range` too, since the counter needs the player close. |
| Narrower `spacing` (`max - min` small) | It moves back and forth more, reacting to every step. | Watch that it still looks calm. |
| Longer `windup` | A longer warning: easier to read and dodge. It does not make the slam easier to counter: the counter window stays `counter.window` updates long, it just opens later. | It must not fall below the counter `window` for a counterable attack. The `hits`' `from`/`to` and any `move` shift with it (the checker rejects hit windows that are no longer inside the active updates). |
| Shorter `windup` | Less time to react. The sweep's 24 updates (0.4 s) is the shortest warning the Duelist has. | Play it: the owner should be able to dodge from the pose and glow, not by guessing. |
| Longer `active` | On its own it only lengthens the glow and the attack (the recovery starts later); what hurts the player are the hit windows in `hits`. | Extend the `hits` (or add more windows) to cover the extra updates; windows must end by `windup + active`. |
| Longer `recovery` | A bigger opening for the player to punish. | |
| Larger counter `window` | The counter is easier to time. | `window` must not exceed the shortest counterable `windup`. |
| Longer `staggerTicks` or higher `damageMultiplier` | The counter is worth more damage. | Do the arithmetic against `maxHp`: with `staggerTicks` 90 the player has time for roughly 5 swings; each one does `damageMultiplier` damage. |
| Larger `maxHp` | A longer fight. | The phase thresholds are fractions of it: recheck the health at which each phase starts. |
| Larger `top` on a hit box | Taller box. | A jump rises roughly 150 units, so a box whose `top` is above that cannot be jumped. That is intended for the slam; make sure a `mustDodge` attack with a tall box can still be dashed. |
| `x0` above 0 on a hit box | The box starts away from the boss's centre. | It leaves a dead zone directly in front of (and under) the boss where the player is safe from that attack: a player standing on the boss's centre would be untouched. The Duelist uses `x0` 0 on every attack for that reason. Only raise it on purpose. |
| Larger `x1` on a hit box | Longer reach. | The attack's `range` should let the player stand outside the reach at the moment the attack starts, or the player cannot avoid it without dashing. |
| Larger `move.speed` or longer `move` | The boss covers more ground: distance = `speed / 60 * (to - from)` (the lunge: 1500 / 60 * 10 = 250). | The boss is clamped to the arena: it cannot leave it. Check the lunge still lands on a player it started 220 to 320 away. |
| Higher `predictability` | Attack order more repeatable. | 1 makes the whole fight a fixed cycle. |
| More weight on an attack | It is picked more often. | The "no third in a row" rule still applies. |
| Shorter `gap` | Less rest between attacks. | Also raises the pressure of chaining, which skips the gap altogether. |
| Higher `chainChance` or `maxChain` | More back-to-back attacks. | Add up the wind-ups and recoveries: the player must still be able to see a warning for each attack in the chain. |
| Higher `walkSpeed` / `retreatSpeed` | The boss closes in and backs off faster. | Check that the boss still reaches each attack's `range` in a reasonable time. |
| `startsAtHpFraction` | Moves the phase change. | Must stay lower than the previous phase's; the first phase is always 1. |
| A shorter `transitionTicks` | A shorter breather. | It is also the only time the boss cannot be hit. |

After any change: run `npm test` (the checker and the behavior tests read the real file, so many mistakes show up there), then play the fight on the PC and the phone and use the list in `docs/phone-testing.md`.

## 5. Ideas not built yet

Recorded in `docs/backlog.md`, not part of the format today:
- **Ranges instead of single numbers** (for example a `gap` that varies a little on each fight), using the seeded random generator so a fight stays replayable.
- **An arena section** for hazards with their own timing (falling objects, moving hazards).
- Playable character types.

More bosses and the menu to choose between them are not in the backlog: the menu is milestone M3 in `docs/SPEC.md`.

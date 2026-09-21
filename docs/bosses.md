# Boss files

How a boss is described, and how to add or tune one. Everything here matches `src/bosses/schema.ts` (the types and their doc comments), `src/bosses/parse.ts` (the checks), `src/game/boss.ts` (the boss's movement, leaps and choices), `src/game/step.ts` (the counter, damage and phase change), `src/game/difficulty.ts` (the difficulty dials, section 5) and `src/ui/render.ts` (how a leap, its landing bar and the crouch are drawn). If you change any of those, update this file and `tests/boss-parse.test.ts`.

Units: times are in **updates** (the game runs 60 per second, so 60 = 1 second), distances are in world units (the arena is 1280 wide, the floor is at y = 640; the player is 48 wide and 96 tall), speeds are units per second.

## 1. Where boss files live and how they are checked

- One file per boss: `src/bosses/<id>.json`. There are two: the Ember Duelist (`src/bosses/ember-duelist.json`, the fixed reference boss) and the Ashen Hound (`src/bosses/ashen-hound.json`, the first boss that dashes and leaps; section 3a describes it).
- `src/bosses/index.ts` imports the file and runs it through `parseBoss` (`src/bosses/parse.ts`) once, when the game loads, and exports the results (`EMBER_DUELIST`, `ASHEN_HOUND`). The types are in `src/bosses/schema.ts`.
- The checker throws a `BossFormatError` for the first problem it finds, with a message naming the exact place in the file. Example:

  ```
  Boss data error at boss.attacks[1].hits[0]: must lie inside the active updates
  ```

  Reading it: the second attack (`attacks` counts from 0), its first hit window. A broken file makes the game fail at start (the page stays blank and the message appears in the browser's developer console); the tests also fail with the same message.
- **The checker ignores fields it does not know.** A misspelled optional field (`opening`, `move`) is silently dropped, not reported. After adding an optional field, check that it has an effect.
- **Things the checker does not judge:** whether the boss is fair or fun, whether a hit window can be jumped, whether an attack's `range` is reachable from the `spacing` the boss keeps, whether `startX` is inside the arena, whether a leap's shockwave window starts at or after the landing (it should, see "Movement skills"), whether the player has enough time to react to an attack. Those are for you to check (section 4).

### Adding a boss
1. Create `src/bosses/<id>.json` with every field below (copy `ember-duelist.json` as a starting point, or `ashen-hound.json` for a boss that moves or leaps).
2. Load and export it in `src/bosses/index.ts` the same way as the Duelist and the Hound, with its own import name: `import rawNext from './next-boss.json'; export const NEXT_BOSS = parseBoss(rawNext);`, and add it to the `BOSSES` list in that file (the menu offers the bosses in that order).
3. Add tests: the real file is accepted and has the shape you planned; and behavior tests for anything new about it. `tests/boss-parse.test.ts` (checker) and `tests/step-boss.test.ts`, `tests/step-counter.test.ts`, `tests/step-phases.test.ts`, `tests/step-leap.test.ts` (behavior, with helpers in `tests/boss-helpers.ts` and `tests/helpers.ts`) show the pattern; `tests/ashen-hound.test.ts` is the pattern for a whole boss file. The boss must also survive the difficulty dials at both ends of their range, now including the leap fields: `tests/difficulty.test.ts` runs the dials over the Duelist and over a test boss with leaps and moves in every direction, and `tests/ashen-hound.test.ts` checks the real Hound at every extreme (add the same check for a new boss).
4. The menu's Boss row (`src/ui/menu-model.ts`) steps through `BOSSES` with left and right (wrapping around), so a boss in that list can be chosen from the menu with no other change. The menu remembers the choice; an unknown stored id falls back to the Duelist (`bossById`).
5. Drawing is separate from the boss file. The body colors, the arm poses, the crouch, the glow and the landing bar live in `src/ui/render.ts`; a boss file only chooses one of the existing poses and describes the movement.

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
| `arena` | Platforms and cover standing in the arena. Optional; absent means a bare arena (the Duelist has none). See "Arena" below. | an object, see below |

### Arena
The optional `arena` object describes scenery for the fight. It has two optional lists, `platforms` and `covers` (absent means empty; once parsed, both lists are always present). This section covers the file format only; how platforms and cover behave in the fight is documented with the simulation.

Each piece in either list has:

| Field | Meaning | Checked |
|---|---|---|
| `x` | Horizontal centre of the piece, in world units. | number |
| `width` | How wide it is. The piece spans `x - width/2` up to `x + width/2`. | number, 40 to 600; the whole span must lie inside the arena (from 0 to 1280) |
| `height` | How tall it is, measured up from the floor. | number; platforms 40 to 300, covers 20 to 400 |

Rules across pieces:
- At most 6 pieces per list.
- Pieces of the same kind must not overlap horizontally. Touching is allowed: a piece ending exactly where the next begins is fine.
- A platform and a cover must not overlap horizontally at all (the error names the platform). Touching is allowed here too.

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
| `pose` | Arm pose during the wind-up, the player's cue: `raised`, `sideways`, `back`, `down` or `crouch`. | one of those five |
| `class` | `counterable` (gold glow, can be countered) or `mustDodge` (red glow). | one of those two |
| `damage` | How many of the player's hits this attack costs when it lands. Optional, 1 when absent. | whole number, at least 1 |
| `windup` | Warning updates before anything hurts. | whole number, at least 1 |
| `active` | Updates during which the attack is live. | whole number, at least 1 |
| `recovery` | Updates after the active part before the boss does anything else. | whole number, at least 0 |
| `range` | `{ min, max }`: the distance from the player (centre to centre) at which it can start this attack. If it is outside, it walks (or backs off) until inside. | numbers, `min` at least 0, `max` greater than `min` |
| `move` (optional) | `{ from, to, speed, dir }`: the boss moves at `speed` units per second while `from <= t < to`. `dir` is `forward` (the way it faces) or `back` (away from the way it faces, still facing forward); when absent it is `forward`. Stops at the arena wall. | `from`, `to` whole numbers; the range must lie inside the active updates; `speed` at least 1; `dir`, when present, `forward` or `back` |
| `leap` (optional) | `{ from, to, height, target, distance }`: the boss leaps in an arc while `from <= t < to`, peaking `height` units above the floor. The landing x is fixed at take-off (update `from`) and does not follow the player afterwards. `target` says where it lands: `player` (the player's x at update `from`), `forward` or `back` (`distance` units in front of or behind the boss's x at update `from`). `distance` is required for `forward` and `back`, and ignored (dropped) for `player`. | `from` whole number at least 0, `to` whole number at least 1 and after `from`, both inside the active updates; `height` at least 1; `target` one of `player`, `forward`, `back`; `distance` at least 1 for `forward`/`back`. An attack may have both a `move` and a `leap`, but their update ranges must not overlap (both change the boss's x). |
| `hits` | The hurt boxes (next section). May be empty only when the attack has a `move` or a `leap` (an attack that only repositions the boss). | at least one, unless there is a `move` or a `leap` |

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

### Movement skills
Three fields let a boss move during an attack: `move` (a dash along the floor), `leap` (a jump in an arc) and the `crouch` pose (the cue for a jump). They are checked in `parseBoss` and run in `src/game/boss.ts` (`updateAttack`, `updateLeap`); the drawing is in `src/ui/render.ts`.

**Reposition-only attacks.** An attack may have an empty `hits` list as long as it has a `move` or a `leap` (the checker rejects an attack with none of the three). It then only moves the boss and can never hurt. The Hound's slip is one. In the stats such an attack can only be "dodged" (it ran its whole length); it can never be a "hit".

**`move.dir`.** `forward` is the way the boss faces, `back` is the opposite way while it keeps facing forward (a retreat). When `dir` is absent it is `forward`. The boss does not turn during an attack, so a forward dash goes the way it faced when the attack began, even if the player has since run past it. The boss stops at the arena wall (it cannot leave the arena). Distance covered is `speed / 60 * (to - from)`.

**`leap`: the arc.** The flight lasts `n = to - from` updates (`from <= t < to`, counted from the start of the attack). On the first flight update `t = from` the boss takes off from where it stands and its landing x is decided (below). On each flight update, with `p = (t - from + 1) / (n + 1)`:

- its x moves in a straight line from the take-off x to the landing x: `x = takeoffX + (landingX - takeoffX) * p`;
- it is lifted above the floor by `lift = 4 * height * p * (1 - p)`.

Dividing by `n + 1` keeps `p` strictly between 0 and 1: the boss is already off the floor on the first flight update, and still in the air on the last. The peak is `height` when the flight has an odd number of updates and a shade under it when even (the Hound's 22-update flight peaks at 219.6 of its 220). At update `to` the boss is on the floor, exactly at the landing x, and the leap is over. Before `from` (the whole wind-up) it stands on the floor.

**`leap`: the landing point is fixed at take-off.** With `target: player` it is the player's x at update `from`; with `forward` or `back` it is `distance` units in front of, or behind, the boss's x at update `from`. It is then kept inside the arena so the body fits. It does not follow the player afterwards, so the player can dodge by moving after take-off. Leaps need `from` at or after the `windup` (the checker requires the leap to lie inside the active updates, so the wind-up on the floor is always the warning, and the crouch pose is what the player sees).

**The landing bar (drawn, not part of the fight rules).** From take-off until landing the game draws a red bar on the floor where the boss will land. It is **one-sided**, like the real shockwave: it covers the distance from the smallest `x0` to the largest `x1` of the attack's hit windows, measured from the landing x on the side the boss faces (the boss does not turn during the attack). It pulses while the boss is in the air, does not move, and disappears at the landing, when the shockwave box itself is shown. A leap whose attack has no hit windows shows only a small, dim marker on the floor, centred on the landing spot and as wide as the boss. The bar is not shown during the crouch: it appears when the boss leaves the floor.

**The shockwave is an ordinary hit window.** Nothing special is needed: write a `hits` entry that starts at or after the leap's `to` and measures from the boss's centre, which is now at the landing x (the Hound's is `from` 52, `to` 58, `x0` 0, `x1` 200, `top` 60: a low box the player can jump, or stay out of). The checker only requires it to lie inside the active updates; that it starts at or after `to` is up to you (a window that starts earlier would hurt the player at floor level while the boss is still in the air, away from the bar). Hit windows are measured from the floor, not from the lifted body, so they are never lifted.

**The body is lifted.** While the boss is in the air its body box is `lift` units above the floor, so the player's swing misses it. The swing of a player standing on the floor covers heights of about 8 to 88 above the floor, so it misses whenever `lift` is above about 88; a player who is in the air can reach higher. With the Hound's numbers, `lift` is above 88 from the third to the twentieth flight update; the first two and last two updates are low enough to hit. After the landing the boss can be hit again.

**Ending a leap early.** Every way an attack can end also puts the boss back on the floor (`landBoss`): the attack finishing, a counter, a phase change and the end of the fight (a victory or a defeat, so the boss never hangs in the air behind the summary). It drops straight down at the x it has at that moment, and the take-off and landing points are forgotten. A counter cannot cut a flight short (its window is in the wind-up, and a leap starts after the wind-up), but a phase change or the end of the fight can.

**`crouch` pose.** The pose tells the player a jump is coming. While the boss winds up on the floor it is drawn 25% shorter, with its arm hanging low in front of it; the glow is red or gold as for any pose. (The pose is only the picture; a `crouch` attack is not required to have a leap.)

**The dials.** How the seven dials treat these fields is in section 5: readability shifts the leap's times together with the wind-up, range scales `leap.distance` (never below 1), and the flight length and height are not scaled by any dial. `move.dir` is always kept.

## 3. How the boss behaves

The boss is always in one of five modes (`BossState.mode` in `src/game/state.ts`). Its code is `src/game/boss.ts`.

- **`gap`** (waiting): it faces the player and walks or backs off to stay between `spacing.min` and `spacing.max`. After the phase's `gap` updates it chooses an attack, decides whether a chain follows (below) and goes to `approach`.
- **`approach`**: it faces the player and walks toward them (at `walkSpeed`) if farther than the attack's `range.max`, or backs off (at `retreatSpeed`) if closer than `range.min`. As soon as the distance is inside the range, `approachTimeout` updates have passed, or it could not move at all this update (it is pinned against the arena wall), the attack starts. The start of an attack is the moment the warning event (gold or red) fires, which also drives the sound.
- **`attack`**: the wind-up (the cue), the active part (hit windows, `move` and `leap` run) and the recovery, then it goes back to `gap`, or straight to `approach` for the next attack of a chain. If the attack has a `move` and a `leap`, the move is applied first, then the leap (their update ranges cannot overlap).
- **`stagger`**: after a counter. It cannot move, attack or turn for `counter.staggerTicks` updates and takes `damageMultiplier` damage per hit. Then it goes back to `gap`.
- **`transition`**: powering up between phases. It cannot be hurt (the player's swings pass through) and does nothing for `transitionTicks` updates. Then it starts the new phase's `opening` attack (walking into range first), or goes to `gap` if there is no `opening`. Every way out of an attack (see "Movement skills") also puts a leaping boss back on the floor.

**Choosing an attack** (from the current phase's `attacks`):
1. It never picks the same attack a third time in a row (if the last two attacks it started were both this one, it is left out; if that would leave nothing, the rule is skipped).
2. With probability `predictability` it follows the phase's list in order (the list order, not the weights), continuing from where it left off, still skipping an attack the first rule forbids. Otherwise it picks by weight.
3. The random numbers come from a seeded generator kept in the game state. The same seed gives the same fight for the same inputs. The app picks a new random seed for each fight (`newSeed` in `src/ui/app.ts`); after a victory or a defeat the game derives the next seed from the last one.

**Chaining:** when it commits to an attack (at the end of `gap`, and for an `opening`), it rolls once against `chainChance`. If the roll succeeds it will perform `maxChain` attacks in total: after the attack's recovery it chooses the next attack the same way but skips the `gap` (it still walks into range and still shows the full wind-up). With `maxChain` 1 nothing ever chains. A counter or a phase change cancels the rest of a chain.

**The phase change:** it is checked when the player's hit lands. If health is at or below `maxHp * startsAtHpFraction` of the *next* phase, the boss immediately drops whatever it was doing (the attack in progress does not finish) and goes to `transition` (event `phaseChange`). One phase change per hit: if one hit (for example a double-damage hit) falls below two thresholds, the second phase change happens on the next hit. At 0 health the fight is won instead ("Victory"; the game itself would start a new fight 60 updates later, but the app shows the summary screen at that point and the next fight starts from the menu).

**The study phase** (M5b; see `docs/phone-testing.md` and `docs/stats.md` section 7.5): with the menu's Study setting on Once or Twice the fight begins with a study, in which the boss performs each attack listed in the **first phase's** `attacks` (after the difficulty dials, so a low Variety leaves some out), once per round in a random order taken from the seeded generator, with no random choice for the attack and no chains. Its behaviour is otherwise the normal one: the same walk, `approach`, warning, speed and `gap`. Nothing can hurt the player, the boss cannot be hurt and counters do nothing. When the last demonstration ends the boss goes back to `gap` and the real fight starts; any leftover hit invulnerability the player got from a `studyHit` in the last demonstration is cleared then, so the real fight starts clean (`endStudy` in `src/game/boss.ts`). A later phase's attacks and `opening` are never shown. No boss file field is needed for this.

**The player's side** (`src/game/params.ts`): 5 health, hit blinking for 60 updates, a dash of 11 updates that is untouchable for its whole length, a jump that rises roughly 150 units when the button is held.

## 3a. The Ashen Hound

`src/bosses/ashen-hound.json`: a low, fast beast (90 wide, 90 tall, 24 health, one phase called Hunt) that keeps a shorter distance than the Duelist (`spacing` 110 to 260) and never has a counterable attack, so the counter does not apply to it. Its numbers are a **first guess**, to be tuned from the owner's play test (`docs/phone-testing.md`). The four attacks, all red (must dodge):

| Attack | Pose | What it does | What it trains |
|---|---|---|---|
| Bite | sideways | 22 updates (0.37 s) of wind-up, then a box 140 in front, 110 high, for 6 updates. Starts when the player is 60 to 140 away. | Timing a dodge in a tight window. The 11-update dash has to cover the 6 updates the box is live, so it can only be started inside a window of about 6 updates (0.1 s), measured with scripted players; jumping over it has about twice that (about 12 updates). |
| Rush | back | 26 updates of wind-up, then it runs forward at 1600 units per second for 12 updates (320 units), hurting along the whole run (box 100 in front, 100 high). Starts from 240 to 420 away. | Dashing through an attack that closes a gap too fast to outrun. |
| Slip | back | 18 updates of wind-up, then it runs forward at 1400 for 10 updates (about 233 units), with **no hit window**: it never hurts, and often ends up behind the player. Starts from 40 to 240 away. | Not reacting to everything. It has the same pose as the rush and a shorter wind-up, so it is a look-alike; the player is expected to tell it apart from the rush by the distance and the timing, or to dash needlessly. It also repositions the boss. |
| Pounce | crouch | 30 updates of crouch, then a leap to where the player stood at take-off (22 updates in the air, up to 220 high), then a shockwave box along the floor for 6 updates: 200 long on the side the boss faces, 60 high. Starts from 200 to 420 away. | Reading a landing spot (the red bar) and either jumping the low shockwave or stepping out of the bar. |

The mix is `bite` 3, `rush` 2, `slip` 2, `pounce` 3; a chain of two follows an attack with chance 0.35; the gap is 45 updates; `predictability` is 0.2. `tests/ashen-hound.test.ts` pins the file's shape and shows, with scripted players, that a player who knows the right answer to each attack can beat it without being hit.

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
| `move.dir` | `back` makes the dash a retreat, `forward` (the default) an advance. | The boss stops at the wall. A retreat that starts already against the wall goes nowhere. |
| `leap.height` | A higher arc. | The peak is `height`; it only changes how the flight looks and how long the body is out of reach of the swing (more updates above about 88). It does not change the landing. |
| Longer flight (`leap.to - leap.from`) | More time in the air, and more time to react to the landing bar. | The landing bar shows the whole flight, so a long flight gives a long warning; keep the shockwave window starting at or after `to`, and the leap inside the active updates. |
| `leap.target` and `leap.distance` | `player` lands where the player stood at take-off; `forward` and `back` land a fixed distance away. | A distance that would land outside the arena is clamped to the wall. |
| Shockwave `x1` or `top` | Longer or taller shockwave. | The bar drawn on the floor follows `x0` and `x1`, but not `top`: a tall shockwave that cannot be jumped looks the same as a low one. The bar is the union over every hit window of the attack (the smallest `x0` to the largest `x1`), so a boss with a hit window during the flight would draw a bar that does not match its landing. Author leap hit windows at or after `leap.to`. |
| Higher `predictability` | Attack order more repeatable. | 1 makes the whole fight a fixed cycle. |
| More weight on an attack | It is picked more often. | The "no third in a row" rule still applies. |
| Shorter `gap` | Less rest between attacks. | Also raises the pressure of chaining, which skips the gap altogether. |
| Higher `chainChance` or `maxChain` | More back-to-back attacks. | Add up the wind-ups and recoveries: the player must still be able to see a warning for each attack in the chain. |
| Higher `walkSpeed` / `retreatSpeed` | The boss closes in and backs off faster. | Check that the boss still reaches each attack's `range` in a reasonable time. |
| `startsAtHpFraction` | Moves the phase change. | Must stay lower than the previous phase's; the first phase is always 1. |
| A shorter `transitionTicks` | A shorter breather. | It is also the only time the boss cannot be hit. |

A boss file must still make sense at the extremes of the difficulty dials (section 5): `tests/difficulty.test.ts` applies every dial at both ends of its range, all of them low, all of them high, and many random mixes, and each result must still pass `parseBoss`. A boss that only works at its written values fails there, so read that failure when adding or changing a boss.

**The reference boss is pinned.** The Ember Duelist is the fixed boss that statistics are compared against, so its simulation must not change by accident. `tests/duelist-golden.test.ts` plays four scripted fights against it (two ordinary fights at Normal and Hard dials, one with a player who cannot die so the fight runs through the phase change and to a victory, and one that counters so the stagger runs) and compares a hash of every update with recorded numbers. If a change to the engine or a shared rule moves any of them, the Duelist plays differently: either fix the change, or, if the difference is meant, re-record the numbers and bump `GAME_VERSION`. A change to the Duelist's own file will also move them, on purpose.

After any change: run `npm test` (the checker and the behavior tests read the real file, so many mistakes show up there), then play the fight on the PC and the phone and use the list in `docs/phone-testing.md`.

## 5. Difficulty dials

The difficulty presets (Easy, Normal, Hard) and the Tweak screen in the menu do not change the boss file. They adjust a copy of the boss through `applyDials` in `src/game/difficulty.ts`, once at the start of each fight, and the boss file on disk (and `BOSSES`) is never modified. The adjusted copy is run through `parseBoss` again, so a dial can never produce a boss the game cannot run: if a dial and a boss file do not fit, that throws the same kind of `BossFormatError`. A dial value of 1 (damage 1 hit) leaves the boss as written; Normal is all ones.

There are seven dials. Each is a multiplier on numbers in the boss file (damage counts whole hits):

| Dial | Range | What it changes in the boss file |
|---|---|---|
| `speed` | 0.7 to 1.4 | Faster: each phase's `walkSpeed` and `retreatSpeed`, each attack's `move.speed` are multiplied (the direction `move.dir` is kept); each attack's `recovery` is divided by it (rounded), so it also recovers sooner. A leap's flight is not sped up. |
| `frequency` | 0.5 to 2 | Each phase's `gap` is divided by it (rounded, never below 0): higher means shorter pauses. It does not touch chaining. |
| `readability` | 0.7 to 1.6 | Each attack's `windup` is multiplied (rounded). The `from` and `to` of its `hits`, of its `move` and of its `leap` shift by the same number of updates, so they stay inside the active part and a leap keeps its length (and the wait between landing and shockwave stays the same). A `counterable` attack never gets a `windup` below `counter.window` (any other attack, never below 1). Lower is harder. Readability changes when the warning opens, but the counter window itself stays the same length, so Easy does not make countering easier. |
| `health` | 0.5 to 2 | `maxHp` is multiplied (rounded, at least 1). The phase thresholds are fractions, so they scale with it. |
| `damage` | 1 to 3 | Each attack's `damage` is multiplied (at least 1). It is a whole number of hits: 1, 2 or 3. |
| `range` | 0.8 to 1.2 | Each attack's `range.min` and `range.max`, and each hit window's `x0` and `x1` (so a shockwave reaches farther, and the landing bar with it), are multiplied: attacks reach farther and start from farther away. A leap's `distance` (only `forward` and `back` leaps have one) is multiplied too, but never falls below 1. `spacing`, `counter.range`, `top`/`bottom` and the leap's `height` are not changed. |
| `variety` | 0.5 to 1 | Each phase keeps only that fraction of its `attacks` (rounded, at least 1): the ones with the highest `weight` (ties keep list order), in their original order. An `opening` attack is not filtered. |

The ranges, the steps the Tweak screen moves in, and the values of the three presets are all in `src/game/difficulty.ts` (`DIALS` and `PRESETS`); change them there. The leap's flight length (`to - from`) and `height` are not scaled by any dial: stretching the flight would move the landing, and its shockwave, in time. Adding a dial means a new entry in `DIALS`, its effect in `applyDials` and a test. Player and environment dials are not built yet (`docs/backlog.md`).

## 6. Ideas not built yet

Recorded in `docs/backlog.md`, not part of the format today:
- **Ranges instead of single numbers** (for example a `gap` that varies a little on each fight), using the seeded random generator so a fight stays replayable.
- **An arena section** for hazards with their own timing (falling objects, moving hazards).
- Playable character types.

More bosses are not in the backlog: they are a later milestone in `docs/SPEC.md`.

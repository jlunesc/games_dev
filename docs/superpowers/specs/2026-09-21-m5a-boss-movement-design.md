# M5a Design: boss movement skills (Leap and Dash)

First step of M5 (direction set by the owner on 2026-09-21, see `docs/SPEC.md` section 11): boss **skills**, then arena features, then generated bosses. The owner chose **Leap and Dash** as the first movement skills (Teleport later). Everything below is **DELEGATED** detail, except the new test boss, which needs the owner's approval (it is not in the spec).

## What the player sees
- **Leap:** the boss crouches (the warning), then jumps in an arc and lands with a low shockwave. A bar on the floor marks where it will land from the moment it takes off, so the player can read it: it shows the side and reach of the shockwave, one-sided like the real hit (a landing that hurts nobody gets only a small dim marker, centred on the landing spot). The player avoids it by getting out from under it, or by jumping over the shockwave. While the boss is high in the air the player's swing cannot reach it.
- **Dash:** a fast slide across the floor after a warning. Two uses: a damaging dash (the Duelist's lunge already is one) and a **reposition dash** that hurts nobody: the boss slides toward, away from, or past the player to change the distance, and can chain into an attack.

## Data format (`docs/bosses.md` and `src/bosses/schema.ts` change)
- `AttackDef.hits` may be empty when the attack has a `move` or a `leap` (a reposition). An attack still needs at least one of: a hit window, a `move`, a `leap`.
- New optional `move.dir`: `'forward'` (the way the boss faces, today's behaviour and the default) or `'back'` (away from the way it faces). The boss has no body collision with the player, so a forward dash already carries it through and past the player; it turns to face the player again when it next chooses. Existing files are unchanged.
- New optional `leap`: `{ from, to, height, target, distance? }`. `from` and `to` are attack times (like `move`): the boss is off the floor from `from` to `to` and lands at `to`; both must lie inside the active updates. `height` is the peak in world units above the floor (at least 1). `target` is `'player'` (lands where the player was at take-off), `'forward'` or `'back'` (with `distance`, in world units). The landing x is decided at take-off (`from`) and clamped to the arena, so it is fixed while the boss is in the air and the landing bar is honest. The horizontal path is a straight line, the vertical path a parabola.
- New pose `'crouch'` for the warning of a leap (drawing only).
- The shockwave is an ordinary hit window that starts at or after `to`, measured from the landing spot, as the burst already works. The boss body in the air is not dangerous by itself.

## Game rules (`src/game/`)
- `BossState` gains `lift` (height above the floor, 0 on the floor), `leapFromX`, `leapToX` (the landing x, or null). Old fights are unaffected because both are 0/null unless a leap is running.
- `bossBox` lifts the box by `lift`: the player's swing hits a leaping boss only when the boxes really overlap.
- The boss's chosen attack starts from its range as now; for a leap the range is the distance at which it may take off.
- A counter (`counterable` class) may apply to any skill; the shipped skills are `mustDodge`.
- Determinism: no new randomness; the arc is computed from integers of attack time.

## Drawing (`src/ui/render.ts`)
Draw the boss lifted by `lift`, the landing bar (the shockwave's side and reach, one-sided) from take-off until landing, and the crouch pose. Colours and the gold/red glow rules are unchanged.

## Dials (`applyDials`)
- Readability shifts `leap.from/to` with the windup, like `move`. Speed scales `move.speed` as now; a leap's flight time is not scaled (it would move the shockwave in time), only its recovery. Range scales `leap.distance`. The adjusted boss is still checked by `parseBoss`.

## A boss to try them on (needs the owner's approval)
The reference boss (Ember Duelist) must not change, because the owner's statistics compare against it. To play the new skills a small second boss is added and offered in the menu's Boss row: the **Ashen Hound**, a fast beast (original design): it **dashes** to close the distance or slide behind the player, **leaps** with a shockwave, and has one plain **bite** attack. About 24 health, one phase, no counter window (all attacks `mustDodge`). It is a first sample, tuned by feel later; the generator (M5c) will make more like it.

## Tests
- Parse: leap and move.dir (forward, back) accepted and rejected (times outside the active updates, height 0, unknown target, empty hits with nothing else); the existing Duelist file still parses unchanged.
- Simulation: the boss leaves the floor at `from` and is on it at `to`; the peak height and the landing x are exact; a `'player'` target lands where the player was at take-off, not where the player moved to; the shockwave hits a grounded player at the landing spot and misses a jumping one; a player swing misses the boss while it is high and hits it after landing; `back` ends where expected; a reposition dash hurts nobody.
- **Duelist unchanged:** a golden test that a scripted fight against the Duelist gives exactly the same final state as before this step (recorded from the current code before any change), so the reference boss and every stored record still replay.
- Dials at both ends produce a valid Hound; replay guarantee and analysis on a Hound fight (the loop-replay test gains a Hound case); the analyzer's outcomes for a leap (dodged by distance, by jump, by dash-out, hit).

## Out of scope (later steps)
Teleport, flying bosses, arena features (platforms, cover), the generator, more bosses.

## Done when
Tests pass, CI is green and deployed, and the owner has fought the Ashen Hound on the phone and the Duelist still plays as before.

# Rest of slice B: flight and the Storm Kite

Status: built 2026-09-29, awaiting the owner's play test. The numbers are a first guess.

## Why

Slice B's first half (`2026-09-29-variety-design.md`) let the five older bosses hover in a leap, strike on both sides and aim their bolts. What was left was a boss that *stays* in the air between attacks and one that flies across the arena. Hovering in generated bosses is out of scope.

## Decisions (owner, 2026-09-29)

| Question | Decision |
|---|---|
| Scope | **One new hand-built flying boss.** The generator and the five older bosses do not change. |
| Style | **Hover and dive**: it hangs high and follows the player sideways, then comes down. |
| When can it be hit | **Only when it comes low.** |
| Dives | **Plunge** (falls on the player's spot) and **Swoop** (a low pass across the arena). |
| Landing marker | The plunge's ring appears at take-off (`from`), not during the wind-up. |

## The mechanic

A boss may have `flight: { height, rise }`; an attack may have `dive: { from, to, shape, target, distance?, low? }`. Details, checks and dial behaviour are in `docs/bosses.md` section 3a-quinquies. In short:

- `BossState.lift` (the height of the boss's feet) starts at `flight.height` and returns to it after each attack at `rise` units per second. The player's swing hits by box overlap, so a boss above the highest jumping swing is unreachable. The checker enforces `height >= HIGHEST_SWING + 10`.
- A plunge falls to the floor and stays there until the attack ends. A swoop falls, skims for `low` updates and climbs back. Both fix their landing x at update `from`, like a leap, and reuse the leap's landing ring (the swoop hides it).
- A boss with `flight` may not leap; an attack may not have both a leap and a dive. The end of an attack keeps the lift (`endMotion`); the counter and the end of the fight still do a full landing (`landBoss`).
- Dials: readability shifts `from` and `to`, range scales `distance`; nothing else touches a dive.

## The Storm Kite

Four attacks (plunge, swoop, bolt volley, and in phase 2 a snap plunge), two phases. Timings in `docs/bosses.md`.

Checked in `tests/storm-kite.test.ts`: the file, the format checks, the trajectories, avoiding each attack, a phase change while low, dial extremes, idle players and corner-standers lose, and a scripted player who knows the answers wins.

## Not in this slice

Flying in generated bosses, a flying boss with counterable attacks, a boss that is hittable while it hangs (for example from a platform), and a schema or `GAME_VERSION` change (no existing boss changed).

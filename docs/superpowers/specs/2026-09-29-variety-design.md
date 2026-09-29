# Variety pass for the five archetype bosses

Status: built 2026-09-29, awaiting the owner's play test. Every number is a first guess.

## Why

After playing, the owner asked for more varied movement for the Quill Warden, Cinder Golem, Veil Dancer, Gale Reaver and Brass Sentinel ("allow jumps, stay in the air and such"), a better look for attacks (they were only rectangles) and more variety of attacks (projectiles, both sides, air attacks). The owner asked for the plan and the build in one go, without design questions; this document records what was done. It folds slice B (flying and hovering) into the work.

## What the engine gained

| Addition | Meaning |
|---|---|
| `hit.both` | The box is mirrored behind the boss: no safe side. Each side is cut by its own cover. |
| `leap.hang` | The boss rises, hovers at the top for `hang` updates, then falls, sliding toward the landing point the whole time. At most `to - from - 2`. |
| bolt `dir: "back"` | A bolt fired behind the boss. Built and tested, no boss uses it yet. |
| bolt `aim: true` | A bolt with a fixed course at the player's body as it was when fired (cannot be combined with `dir`). Fired from a hovering boss it flies down. |
| Bolt height | Now measured above the boss's feet, so it includes the boss's lift. Bosses on the floor are unchanged. |

No dial scales `hang`; the existing dials treat the new fields like the old ones (readability shifts times, speed scales bolt speed, range scales hit boxes). The stats need no change: `schemaVersion` stays 4. `GAME_VERSION` is 0.6.0 because the five bosses' numbers changed.

## The new attacks

Two or three per boss, listed in `docs/bosses.md` section 3a-quater. They are dodge attacks (one counterable spin for the Sentinel); each phase weights them so they show up often.

## The look of attacks

Looks never change a fight (`src/ui/look/`).

- **Strike shapes** (`attackfx.ts`): the live hit box is still drawn faintly so the true reach is honest, and a shape sits inside it: spikes for a low box on the floor, a spear for a long thin one, a crescent for a tall one. Shapes mirror with the side.
- **Bolt trails:** a bolt's trail slants with its climb, so an aimed bolt reads as a diagonal streak.
- **Signs before the attack** (`attackMarks` in `figures.ts`): springs under a boss that will hover, a flare behind one that will strike both sides, and one pip per shot over the head (a ring round it when aimed, one behind when fired backward).
- **Colours follow the boss** (`LOOK.palette` in `tuning.ts`, one `edge`, `core` and `halo` per boss id; `default` for the rest): its strikes, shot glow and trails, lobbed-shot bursts and signs all use them. Danger marks on the floor and the aim ring stay red for every boss so a warning always reads the same.
- **Landing bar:** shows both spans when the strike is on both sides.
- Every new attack is distinct from the others at the last update of its wind-up (a test per figure).

## Testing

- `tests/variety.test.ts`: parsing, geometry with cover, the hover profile, back and aimed bolts, dial extremes.
- `tests/variety-fairness.test.ts`: each new attack hurts a player who stands still and is avoided by one well-timed dash or jump; a player who sees hits coming wins at Normal; every dial extreme plays; replays are identical.
- `tests/look-attackfx.test.ts`: shapes stay inside the box and mirror, trails slant, signs appear only where the attack has them, landing spans.

## Not built

A boss that stays in the air between attacks or flies across the arena, hovering in generated bosses, a boss using `dir: "back"`.

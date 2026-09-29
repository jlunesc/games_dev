# Two bosses in one fight: design

Status: design agreed with the owner on 2026-09-29, one decision at a time. Not built. Not yet in `docs/SPEC.md`; when the work starts, add it there with a status tag.

## Goal

Train a skill the game does not train yet: reading two threats at once, choosing whom to watch and whom to hit, and positioning between two enemies (the duo and twin-boss fights of metroidvanias). Two bosses fight the player in the same fight.

## What was decided (owner, 2026-09-29)

| Topic | Decision |
|---|---|
| Turns | A boss may not start an attack while the other boss has the turn. The turn covers the whole attack (warning, live part, recovery), any shots or eruptions it fired that are still in the air or counting down, and its whole chain. |
| Health | Each boss has its own bar. Both must be beaten. |
| Sword | A swing hurts only the nearest boss in reach, one boss per swing. |
| Survivor | When one boss falls, the other is enraged: shorter waits and faster walking, strength set per pair. |
| Making a pair | A named pair file built from two existing bosses. Each pair is its own entry in the Boss row. Not "any two bosses", not new bosses per pair. |
| Study | Each boss shows its attacks in turn, under the same turn rule. The Off, Once and Twice setting works as today. |
| Tie | If both are ready in the same update, the boss that has waited longer goes first, then the first-listed boss. Deterministic, no extra random draws. (Set by the assistant, not asked.) |
| Difficulty dials | Apply to both bosses at once, as today. |
| Generated bosses | Stay solo in this first version. |

## Engine approach

The game state today holds one boss (`GameState.boss`; about 47 references in 12 source files and about 385 in the tests). It keeps `boss` as the **primary boss** and gains `partners`, a list of the other bosses (empty in a normal fight, one entry in a pair). A normal fight behaves exactly as now. Each boss keeps its own state machine (waiting, approach, attack, stagger, transition), and a pure rule decides each update which boss, if any, may start an attack.

- **Turn rule.** Where a boss goes from approaching to starting an attack, it first asks whether it may. It may when no other boss holds the turn. A boss that may not start keeps waiting or walking to its spacing and asks again next update. With one boss the answer is always yes, so solo fights and every stored replay are unchanged.
- **Random draws.** A blocked boss must not draw random numbers every update. It chooses its attack once, when it gets the turn (or chooses once and holds it), and the order of draws is fixed so the seeded stream stays reproducible.
- **Turn release.** The turn is released when the attack ends, any chain is finished and its shots and eruptions are gone. A boss that is staggered by a counter or is powering up between phases holds no turn, unless it still owns shots.
- **Who goes first.** A boss asks only at its commit moments: the end of its wait, and the opening attack after a phase change. Among the bosses at a commit moment, the one that has waited longest wins (first-listed on a tie). If another boss holds the turn, nobody commits, so a boss with a shorter wait can never jump ahead of one that is being held back. A boss without attacks in its phase never asks and never blocks.
- **Blocked opening.** If a boss finishes powering up but may not open with its opening attack, it goes to a normal wait instead (the opening is lost).
- **A boss going down.** A boss at 0 health while its partner still stands falls: it stops acting, cannot be hit, and its shots vanish. The fight ends only when every boss is at 0.
- **Sword.** The swing looks for the nearest boss in reach and applies the hit, the counter and the phase change to that boss only.
- **Enrage.** When one boss is beaten the other switches to a boosted copy of its numbers (shorter gap, faster walking), set in the pair file. The boost is part of the fight rules, so it is replayed exactly.
- **Study.** The study queue holds each boss's first-phase attacks; the bosses take turns to demonstrate them. Nothing can hurt the player.
- **Winning.** The fight is won when every boss is at zero health.

## Pair file

A small data file next to the boss files, checked by a parser like `parseBoss`. It names two existing bosses and gives, for each, a health scale, plus the enrage strength. It adds no attacks. The format is documented in `docs/bosses.md` when it is built. Existing bosses were tuned for solo fights, so a pair will usually scale each boss's health down.

## Recording and stats

- A recording of a pair fight stores the pair id, the seed, the dials and the inputs, as today. `schemaVersion` goes up by one and older records stay valid. Single-boss recordings must replay exactly as before (the refactor is bit-identical), so `GAME_VERSION` is bumped only if a change to game numbers or a boss file makes that untrue.
- The analysis counts each boss's attacks, hits and dodges separately, plus one shared line for the whole fight. The export format and `docs/stats.md` are updated together with the schema bump.

## Fairness

Because turns cannot overlap, only one boss's attack threatens the player at a time, so the solo argument mostly carries over. The idle boss still moves, so a pincer (one boss on each side) is a real threat; that is part of what the mode trains. Each pair is hand-tuned and checked with scripted players, as the Ashen Hound is. The generator's automatic fairness check is not extended.

## Screen

- Two health bars, each in its boss's colour.
- A small marker on the boss that holds the turn, so the player can see who is about to attack. Look-only, in `src/ui/look/`, light for the phone.
- Readability on the S21 must be checked; arena width and figure size may need tuning.

## Order of work

1. **Refactor, no visible change.** State becomes a list of one boss. All existing tests pass unedited, in particular the Ember Duelist golden test and every replay test. Stop for a check here before adding anything.
2. **Pair rules.** Turn token, nearest-boss sword, enrage, win condition, the pair file and parser, one first pair.
3. **Stats and screen.** Schema bump, per-boss analysis, two health bars, the turn marker, the study, the Boss row entry, docs and the phone-testing checklist.

## Left out on purpose

- Bosses attacking at the same time. A later step could add overlap as a difficulty dial (or in a pair's second stage).
- Generated pairs and "any two bosses" from the menu.
- Bosses that move with or shield each other, or share attacks.
- Extending the automatic fairness check to pairs.

## Open items for the plan (numbers, not design)

- The first pair (which two existing bosses) and the health scale for each.
- The enrage strength for that pair.
- The look of the turn marker.

# M6a: generated arena diversity — design

**Status:** design, awaiting the owner's review of this document.

## Why

M5e (the generator) ships every generated boss on a bare floor. The owner played it and asked for
arena diversity there too (docs/backlog.md's open item). This is the first of two follow-on pieces
the owner asked for after playing all of M5; the second, new attack primitives (explosions,
projectiles), is a separate design that builds on this one and comes after it (owner's choice,
2026-09-22: "two specs, back to back").

The owner also gave one piece of standing feedback from playing the Ashen Hound's own (hand-built)
arena: **"the arena felt a bit crowded, I didn't like having platforms at the same level."** On
inspection, the Hound's platform (height 90) and cover (height 100) really do sit only 10 units
apart — nearly the same level. That is the concrete bug this design fixes, not piece count.

## Scope

- Only the **generator** (`src/bosses/generate/`) gets new logic. The Ember Duelist stays flat, the
  Ashen Hound's arena is untouched (it already exists as a hand-tuned reference).
- No changes to the arena **format**: `ArenaDef`/`ArenaPiece` (`src/bosses/schema.ts`) are unchanged.
  This design is entirely about *how a generated boss's arena is chosen*, not what it can describe.
- Out of scope, staying on the backlog: moving or destroyable pieces, hazards, a boss that reacts to
  the arena (it still walks straight through cover and platforms, the existing M5c simplification),
  arenas for hand-built bosses beyond the Hound.

## What a generated boss's arena looks like

Drawn from the same seeded stream `generateBoss` already uses for attacks (mixed from the fight seed,
`(seed ^ 0x51ed270b) >>> 0`; never touches the gameplay `rng` — same discipline as the rest of the
generator).

1. **Chance of staying bare.** `GEN.arenaBareChance` (default **0.4**): 40% of the time a generated
   boss gets no arena at all, same as the Duelist. This is itself part of the diversity — every
   generated fight does not need scenery to feel different from the last one.
2. **When it does get one: 1 to 3 pieces**, drawn uniformly from `{1, 2, 3}` — similar total count to
   the Hound's (2 platforms + 1 cover = 3), so it reads as "an arena," not a single stray box.
3. **Three placement zones**, centred at x = 320, 640 and 960 (the same spacing the Hound's own
   pieces already use: 330, 640, 950). The piece count picks that many zones, without repeats, from
   these three.
   - **The x = 320 zone is platform-only.** The player's start is x = 320, and `parseBoss` already
     rejects any cover whose span contains it. Rather than generate-and-reject, this zone simply
     never offers cover as an option — the Hound's own left-hand piece is a platform for the same
     reason.
   - The other two zones (640, 960) offer either a platform or a cover, chosen with equal chance.
   - Within its zone, a piece's x is jittered by up to ±40, and its width is drawn per type:
     platforms 140–260, covers 50–110 (both comfortably inside the format's own 40–600 bound, and
     close to the Hound's 200/60).
4. **Heights spread apart, guaranteed by construction (revised during implementation — see below).**
   Every piece's height is `40 + rank * GEN.arenaMinHeightGap + d`, where `rank` is the piece's
   position in a fixed order (every cover ranked below every platform — covers get the lowest
   heights, platforms the highest) and `d` is a single random offset shared by the whole arena,
   drawn just wide enough that the highest-ranked piece of each type present still fits under that
   type's own max height (platforms 40–260, covers 40–160 — the format allows more for cover, but
   this design caps it at a height the player can still jump over; see "Why cap cover height"
   below). Because platforms and covers share the same minimum (40), and covers only ever occupy the
   *low* ranks while platforms occupy the *high* ones, this is provably always satisfiable for every
   piece-count/type combination the three zones can produce (1 to 3 pieces, 0 to 2 of them cover) —
   checked by hand for each case, not assumed. Which zone's piece lands on which rank, among pieces
   of the same type, is itself randomized, so the layout still varies fight to fight; only the exact
   gap between adjacent heights is fixed at exactly `GEN.arenaMinHeightGap`, with no slack to spare
   in the tightest case (three platforms).

   *(Original plan: draw each height randomly, retry up to 20 times if it landed within the minimum
   gap of an existing piece, and fall back to the closest miss otherwise. Implementation found this
   retry approach could still violate the gap for real — for two pieces of cover, whose valid range
   is only 120 units wide, the first cover's height leaves no valid window for the second roughly
   half the time, regardless of how many retries are allowed. The owner chose to fix this by
   guaranteeing the gap by construction, as described above, rather than loosen the numbers or accept
   an occasional violation.)*

**Why cap cover height (40–160, not the format's full 20–400):** a cover taller than about 163 units
becomes a real wall the player cannot jump over (`docs/bosses.md`, "Cover is a wall below its top").
The boss still walks straight through it either way (M5c's simplification), so a tall generated cover
would only ever wall off the *player*, potentially trapping them in a corner against an attack neither
of them can see coming from behind it — a frustration, not a trained skill. Capping at 160 keeps every
generated cover jumpable, matching the spirit of the Hound's 100-height cover.

## Keeping it fair: the new camp-safety check

`docs/bosses.md` already names a known risk that was never actually tested: *"a platform taller than
every hit window's top makes a place where nothing can reach the player, and the fight can then never
end."* The existing fairness checker's idle bot (`checkFairness` in `src/bosses/generate/fairness.ts`)
starts on the floor and never moves, so it has never exercised this case — it happened to be harmless
for the Hound only because its numbers were hand-tuned by feel, not because anything checked it.

This design closes that gap as a genuine extension of the fairness checker, not a generator-only
bolt-on (in keeping with M5e's "reusable, general enough for later steps" principle):

- For **every** platform and cover a `BossDef`'s arena has, `checkFairness` runs the idle bot (no
  input, ever) a second way: starting already standing at the **centre** of that piece's top, instead
  of on the floor. It must still end in `defeated` within the existing cap, exactly like the floor
  case. (Centre, not an edge: the centre is the position most likely to be out of every attack's
  reach, so it is the representative worst case, not an exhaustive search of every position on the
  piece — an approximation, in keeping with this project's bounded-testing approach generally.)
- A boss with no arena is unaffected (nothing new to check).
- This applies to **any** boss checked by `checkFairness`, so it becomes a real regression test
  against the Ashen Hound too: its shipped arena gets checked against a rule that was never actually
  enforced before. If the Hound fails it, that is a genuine, separate finding to bring to the owner —
  not something this design pre-judges.

## Every boss can reach its own arena (added during implementation)

Wiring arenas into real fights revealed a real interaction the earlier design missed: a platform can
be generated taller (up to `GEN.arenaPlatformHeightMax`, 260) than any generated attack's hit window
can ever reach (`GEN.hitTopMax`, 190) — and for an arena with all three zones drawn as platforms, the
tallest platform's height is *guaranteed* to exceed 190 by the height-spacing rule above, not just
possible. Measured effect: the fallback-to-Trainee rate rose from the pre-arena baseline of ~2% to
31% once this was actually wired in and checked for real.

**Owner's fix (2026-09-22): give every generated boss "reach" up to its own arena, guaranteed.**
After a boss's attacks and arena are both generated, if the tallest arena piece is taller than every
one of this boss's own attacks' hit windows, the tallest hit window's `top` is raised to clear it (plus
a small margin). This is a deterministic, construction-time adjustment in `generateBoss` — not a new
random draw, and not a change to the arena or attack generators themselves — matching the owner's own
framing: bosses should be able to "jump, reaching all platforms by design," so no platform is ever
placed out of a boss's own reach in the first place, closing the gap the camp-safety check (above)
exists to catch, before it ever gets the chance to reject a candidate.

## Wiring

- `generateBoss(seed)` gains an `arena` field on the `BossDef` it returns, built by the rules above
  before the boss is checked. No change to its signature or to `resolveBoss`'s three-tries-then-Trainee
  loop — a candidate whose arena creates a camp spot simply fails fairness like any other bad
  candidate, and generation tries again exactly as it does today.
- Trainee (the fallback boss) stays arena-free, as today.

## Versioning

Same as M5c's own arena addition: this changes how a `'generated'` record replays (the same seed can
now come back with a different arena than before this change shipped), so `GAME_VERSION`
(`src/stats/record.ts`, currently `0.4.0`) bumps to **0.5.0** in the task that wires this in.

## Testing

- `generateBoss` over a bounded seed sweep (tens, not hundreds) checking: every generated arena
  parses (via `parseBoss`, which already enforces no-overlap and no-cover-over-start), the bare-chance
  is roughly in the right ballpark, piece count stays 1–3 when present, and no two pieces in the same
  boss are ever closer than `GEN.arenaMinHeightGap` in height.
- The new camp-safety check: a fixture with a deliberately unsafe tall platform must fail it; the
  Ember Duelist (no arena) and Trainee (no arena) are unaffected and stay passing; the Ashen Hound is
  run against it and the real result is reported to the owner as a finding, not assumed.
- `resolveBoss`'s existing tests are extended with at least one seed that produces a generated arena,
  confirming replay is still exact end-to-end (same pattern `tests/loop-replay.test.ts` already uses).

## Done when

- A generated boss sometimes has an arena (1–3 pieces, spread-out heights, matching the placement
  rules above) and sometimes doesn't.
- The fairness checker verifies no arena piece creates a permanent safe spot, for generated bosses and
  as a standing regression check on every hand-built boss with an arena.
- `GAME_VERSION` is bumped and documented.
- `docs/bosses.md`, `docs/stats.md` (version note) and `docs/phone-testing.md` are updated.

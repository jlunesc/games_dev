# The M6 roadmap: adaptability over fairness-proofing

**Status:** LOCKED direction (owner, 2026-09-22). This replaces the flat 7-item M6 order recorded
earlier the same day (`docs/SPEC.md` section 11) with a phased plan. The 7 items aren't dropped —
they're resequenced and two of them (skill-tagging, stat-steering) are pulled forward from the
backlog because the owner identified them as the actual point of the project, not a later polish
step.

## Why (the conversation that produced this)

While finishing M6a (generated arena diversity), a large share of the effort went into precisely
verifying that generated bosses were "fair" — a simulated bot provably beating them without damage.
The owner's read, after watching that effort: **fairness-as-precision-engineering is not the point.**
The point (SPEC section 1, LOCKED since 2026-09-21): *transferable skills* — reading telegraphs,
spacing, dodge timing, punishing, in a way that carries over to other games. A generated boss needs
to be a **legitimate obstacle** (beatable, not a soft-lock) — it does not need to be *provably*
optimal before it's shown. M6a already landed on the right mechanism for this: a cheap backstop (idle
player must lose) plus a banner when the stronger check can't confirm fairness, rather than an
expensive proof gating every fight.

The owner's stated actual goal: **generate a genuinely varied set of attacks and mechanisms, identify
specifically what the owner does wrong, and steer future generation toward practicing that.** That
second half — noticing weaknesses and targeting them — has no code today. It has been sitting as an
open, LOCKED-but-undesigned line in the spec since the very first conversation:

> "stats should be read **per attack type and skill** rather than per named boss... the details of
> how the analysis groups attacks by skill are left to Claude and are still to be designed." (SPEC
> section 1)

> "Using play stats to steer generation... Today generation is uniform random inside fixed ranges,
> with no memory of past fights." (`docs/backlog.md`, under "The boss generator")

This roadmap exists to stop treating that as a someday-item and put it on the critical path.

## Phase 0 — Finish M6a (in progress, nearly done)

Status at time of writing: Tasks 1 and 2 (arena generation, the camp-safety fairness check) are
complete and reviewed. Task 3 (wiring arenas into `generateBoss`, the fallback-to-banner redesign) is
**implemented and fully passing (981/981 tests, typecheck/build/check:dist clean) but its review has
not completed** — the review dispatch hit a session rate limit, not a real finding. Task 4 (docs) has
not started. Full detail and exact resume instructions: `.superpowers/sdd/2026-09-22-m6a-generated-arenas/progress.md`
(the ledger) and `/home/juan/.claude/projects/-home-juan-Documents-repositories-game-dev/memory/m6a-generated-arenas-checkpoint.md`.

**Next action on resume: re-dispatch the Task 3 review** (the review package is already generated),
then Task 4, then a final whole-branch review, then merge with the owner's go-ahead. No further design
work expected here — the hard part (the fairness/fallback redesign) is already decided and built.

## Phase 1 — Five hand-built boss archetypes (no new engineering)

Build five bosses using the **existing** boss format (`docs/bosses.md`) — no generator changes, no new
attack primitives. Each is chosen to stress a clearly different skill, so comparing performance across
them is informative on its own, before any automated analysis exists. Drawn from the archetype list
the spec already named (`docs/SPEC.md` section 7: "melee duelist, heavy bruiser, zoner, summoner,
trickster") minus summoner (needs mechanics — spawning adds — that don't exist yet), plus two more the
owner and Claude agreed on in conversation:

1. **Zoner** — fights from range, pokes and retreats, punishes an unsafe approach. Trains: closing
   distance safely, patience, not eating a poke on the way in.
2. **Heavy bruiser** — slow, hits hard, very telegraphed. Trains: recognizing and punishing a clear
   opening without getting greedy and eating the recovery.
3. **Trickster** — attacks built mostly around fakes and repositions (non-damaging "slip"-style moves,
   like the Ashen Hound's slip, used much more often). Trains: reading the real threat instead of
   flinching at every telegraph.
4. **Rushdown** — fast, closes distance aggressively, chains attacks with little gap between them.
   Trains: staying calm and reactive under sustained pressure, not panic-dodging.
5. **Counter-bait** — most of its attacks are counterable (gold), few must-dodge. Trains: precise
   counter timing and range specifically, since the fight rewards countering over dodging.

Each boss is checked by `parseBoss` at load (same as every hand-built boss) and by `checkFairness`
loosely (idle-must-lose only is the real bar — see the process note at the end of this document; don't
chase a "skilled bot wins clean" proof for these, it isn't the point).

**Deliverable:** five new boss files, addable to the menu's Boss row like the Duelist and Hound. The
owner plays each across a few difficulty levels (Easy/Normal/Hard, and maybe a couple of Tweak-screen
variations) over a real session, then exports stats.

**Bonus, noted for later, not designed now:** these five could double as the first campaign-mode roster
(Phase 4) once that exists — an archetypally distinct set of five bosses is exactly what a campaign
needs, and this phase produces it as a side effect.

## Phase 2 — Skill-tagging and stat-driven steering (the real unlock)

Depends on Phase 1's real data — design this from what the owner's actual fights show, not from
guessing ahead of time. Two parts, likely two sub-designs:

**2a. Skill-tagging.** A taxonomy for what a given attack (or attack shape) trains — for example:
reading an aerial telegraph, spacing against a ranged attack, fast counter timing, reacting under
chain pressure, not overreacting to a fake. Each attack (hand-built or generated) gets one or more
tags. This is squarely the SPEC's own open item quoted above — go back to that line and actually
design it, informed by which skills the five archetypes turned out to actually exercise in practice.

**2b. Weakness-scoring and steering.** Using the existing stats pipeline (evasion, punish
opened/taken/missed, hits taken, reaction data — all already recorded per `docs/stats.md`), score the
owner's recent fights by skill tag: which tags have the worst outcomes. Then either (a) surface this
as a readable summary ("you're weakest at X") for the owner to choose what to fight next, and/or (b)
bias the generator's random draws (`src/bosses/generate/tuning.ts`'s ranges, or a new weighting layer)
toward attack shapes tagged with the weak skills. Start with (a) — visible, low-risk, immediately
useful — before attempting (b), which is a genuine generation-algorithm change.

This phase is the one that turns the project from "a boss fight simulator with variety" into "a
trainer that gets sharper the more it's used," which is the stated point of the whole project.

## Phase 3 — Generator engineering, resumed leaner

The original M6 items 3 (new attack primitives: explosions, projectiles) and 6 (movement diversity,
e.g. flying) — still valuable, still on the list, just built differently than M6a was:

- **Only the cheap fairness backstop up front** (idle player must eventually lose). Do **not** chase a
  "skilled bot must win without damage" proof for every new primitive combination — M6a spent most of
  its time there for comparatively little payoff. Real playtesting and the exported stats catch what a
  simulated bot was never going to catch cheaply anyway (see the process note below).
- If Phase 2 exists by the time this starts, tag new primitives with skill labels as they're built,
  rather than retrofitting later.
- Explosions/projectiles were already flagged (in the M6a design conversation) as needing their own
  design pass together with how they interact with arenas — do that pass fresh, informed by what
  actually shipped in M6a, not the pre-M6a assumptions.

## Phase 4 — Campaign mode

Face a sequence of bosses, must beat each to advance, each with a different trained focus. Depends on
having a roster of archetypally distinct bosses to sequence — Phase 1's five hand-built bosses are a
ready-made starting roster; Phase 3's generator work can expand it later. Design the sequencing,
progress state, and per-boss "focus" framing once there's real content to sequence.

## Backgrounds (original M6 item 5)

Cosmetic, extends the M5d look system, no dependency on anything above. Low risk of a rabbit hole.
Slot it in whenever — a lighter session, or batched with any of Phase 3's visual work.

## Process lesson, stated as a standing principle

**Do not repeat M6a's fairness spiral.** For any future generator work: the pre-flight check stays
cheap and loose (idle-must-lose, nothing more elaborate) instead of trying to prove a stronger
guarantee in simulation. When a real fight turns out to be genuinely unfair, the player will know —
and the stats pipeline (soon, skill-tagged) is the right place to catch and steer away from that
pattern, not an ever-more-precise simulated bot run before the fight ever starts.

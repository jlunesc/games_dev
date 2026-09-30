# Making every boss feel different: analysis and proposed plan

Status: **accepted by the owner on 2026-09-29 and built in rounds 1 to 3** (plan: `docs/superpowers/plans/2026-09-29-boss-identity-round-2-plus.md`). Written 2026-09-29 after the owner asked for an analysis of all boss attacks and movements and a plan to redistribute them and add new ones so each boss feels genuinely different. The text below is the original proposal, kept as written.

## 1. What the analysis found

Scope: the ten hand-built bosses (the Trainee test boss and the Hound and Sage pair excluded, the pair adds no attacks of its own). 49 attacks in total. Method: every boss file read, attacks sorted by what they do, then every pair of attacks on different bosses compared (same kind, wind-up within 6 updates, reach within 35%).

### 1.1 Redundancy: the bosses share one skeleton

- **70 near-duplicate pairs** across different bosses, out of 49 attacks. Nearly every boss has "a sweep, a slam, a dash, a leap and a shot" with different numbers.
- **The dash is on 6 of 10 bosses** (Duelist lunge, Hound rush, Sentinel bash, Golem charge, Reaver rush, Dancer dash). Same pose (arm pulled back), same reach (90 to 110), same answer (dash through or back away).
- **The leap or dive is on 7 of 10** (Hound pounce, Sentinel piston drop, Reaver updraft dive, Warden sky lance, Dancer falling veil, Golem stomp, Kite dives). Four of them are the same crouch pose, landing where you stood, with a wind-up of 30 to 36.
- **Straight bolts are on 6 of 10** (Sentinel cannon, Reaver gust, Warden volley, Kite volley, Dancer fan, Sage bolts). The answer is always jump or dash.
- **Slams and sweeps** (overhead or sideways strike, wind-up 20 to 32, reach 130 to 250) fill 20 of the 49 attacks and are interchangeable between the Duelist, Hound, Reaver, Brute, Sentinel, Dancer and Sage.
- **Two identical fakes**: the Hound's Slip and the Dancer's Phantom Step (same wind-up, same speed, same pose).
- **Wind-ups cluster** at 24 to 30 updates for seven bosses. Only the Golem (40+) and the Reaver and Hound (18 to 24) differ in tempo.

### 1.2 Movement: every boss moves the same way

Between attacks each boss does one thing: walk toward you or away from you until it is inside its preferred distance band. Only the numbers differ (walk speed 150 to 420, gap 35 to 70, preferred distance 80 to 620). Five bosses prefer the same mid-range band (110 to 320). Nothing teleports, vaults away, runs past you, corners you, patrols, or reacts when you get close. Only the Kite leaves the floor. Six of the ten bosses have a single phase, and the phase changes that exist only make the boss faster and add one attack; no boss changes how it behaves.

### 1.3 Gaps: things the game never asks of the player

- **Countering is almost unused.** Only 8 of 49 attacks are counterable and 4 of those belong to the Sentinel. Five bosses have none. The counter is a locked core mechanic and most fights never ask for it.
- **Every hit box starts at the floor.** No attack passes over a standing player, so nothing punishes jumping, and jumping is never a mistake. The new up and down swings and the pogo have no boss that needs them.
- **No timing tricks.** Every attack has a fixed wind-up, so once the rhythm is learnt it never changes. Nothing waits (a held wind-up), and no boss has a fixed combination to learn (chains are random picks).
- **No one forces a particular dodge.** Almost everything can be beaten by a dash or by walking away. Only the Duelist's ground burst, the Hound's landing bar and the Brute's eruptions really ask for a jump or a step aside.
- **Area control is missing.** Nothing lingers on the floor, so position never gets worse over the fight (the spec lists lingering hazards as a candidate).
- **No hand-built boss uses an arena** (the owner removed the Hound's and the Sage's after playing; generated bosses still get them). Any arena work has to be justified by a boss's identity, not added by default.
- **Reactions to the player are missing.** No boss changes what it does because you are close, far, cornered or standing still.

## 2. The design rule proposed

Each boss gets **one question it asks the player**, **one way of moving** that no other boss has, and **one attack family that only it uses**. The shared basics (a strike, a dash, a leap, a bolt) are capped so that no kind appears on more than three bosses, and each boss keeps at most two of them.

The Ember Duelist stays exactly as it is: it is the fixed reference for the statistics and its behaviour is pinned by a test (`tests/duelist-golden.test.ts`). Its question is "can you read the poses?", and the others are measured against it.

## 3. Proposed identity for each boss

"Moves" means attacks taken from another boss's list or removed as duplicates. "New" means it needs something the game does not have yet (section 4). Attacks not mentioned stay as they are.

| Boss | Question it asks | Way of moving | Keeps | Loses | New |
|---|---|---|---|---|---|
| **Ember Duelist** | Can you read the pose? | Steady walk, keeps its distance | Everything (reference boss, unchanged) | Nothing | Nothing |
| **Ashen Hound** | Can you react fast and not fall for a fake? | Prowls fast and low, runs past you to switch sides | Bite, rush, pounce, slip | Nothing | A feint: same pose as the bite, no hit (data only) |
| **Gale Reaver** | Can you stay calm under a learnt combination? | Never stops, keeps stepping in, pushes you to the wall | Wind slash, gale jab, cyclone, tempest rush | Updraft dive (the Hound's pounce), retreating gust (a bolt) | Fixed three-hit combinations with no gap, in the same order every time |
| **Brass Sentinel** | Can you counter? | Plants its feet, advances slowly, never backs away | Herald strike, brass slam, wide sweep, spin cycle (all gold) | Brass cannon (a bolt), piston drop (a leap), charging bash (a dash) | A gold strike that holds its pose a random number of ticks before it hits, and a red follow-up after a countered gold |
| **Cinder Golem** | Can you manage space as it gets crowded? | Very slow lumber, never dashes | Crag slam, furnace stomp, cinder lob, fault slam (its one gold, 2 damage) | Ground charge (a dash) | Burning patches its slams and lobs leave on the floor for a few seconds |
| **Quill Warden** | Can you approach without being punished? | Keeps far, backs away when you get close | Reaching poke, low piercer, overextended thrust (its gold) | Feather volley (a bolt), sky lance (a leap) | A vault backwards (data only: a leap with target back), an anti-air swipe that only hits a jumping player (data only: hit box that starts above the floor) |
| **Storm Kite** | Do you know where it will land? | Circles above, never touches the floor between attacks | Plunge, swoop, bolt volley (aimed down from above) | Snap plunge (a twin of plunge) | A long strafing pass across the arena in phase 2 (data only: a swoop with a long distance) |
| **Tremor Brute** | Can you move when the floor is the weapon? | Marches straight at you, never backs away | Hammer fist, backhand (gold), fissure, twin quake | Nothing | A slow low wave along the floor that must be jumped (data only: a wide low bolt, needs a new look), an anti-air swipe |
| **Veil Dancer** | Where will it be next? | Blinks (disappears and appears) instead of walking | Piercing veil, veil slip, needle fan | Rending dash (a dash), falling veil (a leap), phantom step (the Hound's slip) | Blink behind you and blink away, with a mark that shows where it will appear; a fan of needles that spread out instead of aiming |
| **Vesper Sage** | Can you weave through a pattern of shots? | Floats away when you get close | Single bolt, triple volley, lob, point-blank burst (punishes closing in) | Nothing | Blink away when you approach; pairs of shots in a fixed order (a lob then a low bolt) |

After the change, the shared kinds would sit on at most three bosses each: dash on the Duelist, Hound and Reaver; leap or dive on the Hound, Golem and Kite; bolts on the Sage, Kite and Dancer.

## 4. What the game would need

Grouped by cost. Each is one small design decision for the owner when its turn comes.

**A. Already possible, only boss files change (no engine work).** Removing and moving attacks; the feint; the vault backwards; the anti-air swipe (a hit box that starts above the floor, so a jump into it is punished and standing still is safe); the wide low wave (a bolt); the strafing swoop; two-part strikes (a hit box list already supports two swings); per-boss walk speed, gap and preferred distance. This alone removes most of the 70 near-duplicates and is a first round by itself.

**B. Small engine additions.**
- **Hold**: a wind-up that freezes on its pose for a random (seeded, so replays match) extra 0 to N ticks before it strikes. Makes counter and dodge timing something to read, not memorise.
- **Fixed combinations**: a phase can list named sequences of attacks that run with no gap. The player learns the order.
- **Per-phase preferred distance**: a phase can change how far the boss stays, so a phase 2 changes behaviour and not just speed.
- **Blink**: the boss vanishes and appears at a spot fixed when the attack starts (the same rule as a leap's landing), with a mark on the floor.

**C. Bigger additions (each would be its own design conversation).**
- **Lingering patches**: a floor hazard that stays a few seconds, low enough to jump. The Golem's identity.
- **Reactive evade**: a boss that answers you getting close with a named retreat attack. The Warden's and the Sage's identity.
- **Guard** (optional, needs a rules decision): a boss that ignores frontal hits and can only be hurt by a counter, a swing from above (the pogo) or from behind. Would give the up and down swings a reason to exist. Not needed for the plan to work.

**D. Looks and sounds** for each new primitive and for each boss's new attacks (the attack looks and sounds are separate files and never touch how a fight plays).

Not proposed: summoned minions, arenas on hand-built bosses, and changes to the generator (generated bosses keep using today's attack kinds; the new ones can be offered to the generator later as its own decision).

## 5. Proposed order

1. **Round 1, data only.** Section 3 with only the "data only" items, plus the removals and moves. Each boss gets its own walk speed, gap and distance. Add a **distinctness guard test**: it computes a fingerprint for every attack (kind, pose, class, wind-up bucket, reach bucket) and fails when two bosses share more than a set number of near-duplicates or when a kind is on more than three bosses, so the roster cannot drift back. Bump `GAME_VERSION`, update `docs/bosses.md` where needed, and add play-test questions to `docs/phone-testing.md`.
2. **Round 2, small engine additions** (hold, fixed combinations, per-phase distance, blink), then the Reaver, Sentinel, Dancer and Sage get their new attacks.
3. **Round 3, bigger additions** (lingering patches, reactive evade), then the Golem, Warden and Sage finish.
4. **Round 4, looks and sounds** for the new attacks.

The owner plays after each round (they play on the phone), and the numbers are tuned from that play. All numbers are first guesses.

## 6. Things to know before starting

- **Stats continuity**: the stats record attack ids. Removing or renaming an attack means old exports and new ones no longer line up for that boss. `GAME_VERSION` is bumped so old records still replay with the old numbers, and the stats docs get a note.
- **The Hound and Sage pair** keeps working: the Hound and the Sage lose nothing they rely on, and the pair's two-boss rules do not change.
- **Balance**: removing an attack shortens a boss's list, so the weights of the rest are re-balanced by feel.
- **The Trainee** (used by tests) is left alone.

## 7. First decision for the owner

Is the "one question, one way of moving, one attack family" rule the right target, and may Round 1 (data only) go ahead as the first step? The identity table in section 3 is a proposal: any boss's question or list can be changed before it is built.

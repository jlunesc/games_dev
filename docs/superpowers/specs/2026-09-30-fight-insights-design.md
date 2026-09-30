# Fight insights design

After every fight, the summary screen tells the player what to work on: up to three lines, each a **skill** with the attacks that show it. This is the first piece of Phase 2 of the M6 roadmap (the stat-driven weakness analysis): it answers "what do I specifically do wrong" from one fight, with no history. The design came out of a conversation with the owner on 2026-09-30, in which the owner analysed a real export (a Tremor Brute, a Storm Kite and a Hound and Sage fight on Hard) with Claude and asked for the game to do that itself.

## Owner decisions (LOCKED, 2026-09-30)
- Insights are worded **by skill, with the attack as evidence** (for example "Dodging too late", with the attacks that hit), not by boss or attack alone. This follows SPEC section 1 (transferable skills).
- The summary screen shows the **top 3**, ranked by what each problem cost.
- **This fight only**: no comparison with earlier fights in this step.
- A dodge is **late** when it began in the last **20%** of the time between the warning starting and the danger (scaled to each attack, not a fixed number of ticks). A dodge is **early** when it began in the first **25%** of that time and the player was hit anyway.
- A **greedy swing** is any swing still in progress when an attack's first danger moment arrived, whether or not it was hit.
- **Dash effectiveness** is measured: each dash says whether it escaped an attack, did not save the player, was not needed, or was a travel dash.
- **Movement is not judged by direction.** A dash into an attack can be the right dodge. "Does my movement make sense" is answered by efficiency numbers: do attacks land, are attacks dodged, does the player get close enough to swing before an opening closes, and how far from the boss the player stays.
- The three measurements that do not exist yet (greedy swings, dash effectiveness, opening length and distance) are built now, with a stats schema bump.

Everything below that is not listed above is **DELEGATED** (the owner reviews it here).

## What the player sees
The summary screen (`src/ui/summary-text.ts`, `summary-menu.ts`) gets a block after the existing lines, headed "Work on:", with up to three lines. Each line is one sentence naming the skill and its evidence, for example:
- "Dodging too late: 3 hits began their dodge in the last moments (Swoop, Hammer-fist)."
- "Openings: you used 1 of 10 after attacks. Most were missed because you were too far away."
- "Swinging at the wrong time: 4 swings were still going when an attack became dangerous, and 2 of those attacks hurt you (Low sweep)."

A fight with fewer than three problems shows fewer lines. A fight with nothing worth saying (for example too few attacks) shows "Nothing stands out this fight." The block never appears for a fight left during the study. The block must fit the phone summary screen without scrolling the existing lines off; check the layout on the S21 size.

## The efficiency numbers
Three areas. Every number is for the **real fight only** (the study excluded), unlike the older behaviour numbers, which cover the whole session.

**Attack efficiency**
- Accuracy: `swingsThatHit / swings` (exists).
- Openings used: `punish.taken / punish.opened` (exists).
- Damage dealt per second of fight (derived from `damageDealt` and `fightSeconds`).
- Greedy swings: new, see below.

**Defence efficiency**
- Attacks avoided out of attacks, split by how: walked away (`distance`), `dash`, `jump`, `platform`, `cover`, `countered` (exists in `attacks`).
- Every hit is classed from data that already exists: **late** (`marginTicks` / (`firstDangerTick` - `startTick`) is at most 0.20, including negative margins), **early** (a dodge action with `reactionTicks` / (`firstDangerTick` - `startTick`) below 0.25, hit anyway), **no dodge** (no dash or jump before the danger), else **other**. No new stored field is needed for this: the insight code computes it.

**Approach efficiency**
- Time in swing range and average distance to the boss: new, see below.
- For every opening: did the player get within swing reach before it closed, and how far away were they when it opened: new, see below.
- Dash effectiveness: new, see below.

## New measurements (stats schema version 7)
All are computed by the existing replay in `src/stats/analyze.ts`. Names are proposals; the implementation plan fixes them.

1. **Greedy swing.** Each attack occurrence gains `swingAtDanger: boolean`: a player swing was in progress (startup, active or recovery) on the attack's first danger update. The analysis also gains `behavior.greedySwings` (occurrences with `swingAtDanger` in the real fight) and `behavior.greedyHits` (those that also hit the player). In a pair, every attack counts on its own.
2. **Dash effectiveness.** The analysis gains `dashUse`, counted in the real fight only. The existing `dashes` (dashes started, whole session) stays.
   - `escaped`: a dash begun while an attack was live (warning up to the end of its danger), and the attack was dodged with evasion `dash`.
   - `hitAnyway`: begun while an attack was live, and that attack hit the player.
   - `notNeeded`: begun while an attack was live, and the attack was dodged by another evasion (`distance`, `jump`, `platform`, `cover`). The player was already safe or another move saved them.
   - `travel`: begun with no attack live. It is split into `closer`, `farther` and `even` by comparing the distance to the nearest boss when the dash began and when it ended (more than `TRAVEL_DASH_CHANGE` units closer or farther; otherwise even).
   - A dash during a countered or interrupted attack is counted in `other`. With overlapping attacks (a pair), the dash is assigned to the attack whose warning began first.
3. **Openings.** `punish` gains `windows`, one entry per opened window: `{ attackId, boss, startTick, ticks, distanceAtOpen, closestDistance, swung, hit, reachable }`. `closestDistance` is the smallest distance to the boss while the window was open. `swung` is whether the player began a swing inside the window. `reachable` is whether the player could have reached swing range from `distanceAtOpen` at running speed before the window closed (`distanceAtOpen` minus swing reach is at most running speed times the window length). The existing `opened`, `taken` and `missed` stay and stay equal to the counts of this list.
4. **Distance.** `behavior` gains `realUpdatesInReach` (real-fight updates with the player within swing reach of the nearest standing boss) and `realMeanDistance` (mean distance to the nearest standing boss over the real fight, rounded to 0.1). The existing close, mid and far counts are unchanged.

Swing reach is taken from the player's swing hit box in `src/game/params.ts`, worked out in the plan, and lives in one named constant.

## The insights step
- `src/stats/insights.ts`: a pure function `insightsFor(analysis: Analysis): Insight[]`. It reads only the analysis, so it never touches a fight, a recording or `GAME_VERSION`.
- An `Insight` is `{ skill, cost, attackIds, ... }` plus the plain numbers the text needs: a skill key (`dodge-late`, `dodge-early`, `dodge-other`, `no-dodge`, `greedy-swing`, `openings`, `approach`), a cost (below), and the attack ids as evidence.
- Every cut-off is in `src/stats/insights-tuning.ts`: late 0.20, early 0.25, the number of lines (3), and the smallest sample before a skill is reported (for example at least 3 openings before the opening rate is judged, at least 2 hits before a late or early pattern is called) (`TRAVEL_DASH_CHANGE` lives in `src/stats/analyze.ts` with the other measurement constants).
- **Cost and ranking.** Every insight gets a cost as a share of a whole fight, so health lost and damage missed can be compared: defence problems are the health lost to that cause divided by the player's starting health; attack and approach problems are the damage missed (missed openings times the player's typical damage per landed hit, or 1 when there was none) divided by the bosses' total health. The three highest costs are shown, highest first; an insight with cost 0 is never shown.
- **Old records.** An analysis without the version 7 fields skips the skills that need them. Fights can be re-measured by replay to fill the fields (as `docs/stats.md` section 9 already allows for earlier versions).
- There is no dash line and no accuracy line: a dash that was hit anyway is already a late, early or other dodge hit, and swung-and-missed is inside `openings`. A fight left during the study shows no block.
- The words live in `src/ui/insight-text.ts` (pure: insight to sentence), apart from the logic, so they can be reworded without touching the measuring code. Text uses `textContent` only, never `innerHTML`.

## What this cannot tell you (stated in `docs/stats.md`)
- A travel dash and an early dodge dash are told apart only by whether an attack was live; a dash for movement that starts inside an attack window counts as that attack's dash.
- One fight is a small sample. A line is a hint to practise, not a verdict.
- A hit can have several causes; the insight names the most visible one (the dodge timing data).
- Movement direction is never graded, so wandering is seen only through its results (missed openings, time out of reach), not directly.

## Recording and docs
- `STATS_SCHEMA_VERSION` becomes 7. `docs/stats.md` documents every new field in the existing sections and adds a section on insights: what each skill means, the cut-offs, and the limits above. Older records stay valid and replay exactly as before (no game change). `GAME_VERSION` does not change: no game number or boss file changes.
- `docs/SPEC.md` gets a short note under Phase 2 that the insights step exists and what it covers.

## Tests
- Each new measurement on a small scripted fight: a swing in progress at danger (true and false), a dash that escapes, one that is hit anyway, one not needed, a travel dash that closes and one that retreats, an opening reached and one not reachable, and the distance numbers.
- Real-fight-only rule: a fight with a study gives the same new numbers as the same input after the study.
- The hit classification at the edges (exactly 20% and 25%, negative margin, no dodge).
- `insightsFor`: ranking order, the 3-line limit, cost 0 hidden, sample minimums, an analysis without version 7 fields, a fight with nothing to say.
- `insight-text`: one sentence per skill, singular and plural, no HTML.
- Replay: a version 7 record replays to the same final state, and re-measuring a version 6 record adds the new fields without changing the old ones.

## Out of scope
Trends across fights and an Insights screen, steering boss generation from the insights, the full skill-tagging taxonomy across attacks (the rest of Phase 2), and any judging of movement by direction.

## Done when
Tests and CI pass; after a real fight on the phone the summary shows sensible lines; and the owner has compared them with a hand analysis of the same export and agrees they point at the same problems.

## Deviations from this spec as built
- **Skill keys.** Seven are implemented: `dodge-late`, `dodge-early`, `dodge-other`, `no-dodge`, `greedy-swing`, `openings`, `approach`. The examples `dash-travel`, `dash-wasted` and `accuracy` are **not** implemented as insights. Dash use is measured (`dashUse`, `docs/stats.md` 7.1b) but not yet turned into a line.
- **Wording of dodge-late.** The line also covers a dodge that began after the danger did (a negative margin), not only one in the last 20% of the warning.
- **Greedy-swing wording.** Its "hurt" count covers every hit that had a swing going, while the attack names shown are only those with no dodge action (see `docs/stats.md` 7.6). The openings line counts windows where the player swung and missed as "could have reached".
- **Layout.** The insight lines are drawn smaller than the other summary lines (the `compact` class in `src/ui/screens.ts` and `src/ui/style.css`).
- **Still to do.** The check of the summary layout on the S21 is for the owner to do on the phone.

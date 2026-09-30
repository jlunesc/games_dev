# Fight Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every fight the summary screen shows up to three "Work on:" lines, each a skill (dodging too late, missed openings, and so on) with the attacks that show it, computed from that one fight.

**Architecture:** Three new measurements (greedy swings, dash use, opening detail plus distance) are added to the existing replay in `src/stats/analyze.ts` and the stats schema goes to 7. A pure `insightsFor(analysis)` turns an `Analysis` into ranked `Insight` records, a separate pure module turns each one into a sentence, and `app.ts` shows the lines on the summary screen. Nothing touches a fight, a recording or `GAME_VERSION`.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-fight-insights-design.md` (read it first; this plan implements it, with the deviations listed under "Deviations from the spec" below).

## Global Constraints

- TypeScript in strict mode; `noUnusedLocals` and `noUnusedParameters` are on, so every import and variable must be used.
- No backend, no new dependencies, no third-party scripts. Strict CSP: no inline scripts, no `style="..."`; write DOM text with `textContent`, never `innerHTML` (`el(tag, class, text)` in `src/ui/dom.ts` already does this).
- Insights **never change how a fight plays**: no edit to `src/game/`, `src/bosses/`, the recording format or `GAME_VERSION` (stays `0.10.0`).
- The stats schema is versioned: any shape change bumps `STATS_SCHEMA_VERSION` (6 to 7) and updates `docs/stats.md` and the tests in the same piece of work.
- Every insight cut-off lives in `src/stats/insights-tuning.ts`; the words live in `src/ui/insight-text.ts`, apart from the logic.
- Late dodge = began in the last **20%** of the time from warning start to first danger (negative margin included). Early dodge = began in the first **25%** of that time and the player was hit anyway. Both edges are inclusive.
- Greedy swing = any player swing (start-up, active or recovery) still in progress on the update an attack could first hurt, hit or not.
- Movement is **never** judged by direction. Numbers are for the **real fight only** (the study excluded).
- The summary screen shows at most **3** insight lines, ranked by cost; cost 0 is never shown; a fight left during the study shows no block at all.
- Owner rules: the owner is not a programmer (plain words in anything the player sees); commit only when the owner has asked for commits in this session (if not sure, ask once before the first commit); **never** add a `Co-Authored-By` line or any Claude/Anthropic attribution to a commit message (the owner's global CLAUDE.md overrides any default attribution reminder).
- Test commands: `npm test` (Vitest once), `npm run typecheck`, `npm run build` then `npm run check:dist`.

## Deviations from the spec

The spec says "names are proposals; the implementation plan fixes them". These are the fixed names and small changes:

- The spec's `analysis.dashes` would clash with the existing numeric `analysis.dashes` (dashes started, whole session). The new object is called **`dashUse`**.
- Measurement constants (`TRAVEL_DASH_CHANGE`, `swingReach`) live in `src/stats/analyze.ts`, next to the existing `CLOSE_BELOW` and `MID_UP_TO`. `insights-tuning.ts` holds only the insight cut-offs.
- Insight skills built: `dodge-late`, `dodge-early`, `dodge-other` (dashed or jumped, in time by the clock, hit anyway), `no-dodge`, `greedy-swing`, `openings`, `approach`. Not built as lines: `accuracy` (swung-and-missed is already inside `openings`) and the dash skills (a dash that was hit anyway is already a late, early or other dodge hit, so a dash line would count the same hit twice). The dash numbers are recorded and exported; a dash line is a later, small addition to `insights.ts`.
- `openings` counts only missed openings where the player was close enough; `approach` counts only the ones where the player could not have reached the boss in time. So the two never count the same opening.
- A hit is put in **one** class only: late, early, other (a dodge action was made), else greedy (swinging at danger), else no-dodge.
- A fight with no problem worth reporting shows "Nothing stands out this fight." (spec); a fight left during the study shows nothing (spec).

## File Structure

- Modify `src/stats/analyze.ts`: new measurements (Tasks 1-3).
- Create `tests/analyze-measures.test.ts`: tests for the three measurements (Tasks 1-3).
- Modify `src/stats/record.ts`, `tests/record.test.ts`, `tests/record-pair.test.ts`, `tests/analyze.test.ts`, `docs/stats.md`: schema 7 (Task 4).
- Create `src/stats/insights-tuning.ts`, `src/stats/insights.ts`, `tests/insights.test.ts` (Task 5).
- Create `src/ui/insight-text.ts`, `tests/insight-text.test.ts` (Task 6).
- Modify `src/ui/app.ts`, possibly `src/ui/style.css` (Task 7).
- Modify `docs/stats.md` (insights section), `docs/SPEC.md`, the spec file (Task 8).

---

### Task 1: Greedy swings

**Files:**
- Modify: `src/stats/analyze.ts`
- Create: `tests/analyze-measures.test.ts`

**Interfaces:**
- Produces: `AttackOccurrence.swingAtDanger: boolean`; `Analysis.behavior.greedySwings: number`; `Analysis.behavior.greedyHits: number`.

- [ ] **Step 1: Write the failing tests**

Create `tests/analyze-measures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { analyzeRun } from '../src/stats/analyze';
import { customBoss, melee, solo, standAt, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';

/** `count` idle updates with `at` (update numbers start at 1) overriding some of them. */
const frames = (count: number, at: Record<number, Partial<InputFrame>> = {}): InputFrame[] =>
  Array.from({ length: count }, (_, i) => withInput(at[i + 1] ?? {}));

/** The update (1-based) on which the boss's first attack warning begins when the player stands still. */
const firstWindup = (boss: BossDef, distance: number): number =>
  windupUpdates(run(standAt(boss, distance), 120, () => NO_INPUT, boss))[0]!;

// The sweep warns for 24 updates and is dangerous from update 24 (first + 24). A swing lasts 16 updates.
const sweepBoss = solo('sweep');
// A harmless poke (warning 6, dangerous from 6, reach 50), usable from any distance.
const pokeBoss = customBoss([melee('poke')], { attacks: [{ id: 'poke', weight: 1 }] });

describe('greedy swings', () => {
  it('counts a swing still going when the attack could first hurt, and the hit that followed', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 40, { [first + 15]: { attackPressed: true } }),
    );
    expect(a.attacks[0]!.swingAtDanger).toBe(true);
    expect(a.attacks[0]!.outcome).toBe('hit');
    expect(a.behavior.greedySwings).toBe(1);
    expect(a.behavior.greedyHits).toBe(1);
  });

  it('is false when the player was not swinging', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(first + 40));
    expect(a.attacks[0]!.swingAtDanger).toBe(false);
    expect(a.behavior.greedySwings).toBe(0);
    expect(a.behavior.greedyHits).toBe(0);
  });

  it('is false when the swing was already over at the danger', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 40, { [first + 2]: { attackPressed: true } }),
    );
    expect(a.attacks[0]!.swingAtDanger).toBe(false);
    expect(a.behavior.greedySwings).toBe(0);
  });

  it('counts a greedy swing that was not hurt (the attack missed) as a swing but not a hit', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(
      pokeBoss,
      standAt(pokeBoss, 400),
      frames(first + 10, { [first + 1]: { attackPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({ attackId: 'poke', outcome: 'dodged', swingAtDanger: true });
    expect(a.behavior.greedySwings).toBe(1);
    expect(a.behavior.greedyHits).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/analyze-measures.test.ts`
Expected: FAIL (typecheck-free in Vitest, so the failures read `expected undefined to be true` / `Cannot read properties of undefined`).

- [ ] **Step 3: Implement**

In `src/stats/analyze.ts`:

1. In `interface AttackOccurrence`, after the `shotsFired` field add:

```ts
  /** A player swing (start-up, active or recovery) was in progress on the update the attack could first hurt, whether or not it hurt. */
  swingAtDanger: boolean;
```

2. In `interface Analysis.behavior`, after `updatesOnPlatform` add:

```ts
    /** Attacks of the real fight (the study excluded) with `swingAtDanger`. */
    greedySwings: number;
    /** Of those, how many hit the player. */
    greedyHits: number;
```

3. In `interface OpenAttack`, after `held` add:

```ts
  /** The update the attack could first hurt has been seen (the swing check is made once, on it). */
  dangerSeen: boolean;
  swingAtDanger: boolean;
```

4. In `occurrence(open)`, after `shotsFired: open.shotsFired,` add `swingAtDanger: open.swingAtDanger,`.

5. In `observe`, right after the line `attack.lastT = t;` (the first one, before `const dodgeStarted = ...`) add:

```ts
    if (t === attack.dangerFrom && !attack.dangerSeen) {
      attack.dangerSeen = true;
      attack.swingAtDanger = after.player.attackTick >= 0;
    }
```

6. In the `open = { ... }` literal, after `held: 0,` add `dangerSeen: false,` and `swingAtDanger: false,`.

7. In the returned `behavior` object, after `updatesOnPlatform: platformUpdates,` add:

```ts
      greedySwings: attacks.filter((x) => !x.study && x.swingAtDanger).length,
      greedyHits: attacks.filter((x) => !x.study && x.swingAtDanger && x.outcome === 'hit').length,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/analyze-measures.test.ts && npm run typecheck`
Expected: PASS. If a timing expectation is off by a few updates, read the states (`run(...)` plus `attackTick`) and fix the **test's update numbers**, not the rule "swing in progress on the first danger update".

- [ ] **Step 5: Run the whole suite, then commit**

Run: `npm test`
Expected: PASS (old tests do not look at the new fields).

```bash
git add src/stats/analyze.ts tests/analyze-measures.test.ts
git commit -m "feat: analysis measures greedy swings (a swing still going when an attack could first hurt)"
```

---

### Task 2: Dash use

**Files:**
- Modify: `src/stats/analyze.ts`
- Modify: `tests/analyze-measures.test.ts`

**Interfaces:**
- Consumes: `OpenAttack`, `lingering`, `open`, `finish` (existing, in `analyzeRun`); `PLAYER.dash.duration` (11).
- Produces: `export const TRAVEL_DASH_CHANGE = 40`; `export interface DashUse { escaped: number; hitAnyway: number; notNeeded: number; other: number; travel: { closer: number; farther: number; even: number } }`; `Analysis.dashUse: DashUse`.

- [ ] **Step 1: Write the failing tests**

In `tests/analyze-measures.test.ts` replace the import block with:

```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { analyzeRun } from '../src/stats/analyze';
import { customBoss, melee, solo, standAt, windupUpdates } from './boss-helpers';
import { QUIET_BOSS, run, withInput } from './helpers';
```

and append:

```ts
// A long must-dodge swing: warning 30, dangerous for updates 30 to 60 over 400 units in front of the boss.
const longBoss = customBoss(
  [
    melee('long', {
      windup: 30,
      active: 30,
      recovery: 30,
      hits: [{ from: 30, to: 60, x0: 0, x1: 400, bottom: 0, top: 200 }],
    }),
  ],
  { attacks: [{ id: 'long', weight: 1 }] },
);

const dashTotal = (d: {
  escaped: number;
  hitAnyway: number;
  notNeeded: number;
  other: number;
  travel: { closer: number; farther: number; even: number };
}): number => d.escaped + d.hitAnyway + d.notNeeded + d.other + d.travel.closer + d.travel.farther + d.travel.even;

describe('dash use', () => {
  it('a dash that got the player through the attack escaped it', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 60, { [first + 22]: { dashPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'dash' });
    expect(a.dashUse).toEqual({
      escaped: 1,
      hitAnyway: 0,
      notNeeded: 0,
      other: 0,
      travel: { closer: 0, farther: 0, even: 0 },
    });
  });

  it('a dash that still ended in the attack was hit anyway', () => {
    const first = firstWindup(longBoss, 120);
    // Dash away, early: the player ends 380 units from the boss, still inside the 400-unit swing.
    const a = analyzeRun(
      longBoss,
      standAt(longBoss, 120),
      frames(first + 70, { [first + 5]: { dashPressed: true, moveX: -1 } }),
    );
    expect(a.attacks[0]!.outcome).toBe('hit');
    expect(a.dashUse.hitAnyway).toBe(1);
    expect(dashTotal(a.dashUse)).toBe(1);
  });

  it('a dash against an attack that would have missed anyway was not needed', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(pokeBoss, standAt(pokeBoss, 400), frames(first + 16, { [first + 2]: { dashPressed: true } }));
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'distance' });
    expect(a.dashUse.notNeeded).toBe(1);
    expect(dashTotal(a.dashUse)).toBe(1);
  });

  it('a dash with no attack live is a travel dash: toward the boss is closer, away is farther', () => {
    const toward = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 5: { dashPressed: true, moveX: 1 } }));
    expect(toward.dashUse.travel).toEqual({ closer: 1, farther: 0, even: 0 });
    const away = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 5: { dashPressed: true, moveX: -1 } }));
    expect(away.dashUse.travel).toEqual({ closer: 0, farther: 1, even: 0 });
  });

  it('a travel dash still going when the run ends is judged where it stood (a short one is even)', () => {
    const a = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 40: { dashPressed: true, moveX: 1 } }));
    expect(a.dashUse.travel).toEqual({ closer: 0, farther: 0, even: 1 });
  });

  it('counts nothing for dashes made in the study', () => {
    const initial = createInitialState(sweepBoss, 1, 1);
    const states = run(initial, 1500, () => NO_INPUT, sweepBoss);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    expect(endTick).toBeGreaterThan(80);
    const a = analyzeRun(
      sweepBoss,
      initial,
      frames(endTick, { 5: { dashPressed: true }, 40: { dashPressed: true }, 75: { dashPressed: true } }),
      1,
    );
    expect(a.dashes).toBe(3);
    expect(dashTotal(a.dashUse)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/analyze-measures.test.ts`
Expected: the new tests FAIL (`dashUse` is undefined).

- [ ] **Step 3: Implement**

In `src/stats/analyze.ts`:

1. After `export const POSITION_EVERY = 6;` add:

```ts
/** A travel dash that ended more than this many world units closer to (or farther from) the nearest boss than it began counts as closer (or farther); otherwise even. */
export const TRAVEL_DASH_CHANGE = 40;
```

2. Before `export interface Analysis` add:

```ts
/** What the dashes of the real fight achieved. Every dash of the real fight is in exactly one counter. */
export interface DashUse {
  /** Dashes during an attack that was dodged with evasion `dash`. */
  escaped: number;
  /** Dashes during an attack that hit the player. */
  hitAnyway: number;
  /** Dashes during an attack that was dodged another way (distance, jump, platform or cover). */
  notNeeded: number;
  /** Dashes during an attack that was countered or cut short. */
  other: number;
  /** Dashes with no attack live, by what they did to the distance to the nearest boss. */
  travel: { closer: number; farther: number; even: number };
}
```

3. In `interface Analysis`, after `jumps: number;` add:

```ts
  /** What the dashes of the real fight (the study excluded) achieved. */
  dashUse: DashUse;
```

4. In `interface OpenAttack`, after `swingAtDanger: boolean;` add:

```ts
  /** Dashes of the real fight begun while this attack was the live one. */
  dashes: number;
```

and in the `open = { ... }` literal add `dashes: 0,` after `swingAtDanger: false,`.

5. In `analyzeRun`, after `const punish: PunishWindows = ...;` add:

```ts
  const dashUse: DashUse = { escaped: 0, hitAnyway: 0, notNeeded: 0, other: 0, travel: { closer: 0, farther: 0, even: 0 } };
  /** Travel dashes begun but not yet judged: the update they end on, and the distance when they began. */
  let travelling: { endTick: number; from: number }[] = [];
```

6. After the definition of `finish` (before `const dodgeBegan`), add the helpers, and change `finish` and the two other places that push occurrences to use `emit`. Add:

```ts
  /** Emits an attack's occurrence and credits the dashes made during it by how it ended. */
  const emit = (attack: OpenAttack): void => {
    const made = occurrence(attack);
    attacks.push(made);
    if (attack.dashes === 0) return;
    if (made.outcome === 'hit') dashUse.hitAnyway += attack.dashes;
    else if (made.outcome === 'dodged') {
      if (made.evasion === 'dash') dashUse.escaped += attack.dashes;
      else dashUse.notNeeded += attack.dashes;
    } else dashUse.other += attack.dashes;
  };

  /** The attack a dash begun on `tick` belongs to: of the live attacks (warning up to the end of the danger, or shots still flying) the one whose warning began first; null when none is live. */
  const liveAttack = (tick: number): OpenAttack | null => {
    const live = lingering.filter((x) => !x.study && !x.shotsDone && !x.shotsCleared);
    if (open !== null && !open.study && tick - open.startTick - open.held <= open.dangerTo) live.push(open);
    return live.reduce<OpenAttack | null>((first, x) => (first === null || x.startTick < first.startTick ? x : first), null);
  };

  const judgeTravel = (from: number, to: number): void => {
    if (to < from - TRAVEL_DASH_CHANGE) dashUse.travel.closer += 1;
    else if (to > from + TRAVEL_DASH_CHANGE) dashUse.travel.farther += 1;
    else dashUse.travel.even += 1;
  };
```

Because `emit` is used inside `finish`, define `emit` **before** `finish` (move it up if needed so `const emit` comes first). In `finish` change `else attacks.push(occurrence(attack));` to `else emit(attack);`. In the loop change `for (const x of settled) attacks.push(occurrence(x));` to `for (const x of settled) emit(x);` and the final `for (const waiting of lingering) attacks.push(occurrence(waiting));` to `for (const waiting of lingering) emit(waiting);`.

7. In the main loop, right after `if (dashStarted) dashes += 1;` add:

```ts
    if (dashStarted && !before.study.active) {
      const live = liveAttack(tick);
      if (live !== null) live.dashes += 1;
      else travelling.push({ endTick: tick + PLAYER.dash.duration, from: nearestDistance(before) });
    }
```

and right after `const distance = nearestDistance(after);` add:

```ts
    travelling = travelling.filter((d) => {
      if (tick < d.endTick) return true;
      judgeTravel(d.from, distance);
      return false;
    });
```

8. After the loop's closing brace and before `if (open !== null) finish(open, true);` add:

```ts
  for (const d of travelling) judgeTravel(d.from, nearestDistance(state));
```

9. In the returned object, after `jumps,` add `dashUse,`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/analyze-measures.test.ts && npm run typecheck && npm test`
Expected: PASS. If the "hit anyway" scenario does not produce a hit (the dash endpoint is out of the 400-unit box), shorten the box's miss by widening `x1` to 600 in `longBoss`; do not change the rule.

- [ ] **Step 5: Commit**

```bash
git add src/stats/analyze.ts tests/analyze-measures.test.ts
git commit -m "feat: analysis measures dash use (escaped, hit anyway, not needed, travel)"
```

---

### Task 3: Opening detail and distance

**Files:**
- Modify: `src/stats/analyze.ts`
- Modify: `tests/analyze-measures.test.ts`
- Modify: `tests/analyze.test.ts:677`

**Interfaces:**
- Consumes: `bossDefFor(after, fight, index).width` (boss body width), `PLAYER.width`, `PLAYER.attack.reach`, `PLAYER.runSpeed`, `TICK_RATE`.
- Produces: `export function swingReach(bossWidth: number): number` (centre-to-centre distance at which a swing can touch a boss); `export interface PunishWindow`; `PunishWindows.windows: PunishWindow[]`; `Analysis.behavior.realUpdatesInReach: number`; `Analysis.behavior.realMeanDistance: number`.

- [ ] **Step 1: Write the failing tests**

In `tests/analyze-measures.test.ts` change the `analyzeRun` import to `import { analyzeRun, swingReach } from '../src/stats/analyze';` and append:

```ts
// A harmless swing with a long recovery: the opening after it lasts 60 updates.
const slowBoss = customBoss([melee('slow', { recovery: 60 })], { attacks: [{ id: 'slow', weight: 1 }] });

describe('swing reach', () => {
  it('is the two half-widths plus the swing reach', () => {
    expect(swingReach(80)).toBe(24 + 90 + 40);
  });
});

describe('opening detail', () => {
  it('an opening nobody used: how far, how close, no swing', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(slowBoss, standAt(slowBoss, 100), frames(first + 75));
    const p = a.behavior.punish;
    expect(p.windows.length).toBe(p.opened);
    expect(p.windows[0]).toEqual({
      attackId: 'slow',
      boss: 0,
      startTick: first + 10,
      ticks: 60,
      distanceAtOpen: 100,
      closestDistance: 100,
      swung: false,
      hit: false,
      reachable: true,
    });
  });

  it('an opening used: a swing in the window that hit', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(
      slowBoss,
      standAt(slowBoss, 100),
      frames(first + 75, { [first + 20]: { attackPressed: true } }),
    );
    expect(a.behavior.punish.windows[0]).toMatchObject({ swung: true, hit: true, reachable: true });
    expect(a.behavior.punish.taken).toBe(1);
  });

  it('an opening too short to get to: not reachable', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(pokeBoss, standAt(pokeBoss, 400), frames(first + 20));
    // The poke's opening is 4 updates long: 400 units away cannot be closed at running speed.
    expect(a.behavior.punish.windows[0]).toMatchObject({ distanceAtOpen: 400, swung: false, hit: false, reachable: false });
    expect(a.behavior.punish.windows[0]!.ticks).toBe(4);
  });

  it('a player who runs in gets closer than they began', () => {
    const first = firstWindup(slowBoss, 400);
    const input = Array.from({ length: first + 75 }, (_, i) => withInput(i + 1 >= first + 10 ? { moveX: 1 } : {}));
    const a = analyzeRun(slowBoss, standAt(slowBoss, 400), input);
    const w = a.behavior.punish.windows[0]!;
    expect(w.distanceAtOpen).toBeGreaterThanOrEqual(w.closestDistance);
    expect(w.closestDistance).toBeLessThan(400);
    expect(w.reachable).toBe(true);
  });
});

describe('distance to the boss in the real fight', () => {
  it('mean distance and updates within swing reach (quiet boss, idle player)', () => {
    const near = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 100), frames(10));
    expect(near.behavior.realMeanDistance).toBe(100);
    expect(near.behavior.realUpdatesInReach).toBe(10);
    const far = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 500), frames(10));
    expect(far.behavior.realMeanDistance).toBe(500);
    expect(far.behavior.realUpdatesInReach).toBe(0);
  });

  it('counts nothing for updates in the study', () => {
    const initial = createInitialState(sweepBoss, 1, 1);
    const states = run(initial, 1500, () => NO_INPUT, sweepBoss);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    const a = analyzeRun(sweepBoss, initial, frames(endTick), 1);
    expect(a.behavior.realMeanDistance).toBe(0);
    expect(a.behavior.realUpdatesInReach).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/analyze-measures.test.ts`
Expected: FAIL (`swingReach` is not exported, `windows` is undefined).

- [ ] **Step 3: Implement**

In `src/stats/analyze.ts`:

1. After the `toMs` helper add:

```ts
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The centre-to-centre distance at which the player's forward swing can touch a boss of this width. */
export function swingReach(bossWidth: number): number {
  return PLAYER.width / 2 + PLAYER.attack.reach + bossWidth / 2;
}

/** Whether the player is within swing reach of any boss still standing. */
function inSwingReach(s: GameState, fight: FightDef): boolean {
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    if (Math.abs(s.player.x - bossAt(s, i).x) <= swingReach(bossDefFor(s, fight, i).width)) return true;
  }
  return false;
}
```

2. Replace `export interface PunishWindows { ... }` with:

```ts
/** One opening (the recovery after an attack that was not countered) that closed or was hit. */
export interface PunishWindow {
  attackId: string;
  /** Which boss made the attack. */
  boss: number;
  /** The update the window opened, and how many updates the boss stayed in its recovery. */
  startTick: number;
  ticks: number;
  /** Distance to that boss when the window opened, and the smallest while it was open (rounded to 0.1). */
  distanceAtOpen: number;
  closestDistance: number;
  /** The player began a swing inside the window, and hit the boss in it. */
  swung: boolean;
  hit: boolean;
  /** Could the player have run from `distanceAtOpen` into swing reach before the window closed? */
  reachable: boolean;
}

export interface PunishWindows {
  /** Recovery periods that closed or were hit; a window cut short by the end of the fight without a hit is not counted. */
  opened: number;
  /** Windows in which the player hit the boss. */
  taken: number;
  missed: number;
  /** One entry per counted window, in the order they closed: `windows.length` is always `opened`. */
  windows: PunishWindow[];
}
```

3. In `interface Analysis.behavior`, after `greedyHits: number;` add:

```ts
    /** Updates of the real fight (the study excluded) with the player within swing reach of a standing boss. */
    realUpdatesInReach: number;
    /** Mean distance to the nearest standing boss over the real fight, rounded to 0.1 (0 with no real updates). */
    realMeanDistance: number;
```

4. In `interface OpenAttack`, after `windowTaken: boolean;` add:

```ts
  /** When the window opened, the distance then and the smallest since, the updates it was open, and whether the player swung in it. */
  windowStart: number;
  windowDistance: number;
  windowClosest: number;
  windowTicks: number;
  windowSwung: boolean;
  /** Centre-to-centre distance at which a swing reaches the attacking boss. */
  windowReach: number;
```

and in the `open = { ... }` literal after `windowTaken: false,` add:

```ts
        windowStart: 0,
        windowDistance: 0,
        windowClosest: 0,
        windowTicks: 0,
        windowSwung: false,
        windowReach: 0,
```

5. After `occurrence(open)` add:

```ts
function windowOf(open: OpenAttack): PunishWindow {
  const seconds = open.windowTicks / TICK_RATE;
  return {
    attackId: open.attackId,
    boss: open.boss,
    startTick: open.windowStart,
    ticks: open.windowTicks,
    distanceAtOpen: round1(open.windowDistance),
    closestDistance: round1(open.windowClosest),
    swung: open.windowSwung,
    hit: open.windowTaken,
    reachable: open.windowDistance - open.windowReach <= PLAYER.runSpeed * seconds,
  };
}
```

6. In `analyzeRun`: change `const punish: PunishWindows = { opened: 0, taken: 0, missed: 0 };` to `{ opened: 0, taken: 0, missed: 0, windows: [] }`. In `finish`, inside the `if (!attack.study && attack.windowOpen && ...)` block add `punish.windows.push(windowOf(attack));` as its first statement.

7. In `observe`, replace the block

```ts
    if (
      !attack.countered &&
      owner.mode === 'attack' &&
      t >= attack.recoveryFrom &&
      !attack.windowOpen
    ) {
      attack.windowOpen = true;
    }
    if (attack.windowOpen && events.includes('bossHit')) attack.windowTaken = true;
```

with:

```ts
    if (
      !attack.countered &&
      owner.mode === 'attack' &&
      t >= attack.recoveryFrom &&
      !attack.windowOpen
    ) {
      attack.windowOpen = true;
      attack.windowStart = tick;
      attack.windowDistance = Math.abs(after.player.x - owner.x);
      attack.windowClosest = attack.windowDistance;
      attack.windowReach = swingReach(def.width);
    }
    if (attack.windowOpen && owner.mode === 'attack') {
      attack.windowTicks += 1;
      attack.windowClosest = Math.min(attack.windowClosest, Math.abs(after.player.x - owner.x));
      if (after.player.attackTick === 0) attack.windowSwung = true;
    }
    if (attack.windowOpen && events.includes('bossHit')) attack.windowTaken = true;
```

(`def` is the `bossDefFor(after, fight, attack.boss)` already defined earlier in `observe`.)

8. Distance counters. In `analyzeRun` next to `let platformUpdates = 0;` add:

```ts
  let realUpdates = 0;
  let realDistanceSum = 0;
  let realInReach = 0;
```

After the `if (distance < CLOSE_BELOW) { ... } else { ... }` block add:

```ts
    if (!inStudy) {
      realUpdates += 1;
      realDistanceSum += distance;
      if (inSwingReach(after, fight)) realInReach += 1;
    }
```

In the returned `behavior`, after `greedyHits: ...,` add:

```ts
      realUpdatesInReach: realInReach,
      realMeanDistance: realUpdates === 0 ? 0 : round1(realDistanceSum / realUpdates),
```

9. In `tests/analyze.test.ts` (around line 677) change

```ts
    expect(studyOnly.behavior.punish).toEqual({ opened: 0, taken: 0, missed: 0 });
```

to

```ts
    expect(studyOnly.behavior.punish).toEqual({ opened: 0, taken: 0, missed: 0, windows: [] });
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/analyze-measures.test.ts tests/analyze.test.ts && npm run typecheck`
Expected: PASS. If `ticks` is 59 or 61 rather than 60, print the window's first and last observed update and decide whether the count should include the update the boss leaves the attack; the rule is "updates the boss was still in its attack after the window opened", so fix the **test** only if the code follows that rule.

- [ ] **Step 5: Run the whole suite, then commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/stats/analyze.ts tests/analyze-measures.test.ts tests/analyze.test.ts
git commit -m "feat: analysis measures each opening (distance, swing, reach) and the real-fight distance"
```

---

### Task 4: Schema version 7 and its docs

**Files:**
- Modify: `src/stats/record.ts:16`
- Modify: `tests/record.test.ts:123-127`, `tests/record-pair.test.ts:77-80`
- Modify: `docs/stats.md`

**Interfaces:**
- Produces: `STATS_SCHEMA_VERSION = 7`.

- [ ] **Step 1: Update the failing tests first**

In `tests/record.test.ts` change the test to:

```ts
  it('carries the study rounds and is schema version 7', () => {
    expect(STATS_SCHEMA_VERSION).toBe(7);
```

and `expect(record.schemaVersion).toBe(6);` (inside the loop) to `toBe(7)`. In `tests/record-pair.test.ts` change `it('is 6, and a record ...` to `it('is 7, and a record ...`, and both `toBe(6)` to `toBe(7)`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/record.test.ts tests/record-pair.test.ts`
Expected: FAIL (expected 7, got 6).

- [ ] **Step 3: Bump the constant**

In `src/stats/record.ts` change `export const STATS_SCHEMA_VERSION = 6;` to `= 7;`. `src/stats/export.ts` and `tests/export.test.ts` use the constant, so they follow.

- [ ] **Step 4: Update `docs/stats.md`**

1. In the 7.1 table, after the row starting `| \`dashes\` |` add:

```
| `dashUse` | object | What the dashes of the **real fight** (the study excluded) achieved (7.1b). Added in schema version 7. |
```

2. Insert this section immediately before the line `### 7.2 An attack occurrence (each entry of \`attacks\`)`:

```
### 7.1b Dash use (`dashUse`)

Every dash begun in the real fight is counted once. A dash is **during an attack** when an attack of the real fight was live: from the update its warning began to the last update of its dangerous window (for an attack with shots, until its last shot is gone). When several attacks are live (a pair), the dash belongs to the one whose warning began first. Dashes begun in the study are not counted.

| Field | Meaning |
|---|---|
| `escaped` | Dashes during an attack that was dodged with evasion `"dash"`. |
| `hitAnyway` | Dashes during an attack that hit the player. |
| `notNeeded` | Dashes during an attack that was dodged another way (`"distance"`, `"jump"`, `"platform"` or `"cover"`): the player was already safe, or something else saved them. |
| `other` | Dashes during an attack that was countered or cut short. |
| `travel` | Dashes with no attack live, by what they did to the distance to the nearest standing boss between the dash starting and ending 11 updates later (the last update of the run, if that comes first): `closer` or `farther` when it changed by more than 40 world units (`TRAVEL_DASH_CHANGE` in `src/stats/analyze.ts`), otherwise `even`. |

If one attack has two dashes during it, each counts. The seven counters (`escaped`, `hitAnyway`, `notNeeded`, `other`, `travel.closer`, `travel.farther`, `travel.even`) add up to the dashes of the real fight. Direction is never judged: a dash into an attack can be the right dodge, so `travel` only says where the player ended up, not whether it made sense.
```

3. In the 7.2 table, after the `shotsFired` row add:

```
| `swingAtDanger` | boolean | `true` when a player swing (start-up, active or recovery) was in progress on the update `firstDangerTick` (the attack could first hurt), whether or not the attack then hurt the player. `false` for an attack that never reached its danger (countered, or cut short). Added in schema version 7; an analysis stored in an older record does not have it. |
```

4. In the 7.3 table, after the `updatesOnPlatform` row add:

```
| `greedySwings` | number | Attacks of the real fight (the study excluded) with `swingAtDanger` true. Added in schema version 7. |
| `greedyHits` | number | Of those, how many hit the player. Added in schema version 7. |
| `realUpdatesInReach` | number | Updates of the real fight on which the player was within swing reach of a boss still standing: centre-to-centre distance at most `PLAYER.width / 2 + PLAYER.attack.reach + boss width / 2` (154 for the Ember Duelist). Added in schema version 7. |
| `realMeanDistance` | number | Mean distance to the nearest boss still standing over the real fight, rounded to 0.1; 0 when there were no real updates. Added in schema version 7. |
```

5. In the "Punish windows" list, after the `missed` bullet add:

```
- `windows` (schema version 7): one entry per counted window, in the order they closed, so `windows.length` is `opened`. Each is `{ attackId, boss, startTick, ticks, distanceAtOpen, closestDistance, swung, hit, reachable }`: the attack and boss it followed; the update the window opened and how many updates the boss stayed in its recovery; the distance to that boss when it opened and the smallest while it was open (rounded to 0.1); whether the player began a swing inside it (`swung`) and hit the boss in it (`hit`); and `reachable`, whether the player could have run from `distanceAtOpen` into swing reach before it closed (`distanceAtOpen` minus the swing reach is at most running speed times the window length).
```

6. Replace the whole single-line paragraph that starts `**Not measured yet: "greedy" attacks**` with (use this script from the repo root):

```bash
python3 - <<'EOF'
p = 'docs/stats.md'
lines = open(p).read().split('\n')
i = [n for n, l in enumerate(lines) if l.startswith('**Not measured yet: "greedy" attacks**')][0]
lines[i] = ('**Greedy swings** (schema version 7; SPEC section 9: the player attacks when they should not). An attack occurrence has '
  '`swingAtDanger` when a player swing was in progress on the update the attack could first hurt (a swing lasts 16 updates: 3 start-up, '
  '4 active, 9 recovery), hit or not. `behavior.greedySwings` counts them in the real fight and `behavior.greedyHits` counts those that also hit the player. '
  'A swing that began in a punish window and is still going when the next attack becomes dangerous is the typical case.')
open(p, 'w').write('\n'.join(lines))
EOF
```

7. In section 9 (Versioning), after the bullet that starts `- **Version 6** (two bosses in one fight` add a new bullet:

```
- **Version 7** (fight insights, game version stays 0.10.0) adds measurements only; nothing in the game or the input encoding changes. The analysis gains `dashUse` (7.1b), `behavior.greedySwings`, `behavior.greedyHits`, `behavior.realUpdatesInReach`, `behavior.realMeanDistance` and `behavior.punish.windows` (7.3); each attack occurrence gains `swingAtDanger` (7.2). Records and files of versions 1 to 6 remain valid and replay exactly as before; an analysis stored inside an old record was computed then and is not rewritten, so it has none of the new fields (re-analysing the record by replay, section 8, fills them in and leaves every old number unchanged). The schema version is 7 in the export document and in every record the current game writes.
```

8. In section 12's JSON example add `"swingAtDanger": false,` on the line after `"shotsFired": 0,`.

- [ ] **Step 5: Run everything, then commit**

Run: `npm test && npm run typecheck`
Expected: PASS. The spec's replay requirement ("a version 7 record replays to the same final state and its analysis matches") is covered by the existing `tests/export.test.ts` (`is replayable: ...`) and `tests/loop-replay.test.ts` (`replayFinalState` plus `analyzeRecording` on every case); they run against schema 7 now, so a failure there means the new measurements changed a fight, which they must never do.

```bash
git add src/stats/record.ts tests/record.test.ts tests/record-pair.test.ts docs/stats.md
git commit -m "feat: stats schema 7 for the new measurements, documented in docs/stats.md"
```

---

### Task 5: The insights step

**Files:**
- Create: `src/stats/insights-tuning.ts`
- Create: `src/stats/insights.ts`
- Create: `tests/insights.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `AttackOccurrence`, `PunishWindow` from `src/stats/analyze.ts`; `PLAYER.maxHealth` (5).
- Produces (used by Tasks 6 and 7):
  - `INSIGHT_TUNING` (constants below).
  - `type HitKind = 'late' | 'early' | 'other' | 'greedy' | 'no-dodge'`; `classifyHit(hit: AttackOccurrence): HitKind`.
  - `type Insight` (union below); `insightsFor(analysis: Analysis): Insight[]`.

```ts
interface InsightBase { cost: number; attackIds: string[] }
export type Insight =
  | (InsightBase & { skill: 'dodge-late' | 'dodge-early' | 'dodge-other' | 'no-dodge'; hits: number })
  | (InsightBase & { skill: 'greedy-swing'; swings: number; hurt: number })
  | (InsightBase & { skill: 'openings'; opened: number; taken: number; closeButMissed: number })
  | (InsightBase & { skill: 'approach'; opened: number; tooFar: number; meanDistance: number; inReachPercent: number });
```

- [ ] **Step 1: Write the tuning file**

Create `src/stats/insights-tuning.ts`:

```ts
/** Every cut-off of the fight insights in one place (see docs/stats.md section 7.6). */
export const INSIGHT_TUNING = {
  /** How many lines the summary shows at most. */
  maxLines: 3,
  /** A dodge that began within this share of the warning-to-danger time before the danger is late (inclusive). */
  lateShare: 0.2,
  /** A dodge that began within this share of that time after the warning began is early (inclusive). */
  earlyShare: 0.25,
  /** The fewest hits of one kind before it is called a pattern. */
  minHitsForPattern: 2,
  /** The fewest greedy swings before they are called a pattern. */
  minGreedySwings: 2,
  /** The fewest openings before the opening rate is judged. */
  minOpenings: 3,
  /** The fewest missed openings of one cause before it is called a pattern. */
  minMissedOpenings: 2,
} as const;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyzeRun, type Analysis, type AttackOccurrence, type PunishWindow } from '../src/stats/analyze';
import { classifyHit, insightsFor } from '../src/stats/insights';
import { standAt } from './boss-helpers';
import { QUIET_BOSS, withInput } from './helpers';

/** A real Analysis of a one-update fight, used as the base that each test overrides. */
const empty: Analysis = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), [withInput({})]);

// Warning 30 updates (100 to 130). Late means margin <= 6, early means reaction <= 7.5 (so 7 or less).
const hit = (over: Partial<AttackOccurrence> = {}): AttackOccurrence => ({
  attackId: 'slam',
  boss: 0,
  phase: 1,
  startTick: 100,
  windupTicks: 30,
  firstDangerTick: 130,
  distance: 120,
  playerActionAtStart: 'idle',
  outcome: 'hit',
  evasion: null,
  reactionTicks: null,
  reactionMs: null,
  marginTicks: null,
  marginMs: null,
  damageTaken: 1,
  playerActionWhenHit: 'idle',
  study: false,
  shotsFired: 0,
  swingAtDanger: false,
  ...over,
});

/** A hit after a dodge action begun `reaction` updates after the warning began. */
const dodgedHit = (reaction: number, over: Partial<AttackOccurrence> = {}): AttackOccurrence =>
  hit({ reactionTicks: reaction <= 30 ? reaction : null, marginTicks: 30 - reaction, ...over });

const withAttacks = (attacks: AttackOccurrence[], over: Partial<Analysis> = {}): Analysis => ({
  ...empty,
  attacks,
  ...over,
});

const windowOf = (over: Partial<PunishWindow> = {}): PunishWindow => ({
  attackId: 'slam',
  boss: 0,
  startTick: 200,
  ticks: 30,
  distanceAtOpen: 100,
  closestDistance: 100,
  swung: false,
  hit: false,
  reachable: true,
  ...over,
});

const withWindows = (windows: PunishWindow[], over: Partial<Analysis['behavior']> = {}): Analysis => ({
  ...empty,
  bossMaxHp: 100,
  damageDealt: 20,
  swingsThatHit: 4,
  behavior: {
    ...empty.behavior,
    punish: {
      opened: windows.length,
      taken: windows.filter((w) => w.hit).length,
      missed: windows.filter((w) => !w.hit).length,
      windows,
    },
    ...over,
  },
});

describe('classifyHit', () => {
  it('late: a dodge that began in the last 20% of the warning, edge included', () => {
    expect(classifyHit(dodgedHit(24))).toBe('late'); // margin 6 of 30 = exactly 20%
    expect(classifyHit(dodgedHit(23))).toBe('other'); // margin 7
  });
  it('late: a dodge that began after the danger (negative margin)', () => {
    expect(classifyHit(dodgedHit(33))).toBe('late');
  });
  it('early: a dodge that began in the first 25% of the warning, edge included, and still hit', () => {
    expect(classifyHit(dodgedHit(7))).toBe('early'); // 7 of 30 = 23%
    expect(classifyHit(dodgedHit(8))).toBe('other'); // 27%
  });
  it('no dodge: no dash or jump made; greedy when a swing was going at the danger', () => {
    expect(classifyHit(hit())).toBe('no-dodge');
    expect(classifyHit(hit({ swingAtDanger: true }))).toBe('greedy');
  });
  it('a dodge action wins over a swing at the danger', () => {
    expect(classifyHit(dodgedHit(26, { swingAtDanger: true }))).toBe('late');
  });
});

describe('insightsFor: dodging', () => {
  it('reports late dodges with their attacks and cost (health lost over max health)', () => {
    const a = withAttacks([
      dodgedHit(26, { attackId: 'sweep' }),
      dodgedHit(27, { attackId: 'slam' }),
      dodgedHit(25, { attackId: 'sweep' }),
    ]);
    expect(insightsFor(a)).toEqual([
      { skill: 'dodge-late', cost: 3 / 5, attackIds: ['sweep', 'slam'], hits: 3 },
    ]);
  });

  it('needs at least two hits of a kind', () => {
    expect(insightsFor(withAttacks([dodgedHit(26)]))).toEqual([]);
  });

  it('ignores hits in the study and attacks that did not hit', () => {
    const a = withAttacks([
      dodgedHit(26, { study: true }),
      dodgedHit(26, { study: true }),
      hit({ outcome: 'dodged', evasion: 'dash', damageTaken: 0 }),
    ]);
    expect(insightsFor(a)).toEqual([]);
  });

  it('ranks by cost, highest first, keeps three, and breaks ties by the skill order', () => {
    const a = withAttacks([
      dodgedHit(3, { damageTaken: 2 }),
      dodgedHit(4, { damageTaken: 2 }), // early: cost 4/5
      dodgedHit(26),
      dodgedHit(27),
      dodgedHit(25), // late: cost 3/5
      hit(),
      hit(), // no-dodge: cost 2/5
      dodgedHit(12),
      dodgedHit(13), // other: cost 2/5, same as no-dodge
    ]);
    const skills = insightsFor(a).map((i) => i.skill);
    expect(skills).toEqual(['dodge-early', 'dodge-late', 'dodge-other']);
  });
});

describe('insightsFor: greedy swings', () => {
  it('reports a swing that was still going when the attack hurt', () => {
    const a = withAttacks([hit({ swingAtDanger: true }), hit({ swingAtDanger: true, attackId: 'sweep' })], {
      behavior: { ...empty.behavior, greedySwings: 3, greedyHits: 2 },
    });
    expect(insightsFor(a)).toEqual([
      { skill: 'greedy-swing', cost: 2 / 5, attackIds: ['slam', 'sweep'], swings: 3, hurt: 2 },
    ]);
  });

  it('shows nothing when the greedy swings cost no health (cost 0)', () => {
    const a = withAttacks([hit({ outcome: 'dodged', evasion: 'distance', damageTaken: 0, swingAtDanger: true })], {
      behavior: { ...empty.behavior, greedySwings: 3, greedyHits: 0 },
    });
    expect(insightsFor(a)).toEqual([]);
  });
});

describe('insightsFor: openings and approach', () => {
  it('missed openings where the player was close enough are the openings skill', () => {
    const a = withWindows([windowOf({ hit: true, swung: true }), windowOf(), windowOf({ attackId: 'sweep' })]);
    // 2 missed, each worth 20 / 4 = 5 damage of 100 => cost 0.1
    expect(insightsFor(a)).toEqual([
      { skill: 'openings', cost: 0.1, attackIds: ['slam', 'sweep'], opened: 3, taken: 1, closeButMissed: 2 },
    ]);
  });

  it('missed openings the player could not reach are the approach skill, with the distance numbers', () => {
    const a = withWindows(
      [windowOf({ reachable: false }), windowOf({ reachable: false, attackId: 'sweep' }), windowOf({ hit: true })],
      { realMeanDistance: 312.4, realUpdatesInReach: 60 },
    );
    const found = insightsFor({ ...a, ticks: 600, study: { ...a.study, ticks: 0 } });
    expect(found).toEqual([
      {
        skill: 'approach',
        cost: 0.1,
        attackIds: ['slam', 'sweep'],
        opened: 3,
        tooFar: 2,
        meanDistance: 312.4,
        inReachPercent: 10,
      },
    ]);
  });

  it('needs three openings before the rate is judged, and two missed of one cause', () => {
    expect(insightsFor(withWindows([windowOf(), windowOf()]))).toEqual([]);
    expect(insightsFor(withWindows([windowOf(), windowOf({ hit: true }), windowOf({ hit: true })]))).toEqual([]);
  });

  it('counts 1 damage per missed opening when the player never landed a hit', () => {
    const a = { ...withWindows([windowOf(), windowOf(), windowOf()]), swingsThatHit: 0, damageDealt: 0 };
    const [found] = insightsFor(a);
    expect(found!.cost).toBeCloseTo(3 / 100);
  });
});

describe('insightsFor: old analyses and quiet fights', () => {
  it('skips the skills that need version 7 fields', () => {
    const old = { ...withAttacks([hit(), hit(), dodgedHit(26), dodgedHit(27)]), dashUse: undefined } as unknown as Analysis;
    expect(insightsFor(old).map((i) => i.skill)).toEqual(['dodge-late']);
  });

  it('a fight with nothing in it gives no insights', () => {
    expect(insightsFor(empty)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/insights.test.ts`
Expected: FAIL (module `../src/stats/insights` not found).

- [ ] **Step 4: Implement `src/stats/insights.ts`**

```ts
import { PLAYER } from '../game/params';
import type { Analysis, AttackOccurrence } from './analyze';
import { INSIGHT_TUNING as T } from './insights-tuning';

/** How one hit came about, from the dodge timing data already in the analysis. */
export type HitKind = 'late' | 'early' | 'other' | 'greedy' | 'no-dodge';

/**
 * Each hit goes in one class. With a dodge action (a dash or jump before or during the attack): late (began in
 * the last `lateShare` of the warning, or after the danger began), else early (began in the first `earlyShare`),
 * else other. Without one: greedy when a swing was going at the danger, else no dodge.
 */
export function classifyHit(hit: AttackOccurrence): HitKind {
  const warning = hit.firstDangerTick - hit.startTick;
  if (hit.marginTicks !== null && warning > 0) {
    if (hit.marginTicks / warning <= T.lateShare) return 'late';
    if (hit.reactionTicks !== null && hit.reactionTicks / warning <= T.earlyShare) return 'early';
    return 'other';
  }
  return hit.swingAtDanger ? 'greedy' : 'no-dodge';
}

interface InsightBase {
  /** A share of a whole fight (health lost over the player's health, or damage missed over the bosses' health), so different problems can be ranked together. */
  cost: number;
  /** The attacks that show it, each once, in the order they first appear. */
  attackIds: string[];
}

export type Insight =
  | (InsightBase & { skill: 'dodge-late' | 'dodge-early' | 'dodge-other' | 'no-dodge'; hits: number })
  | (InsightBase & { skill: 'greedy-swing'; swings: number; hurt: number })
  | (InsightBase & { skill: 'openings'; opened: number; taken: number; closeButMissed: number })
  | (InsightBase & { skill: 'approach'; opened: number; tooFar: number; meanDistance: number; inReachPercent: number });

type Skill = Insight['skill'];

/** The order that breaks a tie in cost. */
const ORDER: readonly Skill[] = ['dodge-late', 'dodge-early', 'dodge-other', 'no-dodge', 'greedy-swing', 'openings', 'approach'];

const unique = (ids: string[]): string[] => [...new Set(ids)];
const healthCost = (hits: AttackOccurrence[]): number =>
  hits.reduce((total, h) => total + h.damageTaken, 0) / PLAYER.maxHealth;

const HIT_SKILL = { late: 'dodge-late', early: 'dodge-early', other: 'dodge-other', 'no-dodge': 'no-dodge' } as const;

function hitInsights(analysis: Analysis): Insight[] {
  const hits = analysis.attacks.filter((x) => !x.study && x.outcome === 'hit');
  const found: Insight[] = [];
  for (const kind of ['late', 'early', 'other', 'no-dodge'] as const) {
    const list = hits.filter((h) => classifyHit(h) === kind);
    if (list.length < T.minHitsForPattern) continue;
    found.push({
      skill: HIT_SKILL[kind],
      cost: healthCost(list),
      attackIds: unique(list.map((h) => h.attackId)),
      hits: list.length,
    });
  }
  const greedy = hits.filter((h) => classifyHit(h) === 'greedy');
  if (analysis.behavior.greedySwings >= T.minGreedySwings && greedy.length > 0) {
    found.push({
      skill: 'greedy-swing',
      cost: healthCost(greedy),
      attackIds: unique(greedy.map((h) => h.attackId)),
      swings: analysis.behavior.greedySwings,
      hurt: analysis.behavior.greedyHits,
    });
  }
  return found;
}

function openingInsights(analysis: Analysis): Insight[] {
  const p = analysis.behavior.punish;
  if (p.opened < T.minOpenings || analysis.bossMaxHp <= 0) return [];
  const missed = p.windows.filter((w) => !w.hit);
  const tooFar = missed.filter((w) => !w.reachable);
  const close = missed.filter((w) => w.reachable);
  // What one missed opening would have been worth: the player's own damage per landed hit, or 1 when they never landed one.
  const perHit = analysis.swingsThatHit > 0 ? analysis.damageDealt / analysis.swingsThatHit : 1;
  const share = (n: number): number => Math.min(1, (n * perHit) / analysis.bossMaxHp);
  const found: Insight[] = [];
  if (close.length >= T.minMissedOpenings) {
    found.push({
      skill: 'openings',
      cost: share(close.length),
      attackIds: unique(close.map((w) => w.attackId)),
      opened: p.opened,
      taken: p.taken,
      closeButMissed: close.length,
    });
  }
  if (tooFar.length >= T.minMissedOpenings) {
    const realUpdates = analysis.ticks - analysis.study.ticks;
    found.push({
      skill: 'approach',
      cost: share(tooFar.length),
      attackIds: unique(tooFar.map((w) => w.attackId)),
      opened: p.opened,
      tooFar: tooFar.length,
      meanDistance: analysis.behavior.realMeanDistance,
      inReachPercent: realUpdates > 0 ? Math.round((100 * analysis.behavior.realUpdatesInReach) / realUpdates) : 0,
    });
  }
  return found;
}

/**
 * What to work on after one fight: the problems with a cost above 0, highest cost first, at most
 * `INSIGHT_TUNING.maxLines`. Pure: it reads only the analysis. An analysis from before schema version 7 has no
 * swing, opening or distance numbers, so the skills that need them are left out.
 */
export function insightsFor(analysis: Analysis): Insight[] {
  const hasVersion7 = analysis.dashUse !== undefined;
  const found = hasVersion7
    ? [...hitInsights(analysis), ...openingInsights(analysis)]
    : hitInsights({ ...analysis, behavior: { ...analysis.behavior, greedySwings: 0 } }).filter(
        (i) => i.skill !== 'no-dodge' && i.skill !== 'greedy-swing',
      );
  return found
    .filter((i) => i.cost > 0)
    .sort((a, b) => b.cost - a.cost || ORDER.indexOf(a.skill) - ORDER.indexOf(b.skill))
    .slice(0, T.maxLines);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/insights.test.ts && npm run typecheck`
Expected: PASS. Floating-point note: the test compares `cost: 3 / 5` and `0.1` with `toEqual`; if `2 * 5 / 100` is not exactly `0.1` (it is, `(2*5)/100`), adjust the test to `toBeCloseTo` on a destructured cost, not the code.

- [ ] **Step 6: Commit**

```bash
git add src/stats/insights-tuning.ts src/stats/insights.ts tests/insights.test.ts
git commit -m "feat: insightsFor ranks what to work on from one fight's analysis"
```

---

### Task 6: The words

**Files:**
- Create: `src/ui/insight-text.ts`
- Create: `tests/insight-text.test.ts`

**Interfaces:**
- Consumes: `Insight` from `src/stats/insights.ts`; `FightDef` from `src/game/fight.ts` (`fight.bosses[].attacks[].{id, name}`).
- Produces: `attackNamer(fight: FightDef): (attackId: string) => string`; `insightText(insight: Insight, nameOf: (id: string) => string): string`; `workOnLines(insights: Insight[], nameOf): string[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/insight-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asFight } from '../src/game/fight';
import type { Insight } from '../src/stats/insights';
import { attackNamer, insightText, workOnLines } from '../src/ui/insight-text';
import { DUELIST } from './helpers';

const nameOf = (id: string): string => ({ slam: 'Ember slam', sweep: 'Low sweep', lunge: 'Lunge', burst: 'Burst' })[id] ?? id;

const late = (hits: number, attackIds = ['slam']): Insight => ({ skill: 'dodge-late', cost: 0.4, attackIds, hits });

describe('attackNamer', () => {
  it('turns an attack id into its name, and keeps an unknown id as it is', () => {
    const name = attackNamer(asFight(DUELIST));
    expect(name('slam')).toBe('Ember slam');
    expect(name('nope')).toBe('nope');
  });
});

describe('insightText', () => {
  it('one sentence for each skill, with the evidence', () => {
    const all: Insight[] = [
      late(3, ['slam', 'sweep']),
      { skill: 'dodge-early', cost: 0.4, attackIds: ['lunge'], hits: 2 },
      { skill: 'dodge-other', cost: 0.4, attackIds: ['burst'], hits: 2 },
      { skill: 'no-dodge', cost: 0.4, attackIds: ['slam'], hits: 2 },
      { skill: 'greedy-swing', cost: 0.4, attackIds: ['sweep'], swings: 4, hurt: 2 },
      { skill: 'openings', cost: 0.1, attackIds: ['slam'], opened: 10, taken: 1, closeButMissed: 5 },
      { skill: 'approach', cost: 0.1, attackIds: ['slam'], opened: 10, tooFar: 4, meanDistance: 312.4, inReachPercent: 12 },
    ];
    expect(all.map((i) => insightText(i, nameOf))).toEqual([
      'Dodging too late: 3 hits came after a dodge that began in the last moments of the warning (Ember slam, Low sweep).',
      'Dodging too early: 2 hits landed after a dodge that began so soon it was over before the attack arrived (Lunge).',
      'Dodging at the wrong moment: 2 hits came even though you dashed or jumped (Burst).',
      'Not dodging: 2 hits came with no dash or jump (Ember slam).',
      'Swinging at the wrong time: 4 swings were still going when an attack landed, and 2 hurt you (Low sweep).',
      'Openings: you hit the boss in 1 of 10 openings after its attacks, and 5 times you were close enough but did not land a hit (Ember slam).',
      'Closing in: 4 openings closed before you could reach the boss. You were in swing range 12% of the time and 312 units away on average (Ember slam).',
    ]);
  });

  it('uses the singular for one', () => {
    expect(insightText(late(1), nameOf)).toBe(
      'Dodging too late: 1 hit came after a dodge that began in the last moments of the warning (Ember slam).',
    );
    expect(
      insightText({ skill: 'greedy-swing', cost: 0.2, attackIds: ['sweep'], swings: 1, hurt: 1 }, nameOf),
    ).toBe('Swinging at the wrong time: 1 swing was still going when an attack landed, and 1 hurt you (Low sweep).');
  });

  it('names at most three attacks', () => {
    const text = insightText(late(4, ['slam', 'sweep', 'lunge', 'burst']), nameOf);
    expect(text).toContain('(Ember slam, Low sweep, Lunge)');
    expect(text).not.toContain('Burst');
  });

  it('contains no HTML', () => {
    expect(insightText(late(2, ['<b>x</b>']), (id) => id)).toContain('<b>x</b>'); // names are data; the screen writes them with textContent
  });
});

describe('workOnLines', () => {
  it('heads the lines with "Work on:"', () => {
    expect(workOnLines([late(2)], nameOf)).toEqual([
      'Work on:',
      'Dodging too late: 2 hits came after a dodge that began in the last moments of the warning (Ember slam).',
    ]);
  });

  it('says nothing stands out when there is nothing to work on', () => {
    expect(workOnLines([], nameOf)).toEqual(['Nothing stands out this fight.']);
  });
});
```

(The "no HTML" test documents that the module returns plain strings and never builds markup: the screen writes every line with `textContent` via `el`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/insight-text.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/insight-text.ts`**

```ts
import type { FightDef } from '../game/fight';
import type { Insight } from '../stats/insights';

/** Attack id to the name the player knows it by, over every boss of the fight; an unknown id stays as it is. */
export function attackNamer(fight: FightDef): (attackId: string) => string {
  const names = new Map<string, string>();
  for (const boss of fight.bosses) {
    for (const attack of boss.attacks) if (!names.has(attack.id)) names.set(attack.id, attack.name);
  }
  return (id) => names.get(id) ?? id;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The evidence: up to three attack names in brackets, or nothing. */
function evidence(ids: string[], nameOf: (id: string) => string): string {
  return ids.length === 0 ? '' : ` (${ids.slice(0, 3).map(nameOf).join(', ')})`;
}

/** One plain-language sentence for one insight. Pure text: the screen writes it with `textContent`. */
export function insightText(insight: Insight, nameOf: (id: string) => string): string {
  const seen = evidence(insight.attackIds, nameOf);
  switch (insight.skill) {
    case 'dodge-late':
      return `Dodging too late: ${count(insight.hits, 'hit', 'hits')} came after a dodge that began in the last moments of the warning${seen}.`;
    case 'dodge-early':
      return `Dodging too early: ${count(insight.hits, 'hit', 'hits')} landed after a dodge that began so soon it was over before the attack arrived${seen}.`;
    case 'dodge-other':
      return `Dodging at the wrong moment: ${count(insight.hits, 'hit', 'hits')} came even though you dashed or jumped${seen}.`;
    case 'no-dodge':
      return `Not dodging: ${count(insight.hits, 'hit', 'hits')} came with no dash or jump${seen}.`;
    case 'greedy-swing':
      return `Swinging at the wrong time: ${count(insight.swings, 'swing was', 'swings were')} still going when an attack landed, and ${insight.hurt} hurt you${seen}.`;
    case 'openings':
      return `Openings: you hit the boss in ${insight.taken} of ${count(insight.opened, 'opening', 'openings')} after its attacks, and ${count(insight.closeButMissed, 'time', 'times')} you were close enough but did not land a hit${seen}.`;
    case 'approach':
      return `Closing in: ${count(insight.tooFar, 'opening closed', 'openings closed')} before you could reach the boss. You were in swing range ${insight.inReachPercent}% of the time and ${Math.round(insight.meanDistance)} units away on average${seen}.`;
  }
}

/** The block for the summary screen: a heading and one line per insight, or one line when nothing stands out. */
export function workOnLines(insights: Insight[], nameOf: (id: string) => string): string[] {
  if (insights.length === 0) return ['Nothing stands out this fight.'];
  return ['Work on:', ...insights.map((insight) => insightText(insight, nameOf))];
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/insight-text.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/insight-text.ts tests/insight-text.test.ts
git commit -m "feat: plain-language sentences for the fight insights"
```

---

### Task 7: Show the lines on the summary screen

**Files:**
- Modify: `src/ui/app.ts` (imports near line 26-28 and 68; state near line 147; `renderSummaryScreen` ~488-503; `saveFight` ~523-551; the three places that reset `saveLine`, ~562, ~572, ~690)
- Modify (only if the layout check fails): `src/ui/style.css`

**Interfaces:**
- Consumes: `insightsFor`, `attackNamer`, `workOnLines`, `analyzeRecording`, `buildRecord`.

There is no test for `app.ts` (DOM-driven), so this task is checked by the type check, the full suite, the build, and a manual look.

- [ ] **Step 1: Imports**

In `src/ui/app.ts` add, next to the other stats imports, `import { insightsFor } from '../stats/insights';`, and next to `import { createSound } from './sound';` add `import { attackNamer, workOnLines } from './insight-text';`.

- [ ] **Step 2: State**

After the line `let saveLine: string | null = null;` add:

```ts
  // The "Work on:" lines of the fight just played: empty until its analysis is done, and for a fight left during the study.
  let insightLines: string[] = [];
```

- [ ] **Step 3: Render them after the existing lines, before the save line**

In `renderSummaryScreen` replace the argument

```ts
      saveLine === null ? text.lines : [...text.lines, saveLine],
```

with

```ts
      [...text.lines, ...insightLines, ...(saveLine === null ? [] : [saveLine])],
```

- [ ] **Step 4: Compute the insights outside the store branch**

Replace the whole `saveFight` function with:

```ts
  async function saveFight(recording: Recording, result: FightResult): Promise<void> {
    const epoch = saveEpoch;
    // Taken now: a new fight may start while the save below is waiting.
    const nameOf = attackNamer(fight);
    let line: string;
    let lines: string[] = [];
    try {
      const target = await storeReady;
      // Let the browser paint the summary or the end pause before the replay below runs (it can take a moment
      // on a long fight and would otherwise freeze the screen on the last fight frame).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const analysis = analyzeRecording(recording);
      // A fight left during the study has no fight time: no block at all.
      if (analysis.fightSeconds > 0) lines = workOnLines(insightsFor(analysis), nameOf);
      if (target === null) {
        line = 'This fight was not saved: this device cannot store stats.';
      } else {
        const saved = await target.count();
        await target.add(buildRecord(recording, result, saved + 1, analysis));
        line = `Fight saved (${saved + 1} on this device).`;
      }
    } catch {
      line = 'This fight could not be saved.';
    }
    // A new fight has started since: its summary must not show this line.
    if (epoch !== saveEpoch) return;
    saveLine = line;
    insightLines = lines;
    if (screen === 'summary') renderSummaryScreen();
  }
```

- [ ] **Step 5: Clear the lines wherever the save line is cleared**

There are three places. In each, add `insightLines = [];` on the line after `saveLine = null;`:
1. in `endFight`, inside `if (leaving !== null) {`;
2. in `startFight`, after `saveEpoch += 1;` / `saveLine = null;`;
3. in the game loop, inside `if (advanced.finished !== null) {`.

- [ ] **Step 6: Check**

Run: `npm run typecheck && npm test && npm run build && npm run check:dist`
Expected: all PASS.

- [ ] **Step 7: Look at it**

Run `npm run dev`, open http://localhost:5173 in a browser with a window about 400 px wide and 800 px tall (the S21 shape), play a short fight on Hard until defeated (keyboard is fine), and look at the summary screen:
- the "Work on:" block (or "Nothing stands out this fight.") appears after "Hurt you most" and before the "Fight saved" line;
- the menu rows under the lines are still on screen without scrolling;
- leaving a fight during the study (Study set to Once or Twice) shows no block;
- a normal fight that ends shows the block within a moment of the summary opening.

If the rows are pushed off the screen at that size, add to `src/ui/style.css` directly after the `.summary-line { ... }` rule:

```css
@media (max-height: 820px) {
  .summary-line {
    margin: 0.15rem 0;
    font-size: 0.95rem;
  }
}
```

and look again. If no browser is available in the execution environment, say so explicitly in the report instead of claiming the layout was checked.

- [ ] **Step 8: Commit**

```bash
git add src/ui/app.ts src/ui/style.css
git commit -m "feat: the summary screen shows what to work on after each fight"
```

(If `style.css` was not changed, leave it out of `git add`.)

---

### Task 8: Docs

**Files:**
- Modify: `docs/stats.md`
- Modify: `docs/SPEC.md`
- Modify: `docs/superpowers/specs/2026-09-30-fight-insights-design.md`

- [ ] **Step 1: Add the insights section to `docs/stats.md`**

Insert before `## 8. Replaying a fight` a new subsection `### 7.6 Insights (derived, not stored)`:

```
### 7.6 Insights (derived, not stored)

After a fight the summary screen shows up to three "Work on:" lines. They are computed on the spot from that one fight's `analysis` by `insightsFor` in `src/stats/insights.ts` (cut-offs in `src/stats/insights-tuning.ts`, words in `src/ui/insight-text.ts`) and are **not** stored in the record or the export: they can be reworded or re-tuned without a schema change and without touching a recording.

Everything is for the real fight only (the study excluded). Each hit is put in **one** class: `late` (a dodge action began in the last 20% of the time from warning to first danger, or after the danger began), `early` (it began in the first 25% of that time and the hit came anyway), `other` (a dodge action in between), `greedy` (no dodge action and a swing was in progress at the danger) or `no-dodge`. Both edges are inclusive. The skills and what they count:

| Skill | Shown when | Cost (a share of a whole fight) |
|---|---|---|
| `dodge-late`, `dodge-early`, `dodge-other`, `no-dodge` | at least 2 hits of that class | health lost to them / 5 |
| `greedy-swing` | at least 2 greedy swings (`behavior.greedySwings`) and at least one hit in the greedy class | health lost to those hits / 5 |
| `openings` | at least 3 openings and at least 2 missed where the player was close enough (`reachable` true) | missed openings x the player's damage per landed hit (1 if none) / the bosses' total health |
| `approach` | at least 3 openings and at least 2 missed where the boss could not be reached in time (`reachable` false) | the same, for those openings |

Lines are ranked by cost, highest first, at most three; a skill with cost 0 is never shown, and a fight with nothing to report shows "Nothing stands out this fight." A fight left during the study shows no block. An analysis stored before schema version 7 has no swing, opening or distance numbers, so only the three dodge timing skills are available for it until it is re-analysed by replay.

**What this cannot tell you.**
- A travel dash and an early dodge dash are told apart only by whether an attack was live; a dash for movement that begins inside an attack's window counts as that attack's dash.
- One fight is a small sample. A line is a hint to practise, not a verdict.
- A hit can have several causes; the line names the most visible one (the dodge timing data).
- Movement direction is never graded, so wandering is seen only through its results (missed openings, time out of reach), not directly.
- Dash use (7.1b) is recorded but has no line of its own: a dash that was hit anyway is already inside a late, early or other dodge hit.
```

- [ ] **Step 2: Note it in `docs/SPEC.md`**

Find the last bullet of the status list that ends with the "Rest of slice B: flight and the Storm Kite" bullet (`grep -n "Rest of slice B" docs/SPEC.md`), and add after the list's last bullet:

```
  - **Fight insights** (built 2026-09-30, awaiting the owner's look on the phone; design in `docs/superpowers/specs/2026-09-30-fight-insights-design.md`, plan in `docs/superpowers/plans/2026-09-30-fight-insights.md`, stats in `docs/stats.md` 7.6). The first piece of Phase 2 of the M6 roadmap: after every fight the summary screen shows up to three "Work on:" lines, each a skill with the attacks that show it, from that one fight only. **LOCKED** (owner, 2026-09-30): skills are worded by skill with the attack as evidence; top 3 by cost; late dodge is the last 20% of the warning, early the first 25%; a greedy swing is any swing in progress when the attack could first hurt; movement is judged by efficiency, never by direction. New measurements (stats schema 7): greedy swings, dash use, opening detail, distance. `GAME_VERSION` is unchanged. Trends across fights and steering generation from the insights stay in the rest of Phase 2.
```

Match the indentation of the neighbouring bullets.

- [ ] **Step 3: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-09-30-fight-insights-design.md`:
- In "New measurements", change "`analysis` gains `dashes`" / "The analysis gains `dashes`" to "`dashUse`", and add the sentence: "The existing `dashes` (dashes started, whole session) stays."
- In "The insights step", replace the skill list in the `Insight` bullet with `dodge-late`, `dodge-early`, `dodge-other`, `no-dodge`, `greedy-swing`, `openings`, `approach`, and replace the `TRAVEL_DASH_CHANGE` mention in the tuning bullet with "(`TRAVEL_DASH_CHANGE` lives in `src/stats/analyze.ts` with the other measurement constants)".
- Add under "The insights step": "There is no dash line and no accuracy line: a dash that was hit anyway is already a late, early or other dodge hit, and swung-and-missed is inside `openings`. A fight left during the study shows no block."

- [ ] **Step 4: Run and commit**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: PASS.

```bash
git add docs/stats.md docs/SPEC.md docs/superpowers/specs/2026-09-30-fight-insights-design.md docs/superpowers/plans/2026-09-30-fight-insights.md
git commit -m "docs: fight insights in the stats doc, the spec and the plan"
```

---

## Done when

Tests, typecheck, build and `check:dist` pass; after a real fight on the phone the summary shows sensible lines; and the owner has compared them with a hand analysis of the same export and agrees they point at the same problems (the spec's "Done when").

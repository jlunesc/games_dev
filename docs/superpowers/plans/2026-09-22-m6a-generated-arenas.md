# M6a: Generated Arena Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generated boss (`resolveBoss('generated', seed)`) sometimes gets an arena — 1 to 3
platforms/cover, spread apart in height on purpose — instead of always fighting on a bare floor, and
the fairness checker gains a real, generic check that no arena piece can become a permanent safe spot.

**Architecture:** A new pure, seeded `generateArena` function (same style as `generateAttack`/`generateBoss`)
draws an `ArenaDef | undefined` and is wired into `generateBoss`. `checkFairness` gets a new, boss-agnostic
camp-safety check that exercises any `BossDef`'s arena, not just generated ones. No changes to the boss
file format itself.

**Tech Stack:** TypeScript (strict), Vitest, the existing `nextRandom`/`mulberry32` seeded generator
in `src/game/rng.ts`.

**Spec:** `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`

## Global Constraints

- No changes to `ArenaDef`/`ArenaPiece` (`src/bosses/schema.ts`) or to `parseBoss`'s arena validation
  (`src/bosses/parse.ts`) — this plan only changes *how a generated arena is chosen*, never the format.
- Only the generator changes. The Ember Duelist, Ashen Hound and Trainee boss files are untouched.
- `generateArena` must never advance a gameplay `rng` — it only ever consumes the generator's own
  mixed stream, exactly like `generateAttack` and the rest of `generateBoss` (see `src/bosses/generate/boss.ts:1-29`).
- The new fairness check must be **generic**: it has to work on any `BossDef` with an `arena`, not
  just a generated one (`checkFairness` is documented as "works on any `BossDef`, with no knowledge
  of how it was built" — that must stay true).
- `GAME_VERSION` (`src/stats/record.ts`) must bump from `'0.4.0'` to `'0.5.0'`, because this changes
  how a `'generated'` record replays from its seed (same reasoning as M5c's own bump for the Hound).
- Commit messages: plain, one line, **no** `Co-Authored-By` or other Claude/Anthropic attribution.
- TDD: write the failing test before the implementation, in every task.
- Test sweeps in the committed suite follow this codebase's existing precedent in
  `tests/generate-boss.test.ts`/`tests/generate-attack.test.ts` (loops of up to a few hundred seeds
  are normal and already shipped) — this is not the "bounded to tens" rule for ad hoc exploratory
  probing during a review; it is about the permanent, deliberately-swept test suite.
- Every new exported function gets a short doc comment in the terse style already used throughout
  `src/bosses/generate/`.

---

## Files

| File | Responsibility |
|---|---|
| `src/bosses/generate/tuning.ts` | Modify: add the `GEN` fields the new arena generator draws from. |
| `src/bosses/generate/arena.ts` | Create: `generateArena(state): Draw<ArenaDef \| undefined>`, pure and seeded. |
| `tests/generate-arena.test.ts` | Create: structural tests for `generateArena` alone. |
| `src/bosses/generate/fairness.ts` | Modify: add the camp-safety check to `checkFairness`. |
| `tests/generate-fairness.test.ts` | Modify: add camp-safety fixtures and the Ashen Hound finding. |
| `src/bosses/generate/boss.ts` | Modify: wire `generateArena` into `generateBoss`. |
| `tests/generate-boss.test.ts` | Modify: assert a generated boss sometimes has an arena. |
| `src/stats/record.ts` | Modify: bump `GAME_VERSION`, extend its doc comment. |
| `tests/export.test.ts`, `tests/record.test.ts` | Modify: the two hardcoded `'0.4.0'` literals. |
| `tests/loop-replay.test.ts` | Modify: extend the generated-boss replay case to one with an arena. |
| `docs/bosses.md` | Modify: document arena generation in section 3b. |
| `docs/stats.md` | Modify: add the 0.5.0 versioning note. |
| `docs/phone-testing.md` | Modify: update the generator's checklist and questions. |
| `docs/backlog.md`, `docs/SPEC.md` | Modify: mark generated arenas built. |

---

### Task 1: Tuning ranges and `generateArena`

**Files:**
- Modify: `src/bosses/generate/tuning.ts`
- Create: `src/bosses/generate/arena.ts`
- Test: `tests/generate-arena.test.ts`

**Interfaces:**
- Consumes: `Draw<T>` (exported from `src/bosses/generate/attack.ts`), `nextRandom` from
  `src/game/rng.ts`, `ArenaDef`/`ArenaPiece` from `src/bosses/schema.ts`, `GEN` from
  `src/bosses/generate/tuning.ts`.
- Produces: `generateArena(state: number): Draw<ArenaDef | undefined>` — Task 3 calls this from
  `generateBoss`.

- [ ] **Step 1: Write the failing tests**

Create `tests/generate-arena.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generateArena } from '../src/bosses/generate/arena';
import { GEN } from '../src/bosses/generate/tuning';
import { parseBoss } from '../src/bosses/parse';
import type { ArenaDef, BossDef } from '../src/bosses/schema';

/** A minimal, otherwise-valid boss to hang a generated arena off, so `parseBoss` can check it. */
function baseBoss(arena: ArenaDef | undefined): BossDef {
  return {
    id: 'fixture',
    name: 'Fixture Boss',
    width: 80,
    height: 100,
    startX: 960,
    maxHp: 10,
    spacing: { min: 150, max: 250 },
    approachTimeout: 45,
    predictability: 0.2,
    counter: { window: 10, range: 200, staggerTicks: 80, damageMultiplier: 2 },
    transitionTicks: 60,
    attacks: [
      {
        id: 'poke',
        name: 'Poke',
        pose: 'sideways',
        class: 'mustDodge',
        damage: 1,
        windup: 24,
        active: 8,
        recovery: 24,
        range: { min: 110, max: 200 },
        hits: [{ from: 24, to: 32, x0: 0, x1: 250, bottom: 0, top: 100 }],
      },
    ],
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: [{ id: 'poke', weight: 1 }],
        gap: 40,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 200,
        retreatSpeed: 150,
      },
    ],
    ...(arena === undefined ? {} : { arena }),
  };
}

describe('generateArena', () => {
  it('never throws, and every result parses as part of a whole boss, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      expect(() => parseBoss(baseBoss(arena))).not.toThrow();
    }
  });

  it('is deterministic for the same seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(generateArena(seed)).toEqual(generateArena(seed));
    }
  });

  it('is bare roughly GEN.arenaBareChance of the time, over a large sweep', () => {
    let bare = 0;
    const total = 500;
    for (let seed = 1; seed <= total; seed++) {
      if (generateArena(seed).value === undefined) bare++;
    }
    const rate = bare / total;
    expect(rate).toBeGreaterThan(GEN.arenaBareChance - 0.1);
    expect(rate).toBeLessThan(GEN.arenaBareChance + 0.1);
  });

  it('has 1 to 3 pieces total when not bare, for a sweep of seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      const total = arena.platforms.length + arena.covers.length;
      expect(total).toBeGreaterThanOrEqual(GEN.arenaPieceCountMin);
      expect(total).toBeLessThanOrEqual(GEN.arenaPieceCountMax);
    }
  });

  it('never puts cover over the player start (x = 320)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      for (const c of arena.covers) {
        const overStart = c.x - c.width / 2 <= 320 && 320 < c.x + c.width / 2;
        expect(overStart).toBe(false);
      }
    }
  });

  it('keeps every pair of pieces at least GEN.arenaMinHeightGap apart in height', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      const heights = [...arena.platforms, ...arena.covers].map((p) => p.height);
      for (let i = 0; i < heights.length; i++) {
        for (let j = i + 1; j < heights.length; j++) {
          expect(Math.abs(heights[i]! - heights[j]!)).toBeGreaterThanOrEqual(GEN.arenaMinHeightGap);
        }
      }
    }
  });

  it('caps generated cover below the jumpable height (GEN.arenaCoverHeightMax)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const arena = generateArena(seed).value;
      if (arena === undefined) continue;
      for (const c of arena.covers) expect(c.height).toBeLessThanOrEqual(GEN.arenaCoverHeightMax);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/generate-arena.test.ts`
Expected: FAIL — `Cannot find module '../src/bosses/generate/arena'` (the file does not exist yet).

- [ ] **Step 3: Add the tuning ranges**

In `src/bosses/generate/tuning.ts`, add these fields inside the `GEN` object, just before the
closing `} as const;` (after the existing `fairnessSkilledCapTicks` line):

```typescript
  /** Chance a generated boss's arena is bare (no pieces at all), like the Ember Duelist. */
  arenaBareChance: 0.4,
  arenaPieceCountMin: 1,
  arenaPieceCountMax: 3,
  /** Minimum height gap required between any two pieces in the same arena (the Ashen Hound's own
   * gap, 10, is what read as "crowded" — this is deliberately much larger). */
  arenaMinHeightGap: 90,
  /** Redraws tried before falling back to the farthest-apart candidate found so far — bounded, never
   * an infinite loop. */
  arenaHeightRetries: 20,
  arenaZoneJitterMax: 40,
  arenaPlatformWidthMin: 140,
  arenaPlatformWidthMax: 260,
  arenaCoverWidthMin: 50,
  arenaCoverWidthMax: 110,
  arenaPlatformHeightMin: 40,
  arenaPlatformHeightMax: 260,
  /** Capped below the ~163-unit jump height (docs/bosses.md, "Cover is a wall below its top") so a
   * generated cover is always jumpable, never a true wall. */
  arenaCoverHeightMin: 40,
  arenaCoverHeightMax: 160,
```

- [ ] **Step 4: Write `generateArena`**

Create `src/bosses/generate/arena.ts`:

```typescript
import { nextRandom } from '../../game/rng';
import type { ArenaDef, ArenaPiece } from '../schema';
import type { Draw } from './attack';
import { GEN } from './tuning';

/** One placement zone a generated arena can use: an x centre, and whether cover is allowed there. */
interface Zone {
  x: number;
  allowCover: boolean;
}

/**
 * Three zones spread across the arena, at the same x's the Ashen Hound's own hand-built arena uses
 * (330, 640, 950, rounded here to 320/640/960). The x = 320 zone is platform-only: it sits on the
 * player's start (`PLAYER.startX`), and `parseBoss` already rejects any cover that would cover it.
 */
const ZONES: readonly Zone[] = [
  { x: 320, allowCover: false },
  { x: 640, allowCover: true },
  { x: 960, allowCover: true },
];

/** Draws a uniform float in `[min, max]` and advances the stream. */
function uniform(state: number, min: number, max: number): Draw<number> {
  const draw = nextRandom(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/** Draws a uniform integer in `[min, max]` and advances the stream. */
function uniformInt(state: number, min: number, max: number): Draw<number> {
  const draw = uniform(state, min, max);
  return { value: Math.round(draw.value), state: draw.state };
}

/** Picks one of `options` with equal chance and advances the stream. */
function pick<T>(state: number, options: readonly T[]): Draw<T> {
  const draw = nextRandom(state);
  const index = Math.min(options.length - 1, Math.floor(draw.value * options.length));
  return { value: options[index]!, state: draw.state };
}

/** Picks `count` zones out of `ZONES`, without repeats, in the order they are picked. */
function pickZones(state: number, count: number): Draw<Zone[]> {
  let s = state;
  const remaining = [...ZONES];
  const chosen: Zone[] = [];
  for (let i = 0; i < count; i++) {
    const draw = pick(s, remaining);
    s = draw.state;
    chosen.push(draw.value);
    remaining.splice(remaining.indexOf(draw.value), 1);
  }
  return { value: chosen, state: s };
}

/**
 * Draws a height in `[min, max]` at least `GEN.arenaMinHeightGap` away from every height in
 * `taken`. Tries up to `GEN.arenaHeightRetries` times; if none clears the gap, keeps whichever
 * candidate came closest (the largest minimum distance to any taken height) instead — bounded,
 * never an infinite loop.
 */
function drawSpreadHeight(
  state: number,
  min: number,
  max: number,
  taken: readonly number[],
): Draw<number> {
  let s = state;
  let best: { value: number; gap: number } | null = null;
  for (let i = 0; i < GEN.arenaHeightRetries; i++) {
    const draw = uniform(s, min, max);
    s = draw.state;
    const gap = taken.length === 0 ? Infinity : Math.min(...taken.map((h) => Math.abs(h - draw.value)));
    if (gap >= GEN.arenaMinHeightGap) return { value: draw.value, state: s };
    if (best === null || gap > best.gap) best = { value: draw.value, gap };
  }
  return { value: best!.value, state: s };
}

/**
 * Draws a whole arena for a generated boss from `state`, deterministic in `state` alone: bare
 * (`undefined`) with chance `GEN.arenaBareChance`, otherwise 1 to 3 pieces at up to three fixed x
 * zones, spread apart in height by at least `GEN.arenaMinHeightGap`. Never touches a gameplay
 * `rng`, exactly like `generateAttack` and the rest of `generateBoss`.
 */
export function generateArena(state: number): Draw<ArenaDef | undefined> {
  const bareDraw = nextRandom(state);
  if (bareDraw.value < GEN.arenaBareChance) return { value: undefined, state: bareDraw.state };

  const countDraw = uniformInt(bareDraw.state, GEN.arenaPieceCountMin, GEN.arenaPieceCountMax);
  const zonesDraw = pickZones(countDraw.state, countDraw.value);

  let s = zonesDraw.state;
  const platforms: ArenaPiece[] = [];
  const covers: ArenaPiece[] = [];
  const heights: number[] = [];

  for (const zone of zonesDraw.value) {
    const typeDraw = zone.allowCover
      ? pick(s, ['platform', 'cover'] as const)
      : { value: 'platform' as const, state: s };
    s = typeDraw.state;
    const isPlatform = typeDraw.value === 'platform';

    const jitterDraw = uniform(s, -GEN.arenaZoneJitterMax, GEN.arenaZoneJitterMax);
    s = jitterDraw.state;
    const x = zone.x + jitterDraw.value;

    const widthDraw = uniform(
      s,
      isPlatform ? GEN.arenaPlatformWidthMin : GEN.arenaCoverWidthMin,
      isPlatform ? GEN.arenaPlatformWidthMax : GEN.arenaCoverWidthMax,
    );
    s = widthDraw.state;

    const heightDraw = drawSpreadHeight(
      s,
      isPlatform ? GEN.arenaPlatformHeightMin : GEN.arenaCoverHeightMin,
      isPlatform ? GEN.arenaPlatformHeightMax : GEN.arenaCoverHeightMax,
      heights,
    );
    s = heightDraw.state;
    heights.push(heightDraw.value);

    const piece: ArenaPiece = { x, width: widthDraw.value, height: heightDraw.value };
    (isPlatform ? platforms : covers).push(piece);
  }

  return { value: { platforms, covers }, state: s };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/generate-arena.test.ts`
Expected: PASS, all 6 tests.

If `pick(s, ['platform', 'cover'] as const)` does not typecheck against `pick<T>(state, options:
readonly T[])`, change the call to `pick<'platform' | 'cover'>(s, ['platform', 'cover'])` instead —
functionally identical, just an explicit type argument.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/bosses/generate/tuning.ts src/bosses/generate/arena.ts tests/generate-arena.test.ts
git commit -m "feat: add generateArena, a seeded arena for generated bosses"
```

---

### Task 2: The camp-safety fairness check

**Files:**
- Modify: `src/bosses/generate/fairness.ts`
- Modify: `tests/generate-fairness.test.ts`

**Interfaces:**
- Consumes: `WORLD` from `src/game/params.ts`, `ArenaPiece` from `src/bosses/schema.ts`, the
  existing `createInitialState`/`step`/`NO_INPUT`. Does **not** consume `generateArena` — this check
  must stay generic, per the Global Constraints.
- Produces: `checkFairness`'s signature and `FairnessResult` shape are unchanged; it just also
  checks arena camp-safety internally when `boss.arena` is present.

- [ ] **Step 1: Write the failing tests**

Open `tests/generate-fairness.test.ts`. It already has a local `baseBoss(overrides)` fixture builder
(one attack, `id: 'poke'`, hit window `{ from: 24, to: 32, x0: 0, x1: 250, bottom: 0, top: 100 }` —
confirm this by reading the file; if the exact field names differ, use the ones actually there). Add
this new `describe` block at the end of the file:

```typescript
describe('the camp-safety check', () => {
  it("fails a boss whose platform sits above every attack's reach", () => {
    const boss = baseBoss({
      arena: { platforms: [{ x: 900, width: 200, height: 220 }], covers: [] },
    });
    // The fixture's one attack has hit window top: 100 — well under 220, so nothing on the
    // platform can ever be hit.
    const result = checkFairness(boss);
    expect(result.fair).toBe(false);
    expect(result.reasons.some((r) => r.includes('camping'))).toBe(true);
  });

  it("passes a boss whose platform stays inside the attack's reach", () => {
    const boss = baseBoss({
      arena: { platforms: [{ x: 900, width: 200, height: 60 }], covers: [] },
    });
    // Height 60 is under the fixture's hit window top of 100, so the platform is reachable.
    expect(checkFairness(boss).fair).toBe(true);
  });

  it('is unaffected by a boss with no arena', () => {
    expect(checkFairness(EMBER_DUELIST).fair).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/generate-fairness.test.ts`
Expected: FAIL — the first new test fails because nothing yet checks camping (today's `checkFairness`
only checks the floor), so `result.fair` is currently `true` where the test expects `false`.

- [ ] **Step 3: Add the camp-safety check to `fairness.ts`**

In `src/bosses/generate/fairness.ts`, change the import line:

```typescript
import { PLAYER } from '../../game/params';
```

to:

```typescript
import { PLAYER, WORLD } from '../../game/params';
```

and change:

```typescript
import type { AttackDef, BossDef } from '../schema';
```

to:

```typescript
import type { ArenaPiece, AttackDef, BossDef } from '../schema';
```

Add this new function directly after `idleLoses`:

```typescript
/**
 * Runs the idle bot (no input, ever) starting already perched at the centre of one arena piece's
 * top, instead of the floor — the camp-safety check. Closes a risk `docs/bosses.md` names but never
 * tests: a platform or cover tall enough could give the player a permanent safe spot. The centre is
 * the position most likely to be out of every attack's reach, so it stands in for the worst case
 * rather than an exhaustive search of every position on the piece.
 */
function idleLosesFromPerch(boss: BossDef, seed: number, piece: ArenaPiece): boolean {
  const perchY = WORLD.floorY - piece.height;
  let s = createInitialState(boss, seed);
  s = {
    ...s,
    player: { ...s.player, x: piece.x, prevX: piece.x, y: perchY, prevY: perchY, onGround: true },
  };
  for (let n = 0; n < GEN.fairnessCapTicks && s.phase === 'fight'; n++) {
    s = step(s, NO_INPUT, boss);
  }
  return s.phase === 'defeated';
}
```

In `checkFairness`, immediately after the existing floor-idle loop (the one that pushes
`` `idle player did not lose at seed ${seed}` ``), add:

```typescript
  const pieces: ArenaPiece[] = [...(boss.arena?.platforms ?? []), ...(boss.arena?.covers ?? [])];
  for (const piece of pieces) {
    for (const seed of GEN.fairnessSeeds) {
      if (!idleLosesFromPerch(boss, seed, piece)) {
        reasons.push(
          `idle player camping on a piece at x=${piece.x} height=${piece.height} did not lose at seed ${seed}`,
        );
      }
    }
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/generate-fairness.test.ts`
Expected: PASS, all tests including the three new ones.

- [ ] **Step 5: Determine the Ashen Hound's real result — do not assume it**

The spec requires this check to be run for real against the Ashen Hound's shipped arena, and the
actual result reported, not assumed. Run this once (a scratch script or a temporary `.only` test in
your scratchpad, not committed):

```typescript
import { ASHEN_HOUND } from '../src/bosses';
import { checkFairness } from '../src/bosses/generate/fairness';
console.log(JSON.stringify(checkFairness(ASHEN_HOUND), null, 2));
```

Two outcomes, handle exactly one:

- **If `fair: true`**: add a fourth test to the new `describe` block, matching the file's existing
  "known-fair anchors" pattern (`EMBER_DUELIST`/`ASHEN_HOUND`/`TRAINEE` must always pass):
  ```typescript
  it('the Ashen Hound passes the camp-safety check on its own shipped arena', () => {
    expect(checkFairness(ASHEN_HOUND).fair).toBe(true);
  });
  ```
  Commit it as part of Step 6 below.
- **If `fair: false`**: do **not** edit `src/bosses/ashen-hound.json` — that is a previously
  shipped, owner-approved boss, and retuning it is outside this task's scope and needs the owner's
  sign-off. Do not add a test asserting `fair: false` either (that would freeze in a bug as if it
  were intended behaviour). Instead, write the exact `reasons` array from the real result into your
  task report's Concerns section, word for word, so the controller can bring it to the owner as a
  genuine finding before this plan is merged.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/bosses/generate/fairness.ts tests/generate-fairness.test.ts
git commit -m "feat: check that no arena piece gives the player a permanent safe spot"
```

---

### Task 3: Wire `generateArena` into `generateBoss`, bump `GAME_VERSION`

**Files:**
- Modify: `src/bosses/generate/boss.ts`
- Modify: `tests/generate-boss.test.ts`
- Modify: `src/stats/record.ts`
- Modify: `tests/export.test.ts`, `tests/record.test.ts`
- Modify: `tests/loop-replay.test.ts`

**Interfaces:**
- Consumes: `generateArena(state: number): Draw<ArenaDef | undefined>` from Task 1.
- Produces: `generateBoss(seed: number): BossDef` now may include `.arena`; `resolveBoss` and
  everything downstream of it are unchanged (they already pass through whatever `BossDef` they get).

- [ ] **Step 1: Write the failing test**

In `tests/generate-boss.test.ts`, add this `describe` block at the end of the file:

```typescript
describe("a generated boss's arena", () => {
  it('sometimes has one and sometimes does not, over a sweep of seeds', () => {
    let withArena = 0;
    const total = 300;
    for (let seed = 1; seed <= total; seed++) {
      if (generateBoss(seed).arena !== undefined) withArena++;
    }
    expect(withArena).toBeGreaterThan(0);
    expect(withArena).toBeLessThan(total);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/generate-boss.test.ts`
Expected: FAIL — `withArena` is 0 for every seed today (`generateBoss` never sets `.arena`).

- [ ] **Step 3: Wire `generateArena` into `generateBoss`**

In `src/bosses/generate/boss.ts`, add this import alongside the existing ones:

```typescript
import { generateArena } from './arena';
```

Immediately before the line `const boss = {` (the final object being assembled), add:

```typescript
  const arenaDraw = generateArena(s);
  s = arenaDraw.state;
```

Inside the `boss` object literal, add the arena using a conditional spread — insert this line right
after `phases: [ ... ],` (the last field currently in the object), so the object becomes:

```typescript
  const boss = {
    id: 'generated',
    name: 'Generated Boss',
    width: widthDraw.value,
    height: heightDraw.value,
    startX: 960,
    maxHp: maxHpDraw.value,
    spacing,
    approachTimeout: approachTimeoutDraw.value,
    predictability: predictabilityDraw.value,
    counter: {
      window: Math.min(counterWindowDraw.value, counterableAttack.windup),
      range: counterRangeDraw.value,
      staggerTicks: staggerTicksDraw.value,
      damageMultiplier: 2,
    },
    transitionTicks: 60,
    attacks,
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: phaseAttacks,
        gap: gapDraw.value,
        maxChain: maxChainDraw.value,
        chainChance: chainChanceDraw.value,
        walkSpeed: walkSpeedDraw.value,
        retreatSpeed: retreatSpeedDraw.value,
      },
    ],
    ...(arenaDraw.value === undefined ? {} : { arena: arenaDraw.value }),
  };
```

(Everything above `phases:` is unchanged — only the new `arenaDraw` block before `const boss = {`
and the new spread line after `phases: [...]` are additions.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/generate-boss.test.ts`
Expected: PASS. Also run `npx vitest run tests/generate-arena.test.ts tests/generate-fairness.test.ts`
to confirm Tasks 1 and 2 are still green (this task's change can only add an `arena` field, but
confirm anyway).

- [ ] **Step 5: Bump `GAME_VERSION`**

In `src/stats/record.ts`, change:

```typescript
/**
 * Bump when a change to the game numbers or a boss file changes how a recorded fight replays.
 * 0.4.0: arenas (platforms and cover). Giving the Ashen Hound an arena changes how Hound fights replay, so
 * records made by 0.3.0 no longer replay exactly for the Hound; Ember Duelist records (no arena) still do.
 */
export const GAME_VERSION = '0.4.0';
```

to:

```typescript
/**
 * Bump when a change to the game numbers or a boss file changes how a recorded fight replays.
 * 0.4.0: arenas (platforms and cover). Giving the Ashen Hound an arena changes how Hound fights replay, so
 * records made by 0.3.0 no longer replay exactly for the Hound; Ember Duelist records (no arena) still do.
 * 0.5.0: generated arenas (M6a). Drawing an arena is one more random choice the generator makes, so it
 * reorders the whole random stream: a "generated" record made by 0.4.0 no longer reproduces the same boss
 * (arena included) from its seed. Named-boss records (Ember Duelist, Ashen Hound) are unaffected.
 */
export const GAME_VERSION = '0.5.0';
```

Update the two hardcoded version literals in the test suite:
- `tests/export.test.ts:70`: change `expect(parsed.gameVersion).toBe('0.4.0');` to
  `expect(parsed.gameVersion).toBe('0.5.0');`.
- `tests/record.test.ts:125`: change `expect(GAME_VERSION).toBe('0.4.0');` to
  `expect(GAME_VERSION).toBe('0.5.0');`.
- `tests/record.test.ts:130`: change `expect(record.gameVersion).toBe('0.4.0');` to
  `expect(record.gameVersion).toBe('0.5.0');`.

- [ ] **Step 6: Extend the replay test with a seed that produces a generated arena**

Search seeds 1 to 30 for the first one whose generated boss actually has an arena (run this as a
scratch check, not committed):

```typescript
import { generateBoss } from '../src/bosses/generate/boss';
for (let seed = 1; seed <= 30; seed++) {
  if (generateBoss(seed).arena !== undefined) {
    console.log(seed);
    break;
  }
}
```

In `tests/loop-replay.test.ts`, find the existing test `'a Generated boss: a long fight through the
app loop replays and analyzes faithfully'` (it uses `seed = 30`). Add a new test right after it,
using the seed you just found (call it `ARENA_SEED` below — substitute the real number):

```typescript
it('a Generated boss with an arena: a long fight through the app loop replays and analyzes faithfully', () => {
  const seed = ARENA_SEED; // substitute the seed found above; its generated boss must have an arena
  const generated = resolveBoss('generated', seed);
  expect(generated.arena).toBeDefined();
  const played = playLikeTheApp({
    presetId: 'normal',
    dials: presetDials('normal'),
    seed,
    deltas: messyDeltas(seed),
    bossDef: generated,
    leaveAfterFrames: 2400,
  });
  expect(played.boss.id).toBe('generated');
  expect(played.record.bossId).toBe('generated');
  expectFaithful(played);
});
```

- [ ] **Step 7: Run the full suite and confirm it passes**

Run: `npm test`
Expected: PASS, every test file.

- [ ] **Step 8: Measure the real fallback rate — report it, do not guess**

`docs/bosses.md` documents the pre-M6a fallback rate as "about 2% (2 of 100)". Since arenas add a new
way a candidate can fail fairness, this rate may have changed. Measure it for real (a scratch check,
not committed):

```typescript
import { resolveBoss } from '../src/bosses/resolve';
let fallback = 0;
for (let seed = 1; seed <= 100; seed++) {
  if (resolveBoss('generated', seed).id === 'trainee') fallback++;
}
console.log(fallback);
```

Write the real number in your task report's Concerns section (for example "3/100" or "2/100"), so
Task 4's docs update uses the measured number, not the old one, and so the controller can flag it to
the owner if it has risen a lot. Do not change any `GEN` tuning number to chase a particular rate —
that is a separate decision for the controller/owner, not this task.

- [ ] **Step 9: Typecheck, build and commit**

Run: `npm run typecheck && npm run build && npm run check:dist`
Expected: all clean.

```bash
git add src/bosses/generate/boss.ts tests/generate-boss.test.ts src/stats/record.ts \
  tests/export.test.ts tests/record.test.ts tests/loop-replay.test.ts
git commit -m "feat: give generated bosses an arena, bump GAME_VERSION to 0.5.0"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/bosses.md`
- Modify: `docs/stats.md`
- Modify: `docs/phone-testing.md`
- Modify: `docs/backlog.md`
- Modify: `docs/SPEC.md`
- Modify: `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`

**Interfaces:** none (docs only). Read Task 3's report first for the real measured fallback rate
(Step 8) and the real Ashen Hound camp-safety result (Task 2, Step 5) before writing this task —
both numbers/claims below must match what was actually measured, not guessed.

- [ ] **Step 1: Update `docs/bosses.md` section 3b**

Find this paragraph:

```
**Shape of a generated boss** (`generateBoss` in `src/bosses/generate/boss.ts`): 3 to 5 attacks, with exactly **one** of them `counterable` (gold, like the Duelist's slam) and the rest `mustDodge`; **one phase only**; **no `arena`** in this version (a bare floor, like the Ember Duelist). `id` is always `'generated'`, `name` always `'Generated Boss'`.
```

Replace it with:

```
**Shape of a generated boss** (`generateBoss` in `src/bosses/generate/boss.ts`): 3 to 5 attacks, with exactly **one** of them `counterable` (gold, like the Duelist's slam) and the rest `mustDodge`; **one phase only**. `id` is always `'generated'`, `name` always `'Generated Boss'`.

**The arena (M6a)**: about 4 in 10 generated bosses stay bare, like the Ember Duelist; the rest get 1 to 3 pieces (`generateArena` in `src/bosses/generate/arena.ts`) at up to three fixed spots (x = 320, 640, 960 — the same spacing the Ashen Hound's own arena uses). The x = 320 spot is always a platform: cover can never sit over the player's start (see "Arena" above). Every piece in the same arena is spread at least `GEN.arenaMinHeightGap` apart in height from every other piece, so nothing clusters near one level — the concrete problem the Ashen Hound's own arena had (its platform and cover sit only 10 units apart). Generated cover is capped below the jumpable height, so it is never a true wall the boss's own attacks (which still ignore the arena, see "The boss ignores the arena" above) leave the player stuck behind.
```

Find this paragraph (the fairness checker's bullet list):

```
- a **skilled bot** (dashes through a plain hit or a fast move at the right update, steps away from a leap's landing spot and dashes if it is still close when the leap lands, times a real counter press inside the counter window and range for the one counterable attack, otherwise walks in and swings) must win at least one of the two seeds without ever taking damage: proves the boss is beatable and its attacks are readable, not just survivable.
```

Add a third bullet right after it:

```
- a **camp-safety check** (M6a), for any boss with an arena: the idle bot is also run starting perched at the centre of every platform and cover's top, and must still lose there too. This closes a risk this document names above ("The arena in the fight": a platform taller than every hit window's top makes a place where nothing can reach the player) that was never actually tested before M6a.
```

Find this sentence in the "Retry, then the fallback trainee" paragraph:

```
Measured over a natural sweep of 100 seeds, this fallback is reached about **2% of the time** (2 of 100), not the "rare, hard to force" the original design guessed before it was measured.
```

Replace `2%` and `2 of 100` with the real number measured in Task 3, Step 8 (leave the rest of the
sentence as-is; only the two numbers change if the measured rate differs from 2/100).

- [ ] **Step 2: Update `docs/stats.md` section 9**

Find this bullet:

```
- **The boss generator (M5e, still game version 0.4.0, no bump for it).** `bossId: "generated"` has no file, so its replay stability is a different promise from a named boss's: a `"generated"` record's replay is only guaranteed to match while the generator's algorithm and its tuning (`src/bosses/generate/`) are unchanged, in addition to `GAME_VERSION` itself. A future change to the generator (a tuning number, or the algorithm) will need a `GAME_VERSION` bump exactly like a change to a named boss file would, so old `"generated"` records stay identifiable as no-longer-exact. A version-1, version-2 or version-3 record with a real boss id (`"ember-duelist"` or `"ashen-hound"`) is unaffected by anything about the generator.
```

Add a new bullet right after it:

```
- **Game version 0.5.0: generated arenas (M6a).** Drawing an arena is one more random choice the generator makes, so it reorders the whole random stream: a `"generated"` record made by game version 0.4.0 no longer reproduces the same boss (arena included) from its seed. As with the 0.4.0 bump, only `"generated"` records are affected; the Ember Duelist and Ashen Hound are unchanged.
```

- [ ] **Step 3: Update `docs/phone-testing.md`'s generator section**

Find this bullet:

```
- It has **no ledges or walls** yet (a flat arena, like the Ember Duelist).
```

Replace with:

```
- It **sometimes has ledges or a wall now (M6a)** — about 4 in 10 fights it stays flat, like the Ember Duelist; the rest of the time it has 1 to 3 platforms or cover, placed so they are never at nearly the same height.
```

Add this to the Checklist section (after the existing `Every generated boss you meet is beatable.`
line):

```
- [ ] Some Generated fights have platforms or cover at clearly different heights; others are flat — both should turn up over a handful of tries.
```

Add this to the "Questions about the generator" section:

```
- Does a generated arena ever feel like it traps you, or gives the boss an unfair angle on you?
```

- [ ] **Step 4: Mark it built in `docs/backlog.md`**

Under `## The boss generator (raised 2026-09-22, built as M5e)`, find:

```
- **Generated arenas**: a generated boss has no `arena` at all yet (a bare floor, like the Ember Duelist); the M5c arena's own placement rules (no safe camping spot, cover that actually blocks something) would need to be generalized to arbitrary generated attacks first.
```

Replace with:

```
- ~~Generated arenas~~ **Built in M6a** (`docs/SPEC.md` section 11, design in `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`): a generated boss sometimes has 1 to 3 platforms or cover now, heights spread apart on purpose, checked by a new, generic camp-safety fairness check.
```

- [ ] **Step 5: Update `docs/SPEC.md`'s M6a status**

Find the M6a bullet added when the design was written (it starts with `- **M6a generated arenas**
(design in`). Change its opening clause from:

```
(design in `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`, awaiting the owner's review of that document before it is planned and built)
```

to:

```
(built, awaiting the owner's play test; design in `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`)
```

- [ ] **Step 6: Update the design doc's own status line**

In `docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md`, change:

```
**Status:** design, awaiting the owner's review of this document.
```

to:

```
**Status:** built, awaiting the owner's play test.
```

- [ ] **Step 7: Full verification and commit**

Run: `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`
Expected: all exit 0.

```bash
git add docs/bosses.md docs/stats.md docs/phone-testing.md docs/backlog.md docs/SPEC.md \
  docs/superpowers/specs/2026-09-22-m6a-generated-arenas-design.md
git commit -m "docs: document generated arenas and the camp-safety check (M6a)"
```

---

## Self-Review

**Spec coverage:**
- "Chance of staying bare" (0.4) → Task 1 (`arenaBareChance`).
- "1 to 3 pieces, three placement zones, left zone platform-only" → Task 1 (`generateArena`).
- "Heights spread apart by construction" → Task 1 (`drawSpreadHeight`, `arenaMinHeightGap`).
- "Cap cover height so it stays jumpable" → Task 1 (`arenaCoverHeightMax`).
- "New camp-safety check, generic, checked against the Ashen Hound as a real finding" → Task 2.
- "Wiring: `generateBoss` gains `arena`, no change to `resolveBoss`" → Task 3, Steps 1-4.
- "Versioning: bump to 0.5.0" → Task 3, Steps 5-6.
- "Testing: bounded seed sweep, camp-safety fixtures, replay test with a real arena seed" → Tasks 1-3.
- "Docs: bosses.md, stats.md, phone-testing.md" → Task 4.
- "Done when" checklist → covered by Tasks 1-4 together.

**Placeholder scan:** no TBD/TODO; every step has real code or an exact instruction with the real
file/line it targets. The two places a number cannot be known ahead of time (the arena-seed search in
Task 3 Step 6, the measured fallback rate in Task 3 Step 8) are explicit "search/measure, then use
the real value" instructions, not placeholders — this mirrors how M5e's own plan handled numbers that
only exist once the code runs.

**Type consistency:** `generateArena(state: number): Draw<ArenaDef | undefined>` (Task 1) is called
exactly that way in Task 3 (`generateArena(s)`, `.value`/`.state`). `ArenaPiece` (Task 2's
`idleLosesFromPerch`) matches `src/bosses/schema.ts`'s existing shape (`x`, `width`, `height`) with no
new fields invented. `GEN.arenaMinHeightGap` etc. are defined once (Task 1) and only read afterward
(Tasks 1-3), never redefined.

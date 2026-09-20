# M2: Boss Data Format and the Ember Duelist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 training dummy with the Ember Duelist, a boss defined by a validated data file that walks and keeps its distance, chooses attacks with a seeded random generator, can be countered, has a second phase, and can be beaten.

**Architecture:** A boss is a JSON file checked by a hand-written validator. `step(state, input, boss)` stays pure; the boss definition is an argument and never part of the state. The state gains a `boss` entity (movement, attack, stagger and transition modes) and a seeded random generator state. Effects, sound and drawing stay outside `step` and read its events.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Canvas 2D, Web Audio. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-m2-design.md` (implements M2 of `docs/SPEC.md` section 11). Also read `docs/superpowers/specs/2026-09-20-m1-design.md`, `CLAUDE.md` and `docs/backlog.md`.

## Global Constraints

- TypeScript strict mode, `noUncheckedIndexedAccess` on (tests may use `!` on array elements). No `any`. Use `import type` for type-only imports.
- **Purity:** nothing under `src/game/`, `src/bosses/` or `src/engine/loop.ts` may read a clock, `Math.random`, the DOM or the gamepad. `step` must not mutate the state it is given. All randomness in the simulation comes from `nextRandom` in `src/game/rng.ts`.
- **No new dependencies.** No backend, third-party scripts or CDN code.
- **Strict CSP is not loosened:** no inline scripts, no `style="..."` attributes, no `innerHTML`. JSON is imported and bundled (no fetch at runtime).
- Every tunable number lives in `src/game/params.ts` (player, world, feedback) or in the boss file (everything about a boss). Times are in updates (60 per second), distances in world units (world 1280 by 720), speeds in units per second.
- The boss definition is data: the code must not hard-code attack names, numbers or phase counts of the Ember Duelist (tests may read the real file).
- **Commit messages: never add a `Co-Authored-By` line or any Claude/Anthropic attribution.** Do not change git config or pass `--author`. Use explicit paths with `git add`. **Never `git push`**; the controller decides when to push.
- Follow `CLAUDE.md`: do not add features that are not in this plan without asking.

## Conventions used by the tests

- `tests/helpers.ts` (Task 2) exports `DUELIST` (the real boss), `QUIET_BOSS` (the real boss with no attacks and no walking, a stationary target for player-only tests), `withInput`, `advance` and `run`. `advance` and `run` take an optional boss argument that defaults to `QUIET_BOSS`.
- `run(state, count, inputFor, boss)` runs updates numbered 1 to `count`; `states[i]` is the state after update `i + 1`.
- An attack's `attackTick` is 0 on the update that starts it and increases by 1 per update; a hit window with `from <= attackTick < to` is active on that update.

## File Structure

| File | Responsibility |
|---|---|
| `src/bosses/schema.ts` | Types of a boss file |
| `src/bosses/parse.ts` | `parseBoss` validator and `BossFormatError` |
| `src/bosses/ember-duelist.json` | The Ember Duelist's data |
| `src/bosses/index.ts` | Loads and validates the Duelist (`EMBER_DUELIST`) |
| `src/game/rng.ts` | Seeded random numbers |
| `src/game/state.ts` | State types with the `boss` entity, `createInitialState(boss, seed)` |
| `src/game/geometry.ts` | Boxes: player, boss, player attack, boss hit boxes |
| `src/game/boss.ts` | Boss movement, choosing and running attacks, stagger, phase transition |
| `src/game/step.ts` | `step(state, input, boss)` and the player update and collisions |
| `src/ui/feedback.ts`, `src/ui/audio.ts`, `src/ui/render.ts`, `src/ui/app.ts` | Effects, sound, drawing, app shell |
| `docs/bosses.md` | The boss file format for whoever adds the next boss |
| `tests/*.test.ts`, `tests/helpers.ts` | Tests |

---

### Task 1: Boss file format, the Ember Duelist file, and seeded random numbers (TDD)

**Files:**
- Create: `src/bosses/schema.ts`, `src/bosses/parse.ts`, `src/bosses/ember-duelist.json`, `src/bosses/index.ts`, `src/game/rng.ts`
- Modify: `tsconfig.json` (add `"resolveJsonModule": true`)
- Test: `tests/boss-parse.test.ts`, `tests/rng.test.ts`

**Interfaces:**
- Produces: types `Pose`, `AttackClass`, `HitWindow`, `AttackMove`, `AttackDef`, `PhaseAttack`, `PhaseDef`, `CounterDef`, `BossDef` (`schema.ts`); `BossFormatError`, `parseBoss(data: unknown): BossDef` (`parse.ts`); `EMBER_DUELIST: BossDef` (`index.ts`); `nextRandom(state: number): { value: number; state: number }` (`rng.ts`).

- [ ] **Step 1: Write the failing tests**

`tests/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextRandom } from '../src/game/rng';

function sequence(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const next = nextRandom(state);
    out.push(next.value);
    state = next.state;
  }
  return out;
}

describe('nextRandom', () => {
  it('gives the same numbers for the same seed', () => {
    expect(sequence(7, 50)).toEqual(sequence(7, 50));
  });

  it('gives different numbers for different seeds', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it('always returns a value from 0 up to but not including 1', () => {
    for (const value of sequence(12345, 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads the values across the range', () => {
    const values = sequence(99, 5000);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(2200);
    expect(values.filter((v) => v < 0.5).length).toBeLessThan(2800);
  });

  it('moves on to a new state on every draw and never returns a negative or fractional state', () => {
    const first = nextRandom(5);
    const second = nextRandom(first.state);
    expect(second.state).not.toBe(first.state);
    expect(Number.isInteger(first.state)).toBe(true);
    expect(first.state).toBeGreaterThanOrEqual(0);
  });
});
```

`tests/boss-parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import raw from '../src/bosses/ember-duelist.json';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';

/** A deep copy of the real boss for a test to break on purpose. */
const copy = (): BossDef => structuredClone(EMBER_DUELIST);

const rejects = (boss: unknown, where: string): void => {
  expect(() => parseBoss(boss)).toThrow(BossFormatError);
  expect(() => parseBoss(boss)).toThrow(where);
};

describe('the real Ember Duelist file', () => {
  it('is accepted and has the planned shape', () => {
    expect(parseBoss(raw)).toEqual(EMBER_DUELIST);
    expect(EMBER_DUELIST.id).toBe('ember-duelist');
    expect(EMBER_DUELIST.attacks.map((a) => a.id)).toEqual(['slam', 'sweep', 'lunge', 'burst']);
    expect(EMBER_DUELIST.phases).toHaveLength(2);
    expect(EMBER_DUELIST.phases[0]!.startsAtHpFraction).toBe(1);
  });

  it('has exactly one counterable attack, the slam', () => {
    expect(EMBER_DUELIST.attacks.filter((a) => a.class === 'counterable').map((a) => a.id)).toEqual([
      'slam',
    ]);
  });
});

describe('parseBoss rejects broken files, naming the place', () => {
  it('data that is not an object', () => {
    rejects(42, 'boss');
    rejects(null, 'boss');
    rejects([], 'boss');
  });

  it('a missing name', () => {
    const b = copy() as unknown as Record<string, unknown>;
    delete b.name;
    rejects(b, 'boss.name');
  });

  it('a negative health', () => {
    const b = copy();
    b.maxHp = -1;
    rejects(b, 'boss.maxHp');
  });

  it('a fractional whole-number field', () => {
    const b = copy();
    b.transitionTicks = 10.5;
    rejects(b, 'boss.transitionTicks');
  });

  it('a predictability outside 0 to 1', () => {
    const b = copy();
    b.predictability = 1.5;
    rejects(b, 'boss.predictability');
  });

  it('spacing whose maximum is not above its minimum', () => {
    const b = copy();
    b.spacing = { min: 300, max: 300 };
    rejects(b, 'boss.spacing');
  });

  it('two attacks with the same id', () => {
    const b = copy();
    b.attacks[1]!.id = 'slam';
    rejects(b, 'boss.attacks[1].id');
  });

  it('an unknown pose', () => {
    const b = copy();
    (b.attacks[0] as unknown as { pose: string }).pose = 'jumping';
    rejects(b, 'boss.attacks[0].pose');
  });

  it('an unknown attack class', () => {
    const b = copy();
    (b.attacks[0] as unknown as { class: string }).class = 'friendly';
    rejects(b, 'boss.attacks[0].class');
  });

  it('a range whose minimum is not below its maximum', () => {
    const b = copy();
    b.attacks[0]!.range = { min: 100, max: 100 };
    rejects(b, 'boss.attacks[0].range');
  });

  it('a hit window outside the active updates', () => {
    const b = copy();
    const slam = b.attacks[0]!;
    slam.hits[0]!.to = slam.windup + slam.active + 1;
    rejects(b, 'boss.attacks[0].hits[0]');
  });

  it('a hit window whose far edge is not beyond its near edge', () => {
    const b = copy();
    b.attacks[0]!.hits[0]!.x1 = b.attacks[0]!.hits[0]!.x0;
    rejects(b, 'boss.attacks[0].hits[0]');
  });

  it('an attack with no hit window', () => {
    const b = copy();
    b.attacks[0]!.hits = [];
    rejects(b, 'boss.attacks[0].hits');
  });

  it('a move outside the active updates', () => {
    const b = copy();
    const lunge = b.attacks[2]!;
    lunge.move = { from: lunge.windup, to: lunge.windup + lunge.active + 5, speed: 1500 };
    rejects(b, 'boss.attacks[2].move');
  });

  it('a phase that lists an attack that does not exist', () => {
    const b = copy();
    b.phases[0]!.attacks[0]!.id = 'nope';
    rejects(b, 'boss.phases[0].attacks[0].id');
  });

  it('an attack weight of zero', () => {
    const b = copy();
    b.phases[0]!.attacks[0]!.weight = 0;
    rejects(b, 'boss.phases[0].attacks[0].weight');
  });

  it('an opening attack that does not exist', () => {
    const b = copy();
    b.phases[1]!.opening = 'nope';
    rejects(b, 'boss.phases[1].opening');
  });

  it('a first phase that does not start at full health', () => {
    const b = copy();
    b.phases[0]!.startsAtHpFraction = 0.9;
    rejects(b, 'boss.phases[0].startsAtHpFraction');
  });

  it('phases that do not start in decreasing order', () => {
    const b = copy();
    b.phases[1]!.startsAtHpFraction = 1;
    rejects(b, 'boss.phases[1].startsAtHpFraction');
  });

  it('a phase that never walks', () => {
    const b = copy();
    b.phases[0]!.walkSpeed = 0;
    rejects(b, 'boss.phases[0].walkSpeed');
  });

  it('a counter window longer than a counterable attack wind-up', () => {
    const b = copy();
    b.counter.window = b.attacks[0]!.windup + 1;
    rejects(b, 'boss.counter.window');
  });

  it('no attacks and no phases', () => {
    const noAttacks = copy();
    noAttacks.attacks = [];
    rejects(noAttacks, 'boss.attacks');
    const noPhases = copy();
    noPhases.phases = [];
    rejects(noPhases, 'boss.phases');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rng.test.ts tests/boss-parse.test.ts`
Expected: FAIL, `../src/game/rng` and `../src/bosses` cannot be resolved.

- [ ] **Step 3: Enable JSON imports and create `src/game/rng.ts`**

In `tsconfig.json`, add `"resolveJsonModule": true,` inside `compilerOptions` (next to `"isolatedModules": true`).

`src/game/rng.ts`:
```ts
/**
 * Seeded random numbers (the "mulberry32" generator). Pure: the caller keeps the state,
 * so a whole fight can be replayed exactly from its seed.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}
```

- [ ] **Step 4: Create the types, the validator, the Duelist file and the loader**

`src/bosses/schema.ts`:
```ts
/** The arm pose shown while an attack winds up; it tells the player which attack is coming. */
export type Pose = 'raised' | 'sideways' | 'back' | 'down';

/** Counterable attacks glow gold and can be countered; must-dodge attacks glow red. */
export type AttackClass = 'counterable' | 'mustDodge';

/**
 * A box that hurts the player. Times are updates counted from the attack's first update (0);
 * it is active while `from <= t < to`. Distances are measured from the boss's centre in the direction
 * it faces (`x0` near edge, `x1` far edge); `bottom` and `top` are heights above the floor.
 */
export interface HitWindow {
  from: number;
  to: number;
  x0: number;
  x1: number;
  bottom: number;
  top: number;
}

/** The boss moves forward (the way it faces) at `speed` units per second while `from <= t < to`. */
export interface AttackMove {
  from: number;
  to: number;
  speed: number;
}

export interface AttackDef {
  id: string;
  name: string;
  pose: Pose;
  class: AttackClass;
  windup: number;
  active: number;
  recovery: number;
  /** Distance from the player (centre to centre) at which the boss starts this attack. */
  range: { min: number; max: number };
  move?: AttackMove;
  hits: HitWindow[];
}

export interface PhaseAttack {
  id: string;
  weight: number;
}

export interface PhaseDef {
  name: string;
  /** The phase begins when health falls to this fraction of the maximum or below (1 for the first phase). */
  startsAtHpFraction: number;
  attacks: PhaseAttack[];
  /** The attack the boss opens with when this phase begins (after the powering-up pause). */
  opening?: string;
  /** Updates the boss waits (walking and keeping its distance) before choosing its next attack. */
  gap: number;
  /** Most attacks in one chain (1 means no chaining). */
  maxChain: number;
  /** Chance that an attack is followed straight away by another, up to `maxChain`. */
  chainChance: number;
  walkSpeed: number;
  retreatSpeed: number;
}

export interface CounterDef {
  /** The last `window` updates of a counterable attack's wind-up in which a counter works. */
  window: number;
  /** How close (centre to centre) the player must be. */
  range: number;
  staggerTicks: number;
  damageMultiplier: number;
}

export interface BossDef {
  id: string;
  name: string;
  width: number;
  height: number;
  startX: number;
  maxHp: number;
  /** The distance the boss tries to keep from the player while it waits. */
  spacing: { min: number; max: number };
  /** Updates the boss may spend walking into an attack's range before it starts the attack anyway. */
  approachTimeout: number;
  /** 0 picks attacks by weighted random, 1 cycles through the phase's list in order. */
  predictability: number;
  counter: CounterDef;
  /** Length of the powering-up pause between phases, in which the boss cannot be hurt. */
  transitionTicks: number;
  attacks: AttackDef[];
  phases: PhaseDef[];
}
```

`src/bosses/parse.ts`:
```ts
import type {
  AttackDef,
  AttackMove,
  BossDef,
  CounterDef,
  HitWindow,
  PhaseDef,
  Pose,
} from './schema';

/** A boss file is broken. The message names the exact place, for example `boss.attacks[1].range`. */
export class BossFormatError extends Error {
  constructor(path: string, message: string) {
    super(`Boss data error at ${path}: ${message}`);
    this.name = 'BossFormatError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new BossFormatError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value as Obj;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty text');
  return value;
}

interface NumberRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

function num(value: unknown, path: string, rule: NumberRule = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  if (rule.integer && !Number.isInteger(value)) fail(path, 'expected a whole number');
  if (rule.min !== undefined && value < rule.min) fail(path, `must be at least ${rule.min}`);
  if (rule.max !== undefined && value > rule.max) fail(path, `must be at most ${rule.max}`);
  return value;
}

const POSES: readonly Pose[] = ['raised', 'sideways', 'back', 'down'];

function hitWindow(value: unknown, path: string): HitWindow {
  const o = object(value, path);
  const hit: HitWindow = {
    from: num(o.from, `${path}.from`, { min: 0, integer: true }),
    to: num(o.to, `${path}.to`, { min: 1, integer: true }),
    x0: num(o.x0, `${path}.x0`),
    x1: num(o.x1, `${path}.x1`),
    bottom: num(o.bottom, `${path}.bottom`, { min: 0 }),
    top: num(o.top, `${path}.top`),
  };
  if (hit.to <= hit.from) fail(path, '"to" must be after "from"');
  if (hit.x1 <= hit.x0) fail(path, '"x1" must be greater than "x0"');
  if (hit.top <= hit.bottom) fail(path, '"top" must be greater than "bottom"');
  return hit;
}

function attack(value: unknown, path: string): AttackDef {
  const o = object(value, path);
  const pose = text(o.pose, `${path}.pose`);
  if (!POSES.includes(pose as Pose)) fail(`${path}.pose`, `must be one of ${POSES.join(', ')}`);
  const cls = text(o.class, `${path}.class`);
  if (cls !== 'counterable' && cls !== 'mustDodge') {
    fail(`${path}.class`, 'must be "counterable" or "mustDodge"');
  }
  const windup = num(o.windup, `${path}.windup`, { min: 1, integer: true });
  const active = num(o.active, `${path}.active`, { min: 1, integer: true });
  const recovery = num(o.recovery, `${path}.recovery`, { min: 0, integer: true });

  const rangeObject = object(o.range, `${path}.range`);
  const range = {
    min: num(rangeObject.min, `${path}.range.min`, { min: 0 }),
    max: num(rangeObject.max, `${path}.range.max`, { min: 0 }),
  };
  if (range.max <= range.min) fail(`${path}.range`, '"max" must be greater than "min"');

  const hits = list(o.hits, `${path}.hits`).map((entry, i) => hitWindow(entry, `${path}.hits[${i}]`));
  if (hits.length === 0) fail(`${path}.hits`, 'needs at least one hit window');
  hits.forEach((hit, i) => {
    if (hit.from < windup || hit.to > windup + active) {
      fail(`${path}.hits[${i}]`, 'must lie inside the active updates');
    }
  });

  let move: AttackMove | undefined;
  if (o.move !== undefined) {
    const m = object(o.move, `${path}.move`);
    move = {
      from: num(m.from, `${path}.move.from`, { min: 0, integer: true }),
      to: num(m.to, `${path}.move.to`, { min: 1, integer: true }),
      speed: num(m.speed, `${path}.move.speed`, { min: 1 }),
    };
    if (move.to <= move.from || move.from < windup || move.to > windup + active) {
      fail(`${path}.move`, 'must lie inside the active updates');
    }
  }

  const def: AttackDef = {
    id: text(o.id, `${path}.id`),
    name: text(o.name, `${path}.name`),
    pose: pose as Pose,
    class: cls,
    windup,
    active,
    recovery,
    range,
    hits,
  };
  return move === undefined ? def : { ...def, move };
}

function phase(value: unknown, path: string, attackIds: ReadonlySet<string>): PhaseDef {
  const o = object(value, path);
  const attacks = list(o.attacks, `${path}.attacks`).map((entry, i) => {
    const e = object(entry, `${path}.attacks[${i}]`);
    const id = text(e.id, `${path}.attacks[${i}].id`);
    if (!attackIds.has(id)) fail(`${path}.attacks[${i}].id`, `unknown attack "${id}"`);
    return { id, weight: num(e.weight, `${path}.attacks[${i}].weight`, { min: 0.0001 }) };
  });
  if (attacks.length === 0) fail(`${path}.attacks`, 'needs at least one attack');

  let opening: string | undefined;
  if (o.opening !== undefined) {
    opening = text(o.opening, `${path}.opening`);
    if (!attackIds.has(opening)) fail(`${path}.opening`, `unknown attack "${opening}"`);
  }

  const result: PhaseDef = {
    name: text(o.name, `${path}.name`),
    startsAtHpFraction: num(o.startsAtHpFraction, `${path}.startsAtHpFraction`, {
      min: 0.0001,
      max: 1,
    }),
    attacks,
    gap: num(o.gap, `${path}.gap`, { min: 0, integer: true }),
    maxChain: num(o.maxChain, `${path}.maxChain`, { min: 1, integer: true }),
    chainChance: num(o.chainChance, `${path}.chainChance`, { min: 0, max: 1 }),
    walkSpeed: num(o.walkSpeed, `${path}.walkSpeed`, { min: 1 }),
    retreatSpeed: num(o.retreatSpeed, `${path}.retreatSpeed`, { min: 1 }),
  };
  return opening === undefined ? result : { ...result, opening };
}

/** Checks a boss file and returns it typed. Throws a `BossFormatError` naming the first problem found. */
export function parseBoss(data: unknown): BossDef {
  const o = object(data, 'boss');

  const attacks = list(o.attacks, 'boss.attacks').map((entry, i) =>
    attack(entry, `boss.attacks[${i}]`),
  );
  if (attacks.length === 0) fail('boss.attacks', 'needs at least one attack');
  const ids = new Set<string>();
  attacks.forEach((a, i) => {
    if (ids.has(a.id)) fail(`boss.attacks[${i}].id`, `"${a.id}" is used twice`);
    ids.add(a.id);
  });

  const phases = list(o.phases, 'boss.phases').map((entry, i) =>
    phase(entry, `boss.phases[${i}]`, ids),
  );
  if (phases.length === 0) fail('boss.phases', 'needs at least one phase');
  phases.forEach((p, i) => {
    if (i === 0 && p.startsAtHpFraction !== 1) {
      fail('boss.phases[0].startsAtHpFraction', 'the first phase must start at 1 (full health)');
    }
    const before = phases[i - 1];
    if (before !== undefined && p.startsAtHpFraction >= before.startsAtHpFraction) {
      fail(`boss.phases[${i}].startsAtHpFraction`, 'must be lower than the previous phase');
    }
  });

  const spacingObject = object(o.spacing, 'boss.spacing');
  const spacing = {
    min: num(spacingObject.min, 'boss.spacing.min', { min: 0 }),
    max: num(spacingObject.max, 'boss.spacing.max', { min: 0 }),
  };
  if (spacing.max <= spacing.min) fail('boss.spacing', '"max" must be greater than "min"');

  const counterObject = object(o.counter, 'boss.counter');
  const counter: CounterDef = {
    window: num(counterObject.window, 'boss.counter.window', { min: 1, integer: true }),
    range: num(counterObject.range, 'boss.counter.range', { min: 1 }),
    staggerTicks: num(counterObject.staggerTicks, 'boss.counter.staggerTicks', {
      min: 1,
      integer: true,
    }),
    damageMultiplier: num(counterObject.damageMultiplier, 'boss.counter.damageMultiplier', {
      min: 1,
    }),
  };
  attacks.forEach((a, i) => {
    if (a.class === 'counterable' && a.windup < counter.window) {
      fail(
        'boss.counter.window',
        `is longer than the wind-up of the counterable attack boss.attacks[${i}]`,
      );
    }
  });

  return {
    id: text(o.id, 'boss.id'),
    name: text(o.name, 'boss.name'),
    width: num(o.width, 'boss.width', { min: 1 }),
    height: num(o.height, 'boss.height', { min: 1 }),
    startX: num(o.startX, 'boss.startX', { min: 0 }),
    maxHp: num(o.maxHp, 'boss.maxHp', { min: 1, integer: true }),
    spacing,
    approachTimeout: num(o.approachTimeout, 'boss.approachTimeout', { min: 1, integer: true }),
    predictability: num(o.predictability, 'boss.predictability', { min: 0, max: 1 }),
    counter,
    transitionTicks: num(o.transitionTicks, 'boss.transitionTicks', { min: 0, integer: true }),
    attacks,
    phases,
  };
}
```

`src/bosses/ember-duelist.json`:
```json
{
  "id": "ember-duelist",
  "name": "Ember Duelist",
  "width": 80,
  "height": 150,
  "startX": 960,
  "maxHp": 30,
  "spacing": { "min": 200, "max": 320 },
  "approachTimeout": 180,
  "predictability": 0.25,
  "counter": { "window": 12, "range": 200, "staggerTicks": 90, "damageMultiplier": 2 },
  "transitionTicks": 60,
  "attacks": [
    {
      "id": "slam",
      "name": "Ember slam",
      "pose": "raised",
      "class": "counterable",
      "windup": 30,
      "active": 6,
      "recovery": 30,
      "range": { "min": 90, "max": 140 },
      "hits": [{ "from": 30, "to": 36, "x0": 40, "x1": 150, "bottom": 0, "top": 180 }]
    },
    {
      "id": "sweep",
      "name": "Low sweep",
      "pose": "sideways",
      "class": "mustDodge",
      "windup": 24,
      "active": 8,
      "recovery": 24,
      "range": { "min": 110, "max": 200 },
      "hits": [{ "from": 24, "to": 32, "x0": 40, "x1": 250, "bottom": 0, "top": 100 }]
    },
    {
      "id": "lunge",
      "name": "Lunge",
      "pose": "back",
      "class": "mustDodge",
      "windup": 30,
      "active": 10,
      "recovery": 36,
      "range": { "min": 220, "max": 320 },
      "move": { "from": 30, "to": 40, "speed": 1500 },
      "hits": [{ "from": 30, "to": 40, "x0": 0, "x1": 90, "bottom": 0, "top": 150 }]
    },
    {
      "id": "burst",
      "name": "Ground burst",
      "pose": "down",
      "class": "mustDodge",
      "windup": 30,
      "active": 20,
      "recovery": 30,
      "range": { "min": 150, "max": 350 },
      "hits": [
        { "from": 30, "to": 34, "x0": 40, "x1": 140, "bottom": 0, "top": 50 },
        { "from": 34, "to": 38, "x0": 140, "x1": 240, "bottom": 0, "top": 50 },
        { "from": 38, "to": 42, "x0": 240, "x1": 340, "bottom": 0, "top": 50 },
        { "from": 42, "to": 46, "x0": 340, "x1": 440, "bottom": 0, "top": 50 },
        { "from": 46, "to": 50, "x0": 440, "x1": 540, "bottom": 0, "top": 50 }
      ]
    }
  ],
  "phases": [
    {
      "name": "Phase 1",
      "startsAtHpFraction": 1,
      "attacks": [
        { "id": "slam", "weight": 3 },
        { "id": "sweep", "weight": 3 },
        { "id": "lunge", "weight": 2 }
      ],
      "gap": 70,
      "maxChain": 1,
      "chainChance": 0,
      "walkSpeed": 190,
      "retreatSpeed": 150
    },
    {
      "name": "Phase 2",
      "startsAtHpFraction": 0.66,
      "attacks": [
        { "id": "slam", "weight": 2 },
        { "id": "sweep", "weight": 2 },
        { "id": "lunge", "weight": 2 },
        { "id": "burst", "weight": 3 }
      ],
      "opening": "burst",
      "gap": 40,
      "maxChain": 2,
      "chainChance": 0.5,
      "walkSpeed": 240,
      "retreatSpeed": 190
    }
  ]
}
```

`src/bosses/index.ts`:
```ts
import raw from './ember-duelist.json';
import { parseBoss } from './parse';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (the M1 suite plus the new files), typecheck exits 0. If `import raw from './ember-duelist.json'` is rejected by the installed TypeScript (for example a default-import error), adapt the import form while keeping `resolveJsonModule` on and report what you changed; do not add a dependency.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json src/bosses src/game/rng.ts tests/boss-parse.test.ts tests/rng.test.ts
git commit -m "feat: add the boss file format, the Ember Duelist file and seeded random numbers"
```

---

### Task 2: A boss entity replaces the dummy (static boss; migrate tests, geometry, UI)

After this task the game builds and runs against a boss that stands still and can be hit (the Duelist's behavior arrives in Tasks 3 to 5). The dummy and its sweep are gone.

**Files:**
- Modify: `src/game/state.ts` (replace whole file), `src/game/geometry.ts` (replace whole file), `src/game/step.ts` (replace whole file), `src/game/params.ts`, `src/ui/feedback.ts`, `src/ui/audio.ts`, `src/ui/render.ts`, `src/ui/app.ts`, `tests/helpers.ts` (replace whole file), `tests/state.test.ts`, `tests/geometry.test.ts`, `tests/step-movement.test.ts`, `tests/step-combat.test.ts`, `tests/feedback.test.ts`
- Delete: `tests/step-dummy.test.ts`

**Interfaces:**
- Consumes: `BossDef` (Task 1), `EMBER_DUELIST`, `nextRandom`.
- Produces:
  - `state.ts`: `BossMode`, `BossState`, `GameEvent`, `GameState`, `createInitialState(boss: BossDef, seed = 1): GameState`. `GameEvent` is `'bossHit' | 'playerHit' | 'dash' | 'bossWindupGold' | 'bossWindupRed' | 'counter' | 'phaseChange' | 'bossDefeated' | 'playerDefeated'`.
  - `geometry.ts`: `bossBox(b: BossState, boss: BossDef): Box` (the dummy functions are removed).
  - `step.ts`: `updatePlayer(p, input, events)`, `hurtPlayer(s: GameState): void`, `step(prev: GameState, input: InputFrame, boss: BossDef): GameState`.
  - `params.ts`: `DUMMY` removed; `FEEDBACK.freezeOnBossHit` and `FEEDBACK.bossFlashTicks` replace the dummy names.
  - `tests/helpers.ts`: `DUELIST`, `QUIET_BOSS`, `withInput`, `advance`, `run` as described in the conventions.

- [ ] **Step 1: Replace the state, geometry and step modules**

`src/game/state.ts`:
```ts
import type { BossDef } from '../bosses/schema';
import { PLAYER, WORLD } from './params';

export interface Buffered {
  jump: number;
  attack: number;
  dash: number;
}

export interface PlayerState {
  /** Horizontal centre and feet height, in world units (y grows downward). */
  x: number;
  y: number;
  /** Position before the last update, so the renderer can blend between updates. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  jumpCut: boolean;
  health: number;
  /** Updates of untouchability left after being hit. */
  invulnerableTicks: number;
  /** -1 when not attacking, otherwise updates since the swing began (0 on its first update). */
  attackTick: number;
  attackConnected: boolean;
  /** -1 when not dashing, otherwise updates since the dash began (0 on its first update). */
  dashTick: number;
  dashDir: 1 | -1;
  dashCooldown: number;
  /** Updates a recent press stays usable. */
  buffer: Buffered;
}

/**
 * What the boss is doing: `gap` (walking and keeping its distance, waiting to attack), `approach`
 * (walking into range of the attack it chose), `attack`, `stagger` (countered), `transition` (powering up between phases).
 */
export type BossMode = 'gap' | 'approach' | 'attack' | 'stagger' | 'transition';

export interface BossState {
  /** Horizontal centre, in world units; the boss always stands on the floor. */
  x: number;
  facing: 1 | -1;
  hp: number;
  /** Index into the boss definition's phases. */
  phase: number;
  mode: BossMode;
  /** Updates spent in the current mode (0 on the update the mode began). */
  modeTick: number;
  /** The attack being performed (mode `attack`), and updates since it began (0 on its first update). */
  attackId: string | null;
  attackTick: number;
  /** The attack chosen while walking into range (mode `approach`). */
  pendingAttackId: string | null;
  /** Attacks still to follow straight after the current one. */
  chainLeft: number;
  /** The last two attacks started, to avoid three of the same in a row. */
  lastAttacks: string[];
  /** Position in the phase's attack list used when following the fixed cycle. */
  cycleIndex: number;
}

export type GameEvent =
  | 'bossHit'
  | 'playerHit'
  | 'dash'
  | 'bossWindupGold'
  | 'bossWindupRed'
  | 'counter'
  | 'phaseChange'
  | 'bossDefeated'
  | 'playerDefeated';

export interface GameState {
  tick: number;
  /** `defeated` and `victory` freeze the fight for `endTicks` updates, then a new fight starts. */
  phase: 'fight' | 'defeated' | 'victory';
  endTicks: number;
  player: PlayerState;
  boss: BossState;
  /** Events produced by the last update. */
  events: GameEvent[];
  /** State of the seeded random generator; advances only when the boss makes a random choice. */
  rng: number;
  /** The seed this fight started from, kept so it can be replayed and recorded. */
  seed: number;
}

export function createInitialState(boss: BossDef, seed = 1): GameState {
  const start = seed >>> 0;
  return {
    tick: 0,
    phase: 'fight',
    endTicks: 0,
    player: {
      x: PLAYER.startX,
      y: WORLD.floorY,
      prevX: PLAYER.startX,
      prevY: WORLD.floorY,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      jumpCut: false,
      health: PLAYER.maxHealth,
      invulnerableTicks: 0,
      attackTick: -1,
      attackConnected: false,
      dashTick: -1,
      dashDir: 1,
      dashCooldown: 0,
      buffer: { jump: 0, attack: 0, dash: 0 },
    },
    boss: {
      x: boss.startX,
      facing: -1,
      hp: boss.maxHp,
      phase: 0,
      mode: 'gap',
      modeTick: 0,
      attackId: null,
      attackTick: 0,
      pendingAttackId: null,
      chainLeft: 0,
      lastAttacks: [],
      cycleIndex: 0,
    },
    events: [],
    rng: start,
    seed: start,
  };
}
```

`src/game/geometry.ts`:
```ts
import type { BossDef } from '../bosses/schema';
import { PLAYER, WORLD } from './params';
import type { BossState, PlayerState } from './state';

/** Top-left corner plus size, in world units (y grows downward). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function playerBox(p: PlayerState): Box {
  return { x: p.x - PLAYER.width / 2, y: p.y - PLAYER.height, w: PLAYER.width, h: PLAYER.height };
}

export function bossBox(b: BossState, boss: BossDef): Box {
  return {
    x: b.x - boss.width / 2,
    y: WORLD.floorY - boss.height,
    w: boss.width,
    h: boss.height,
  };
}

/** The area the player's swing hits: in front of the player, centred vertically on the body. */
export function attackBox(p: PlayerState): Box {
  const { reach, height } = PLAYER.attack;
  const x = p.facing === 1 ? p.x + PLAYER.width / 2 : p.x - PLAYER.width / 2 - reach;
  return { x, y: p.y - PLAYER.height / 2 - height / 2, w: reach, h: height };
}

/** True only during the swing's active updates (after start-up, before recovery). */
export function attackActive(p: PlayerState): boolean {
  const { startup, active } = PLAYER.attack;
  return p.attackTick >= startup && p.attackTick < startup + active;
}

/** Untouchable after a hit, and for the whole dash. */
export function isInvulnerable(p: PlayerState): boolean {
  return p.invulnerableTicks > 0 || p.dashTick >= 0;
}
```

`src/game/step.ts` (the player code is unchanged from M1; the dummy code is replaced):
```ts
import type { BossDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { attackActive, attackBox, bossBox, overlaps } from './geometry';
import { GAME, PLAYER, WORLD } from './params';
import { nextRandom } from './rng';
import {
  createInitialState,
  type GameEvent,
  type GameState,
  type PlayerState,
} from './state';

const ATTACK_TOTAL = PLAYER.attack.startup + PLAYER.attack.active + PLAYER.attack.recovery;

/**
 * Moves the player one update: input buffers, timers, dash, attack, run, jump
 * (with an early-release cut), gravity, walls and floor.
 */
export function updatePlayer(p: PlayerState, input: InputFrame, events: GameEvent[]): void {
  p.prevX = p.x;
  p.prevY = p.y;

  p.buffer.jump = input.jumpPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.jump - 1);
  p.buffer.attack = input.attackPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.attack - 1);
  p.buffer.dash = input.dashPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.dash - 1);

  if (p.invulnerableTicks > 0) p.invulnerableTicks -= 1;
  if (p.dashCooldown > 0) p.dashCooldown -= 1;

  if (p.dashTick >= 0) {
    p.dashTick += 1;
    if (p.dashTick >= PLAYER.dash.duration) {
      p.dashTick = -1;
      p.dashCooldown = PLAYER.dash.cooldown;
    }
  }
  if (p.attackTick >= 0) {
    p.attackTick += 1;
    if (p.attackTick >= ATTACK_TOTAL) p.attackTick = -1;
  }

  // The facing direction follows the stick, except during a swing or a dash.
  if (p.attackTick < 0 && p.dashTick < 0 && input.moveX !== 0) {
    p.facing = input.moveX > 0 ? 1 : -1;
  }

  if (p.buffer.dash > 0 && p.dashTick < 0 && p.dashCooldown === 0) {
    const dir = input.moveX !== 0 ? (input.moveX > 0 ? 1 : -1) : p.facing;
    p.dashTick = 0;
    p.dashDir = dir;
    p.facing = dir;
    p.attackTick = -1;
    p.buffer.dash = 0;
    events.push('dash');
  }
  if (p.buffer.attack > 0 && p.attackTick < 0 && p.dashTick < 0) {
    p.attackTick = 0;
    p.attackConnected = false;
    p.buffer.attack = 0;
  }

  if (p.dashTick >= 0) {
    p.vx = p.dashDir * PLAYER.dash.speed;
    p.vy = 0;
  } else {
    const speedFactor = p.attackTick >= 0 ? PLAYER.attack.moveFactor : 1;
    p.vx = input.moveX * PLAYER.runSpeed * speedFactor;
    p.vy = Math.min(p.vy + PLAYER.gravity * DT, PLAYER.maxFallSpeed);

    if (p.buffer.jump > 0 && p.onGround) {
      p.vy = -PLAYER.jumpSpeed;
      p.onGround = false;
      p.jumpCut = false;
      p.buffer.jump = 0;
    }
    if (!p.onGround && p.vy < 0 && !input.jumpHeld && !p.jumpCut) {
      p.vy *= PLAYER.jumpReleaseFactor;
      p.jumpCut = true;
    }
  }

  p.x += p.vx * DT;
  p.y += p.vy * DT;

  const half = PLAYER.width / 2;
  p.x = Math.min(Math.max(p.x, half), WORLD.width - half);

  if (p.y >= WORLD.floorY) {
    p.y = WORLD.floorY;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }
}

/** The player takes one hit. The last hit ends the fight. */
export function hurtPlayer(s: GameState): void {
  const p = s.player;
  p.health -= 1;
  p.invulnerableTicks = PLAYER.hitInvulnerability;
  s.events.push('playerHit');
  if (p.health <= 0) {
    p.health = 0;
    s.phase = 'defeated';
    s.endTicks = GAME.defeatRestartTicks;
    s.events.push('playerDefeated');
  }
}

/** The player's swing hurts the boss once per swing. */
function resolvePlayerAttack(s: GameState, boss: BossDef): void {
  const { player: p, boss: b } = s;
  if (attackActive(p) && !p.attackConnected && overlaps(attackBox(p), bossBox(b, boss))) {
    p.attackConnected = true;
    b.hp = Math.max(0, b.hp - 1);
    s.events.push('bossHit');
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame, boss: BossDef): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;

  if (s.phase !== 'fight') {
    s.endTicks -= 1;
    // The player is frozen: without this the renderer would keep blending from the last move.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    // The next fight gets a new seed derived from this one, so it plays out differently but stays reproducible.
    return s.endTicks <= 0 ? createInitialState(boss, nextRandom(s.rng).state) : s;
  }

  updatePlayer(s.player, input, s.events);
  resolvePlayerAttack(s, boss);
  return s;
}
```

- [ ] **Step 2: Update params, feedback, audio**

`src/game/params.ts`: delete the whole `DUMMY` export. In `FEEDBACK` rename `freezeOnDummyHit` to `freezeOnBossHit` and `dummyFlashTicks` to `bossFlashTicks` (values unchanged). Change nothing else.

`src/ui/feedback.ts`: rename `dummyFlashTicks` to `bossFlashTicks` in `FeedbackState`, `NO_FEEDBACK`, `applyEvents` and `advanceFeedback`; the event `'dummyHit'` becomes `'bossHit'` in `freezeFor` and `applyEvents`; `FEEDBACK.freezeOnDummyHit` becomes `FEEDBACK.freezeOnBossHit`, `FEEDBACK.dummyFlashTicks` becomes `FEEDBACK.bossFlashTicks`. Behavior is otherwise unchanged (Task 6 adds the new events).

`src/ui/audio.ts`: in `play`, change the event names: `'dummyHit'` becomes `'bossHit'`; the line for `'dummyWindup'` is replaced by two lines with the same beep for now: `if (event === 'bossWindupGold') beep(440, 120, 'sine', 0.12);` and `if (event === 'bossWindupRed') beep(440, 120, 'sine', 0.12);` (Task 6 gives them their own sounds).

- [ ] **Step 3: Update rendering and the app so everything compiles**

`src/ui/render.ts`:
- Imports: replace `import { attackActive, attackBox, sweepBox } from '../game/geometry';` with `import { attackActive, attackBox } from '../game/geometry';`; replace `import { DUMMY, PLAYER, WORLD } from '../game/params';` with `import { PLAYER, WORLD } from '../game/params';`; replace `import type { DummyPhase, GameState } from '../game/state';` with `import type { GameState } from '../game/state';`; add `import type { BossDef } from '../bosses/schema';`.
- In `COLORS`, delete the four `dummy*` entries and add `boss: '#c8642a',` and `bossHp: '#e0403a',`.
- Delete `dummyColor` and `drawDummy`; add:
```ts
function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: BossDef,
  feedback: FeedbackState,
): void {
  const b = state.boss;
  ctx.fillStyle = feedback.bossFlashTicks > 0 ? COLORS.flash : COLORS.boss;
  ctx.fillRect(b.x - boss.width / 2, WORLD.floorY - boss.height, boss.width, boss.height);
}
```
- `drawHud` gets a `boss: BossDef` parameter; its bar becomes `ctx.fillStyle = COLORS.bossHp; ctx.fillRect(left, 24, (width * state.boss.hp) / boss.maxHp, 14);`.
- `drawFrame` gets a `boss: BossDef` parameter right after `state` (so the order is `ctx, canvasWidth, canvasHeight, state, boss, alpha, feedback`); it calls `drawBoss(ctx, state, boss, feedback)` and `drawHud(ctx, state, boss)`.

`src/ui/app.ts`:
- Add `import { EMBER_DUELIST } from '../bosses';`.
- `let state: GameState = createInitialState();` becomes `let state: GameState = createInitialState(EMBER_DUELIST);`; in `startFight`, `state = createInitialState();` becomes `state = createInitialState(EMBER_DUELIST);` (Task 7 adds a random seed).
- `state = step(state, applyPresses(input, pending));` becomes `state = step(state, applyPresses(input, pending), EMBER_DUELIST);`.
- `drawFrame(context, width, height, state, alpha, feedback);` becomes `drawFrame(context, width, height, state, EMBER_DUELIST, alpha, feedback);`.
- The button texts `'Fight the dummy'` and `'Fight the dummy (bottom button)'` become `'Fight the Ember Duelist'` and `'Fight the Ember Duelist (bottom button)'`.

- [ ] **Step 4: Replace the test helpers and migrate the tests**

`tests/helpers.ts`:
```ts
import { EMBER_DUELIST } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import type { GameState } from '../src/game/state';

/** The real Ember Duelist. */
export const DUELIST: BossDef = EMBER_DUELIST;

/**
 * The Duelist with no attacks and no walking: a stationary target for tests about the player.
 * (It skips the validator on purpose; it is only ever used by tests.)
 */
export const QUIET_BOSS: BossDef = {
  ...EMBER_DUELIST,
  spacing: { min: 0, max: 1e9 },
  phases: EMBER_DUELIST.phases.map((phase) => ({ ...phase, attacks: [] })),
};

export const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

/** Runs `count` updates with the same input and returns the final state. */
export function advance(
  state: GameState,
  count: number,
  input: InputFrame = NO_INPUT,
  boss: BossDef = QUIET_BOSS,
): GameState {
  let s = state;
  for (let i = 0; i < count; i++) s = step(s, input, boss);
  return s;
}

/** Runs updates numbered 1..count, asking `inputFor(n)` for update n, and returns every resulting state (index 0 is update 1). */
export function run(
  state: GameState,
  count: number,
  inputFor: (update: number) => InputFrame,
  boss: BossDef = QUIET_BOSS,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= count; n++) {
    s = step(s, inputFor(n), boss);
    states.push(s);
  }
  return states;
}
```

Migrate the existing tests mechanically (read each file first; keep every assertion's meaning, and keep the numbers derived from `params.ts`/the boss file):
- **All test files that call `createInitialState()`** (`step-movement`, `step-combat`, `geometry`, `state`): import `QUIET_BOSS` (and `DUELIST` where the real boss is meant) from `./helpers` and call `createInitialState(QUIET_BOSS)`. Every direct `step(state, input)` call gets `QUIET_BOSS` as third argument.
- `tests/state.test.ts`: replace the dummy test with a boss test and add a seed test (keep the other two tests, calling `createInitialState(DUELIST)`):
```ts
it('starts the boss waiting at its start position with full health', () => {
  const s = createInitialState(DUELIST);
  expect(s.boss.x).toBe(DUELIST.startX);
  expect(s.boss.hp).toBe(DUELIST.maxHp);
  expect(s.boss.phase).toBe(0);
  expect(s.boss.mode).toBe('gap');
  expect(s.boss.modeTick).toBe(0);
  expect(s.boss.attackId).toBeNull();
  expect(s.boss.pendingAttackId).toBeNull();
  expect(s.boss.lastAttacks).toEqual([]);
});

it('records the seed and starts the random generator from it', () => {
  const s = createInitialState(DUELIST, 1234);
  expect(s.seed).toBe(1234);
  expect(s.rng).toBe(1234);
  expect(createInitialState(DUELIST).seed).toBe(1);
});
```
- `tests/geometry.test.ts`: `dummyBox` becomes `bossBox`; the box test becomes
```ts
it('places the boss box on the floor', () => {
  const b = createInitialState(DUELIST).boss;
  expect(bossBox(b, DUELIST)).toEqual({
    x: DUELIST.startX - DUELIST.width / 2,
    y: WORLD.floorY - DUELIST.height,
    w: DUELIST.width,
    h: DUELIST.height,
  });
});
```
  and the `DUMMY` import is removed.
- `tests/step-combat.test.ts`: `quiet()` returns `createInitialState(QUIET_BOSS)` (drop the `nextSweepIn` line); `IN_REACH_X` uses `QUIET_BOSS.startX` and `QUIET_BOSS.width` in place of `DUMMY.x` and `DUMMY.width`; the event `'dummyHit'` becomes `'bossHit'`; test titles say "boss" instead of "dummy"; the "refills the dummy display health" test becomes "takes one hit point off the boss per swing": start with the boss at full health, swing once in reach, expect `boss.hp` to equal `QUIET_BOSS.maxHp - 1` after the hit update.
- `tests/feedback.test.ts`: `'dummyHit'` becomes `'bossHit'`; `FEEDBACK.freezeOnDummyHit` becomes `FEEDBACK.freezeOnBossHit`; `dummyFlashTicks` becomes `bossFlashTicks`.
- Delete `tests/step-dummy.test.ts` with `git rm` (its coverage returns as boss tests in Tasks 3 to 5).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build && npm run check:dist`
Expected: all exit 0 (the test count is lower than before because the dummy tests are gone). No reference to `dummy`, `Dummy` or `DUMMY` remains under `src/` or `tests/` (run `grep -rni dummy src tests` and show it is empty, apart from prose in comments you rewrote).

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "refactor: replace the training dummy with a boss entity driven by a boss file"
```

---

### Task 3: The Duelist walks, chooses attacks, attacks and hurts the player (TDD)

**Files:**
- Create: `src/game/boss.ts`
- Modify: `src/game/geometry.ts` (append `activeHitBoxes`), `src/game/step.ts` (wire the boss in)
- Test: `tests/step-boss.test.ts`, `tests/geometry.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: from `boss.ts`: `attackById(boss, id): AttackDef`, `attackLength(attack): number`, `updateBoss(s: GameState, boss: BossDef): void` (mutates the cloned state `s`; Tasks 4 and 5 add the `stagger` and `transition` modes). From `geometry.ts`: `activeHitBoxes(b: BossState, boss: BossDef): Box[]`. `step` now runs the boss and resolves boss hits on the player (event `playerHit`, defeat, restart). Events emitted: `bossWindupGold`, `bossWindupRed`, `playerHit`, `playerDefeated`.

Boss behavior (per update, after the player's update): in `gap` mode the boss faces the player, walks toward them if farther than `spacing.max` or backs away if closer than `spacing.min`, and once `phase.gap` updates have passed in the mode it chooses an attack (weighted random with the rules below) and enters `approach`. In `approach` it walks toward or away from the player until the distance is inside the attack's `range`, then starts the attack (or starts it anyway after `approachTimeout` updates). An attack runs `windup + active + recovery` updates; hit boxes are active per their windows; a `move` carries the boss forward. After an attack the boss chains straight into another (skipping the gap) while `chainLeft > 0`, otherwise returns to `gap`. Choosing: draw two random numbers (always both, so the sequence does not depend on the branch); the pool excludes an attack that was just used twice in a row (unless that leaves nothing); with probability `predictability` follow the fixed cycle through the phase's list, otherwise pick by weight.

- [ ] **Step 1: Write the failing tests**

Append to `tests/geometry.test.ts` (add `activeHitBoxes` to its imports from `../src/game/geometry`; `DUELIST` and `WORLD` are already imported or import them from `./helpers` and `../src/game/params`):
```ts
describe('activeHitBoxes', () => {
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const hit = slam.hits[0]!;
  const bossAt = (tick: number, facing: 1 | -1) => {
    const b = createInitialState(DUELIST).boss;
    b.mode = 'attack';
    b.attackId = 'slam';
    b.attackTick = tick;
    b.facing = facing;
    return b;
  };
  const size = { y: WORLD.floorY - hit.top, w: hit.x1 - hit.x0, h: hit.top - hit.bottom };

  it('is empty when the boss is not attacking', () => {
    expect(activeHitBoxes(createInitialState(DUELIST).boss, DUELIST)).toEqual([]);
  });

  it('is empty before and after the hit window', () => {
    expect(activeHitBoxes(bossAt(hit.from - 1, -1), DUELIST)).toEqual([]);
    expect(activeHitBoxes(bossAt(hit.to, -1), DUELIST)).toEqual([]);
  });

  it('places the box on the side the boss faces, measured from its centre', () => {
    expect(activeHitBoxes(bossAt(hit.from, -1), DUELIST)).toEqual([
      { x: DUELIST.startX - hit.x1, ...size },
    ]);
    expect(activeHitBoxes(bossAt(hit.to - 1, 1), DUELIST)).toEqual([
      { x: DUELIST.startX + hit.x0, ...size },
    ]);
  });
});
```

`tests/step-boss.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { GAME, PLAYER, WORLD } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { DUELIST, run, withInput } from './helpers';

const isWindup = (e: GameEvent): boolean => e === 'bossWindupGold' || e === 'bossWindupRed';
const windupUpdates = (states: GameState[]): number[] =>
  states.flatMap((s, i) => (s.events.some(isWindup) ? [i + 1] : []));
const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));
const attackIds = (states: GameState[]): string[] =>
  states.flatMap((s) => (s.events.some(isWindup) ? [s.boss.attackId ?? ''] : []));

/** The real boss with its attacks removed: it walks and keeps its distance but never attacks. */
const WALKER: BossDef = {
  ...DUELIST,
  phases: DUELIST.phases.map((p) => ({ ...p, attacks: [] })),
};

/** The real boss using only attack `id`, starting a new attack one update after the last one ends, never walking. */
function solo(id: string): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    phases: DUELIST.phases.map((p) => ({
      ...p,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id, weight: 1 }],
    })),
  };
}

/** The real boss with every attack usable from any distance and no walking, so a test decides when it strikes. */
function anywhere(): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    attacks: DUELIST.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
  };
}

/** A fresh fight with the player `distance` units to the left of the boss. */
function standAt(boss: BossDef, distance: number, seed = 1): GameState {
  const s = createInitialState(boss, seed);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

describe('walking', () => {
  it('walks towards a far player until it is at its keeping distance', () => {
    const s = createInitialState(WALKER);
    s.player.x = 100;
    s.player.prevX = 100;
    const last = run(s, 300, () => NO_INPUT, WALKER)[299]!;
    const distance = Math.abs(last.player.x - last.boss.x);
    expect(distance).toBeGreaterThan(DUELIST.spacing.min - 6);
    expect(distance).toBeLessThan(DUELIST.spacing.max + 6);
  });

  it('backs away from a player who is too close', () => {
    const last = run(standAt(WALKER, 100), 200, () => NO_INPUT, WALKER)[199]!;
    const distance = Math.abs(last.player.x - last.boss.x);
    expect(distance).toBeGreaterThan(DUELIST.spacing.min - 6);
    expect(distance).toBeLessThan(DUELIST.spacing.max + 6);
  });

  it('always faces the player', () => {
    const left = run(standAt(WALKER, 250), 1, () => NO_INPUT, WALKER)[0]!;
    expect(left.boss.facing).toBe(-1);
    const s = createInitialState(WALKER);
    s.player.x = 1250;
    s.player.prevX = 1250;
    expect(run(s, 1, () => NO_INPUT, WALKER)[0]!.boss.facing).toBe(1);
  });

  it('stays inside the arena when backed against a wall', () => {
    const s = createInitialState(WALKER);
    s.boss.x = 1230;
    s.player.x = 1200;
    s.player.prevX = 1200;
    const states = run(s, 200, () => NO_INPUT, WALKER);
    const limit = WORLD.width - DUELIST.width / 2;
    expect(states.every((st) => st.boss.x <= limit && st.boss.x >= DUELIST.width / 2)).toBe(true);
    expect(states[199]!.boss.x).toBe(limit);
  });
});

const CASES = [
  { id: 'slam', distance: 120 },
  { id: 'sweep', distance: 150 },
  { id: 'lunge', distance: 270 },
  { id: 'burst', distance: 250 },
];

describe.each(CASES)('the $id attack', ({ id, distance }) => {
  const boss = solo(id);
  const attack = DUELIST.attacks.find((a) => a.id === id)!;
  const states = run(standAt(boss, distance), 200, () => NO_INPUT, boss);
  const winds = windupUpdates(states);
  const first = winds[0]!;

  it('is announced by a warning event of its class', () => {
    const event: GameEvent = attack.class === 'counterable' ? 'bossWindupGold' : 'bossWindupRed';
    const at = states[first - 1]!;
    expect(at.events).toContain(event);
    expect(at.boss.mode).toBe('attack');
    expect(at.boss.attackId).toBe(id);
  });

  it('first hurts the player inside its active updates, never before', () => {
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(hit).toBeGreaterThanOrEqual(first + attack.windup);
    expect(hit).toBeLessThan(first + attack.windup + attack.active);
  });
});

describe.each(CASES.filter((c) => c.id !== 'lunge'))('the $id attack timing', ({ id, distance }) => {
  const boss = solo(id);
  const attack = DUELIST.attacks.find((a) => a.id === id)!;
  const winds = windupUpdates(run(standAt(boss, distance), 200, () => NO_INPUT, boss));

  it('is followed by the next one after its length plus the gap', () => {
    // The attack ends, the boss waits one update (gap 1), chooses, then starts on the next update.
    expect(winds[1]).toBe(winds[0]! + attackLength(attack) + 2);
  });
});

describe('the lunge', () => {
  it('carries the boss forward by its speed times its length', () => {
    const boss = solo('lunge');
    const move = DUELIST.attacks.find((a) => a.id === 'lunge')!.move!;
    const states = run(standAt(boss, 270), 120, () => NO_INPUT, boss);
    const first = windupUpdates(states)[0]!;
    const after = states[first - 1 + move.to]!;
    expect(after.boss.x).toBeCloseTo(DUELIST.startX - (move.speed * (move.to - move.from)) / 60, 3);
  });
});

describe('dodging', () => {
  const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
  const sweepBoss = solo('sweep');
  const dry = run(standAt(sweepBoss, 150), 120, () => NO_INPUT, sweepBoss);
  const first = windupUpdates(dry)[0]!;
  const hitStart = first + sweep.windup;
  const attackEnd = first + attackLength(sweep);
  const hitsInFirstAttack = (states: GameState[]): number[] =>
    updatesWith(states.slice(0, attackEnd), 'playerHit');

  it('standing still is hurt by the sweep on its first active update', () => {
    expect(hitsInFirstAttack(dry)).toEqual([hitStart]);
  });

  it('a jump timed for the warning clears the low sweep', () => {
    const jumpAt = hitStart - 13;
    const states = run(
      standAt(sweepBoss, 150),
      attackEnd,
      (n) => withInput({ jumpPressed: n === jumpAt, jumpHeld: n >= jumpAt && n <= hitStart + 20 }),
      sweepBoss,
    );
    expect(hitsInFirstAttack(states)).toEqual([]);
  });

  it('a dash through the sweep is untouchable', () => {
    const dashAt = hitStart - 2;
    const states = run(
      standAt(sweepBoss, 150),
      attackEnd,
      (n) => withInput({ dashPressed: n === dashAt, moveX: n === dashAt ? 1 : 0 }),
      sweepBoss,
    );
    expect(hitsInFirstAttack(states)).toEqual([]);
  });

  it('the tall slam cannot be jumped over', () => {
    const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
    const slamBoss = solo('slam');
    const slamDry = run(standAt(slamBoss, 120), 60, () => NO_INPUT, slamBoss);
    const slamHit = windupUpdates(slamDry)[0]! + slam.windup;
    const jumpAt = slamHit - 13;
    const states = run(
      standAt(slamBoss, 120),
      slamHit,
      (n) => withInput({ jumpPressed: n === jumpAt, jumpHeld: n >= jumpAt }),
      slamBoss,
    );
    expect(updatesWith(states, 'playerHit')).toEqual([slamHit]);
  });

  it('the ground burst can be jumped over', () => {
    const burst = DUELIST.attacks.find((a) => a.id === 'burst')!;
    const burstBoss = solo('burst');
    const burstDry = run(standAt(burstBoss, 250), 120, () => NO_INPUT, burstBoss);
    const burstFirst = windupUpdates(burstDry)[0]!;
    // The boxes that reach a player 250 units away are the second and third; jump so the player is high for both.
    const jumpAt = burstFirst + burst.hits[1]!.from - 9;
    const states = run(
      standAt(burstBoss, 250),
      burstFirst + attackLength(burst),
      (n) => withInput({ jumpPressed: n === jumpAt, jumpHeld: n >= jumpAt && n <= jumpAt + 30 }),
      burstBoss,
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
  });
});

describe('choosing attacks', () => {
  /** A copy of `anywhere()` whose phases all use `attacks` with no gap and no chaining. */
  function pick(attacks: { id: string; weight: number }[], predictability: number): BossDef {
    const base = anywhere();
    return {
      ...base,
      predictability,
      phases: base.phases.map((p) => ({ ...p, gap: 1, maxChain: 1, chainChance: 0, attacks })),
    };
  }
  /** The player stays near and is given plenty of health so the fight goes on. */
  function arena(boss: BossDef, seed: number): GameState {
    const s = standAt(boss, 120, seed);
    s.player.health = 1000;
    return s;
  }

  it('never uses the same attack three times in a row', () => {
    const boss = pick([{ id: 'slam', weight: 100 }, { id: 'sweep', weight: 1 }], 0);
    const ids = attackIds(run(arena(boss, 42), 3000, () => NO_INPUT, boss));
    expect(ids.length).toBeGreaterThan(20);
    for (let i = 2; i < ids.length; i++) {
      expect(ids[i] === ids[i - 1] && ids[i] === ids[i - 2]).toBe(false);
    }
    expect(ids.filter((id) => id === 'sweep').length).toBeGreaterThan(5);
  });

  it('with predictability 1 cycles through the list in order', () => {
    const order = ['slam', 'sweep', 'lunge'];
    const boss = pick(order.map((id) => ({ id, weight: 1 })), 1);
    const ids = attackIds(run(arena(boss, 7), 900, () => NO_INPUT, boss));
    expect(ids.slice(0, 6)).toEqual([...order, ...order]);
  });

  it('gives the same order for the same seed and a different order for another seed', () => {
    const boss = pick(
      ['slam', 'sweep', 'lunge'].map((id) => ({ id, weight: 1 })),
      0,
    );
    const play = (seed: number): string[] => attackIds(run(arena(boss, seed), 1500, () => NO_INPUT, boss));
    expect(play(5)).toEqual(play(5));
    expect(play(5)).not.toEqual(play(6));
  });
});

describe('defeat and restart', () => {
  const boss = solo('slam');
  const start = (): GameState => {
    const s = standAt(boss, 120);
    s.player.health = 1;
    return s;
  };
  const states = run(start(), 200, () => NO_INPUT, boss);
  const hit = updatesWith(states, 'playerHit')[0]!;

  it('ends the fight when the last hit lands', () => {
    expect(states[hit - 1]!.phase).toBe('defeated');
    expect(states[hit - 1]!.player.health).toBe(0);
    expect(states[hit - 1]!.events).toContain('playerDefeated');
  });

  it('freezes the boss and the player during the pause', () => {
    expect(states[hit + 10]!.boss).toEqual(states[hit - 1]!.boss);
    expect(states[hit + 10]!.player.prevX).toBe(states[hit + 10]!.player.x);
  });

  it('restarts a fresh fight with a new seed exactly the pause length later', () => {
    expect(states[hit + GAME.defeatRestartTicks - 2]!.phase).toBe('defeated');
    const fresh = states[hit + GAME.defeatRestartTicks - 1]!;
    expect(fresh.phase).toBe('fight');
    expect(fresh.tick).toBe(0);
    expect(fresh.player.health).toBe(PLAYER.maxHealth);
    expect(fresh.boss.hp).toBe(boss.maxHp);
    expect(fresh.boss.mode).toBe('gap');
    expect(fresh.seed).not.toBe(states[0]!.seed);
  });
});

describe('purity', () => {
  it('does not change the state it is given while the boss acts', () => {
    const boss = solo('lunge');
    let s = standAt(boss, 270);
    for (let i = 0; i < 60; i++) s = step(s, NO_INPUT, boss);
    const snapshot = JSON.stringify(s);
    step(s, NO_INPUT, boss);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/step-boss.test.ts tests/geometry.test.ts`
Expected: FAIL (`activeHitBoxes` and `../src/game/boss` do not exist yet).

- [ ] **Step 3: Append `activeHitBoxes` to `src/game/geometry.ts`**

```ts

/** The boxes that hurt the player right now: the active hit windows of the attack the boss is performing. */
export function activeHitBoxes(b: BossState, boss: BossDef): Box[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const attack = boss.attacks.find((a) => a.id === b.attackId);
  if (attack === undefined) return [];
  return attack.hits
    .filter((hit) => b.attackTick >= hit.from && b.attackTick < hit.to)
    .map((hit) => ({
      x: b.facing === 1 ? b.x + hit.x0 : b.x - hit.x1,
      y: WORLD.floorY - hit.top,
      w: hit.x1 - hit.x0,
      h: hit.top - hit.bottom,
    }));
}
```

- [ ] **Step 4: Create `src/game/boss.ts`**

```ts
import type { AttackDef, BossDef, PhaseDef } from '../bosses/schema';
import { DT } from '../engine/time';
import { WORLD } from './params';
import { nextRandom } from './rng';
import type { BossState, GameState } from './state';

export function attackById(boss: BossDef, id: string): AttackDef {
  const found = boss.attacks.find((attack) => attack.id === id);
  if (found === undefined) throw new Error(`Boss "${boss.id}" has no attack "${id}"`);
  return found;
}

/** Updates from the first update of an attack until it is over. */
export const attackLength = (attack: AttackDef): number =>
  attack.windup + attack.active + attack.recovery;

/** One draw from the fight's seeded generator. */
function draw(s: GameState): number {
  const next = nextRandom(s.rng);
  s.rng = next.state;
  return next.value;
}

function enterGap(b: BossState): void {
  b.mode = 'gap';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
}

function faceTarget(b: BossState, targetX: number): void {
  b.facing = targetX < b.x ? -1 : 1;
}

function moveBoss(b: BossState, boss: BossDef, direction: 1 | -1, speed: number): void {
  const half = boss.width / 2;
  b.x = Math.min(Math.max(b.x + direction * speed * DT, half), WORLD.width - half);
}

/**
 * Picks the next attack from the phase's list: never the same attack three times in a row, and with
 * probability `predictability` the next one in the fixed cycle, otherwise by weight. Both random numbers
 * are always drawn so the sequence does not depend on which branch is taken.
 */
function chooseAttack(s: GameState, boss: BossDef, phase: PhaseDef): string | null {
  if (phase.attacks.length === 0) return null;
  const b = s.boss;
  const followCycle = draw(s) < boss.predictability;
  const weightRoll = draw(s);

  const allowed = phase.attacks.filter(
    (entry) => !(b.lastAttacks.length >= 2 && b.lastAttacks.every((id) => id === entry.id)),
  );
  const pool = allowed.length > 0 ? allowed : phase.attacks;

  if (followCycle) {
    for (let i = 0; i < phase.attacks.length; i++) {
      const index = (b.cycleIndex + i) % phase.attacks.length;
      const entry = phase.attacks[index];
      if (entry !== undefined && pool.includes(entry)) {
        b.cycleIndex = (index + 1) % phase.attacks.length;
        return entry.id;
      }
    }
  }

  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = weightRoll * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry.id;
  }
  return pool[pool.length - 1]?.id ?? null;
}

/** How many attacks follow straight after the one about to start (none when `maxChain` is 1). */
function planChain(s: GameState, phase: PhaseDef): number {
  return draw(s) < phase.chainChance ? phase.maxChain - 1 : 0;
}

function startAttack(s: GameState, boss: BossDef, id: string): void {
  const b = s.boss;
  const attack = attackById(boss, id);
  b.mode = 'attack';
  b.modeTick = 0;
  b.attackId = id;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.lastAttacks = [...b.lastAttacks, id].slice(-2);
  s.events.push(attack.class === 'counterable' ? 'bossWindupGold' : 'bossWindupRed');
}

function updateGap(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  const p = s.player;
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
  if (b.modeTick >= phase.gap) {
    const id = chooseAttack(s, boss, phase);
    if (id !== null) {
      b.pendingAttackId = id;
      b.chainLeft = planChain(s, phase);
      b.mode = 'approach';
      b.modeTick = 0;
    }
  }
}

function updateApproach(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  const p = s.player;
  const id = b.pendingAttackId;
  if (id === null) {
    enterGap(b);
    return;
  }
  const attack = attackById(boss, id);
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const inRange = distance >= attack.range.min && distance <= attack.range.max;
  if (inRange || b.modeTick >= boss.approachTimeout) {
    startAttack(s, boss, id);
    return;
  }
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  if (distance > attack.range.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
}

/** After an attack: straight into the next one of a chain, otherwise back to waiting. */
function finishAttack(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  if (b.chainLeft > 0) {
    const id = chooseAttack(s, boss, phase);
    if (id !== null) {
      b.chainLeft -= 1;
      b.attackId = null;
      b.attackTick = 0;
      b.pendingAttackId = id;
      b.mode = 'approach';
      b.modeTick = 0;
      return;
    }
  }
  b.chainLeft = 0;
  enterGap(b);
}

function updateAttack(s: GameState, boss: BossDef, phase: PhaseDef): void {
  const b = s.boss;
  if (b.attackId === null) {
    enterGap(b);
    return;
  }
  const attack = attackById(boss, b.attackId);
  b.attackTick += 1;
  const move = attack.move;
  if (move !== undefined && b.attackTick >= move.from && b.attackTick < move.to) {
    moveBoss(b, boss, b.facing, move.speed);
  }
  if (b.attackTick >= attackLength(attack)) finishAttack(s, boss, phase);
}

/** Moves the boss one update. Mutates the (already cloned) state. */
export function updateBoss(s: GameState, boss: BossDef): void {
  const b = s.boss;
  const phase = boss.phases[b.phase];
  if (phase === undefined) return;
  b.modeTick += 1;
  switch (b.mode) {
    case 'gap':
      updateGap(s, boss, phase);
      break;
    case 'approach':
      updateApproach(s, boss, phase);
      break;
    case 'attack':
      updateAttack(s, boss, phase);
      break;
    default:
      // Stagger and transition are added in later tasks.
      break;
  }
}
```

- [ ] **Step 5: Wire the boss into `src/game/step.ts`**

Change the imports to
```ts
import { updateBoss } from './boss';
import { activeHitBoxes, attackActive, attackBox, bossBox, isInvulnerable, overlaps, playerBox } from './geometry';
```
(keep the other imports), add this function next to `resolvePlayerAttack`:
```ts
/** The boss's active hit boxes hurt a player who is not untouchable. */
function resolveBossHits(s: GameState, boss: BossDef): void {
  const p = s.player;
  if (isInvulnerable(p)) return;
  const box = playerBox(p);
  if (activeHitBoxes(s.boss, boss).some((hit) => overlaps(hit, box))) hurtPlayer(s);
}
```
and make the end of `step` read
```ts
  updatePlayer(s.player, input, s.events);
  updateBoss(s, boss);
  resolvePlayerAttack(s, boss);
  resolveBossHits(s, boss);
  return s;
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0. The timeline numbers in the new tests were derived by hand from the boss file (for example a solo attack starts on update 2 and the next one `length + 2` updates after it starts). If one is off, re-derive it from the code and report the measured value; do not change the boss file or `params.ts` to fit a test, and do not weaken an assertion silently.

- [ ] **Step 7: Commit**

```bash
git add src/game/boss.ts src/game/geometry.ts src/game/step.ts tests/step-boss.test.ts tests/geometry.test.ts
git commit -m "feat: the Ember Duelist walks, chooses attacks with a seeded generator and hurts the player"
```

---

### Task 4: The counter and the stagger (TDD)

**Files:**
- Create: `tests/boss-helpers.ts`, `tests/step-counter.test.ts`
- Modify: `src/game/boss.ts` (add the `stagger` mode), `src/game/step.ts` (counter, damage bonus), `tests/step-boss.test.ts` (import shared helpers)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: event `counter`; boss mode `stagger` lasting `boss.counter.staggerTicks` updates; player hits deal `boss.counter.damageMultiplier` damage while the boss is staggered. `tests/boss-helpers.ts` exports `isWindup`, `windupUpdates`, `updatesWith`, `attackIds`, `WALKER`, `solo`, `anywhere`, `standAt` (moved out of `tests/step-boss.test.ts`, unchanged).

Rule: a counter happens when the player's swing **starts** (`player.attackTick === 0` on that update) while the boss is in `attack` mode performing a `counterable` attack, the boss's `attackTick` is in `[windup - counter.window, windup)`, and the player is within `counter.range` of the boss (centre to centre). The boss then enters `stagger` (attack cancelled, no chain) and the event `counter` is emitted. The check runs after the boss's update and before the player's hit and the boss's hit boxes are resolved, so a counter on the last window update also prevents the hit that would have started on the next update.

- [ ] **Step 1: Share the boss test helpers**

Create `tests/boss-helpers.ts` by moving these definitions out of `tests/step-boss.test.ts`, exporting each one and keeping the code identical: `isWindup`, `windupUpdates`, `updatesWith`, `attackIds`, `WALKER`, `solo`, `anywhere`, `standAt` (with their imports: `BossDef`, `createInitialState`, `GameEvent`, `GameState`, `DUELIST`). In `tests/step-boss.test.ts` remove those definitions and import them from `./boss-helpers` (keep `DUELIST`, `run`, `withInput` from `./helpers`). Run `npx vitest run tests/step-boss.test.ts` and confirm it still passes before going on.

- [ ] **Step 2: Write the failing tests**

`tests/step-counter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER } from '../src/game/params';
import { solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, run, withInput } from './helpers';

const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
const boss = solo('slam');
const first = windupUpdates(run(standAt(boss, 120), 60, () => NO_INPUT, boss))[0]!;
const windowStart = first + slam.windup - DUELIST.counter.window;
const windowEnd = first + slam.windup - 1;
const hitStart = first + slam.windup;
const stagger = DUELIST.counter.staggerTicks;

/** The player at `distance` from the boss starts one swing on update `at`. */
const swingAt = (at: number, b: BossDef = boss, distance = 120) =>
  run(standAt(b, distance), hitStart + stagger + 40, (n) => withInput({ attackPressed: n === at }), b);

describe('a counter', () => {
  it.each([
    { name: 'the first update of the window', at: windowStart },
    { name: 'the last update of the window', at: windowEnd },
  ])('works on $name', ({ at }) => {
    const states = swingAt(at);
    expect(updatesWith(states, 'counter')).toEqual([at]);
    expect(states[at - 1]!.boss.mode).toBe('stagger');
    expect(states[at - 1]!.boss.attackId).toBeNull();
    // Nothing hurts the player while the slam is cancelled and the boss is staggered.
    expect(updatesWith(states.slice(0, hitStart + slam.active + 5), 'playerHit')).toEqual([]);
  });

  it('does not work one update before the window', () => {
    const states = swingAt(windowStart - 1);
    expect(updatesWith(states, 'counter')).toEqual([]);
    expect(updatesWith(states, 'playerHit')[0]).toBe(hitStart);
  });

  it('does not work once the attack has become active', () => {
    const states = swingAt(hitStart);
    expect(updatesWith(states, 'counter')).toEqual([]);
    expect(updatesWith(states, 'playerHit')[0]).toBe(hitStart);
  });

  it('needs the player to be close enough', () => {
    const shortRange: BossDef = { ...boss, counter: { ...boss.counter, range: 100 } };
    expect(updatesWith(swingAt(windowStart, shortRange), 'counter')).toEqual([]);
  });

  it('does not work on an attack that must be dodged', () => {
    const sweepBoss = solo('sweep');
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const sweepFirst = windupUpdates(run(standAt(sweepBoss, 150), 60, () => NO_INPUT, sweepBoss))[0]!;
    const at = sweepFirst + sweep.windup - 5;
    const states = run(
      standAt(sweepBoss, 150),
      at + 40,
      (n) => withInput({ attackPressed: n === at }),
      sweepBoss,
    );
    expect(updatesWith(states, 'counter')).toEqual([]);
  });
});

describe('the stagger', () => {
  const at = windowStart + 3;
  const states = swingAt(at);

  it('lasts the planned time, then the boss goes back to waiting', () => {
    expect(states.slice(at - 1, at - 1 + stagger).every((s) => s.boss.mode === 'stagger')).toBe(true);
    expect(states[at - 1 + stagger]!.boss.mode).toBe('gap');
  });

  it('is followed by a new attack a moment later', () => {
    expect(windupUpdates(states).some((u) => u > at + stagger)).toBe(true);
  });

  it('makes the player hits do the bonus damage', () => {
    // The counter swing itself connects once its start-up is over, while the boss is staggered.
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(hit).toBe(at + PLAYER.attack.startup);
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - DUELIST.counter.damageMultiplier);
  });
});

describe('a normal hit', () => {
  it('does one damage to a boss that is not staggered', () => {
    const at = first + 2;
    const states = swingAt(at);
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(hit).toBe(at + PLAYER.attack.startup);
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - 1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/step-counter.test.ts`
Expected: FAIL (the boss never staggers and no `counter` event exists).

- [ ] **Step 4: Implement**

In `src/game/boss.ts`, add a case to the `switch` in `updateBoss`, before `default`:
```ts
    case 'stagger':
      if (b.modeTick >= boss.counter.staggerTicks) enterGap(b);
      break;
```

In `src/game/step.ts`: import `attackById` (`import { attackById, updateBoss } from './boss';`), add
```ts
/**
 * A swing that starts inside the counter window of a counterable attack, close enough, staggers the boss
 * and cancels the attack. It runs before the hits are resolved, so the cancelled attack cannot hurt.
 */
function tryCounter(s: GameState, boss: BossDef): void {
  const { player: p, boss: b } = s;
  if (b.mode !== 'attack' || b.attackId === null || p.attackTick !== 0) return;
  const attack = attackById(boss, b.attackId);
  if (attack.class !== 'counterable') return;
  if (b.attackTick < attack.windup - boss.counter.window || b.attackTick >= attack.windup) return;
  if (Math.abs(p.x - b.x) > boss.counter.range) return;
  b.mode = 'stagger';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('counter');
}
```
change `resolvePlayerAttack` so the damage is `const damage = b.mode === 'stagger' ? boss.counter.damageMultiplier : 1;` and `b.hp = Math.max(0, b.hp - damage);`, and call `tryCounter(s, boss);` in `step` right after `updateBoss(s, boss);`.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/boss.ts src/game/step.ts tests/boss-helpers.ts tests/step-boss.test.ts tests/step-counter.test.ts
git commit -m "feat: add the counter and the stagger"
```

---

### Task 5: Phase 2, chaining and victory (TDD)

**Files:**
- Modify: `src/game/boss.ts` (transition mode, `beginTransition`), `src/game/step.ts` (damage handling, victory)
- Test: `tests/step-phases.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces: `beginTransition(s: GameState): void` from `boss.ts`; events `phaseChange` and `bossDefeated`; game phase `'victory'`.

Rules: after a player hit, if health reaches 0 the game phase becomes `victory` (`endTicks` set, event `bossDefeated`) and nothing else happens this update (the boss's own hit boxes must not hurt the player on the same update). Otherwise, if the next phase exists and `hp <= maxHp * next.startsAtHpFraction`, the boss enters the `transition` mode (phase index +1, attack cancelled, event `phaseChange`); it cannot be hurt during `transition`. When `boss.transitionTicks` updates have passed it opens with the new phase's `opening` attack (entering `approach`), or goes back to `gap` if there is none.

- [ ] **Step 1: Write the failing tests**

`tests/step-phases.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { GAME, PLAYER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { anywhere, attackIds, solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, run, withInput } from './helpers';

const threshold = DUELIST.maxHp * DUELIST.phases[1]!.startsAtHpFraction;

/** A fight with the player in reach of the boss and the boss at `hp` health. */
function inReach(boss: BossDef, hp: number): GameState {
  const s = standAt(boss, 120);
  s.boss.hp = hp;
  return s;
}

/** The player swings on update 1 and again on update 20. */
const swings = (n: number) => withInput({ attackPressed: n === 1 || n === 20 });

const HIT = PLAYER.attack.startup + 1;

describe('the phase change', () => {
  const states = run(inReach(DUELIST, 20), 130, swings, DUELIST);

  it('starts once when a hit brings health down to the next phase threshold', () => {
    // The setup: 20 health is above the threshold, one hit takes it to or below it.
    expect(20).toBeGreaterThan(threshold);
    expect(20 - 1).toBeLessThanOrEqual(threshold);
    expect(updatesWith(states, 'phaseChange')).toEqual([HIT]);
    expect(states[HIT - 1]!.boss.phase).toBe(1);
    expect(states[HIT - 1]!.boss.mode).toBe('transition');
  });

  it('does not start while health stays above the threshold', () => {
    const above = run(inReach(DUELIST, Math.ceil(threshold) + 2), 40, swings, DUELIST);
    expect(updatesWith(above, 'phaseChange')).toEqual([]);
    expect(above[39]!.boss.phase).toBe(0);
  });

  it('cannot be hurt while the boss powers up', () => {
    const second = 20 + PLAYER.attack.startup;
    expect(states[second - 1]!.boss.mode).toBe('transition');
    expect(states[second - 1]!.events).not.toContain('bossHit');
    expect(states[second - 1]!.boss.hp).toBe(states[HIT - 1]!.boss.hp);
  });

  it('opens with the phase opening attack once the pause is over', () => {
    const over = HIT + DUELIST.transitionTicks;
    expect(states[over - 1]!.boss.mode).toBe('approach');
    expect(states[over - 1]!.boss.pendingAttackId).toBe(DUELIST.phases[1]!.opening);
    expect(attackIds(states)[0]).toBe(DUELIST.phases[1]!.opening);
  });
});

describe('chaining in the second phase', () => {
  it('follows an attack straight with another, without the gap, then waits', () => {
    const base = anywhere();
    const boss: BossDef = {
      ...base,
      predictability: 0,
      phases: base.phases.map((p) => ({
        ...p,
        gap: 1,
        maxChain: 2,
        chainChance: 1,
        opening: undefined,
        attacks: [
          { id: 'slam', weight: 1 },
          { id: 'sweep', weight: 1 },
        ],
      })),
    };
    const s = standAt(boss, 120);
    s.player.health = 1000;
    s.boss.phase = 1;
    const states = run(s, 500, () => NO_INPUT, boss);
    const winds = windupUpdates(states);
    const length = (w: number): number =>
      attackLength(boss.attacks.find((a) => a.id === states[w - 1]!.boss.attackId)!);
    // Chained: the next attack starts one update after the previous one ends (no gap).
    expect(winds[1]).toBe(winds[0]! + length(winds[0]!) + 1);
    // The chain is used up after two attacks, so the third waits for the gap (one update here).
    expect(winds[2]).toBe(winds[1]! + length(winds[1]!) + 2);
    expect(winds[3]).toBe(winds[2]! + length(winds[2]!) + 1);
  });
});

describe('victory', () => {
  const states = run(inReach(QUIET_BOSS, 1), 100, swings, QUIET_BOSS);

  it('ends the fight when the last hit lands', () => {
    expect(updatesWith(states, 'bossDefeated')).toEqual([HIT]);
    expect(states[HIT - 1]!.phase).toBe('victory');
    expect(states[HIT - 1]!.boss.hp).toBe(0);
  });

  it('starts a new fight with a new seed after the pause', () => {
    expect(states[HIT + GAME.defeatRestartTicks - 2]!.phase).toBe('victory');
    const fresh = states[HIT + GAME.defeatRestartTicks - 1]!;
    expect(fresh.phase).toBe('fight');
    expect(fresh.tick).toBe(0);
    expect(fresh.boss.hp).toBe(QUIET_BOSS.maxHp);
    expect(fresh.seed).not.toBe(createInitialState(QUIET_BOSS).seed);
  });

  it('does not let the boss hurt the player on the update it is defeated', () => {
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const sweepBoss = solo('sweep');
    const start = (): GameState => {
      const s = standAt(sweepBoss, 150);
      s.boss.hp = 1;
      return s;
    };
    const first = windupUpdates(run(start(), 60, () => NO_INPUT, sweepBoss))[0]!;
    const hitStart = first + sweep.windup;
    // The swing connects on the very update the sweep's hit box becomes active.
    const swingAt = hitStart - PLAYER.attack.startup;
    const result = run(start(), hitStart + 2, (n) => withInput({ attackPressed: n === swingAt }), sweepBoss);
    expect(updatesWith(result, 'bossDefeated')).toEqual([hitStart]);
    expect(updatesWith(result, 'playerHit')).toEqual([]);
    expect(result[hitStart - 1]!.player.health).toBe(PLAYER.maxHealth);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/step-phases.test.ts`
Expected: FAIL (no phase change and no victory yet).

- [ ] **Step 3: Implement the transition in `src/game/boss.ts`**

Add these functions (the second is exported) and one more `case` in `updateBoss`:
```ts
/** After the powering-up pause the boss opens with the new phase's opening attack, if it has one. */
function finishTransition(s: GameState, phase: PhaseDef): void {
  const b = s.boss;
  if (phase.opening !== undefined) {
    b.pendingAttackId = phase.opening;
    b.chainLeft = planChain(s, phase);
    b.mode = 'approach';
    b.modeTick = 0;
  } else {
    enterGap(b);
  }
}

/** The boss moves on to the next phase: it drops what it was doing and powers up, unhurtable. */
export function beginTransition(s: GameState): void {
  const b = s.boss;
  b.phase += 1;
  b.mode = 'transition';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('phaseChange');
}
```
```ts
    case 'transition':
      if (b.modeTick >= boss.transitionTicks) finishTransition(s, phase);
      break;
```

- [ ] **Step 4: Handle damage, phases and victory in `src/game/step.ts`**

Import `beginTransition` (`import { attackById, beginTransition, updateBoss } from './boss';`). Replace `resolvePlayerAttack` with
```ts
/** The player's swing hurts the boss once per swing. It ends the fight at 0 health and can start the next phase. */
function resolvePlayerAttack(s: GameState, boss: BossDef): void {
  const { player: p, boss: b } = s;
  if (b.mode === 'transition') return;
  if (!attackActive(p) || p.attackConnected || !overlaps(attackBox(p), bossBox(b, boss))) return;
  p.attackConnected = true;
  const damage = b.mode === 'stagger' ? boss.counter.damageMultiplier : 1;
  b.hp = Math.max(0, b.hp - damage);
  s.events.push('bossHit');
  if (b.hp <= 0) {
    s.phase = 'victory';
    s.endTicks = GAME.defeatRestartTicks;
    s.events.push('bossDefeated');
    return;
  }
  const next = boss.phases[b.phase + 1];
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) beginTransition(s);
}
```
and in `step`, right after `resolvePlayerAttack(s, boss);` add `if (s.phase !== 'fight') return s;` (so the boss cannot hurt the player on the update it is defeated).

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/boss.ts src/game/step.ts tests/step-phases.test.ts
git commit -m "feat: add the second phase, chained attacks and victory"
```

---

### Task 6: What the player sees and hears: poses, glow, health bar, effects, sounds (TDD for the pure parts)

**Files:**
- Modify: `src/game/params.ts` (two `FEEDBACK` keys), `src/ui/feedback.ts` (replace whole file), `src/ui/audio.ts` (replace the `play` body), `src/ui/render.ts`
- Test: `tests/boss-look.test.ts` (new), `tests/feedback.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1 to 5 (events, `BossState`, `activeHitBoxes`).
- Produces: from `render.ts`: `Rect`, `armRect(pose, facing, shoulderX, shoulderY): Rect`, `BOSS_COLORS`, `BossLook`, `bossLook(b, boss): BossLook`; `drawFrame` (same signature as after Task 2) now draws the boss with its pose, glow, hurt boxes and a health bar with phase marks, and the words "Defeated" or "Victory".

- [ ] **Step 1: Write the failing tests**

`tests/boss-look.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BOSS_COLORS, armRect, bossLook } from '../src/ui/render';
import { createInitialState } from '../src/game/state';
import { DUELIST } from './helpers';

describe('armRect', () => {
  it('raises the arm above the shoulder', () => {
    const r = armRect('raised', 1, 100, 300);
    expect(r.y + r.h).toBe(300);
    expect(r.y).toBeLessThan(300);
    expect(r.x + r.w / 2).toBe(100);
  });

  it('holds the arm out sideways to the side the boss faces', () => {
    const right = armRect('sideways', 1, 100, 300);
    expect(right.x).toBe(100);
    expect(right.w).toBeGreaterThan(right.h);
    const left = armRect('sideways', -1, 100, 300);
    expect(left.x + left.w).toBe(100);
  });

  it('pulls the arm back behind the boss', () => {
    const facingRight = armRect('back', 1, 100, 300);
    expect(facingRight.x + facingRight.w).toBe(100);
    const facingLeft = armRect('back', -1, 100, 300);
    expect(facingLeft.x).toBe(100);
  });

  it('points the arm down for a stomp', () => {
    const r = armRect('down', 1, 100, 300);
    expect(r.y).toBe(300);
    expect(r.h).toBeGreaterThan(r.w);
  });
});

describe('bossLook', () => {
  const attacking = (id: string, tick: number) => {
    const b = createInitialState(DUELIST).boss;
    b.mode = 'attack';
    b.attackId = id;
    b.attackTick = tick;
    return b;
  };
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;

  it('has no glow while waiting', () => {
    expect(bossLook(createInitialState(DUELIST).boss, DUELIST)).toEqual({
      body: BOSS_COLORS.ember,
      glow: null,
    });
  });

  it('glows gold during a counterable attack and red during a must-dodge one', () => {
    expect(bossLook(attacking('slam', 5), DUELIST).glow).toBe(BOSS_COLORS.gold);
    expect(bossLook(attacking('sweep', 5), DUELIST).glow).toBe(BOSS_COLORS.red);
  });

  it('stops glowing once the attack is over and it is recovering', () => {
    expect(bossLook(attacking('slam', slam.windup + slam.active), DUELIST).glow).toBeNull();
    expect(bossLook(attacking('sweep', sweep.windup + sweep.active - 1), DUELIST).glow).toBe(
      BOSS_COLORS.red,
    );
  });

  it('turns blue when staggered and glows white while powering up', () => {
    const staggered = createInitialState(DUELIST).boss;
    staggered.mode = 'stagger';
    expect(bossLook(staggered, DUELIST)).toEqual({ body: BOSS_COLORS.stagger, glow: null });
    const powering = createInitialState(DUELIST).boss;
    powering.mode = 'transition';
    expect(bossLook(powering, DUELIST).glow).toBe(BOSS_COLORS.power);
  });
});
```

Extend `tests/feedback.test.ts` with these cases (adapt the imports; keep the existing tests):
```ts
describe('the new boss events', () => {
  it('freeze longer on a counter and on victory, and not at all on a phase change', () => {
    expect(freezeFor(['counter'])).toBe(FEEDBACK.freezeOnCounter);
    expect(freezeFor(['bossDefeated'])).toBe(FEEDBACK.freezeOnBossDefeated);
    expect(freezeFor(['phaseChange'])).toBe(0);
    expect(FEEDBACK.freezeOnCounter).toBeGreaterThan(FEEDBACK.freezeOnBossHit);
  });

  it('shake the screen and flash the boss on a counter and on victory', () => {
    for (const event of ['counter', 'bossDefeated'] as const) {
      const fb = applyEvents(NO_FEEDBACK, [event]);
      expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
      expect(fb.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    }
  });

  it('shake the screen on a phase change without flashing anyone', () => {
    const fb = applyEvents(NO_FEEDBACK, ['phaseChange']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.bossFlashTicks).toBe(0);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('ignore the warning events', () => {
    expect(applyEvents(NO_FEEDBACK, ['bossWindupGold', 'bossWindupRed'])).toEqual(NO_FEEDBACK);
    expect(freezeFor(['bossWindupGold', 'bossWindupRed'])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/boss-look.test.ts tests/feedback.test.ts`
Expected: FAIL (`armRect`, `bossLook`, `BOSS_COLORS` and the new feedback keys do not exist).

- [ ] **Step 3: Feedback and sound**

In `src/game/params.ts` add to `FEEDBACK`: `freezeOnCounter: 10,` and `freezeOnBossDefeated: 12,` (no other change).

Replace `src/ui/feedback.ts` with:
```ts
import { FEEDBACK } from '../game/params';
import type { GameEvent } from '../game/state';

/** Effect timers that only exist for the eyes: they never feed back into the simulation. */
export interface FeedbackState {
  shakeTicks: number;
  bossFlashTicks: number;
  playerFlashTicks: number;
}

export const NO_FEEDBACK: FeedbackState = { shakeTicks: 0, bossFlashTicks: 0, playerFlashTicks: 0 };

/** How many updates the loop should hold still after these events (the longest one wins). */
export function freezeFor(events: readonly GameEvent[]): number {
  let freeze = 0;
  for (const event of events) {
    if (event === 'bossHit') freeze = Math.max(freeze, FEEDBACK.freezeOnBossHit);
    if (event === 'playerHit') freeze = Math.max(freeze, FEEDBACK.freezeOnPlayerHit);
    if (event === 'counter') freeze = Math.max(freeze, FEEDBACK.freezeOnCounter);
    if (event === 'bossDefeated') freeze = Math.max(freeze, FEEDBACK.freezeOnBossDefeated);
  }
  return freeze;
}

export function applyEvents(fb: FeedbackState, events: readonly GameEvent[]): FeedbackState {
  const next = { ...fb };
  for (const event of events) {
    if (event === 'bossHit' || event === 'counter' || event === 'bossDefeated') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.bossFlashTicks = FEEDBACK.bossFlashTicks;
    }
    if (event === 'playerHit') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.playerFlashTicks = FEEDBACK.playerFlashTicks;
    }
    if (event === 'phaseChange') next.shakeTicks = FEEDBACK.shakeTicks;
  }
  return next;
}

/** Called once per real 60th of a second, including during a freeze, so effects fade in real time. */
export function advanceFeedback(fb: FeedbackState): FeedbackState {
  return {
    shakeTicks: Math.max(0, fb.shakeTicks - 1),
    bossFlashTicks: Math.max(0, fb.bossFlashTicks - 1),
    playerFlashTicks: Math.max(0, fb.playerFlashTicks - 1),
  };
}

/** Sideways screen offset in world units: alternates sides every update and fades out. */
export function shakeOffset(fb: FeedbackState): number {
  if (fb.shakeTicks <= 0) return 0;
  const strength = fb.shakeTicks / FEEDBACK.shakeTicks;
  return (fb.shakeTicks % 2 === 0 ? 1 : -1) * FEEDBACK.shakeAmplitude * strength;
}
```

In `src/ui/audio.ts` replace the whole body of `play` with:
```ts
    play(events): void {
      for (const event of events) {
        if (event === 'bossHit') beep(220, 90, 'square', 0.15);
        if (event === 'playerHit') beep(110, 200, 'sawtooth', 0.2);
        if (event === 'dash') beep(660, 70, 'triangle', 0.1);
        // Two different warnings: a high clear note for the counterable (gold) attack, a low rough one for red.
        if (event === 'bossWindupGold') beep(880, 140, 'sine', 0.14);
        if (event === 'bossWindupRed') beep(330, 140, 'sawtooth', 0.1);
        if (event === 'counter') beep(1100, 160, 'triangle', 0.18);
        if (event === 'phaseChange') beep(140, 450, 'sawtooth', 0.18);
        if (event === 'bossDefeated') beep(523, 320, 'triangle', 0.2);
        if (event === 'playerDefeated') beep(80, 500, 'sawtooth', 0.2);
      }
    },
```

- [ ] **Step 4: Drawing**

In `src/ui/render.ts`:
- Imports: `import { activeHitBoxes, attackActive, attackBox } from '../game/geometry';`, `import type { BossState, GameState } from '../game/state';`, and `import type { BossDef, Pose } from '../bosses/schema';` (replace the Task 2 imports accordingly).
- Add (above `COLORS`):
```ts
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ARM_LENGTH = 90;
const ARM_THICKNESS = 16;

/** The boss's arm for a pose, as a rectangle hanging from the shoulder point. The pose tells the player which attack is coming. */
export function armRect(pose: Pose, facing: 1 | -1, shoulderX: number, shoulderY: number): Rect {
  const t = ARM_THICKNESS;
  const l = ARM_LENGTH;
  switch (pose) {
    case 'raised':
      return { x: shoulderX - t / 2, y: shoulderY - l, w: t, h: l };
    case 'down':
      return { x: shoulderX + facing * 30 - t / 2, y: shoulderY, w: t, h: l };
    case 'sideways':
      return { x: facing === 1 ? shoulderX : shoulderX - l, y: shoulderY - t / 2, w: l, h: t };
    case 'back':
      return { x: facing === 1 ? shoulderX - l : shoulderX, y: shoulderY - t / 2, w: l, h: t };
  }
}

export const BOSS_COLORS = {
  ember: '#c8642a',
  stagger: '#7fd6ff',
  power: '#ffffff',
  gold: '#f5c542',
  red: '#e0403a',
};

export interface BossLook {
  body: string;
  /** The colour of the glow around the boss, or null for none. */
  glow: string | null;
}

/**
 * How the boss looks right now: gold glow while a counterable attack winds up or is active, red for a
 * must-dodge one, blue when staggered, white while powering up between phases.
 */
export function bossLook(b: BossState, boss: BossDef): BossLook {
  if (b.mode === 'transition') return { body: BOSS_COLORS.ember, glow: BOSS_COLORS.power };
  if (b.mode === 'stagger') return { body: BOSS_COLORS.stagger, glow: null };
  if (b.mode === 'attack' && b.attackId !== null) {
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    if (attack !== undefined && b.attackTick < attack.windup + attack.active) {
      return {
        body: BOSS_COLORS.ember,
        glow: attack.class === 'counterable' ? BOSS_COLORS.gold : BOSS_COLORS.red,
      };
    }
  }
  return { body: BOSS_COLORS.ember, glow: null };
}
```
- In `COLORS` remove `boss` and keep `bossHp`; replace the Task 2 `drawBoss` with:
```ts
function drawBoss(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boss: BossDef,
  feedback: FeedbackState,
): void {
  const b = state.boss;
  const look = bossLook(b, boss);
  const left = b.x - boss.width / 2;
  const top = WORLD.floorY - boss.height;

  ctx.fillStyle = feedback.bossFlashTicks > 0 ? COLORS.flash : look.body;
  ctx.fillRect(left, top, boss.width, boss.height);
  if (look.glow !== null) {
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(state.tick / 2);
    ctx.strokeStyle = look.glow;
    ctx.lineWidth = 8;
    ctx.strokeRect(left - 4, top - 4, boss.width + 8, boss.height + 8);
    ctx.globalAlpha = 1;
  }

  // The arm shows the pose of the attack being performed; when waiting it hangs at the side.
  const attack =
    b.mode === 'attack' && b.attackId !== null
      ? boss.attacks.find((a) => a.id === b.attackId)
      : undefined;
  const shoulderY = top + boss.height * 0.3;
  const arm =
    attack !== undefined
      ? armRect(attack.pose, b.facing, b.x, shoulderY)
      : { x: b.x + b.facing * 18 - 8, y: shoulderY, w: 16, h: 50 };
  ctx.fillStyle = look.glow ?? '#e8965a';
  ctx.fillRect(arm.x, arm.y, arm.w, arm.h);
  // A small notch on the side the boss faces.
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(b.x + b.facing * (boss.width / 2 - 14) - 5, top + 24, 10, 10);

  for (const box of activeHitBoxes(b, boss)) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = look.glow ?? COLORS.bossHp;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}
```
- In `drawHud`, replace the boss bar with a wider bar that has a mark at each phase change and the boss's name:
```ts
  const width = 260;
  const left = WORLD.width - 24 - width;
  ctx.fillStyle = COLORS.hudBack;
  ctx.fillRect(left, 24, width, 14);
  ctx.fillStyle = COLORS.bossHp;
  ctx.fillRect(left, 24, (width * state.boss.hp) / boss.maxHp, 14);
  ctx.fillStyle = COLORS.hud;
  for (const phase of boss.phases.slice(1)) {
    ctx.fillRect(left + width * phase.startsAtHpFraction - 1, 20, 3, 22);
  }
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(boss.name, WORLD.width - 24, 46);
```
- Replace the block at the end of `drawFrame` that draws "Defeated" so it handles both end states:
```ts
  if (state.phase !== 'fight') {
    ctx.fillStyle = COLORS.hud;
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.phase === 'victory' ? 'Victory' : 'Defeated', WORLD.width / 2, WORLD.height / 2);
  }
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0. Drawing itself is not unit tested (it needs a browser); the owner checks it by playing.

- [ ] **Step 6: Commit**

```bash
git add src/game/params.ts src/ui/feedback.ts src/ui/audio.ts src/ui/render.ts tests/boss-look.test.ts tests/feedback.test.ts
git commit -m "feat: draw the boss's pose, glow and health bar, and add the counter and phase effects and sounds"
```

---

### Task 7: New seed each fight, the boss format documented, docs and checklist

**Files:**
- Modify: `src/ui/app.ts`, `docs/phone-testing.md`, `CLAUDE.md`
- Create: `docs/bosses.md`

- [ ] **Step 1: A new seed for every fight**

In `src/ui/app.ts` add, above `mountApp`:
```ts
/** A fresh seed for a fight, from the browser's random source (outside the simulation, which stays reproducible). */
function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}
```
and in `startFight` change `state = createInitialState(EMBER_DUELIST);` to `state = createInitialState(EMBER_DUELIST, newSeed());`. (After a defeat or victory, `step` already starts the next fight with a seed derived from the last.) Run `npm run typecheck && npm test && npm run build && npm run check:dist`.

- [ ] **Step 2: Document the boss format**

Create `docs/bosses.md` with these sections, written for someone adding the next boss (plain language, exact field names):
1. **Where boss files live and how they are checked**: `src/bosses/<id>.json`, checked at load by `parseBoss` in `src/bosses/parse.ts`; a broken file stops the game at start with a message naming the exact place (give one example message); how to add a boss (create the file, export it from `src/bosses/index.ts`, add tests).
2. **Every field**, as a list or table, copied from the "Boss file format" section of `docs/superpowers/specs/2026-09-20-m2-design.md` and from the doc comments in `src/bosses/schema.ts`: top level, `spacing`, `counter`, each attack field, hit windows (with the "measured from the boss's centre in the direction it faces" rule and the worked example of the slam's box), `move`, each phase field.
3. **How the boss behaves** (a short explanation of the modes `gap`, `approach`, `attack`, `stagger`, `transition`, how an attack is chosen, chaining, the counter and the phase change), so a reader can predict what a change will do.
4. **What can be tuned safely and what to check afterwards**: which numbers are timings in updates (60 per second), a checklist of consequences (a wider `spacing` means...; a longer `windup` means...).
5. **Ideas not built yet**: a pointer to `docs/backlog.md` (ranges instead of single numbers for random variation, an arena section for hazards).

- [ ] **Step 3: Update `CLAUDE.md` and `docs/phone-testing.md`**

`CLAUDE.md`, "Conventions": add the bullet `- Bosses are JSON files in `src/bosses/`, checked by `parseBoss`. The format is documented in `docs/bosses.md`; when the format changes, update that file and the tests.`

`docs/phone-testing.md`: replace the whole section "Playing the fight (M1)" with a section "Playing the fight (M2)" that keeps the landscape and install paragraph, the start-screen paragraph (now "Fight the Ember Duelist"), the controls line and the sound, pause, hold-to-leave and multi-button items, and replaces the dummy items with these checklist items:
- [ ] The Ember Duelist walks up to you, keeps a fighting distance, and backs off if you crowd it. It always faces you.
- [ ] Its arm shows which attack is coming: raised (a slam, gold glow), sideways (a low sweep, red glow), pulled back (a lunge across the screen, red glow).
- [ ] Red attacks are dodged: jump over the sweep, dash through the lunge or the sweep. The slam is tall, so jumping does not help; dash through it or back away.
- [ ] Countering: press attack in the last fifth of a second of the gold slam's warning while you are close. The Duelist turns blue and is staggered for about a second and a half, and your hits do double damage. Too early or too late is just a normal swing.
- [ ] Hits feel right: the freeze, the shake and the flash when you hit it and when it hits you; a counter feels bigger.
- [ ] Phase 2 at about two thirds of its health: it powers up (white glow, cannot be hurt), then attacks faster, sometimes chains two attacks, and adds a ground shockwave that you jump over.
- [ ] Beating it shows "Victory" and a new fight starts; losing shows "Defeated" and a new fight starts.
- [ ] Fights are not identical: the order of attacks differs from fight to fight.
Keep the note that the sweep and other attacks are meant to be dodged from their warning, generalized to "all its attacks", and keep the request for impressions in plain words (too fast, too slow, too hard, too easy, unfair, boring).

- [ ] **Step 4: Final full verification**

Run: `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`
Expected: everything exits 0 from a clean install; `git status --short` shows only this task's files.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.ts docs/bosses.md docs/phone-testing.md CLAUDE.md
git commit -m "feat: a new seed for every fight, and document the boss format and the M2 play test"
```

---

## M2 done when

- All seven tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout.
- The controller pushes, CI is green and the site is deployed (the controller does this, not the task agents).
- The owner has fought the Duelist on the PC pad and on the S21 with the checklist in `docs/phone-testing.md`, and any tuning they ask for is made in `src/bosses/ember-duelist.json` or `src/game/params.ts`.

## Self-review notes

- **Spec coverage** (`docs/superpowers/specs/2026-09-20-m2-design.md`): data format and validator (Task 1), removal of the dummy and the boss entity (Task 2), walking, spacing, attack choice with predictability and the no-triple rule, the four attacks, hits (Task 3), the counter and stagger with double damage (Task 4), phase 2, the powering-up pause, the opening attack, chaining, victory and restart with a new seed (Task 5), poses, glow, boss bar with phase mark, counter and phase effects and sounds (Task 6), a new seed per fight, format docs and the play-test checklist (Task 7). Backlog ideas are recorded, not built.
- **Names used across tasks:** `BossDef`, `AttackDef`, `PhaseDef`, `parseBoss`, `EMBER_DUELIST`, `nextRandom`, `createInitialState(boss, seed)`, `step(state, input, boss)`, `bossBox`, `activeHitBoxes`, `updateBoss`, `attackById`, `attackLength`, `beginTransition`, `hurtPlayer`, `armRect`, `bossLook`, `BOSS_COLORS`; test helpers `DUELIST`, `QUIET_BOSS`, `withInput`, `advance`, `run` (Task 2) and `isWindup`, `windupUpdates`, `updatesWith`, `attackIds`, `WALKER`, `solo`, `anywhere`, `standAt` (Task 3, shared in Task 4); events `bossHit`, `playerHit`, `dash`, `bossWindupGold`, `bossWindupRed`, `counter`, `phaseChange`, `bossDefeated`, `playerDefeated`.

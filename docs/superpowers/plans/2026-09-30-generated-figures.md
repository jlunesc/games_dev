# Generated boss figures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated boss is drawn from a body plan plus mix-and-match parts chosen by its seed, instead of the one block-and-head figure.

**Architecture:** A pure `figureRecipe(seed, boss)` picks a plan, head, arm, back piece and trim, tilted loosely by the boss's attack kinds. `generatedFigure(bp, recipe, colors)` turns the recipe into the existing `Primitive` shapes using the pose data (`BossPose`) that every figure already gets. `bossFigure` uses it for id `generated` only.

**Tech Stack:** TypeScript (strict), Vitest, Canvas 2D shapes (`Primitive`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-generated-figures-design.md`

## Global Constraints

- Generated bosses only; every hand-built boss and pair figure is unchanged (existing figure tests pass untouched).
- Look only: no change to a fight, a recording, the stats or `GAME_VERSION`. The same seed gives the same look.
- CSP: no `innerHTML`, no inline style. Shapes only (`rect`, `circle`, `poly`), no blur.
- Every size, count and chance lives in `src/ui/look/tuning.ts` (`LOOK.genFigure`).
- Figures stay inside the boss box plus 24 world units of margin, fill most of the box, and never exceed `LOOK.genFigure.maxShapes`.
- The attack-pose arm (`weaponArm`) is always drawn so wind-ups stay readable.
- The owner is not a programmer: docs and the final message use plain language.
- Do not commit unless the owner asks. When committing: no Claude or Anthropic attribution line (global rule).

## File Structure

- `src/ui/look/pose.ts` (modify): gains `BossPose`, `AttackMarks`, `forwardRect`, `forwardPoly`, `weaponArm` moved from `figures.ts` (shared without an import cycle).
- `src/ui/look/figures.ts` (modify): imports those from `pose.ts`; `bossFigure` routes `generated` to the new module.
- `src/ui/look/generated-figure.ts` (create): recipe and drawing.
- `src/ui/look/tuning.ts` (modify): `LOOK.genFigure`.
- `tests/look-generated-figure.test.ts` (create).
- `docs/SPEC.md`, `docs/phone-testing.md`, `docs/backlog.md` (modify).

---

### Task 1: Move the shared pose helpers into `pose.ts`

**Files:**
- Modify: `src/ui/look/pose.ts`, `src/ui/look/figures.ts`
- Test: existing `tests/look-figures.test.ts` and all figure tests (no new test, a pure move)

**Interfaces:**
- Produces (exported from `pose.ts`): `interface BossPose` and `interface AttackMarks` (exactly as now in `figures.ts`), `forwardRect(bp, dx0, dx1, y, h, color): Primitive`, `forwardPoly(bp, points, color): Primitive`, `weaponArm(bp, arm, blade): Primitive[]`. `Primitive` stays exported from `figures.ts`; `pose.ts` imports it with `import type`.

- [ ] **Step 1:** Run `npm test` and note the passing count as the baseline.
- [ ] **Step 2:** Cut `BossPose`, `AttackMarks`, `forwardRect`, `forwardPoly` and `weaponArm` (with their doc comments) out of `figures.ts` and paste them into `pose.ts`, adding `export`. In `pose.ts` add `import type { Primitive } from './figures';`. Their own imports (`LOOK`, `WORLD`, `armRect`, `Pose`) are already in or added to `pose.ts`.
- [ ] **Step 3:** In `figures.ts`, import the moved names from `./pose` (`armRect` is still used there). Delete any import that became unused.
- [ ] **Step 4:** Run `npm run typecheck && npm test`. Expected: same passing count as Step 1.

---

### Task 2: The recipe (pure picking)

**Files:**
- Create: `src/ui/look/generated-figure.ts` (recipe half)
- Modify: `src/ui/look/tuning.ts` (add `genFigure` block)
- Test: `tests/look-generated-figure.test.ts`

**Interfaces:**
- Consumes: `rng(seed)` from `./background`; `BossDef`, `AttackDef` from `../../bosses/schema`.
- Produces:
  ```ts
  export type Plan = 'upright' | 'beast' | 'wisp' | 'totem' | 'crawler';
  export type Head = 'helm' | 'horns' | 'hood' | 'eye' | 'crown' | 'faceless';
  export type ArmStyle = 'blade' | 'plain' | 'club' | 'orb';
  export type Back = 'cape' | 'wings' | 'spines' | 'orbs' | 'shell' | 'none';
  export type Trim = 'stripes' | 'core' | 'runes' | 'none';
  export interface Recipe { plan: Plan; head: Head; arm: ArmStyle; back: Back; trim: Trim }
  export const PLANS: readonly Plan[]; export const HEADS: readonly Head[];
  export const ARMS: readonly ArmStyle[]; export const BACKS: readonly Back[]; export const TRIMS: readonly Trim[];
  export function figureRecipe(seed: number, boss: BossDef): Recipe;
  ```

`LOOK.genFigure` (add to `tuning.ts`, inside `LOOK`):

```ts
genFigure: {
  /** How much a hinted option is favoured: its weight is 1 + hint * (share of the boss's attacks of that kind). */
  hint: 3,
  /** The most shapes one generated figure may use (phone limit). */
  maxShapes: 48,
  /** The tallest a head piece, spike or horn may stand above its head, world units. */
  reach: 14,
  legSwing: 6,
  legLift: 4,
  /** Sway of capes, tails and the wisp, world units and ticks per cycle. */
  sway: 5,
  swayTicks: 40,
  flapTicks: 18,
  orbitTicks: 120,
  corePulse: 0.12,
},
```

How attacks tilt the picks (each option lists the attack kinds it likes; an attack's kind is: `shot` has a bolt or arc, `eruption` has an eruption, `leap` has `leap`, `dash` has `move` and no `leap`, `strike` is none of those):

| Option | Likes |
|---|---|
| plan upright | strike |
| plan beast | leap, dash |
| plan wisp | shot |
| plan totem | eruption |
| plan crawler | leap |
| head helm | strike, dash |
| head horns | strike |
| head hood | shot |
| head eye | shot |
| head crown | eruption |
| head faceless | (none) |
| arm blade | strike |
| arm plain | dash |
| arm club | eruption |
| arm orb | shot |
| back cape | dash |
| back wings | leap |
| back spines | eruption |
| back orbs | shot |
| back shell | strike |
| back none, trim all | (none) |

- [ ] **Step 1: Write the failing tests** in `tests/look-generated-figure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateBoss } from '../src/bosses/generate/boss';
import type { AttackDef, BossDef, ShotDef } from '../src/bosses/schema';
import {
  ARMS, BACKS, HEADS, PLANS, TRIMS, figureRecipe,
} from '../src/ui/look/generated-figure';
import { DUELIST } from './helpers';

const BOLT: ShotDef = { kind: 'bolt', at: 20, height: 40, size: 14, speed: 300 };
const ERUPTION: ShotDef = { kind: 'eruption', at: 20, offset: 0, width: 60, delay: 30, burst: 10 };

/** The Duelist with every attack given the same extra, to test how attacks tilt the recipe. */
function withEvery(extra: Partial<AttackDef>): BossDef {
  return { ...DUELIST, attacks: DUELIST.attacks.map((a) => ({ ...a, ...extra })) };
}
const plain = withEvery({ shots: undefined, leap: undefined, move: undefined });
const casters = withEvery({ shots: [BOLT] });
const erupters = withEvery({ shots: [ERUPTION] });

const count = <T,>(seeds: number, pick: (seed: number) => T, want: T): number => {
  let n = 0;
  for (let s = 1; s <= seeds; s++) if (pick(s) === want) n++;
  return n;
};

describe('figureRecipe', () => {
  it('is the same for the same seed and boss', () => {
    const boss = generateBoss(7);
    expect(figureRecipe(7, boss)).toEqual(figureRecipe(7, boss));
  });

  it('gives many different looks over many seeds and uses every option', () => {
    const seen = new Set<string>();
    const plans = new Set<string>(), heads = new Set<string>(), arms = new Set<string>();
    const backs = new Set<string>(), trims = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const r = figureRecipe(seed, generateBoss(seed));
      seen.add(JSON.stringify(r));
      plans.add(r.plan); heads.add(r.head); arms.add(r.arm); backs.add(r.back); trims.add(r.trim);
    }
    expect(seen.size).toBeGreaterThan(150);
    expect(plans.size).toBe(PLANS.length);
    expect(heads.size).toBe(HEADS.length);
    expect(arms.size).toBe(ARMS.length);
    expect(backs.size).toBe(BACKS.length);
    expect(trims.size).toBe(TRIMS.length);
  });

  it('leans towards casters parts for a boss of shots, and eruption parts for a boss of eruptions', () => {
    const n = 400;
    expect(count(n, (s) => figureRecipe(s, casters).plan, 'wisp')).toBeGreaterThan(
      count(n, (s) => figureRecipe(s, plain).plan, 'wisp'),
    );
    expect(count(n, (s) => figureRecipe(s, casters).back, 'orbs')).toBeGreaterThan(
      count(n, (s) => figureRecipe(s, plain).back, 'orbs'),
    );
    expect(count(n, (s) => figureRecipe(s, erupters).back, 'spines')).toBeGreaterThan(
      count(n, (s) => figureRecipe(s, plain).back, 'spines'),
    );
    expect(count(n, (s) => figureRecipe(s, erupters).head, 'crown')).toBeGreaterThan(
      count(n, (s) => figureRecipe(s, plain).head, 'crown'),
    );
  });

  it('still lets the seed decide: a boss of shots is not always a wisp', () => {
    expect(count(400, (s) => figureRecipe(s, casters).plan, 'wisp')).toBeLessThan(400 * 0.6);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/look-generated-figure.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Create `generated-figure.ts` with the types, the option lists, the `genFigure` tuning, and:

```ts
import { rng } from './background';

type Hint = 'shot' | 'eruption' | 'leap' | 'dash' | 'strike';
interface Option<T> { id: T; likes: readonly Hint[] }

function shares(boss: BossDef): Record<Hint, number> {
  const n = Math.max(1, boss.attacks.length);
  const out: Record<Hint, number> = { shot: 0, eruption: 0, leap: 0, dash: 0, strike: 0 };
  for (const a of boss.attacks) {
    const shots = a.shots ?? [];
    if (shots.some((s) => s.kind !== 'eruption')) out.shot += 1 / n;
    else if (shots.some((s) => s.kind === 'eruption')) out.eruption += 1 / n;
    else if (a.leap !== undefined) out.leap += 1 / n;
    else if (a.move !== undefined) out.dash += 1 / n;
    else out.strike += 1 / n;
  }
  return out;
}

function choose<T>(options: readonly Option<T>[], share: Record<Hint, number>, next: () => number): T {
  const weights = options.map((o) => 1 + LOOK.genFigure.hint * o.likes.reduce((sum, h) => sum + share[h], 0));
  let roll = next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return options[i]!.id;
  }
  return options[options.length - 1]!.id;
}
```

  and `figureRecipe` building five `Option[]` tables from the table above (`{ id: 'wisp', likes: ['shot'] }` and so on), exporting `PLANS`, `HEADS`, `ARMS`, `BACKS`, `TRIMS` as the ids of those tables, and drawing in fixed order plan, head, arm, back, trim from `rng(seed ^ 0x6f1d5eed)`.
- [ ] **Step 4:** Run the same test. Expected: PASS. Then `npm run typecheck`.

---

### Task 3: Draw the plans with their parts

**Files:**
- Modify: `src/ui/look/generated-figure.ts` (drawing half)
- Test: `tests/look-generated-figure.test.ts` (append)

**Interfaces:**
- Consumes: `BossPose`, `forwardRect`, `forwardPoly`, `weaponArm` from `./pose`; `Primitive` (type) from `./figures`; `Recipe` from Task 2.
- Produces: `export function generatedFigure(bp: BossPose, recipe: Recipe, colors: { body: string; accent: string; glow: string | null }): Primitive[]`.

Geometry (all in "forward" coordinates: `dx` forward of the centre, `y` world, `bp.f` mirrors; `bodyTop = bp.top + bp.headR * 1.6 - bp.rise`; `gait` phase `= TAU * bp.t / LOOK.legCycleTicks`, a foot swings `legSwing * sin(phase)` and lifts `legLift * max(0, cos(phase))` only while `bp.walking`, and lifts `legLift * 1.5` while `bp.airborne`). Each plan returns shapes plus **anchors** `{ head: {dx, y, r}, torso: {dx0, dx1, y0, y1}, back: {dx, y0, y1} }` that the parts attach to:

| Plan | Shapes | Anchors |
|---|---|---|
| upright | two legs (width `w*0.2`, height `h*0.32`), torso rect `±w*0.4` from `bodyTop` to the hips, head circle at `(lean*1.2, top+headR-rise)` | head above torso, torso the rect, back at `-w*0.4` |
| beast | body rect from `-w/2` to `+w*0.3`, `y` from `top+h*0.4-rise` to `feet-h*0.25`; four legs (front pair and back pair on opposite phases); neck poly to a head circle (radius `headR*1.2`) at `(w*0.42, top+h*0.3-rise)`; tail poly from the rump up to `(−w/2−10, top+h*0.1)` swaying with `sway` | head forward, torso the body, back at `-w/2` |
| wisp | body circle centre `(0, top+h*0.42-rise*1.5)`, radius `min(w/2, h*0.4)`; a tapering tail poly down to the feet swaying; two fin polys out to `±w/2` | head at the circle's upper front, torso the circle's box |
| totem | three blocks (`w*0.9`, `w*0.7`, `w*0.5` wide; `h*0.3`, `h*0.3`, `h*0.25` tall) stacked from the feet with 2-unit gaps, each shifted by `lean*(i/2)` and lifted by `rise*i`; head circle on the top block | head on top, torso the middle block, back at its left edge |
| crawler | dome poly (7 points) `±w/2` wide from `top+h*0.12-rise` down to `feet-h*0.3`; six short legs, alternate legs on opposite phases | head at the dome's front top, torso the dome's middle, back at `-w*0.4` |

Parts (head parts add to the head circle, which is always drawn in `body`; a part never rises more than `LOOK.genFigure.reach` above its head):

- Heads: `helm` visor slit + short crest in `accent`; `horns` two curved polys up and out in `accent`; `hood` a tall triangle in `body` with two eye dots in `accent`; `eye` one big `glow ?? accent` circle (radius `headR*0.55`) with a `body` pupil; `crown` 3 to 5 spikes in `accent`; `faceless` nothing.
- Arms: always `weaponArm(bp, accent, blade)`. `blade` passes `glow ?? accent` as the blade colour; `plain` passes `null`; `club` adds a square `headR*1.1` wide at the far end of the arm rect; `orb` adds a circle of radius `headR*0.7` in `glow ?? accent` at the far end.
- Back (drawn first, behind everything): `cape` poly from the shoulders swaying back and down; `wings` two polys that flap with `sin(TAU*t/flapTicks)`, tips never above `bp.top - 8`; `spines` 3 to 5 triangles along the back; `orbs` 3 circles of radius `headR*0.45` orbiting the body centre at `rx = w/2 - r`, `ry = h*0.3` with `orbitTicks`; `shell` an arch poly over the back in `accent`.
- Trim (drawn last, on the torso anchors): `stripes` 2 to 3 thin `accent` bars; `core` a `glow ?? accent` circle pulsing by `corePulse`; `runes` 3 to 4 small `accent` squares; `none`.

- [ ] **Step 1: Write the failing tests** (append):

```ts
import { createInitialState, type GameState } from '../src/game/state';
import { bossFigure, type Primitive } from '../src/ui/look/figures';
import { bossDrawBox } from '../src/ui/look/pose';
import { LOOK } from '../src/ui/look/tuning';

const COLORS = { body: '#3a6ea5', accent: '#e8a23a', glow: null as string | null };
const MARGIN = 24;

function extremes(p: Primitive): { xs: number[]; ys: number[] } {
  if (p.kind === 'rect') return { xs: [p.x, p.x + p.w], ys: [p.y, p.y + p.h] };
  if (p.kind === 'circle') return { xs: [p.x - p.r, p.x + p.r], ys: [p.y - p.r, p.y + p.r] };
  return { xs: p.points.map((q) => q[0]), ys: p.points.map((q) => q[1]) };
}
function bounds(list: Primitive[]): { l: number; r: number; t: number; b: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const p of list) { const e = extremes(p); xs.push(...e.xs); ys.push(...e.ys); }
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}
const fightState = (seed: number, tick: number): GameState => ({ ...createInitialState(generateBoss(seed), seed), tick });

describe('generated figures', () => {
  it('draw inside the box, fill most of it and respect the shape cap, for 200 seeds and both facings', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const boss = generateBoss(seed);
      for (const facing of [1, -1] as const) {
        for (const tick of [0, 13, 57]) {
          const s = fightState(seed, tick);
          const state: GameState = { ...s, boss: { ...s.boss, facing } };
          const shapes = bossFigure(state, boss, COLORS);
          expect(shapes.length).toBeLessThanOrEqual(LOOK.genFigure.maxShapes);
          const box = bossDrawBox(state.boss, boss);
          const cx = state.boss.x;
          const b = bounds(shapes);
          expect(b.l).toBeGreaterThanOrEqual(cx - boss.width / 2 - MARGIN);
          expect(b.r).toBeLessThanOrEqual(cx + boss.width / 2 + MARGIN);
          expect(b.t).toBeGreaterThanOrEqual(box.top - MARGIN);
          expect(b.b).toBeLessThanOrEqual(box.top + box.height + MARGIN);
        }
      }
    }
  });

  it('is deterministic: the same state gives the same shapes', () => {
    const boss = generateBoss(11);
    const state = fightState(11, 30);
    expect(bossFigure(state, boss, COLORS)).toEqual(bossFigure(state, boss, COLORS));
  });

  it('mirrors when the boss faces the other way', () => {
    const boss = generateBoss(5);
    const s = fightState(5, 20);
    const right = bossFigure({ ...s, boss: { ...s.boss, facing: 1 } }, boss, COLORS);
    const left = bossFigure({ ...s, boss: { ...s.boss, facing: -1 } }, boss, COLORS);
    const cx = s.boss.x;
    const mirror = (p: Primitive): Primitive =>
      p.kind === 'rect' ? { ...p, x: 2 * cx - (p.x + p.w) }
      : p.kind === 'circle' ? { ...p, x: 2 * cx - p.x }
      : { ...p, points: p.points.map(([x, y]): [number, number] => [2 * cx - x, y]) };
    const a = right.map(mirror).map(extremes);
    const b = left.map(extremes);
    expect(a.length).toBe(b.length);
    a.forEach((e, i) => e.xs.slice().sort().forEach((v, k) => expect(v).toBeCloseTo(b[i]!.xs.slice().sort()[k]!, 5)));
  });

  it('shows the attack pose arm while an attack winds up', () => {
    const boss = generateBoss(9);
    const attack = boss.attacks[0]!;
    const s = fightState(9, 40);
    const idle = bossFigure(s, boss, COLORS);
    const winding = bossFigure(
      { ...s, boss: { ...s.boss, mode: 'attack', attackId: attack.id, attackTick: 4 } }, boss, COLORS);
    expect(JSON.stringify(winding)).not.toBe(JSON.stringify(idle));
  });

  it('does not touch hand-built bosses', () => {
    expect(bossFigure(createInitialState(DUELIST, 1), DUELIST, COLORS)).toEqual(
      bossFigure(createInitialState(DUELIST, 999), DUELIST, COLORS),
    );
  });
});
```

- [ ] **Step 2:** Run the test file. Expected: the new `bossFigure` tests FAIL (the generic figure has no cap and ignores the seed; the box check may already pass, the cap and determinism checks drive the work) or fail to compile until `generatedFigure` exists. Keep the failing output for the record.
- [ ] **Step 3:** Implement `generatedFigure` following the geometry table and the parts list above. Shape order is back piece, plan shapes, head circle and head parts, arm (`weaponArm` and its extra), trim. Keep each plan, head, arm, back and trim in its own small function so each stays short. Count shapes while building and never push past `maxShapes` (drop trim first, then back, never the plan or the arm).
- [ ] **Step 4:** Run the test file. Expected: PASS. Adjust geometry (not the test limits) if a plan leaves its box or fills too little.

---

### Task 4: Use it for the generated boss, and check it on a screen

**Files:**
- Modify: `src/ui/look/figures.ts` (`bossFigure` default branch and imports)

**Interfaces:**
- Consumes: `figureRecipe`, `generatedFigure` from Task 2 and 3. The seed is `state.seed` (the same one `moodFor` uses in `render.ts`).

- [ ] **Step 1:** In `bossFigure`, before `default`, add:

```ts
    case 'generated':
      return generatedFigure(bp, figureRecipe(state.seed, boss), colors);
```

  Keep `genericFigure` for any other unknown id.
- [ ] **Step 2:** Run `npm run typecheck && npm test`. Expected: all pass (the Task 3 tests now run through `bossFigure`).
- [ ] **Step 3:** Run `npm run dev` and use the feature in a browser: pick Generated, fight several times with different seeds, watch at least five looks, and check with Effects on and off, both facings, a leap and a wind-up. Report honestly what was and was not seen.
- [ ] **Step 4:** Run `npm run build && npm run check:dist`. Expected: pass.

---

### Task 5: Docs

**Files:**
- Modify: `docs/SPEC.md` (entry after the backdrop entries), `docs/phone-testing.md`, `docs/backlog.md`

- [ ] **Step 1:** `SPEC.md`: add an entry "Generated boss figures" stating the LOCKED decisions and DELEGATED numbers from the spec, marked built and awaiting the owner's look on the phone.
- [ ] **Step 2:** `phone-testing.md`: add a "Generated figures" checklist: fight Generated ten times and confirm each boss looks clearly different; casters look like casters (orbs, hood, eye) and eruption bosses have spines or a crown; every wind-up arm is easy to see; nothing is cut off at the box edges; the frame rate is as smooth as with a hand-built boss; hand-built bosses look exactly as before. Say where the numbers to tweak live (`LOOK.genFigure`, the tables in `generated-figure.ts`).
- [ ] **Step 3:** `backlog.md`: list what is left out: damage and wear during the fight, figures that change during a fight, figures for flying generated bosses, a second arm.
- [ ] **Step 4:** Run `npm test` one last time. Then report to the owner in plain language. Do not commit until asked.

## Self-Review

- Spec coverage: plans and parts (Tasks 2 and 3), loose attack hints (Task 2 table and tests), generated only (Task 4 routes `generated`, Task 3 test on hand-built), no mid-fight change (recipe depends only on the seed and the boss), look only (no game file changes; `GAME_VERSION` untouched), phone limits (`maxShapes`, flat shapes, tuning in `LOOK.genFigure`), tests and docs (Tasks 3 and 5).
- Types: `Recipe`, `Plan`, `Head`, `ArmStyle`, `Back`, `Trim` and the lists are defined in Task 2 and used unchanged in Tasks 3 and 4; `BossPose`, `forwardRect`, `forwardPoly` and `weaponArm` move in Task 1 and are consumed in Task 3.

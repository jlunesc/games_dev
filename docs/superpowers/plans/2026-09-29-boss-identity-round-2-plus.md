# Boss Identity, Round 2 and Beyond: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every hand-built boss (except the Ember Duelist) its own way of moving and fighting, by adding a small set of new engine mechanics (temper, hold, combos, per-phase spacing, blink, lingering embers, side bolts, hit reactions, a facing shield) and then using them in the boss files, with matching looks and sounds.

**Architecture:** Every new mechanic is an optional field on the boss data (`src/bosses/schema.ts`, checked in `src/bosses/parse.ts`), so a boss file that does not use it plays exactly as before. The engine (`src/game/boss.ts`, `shots.ts`, `step.ts`) reads the new fields; nothing draws from the seeded random generator unless the mechanic is used, and nothing during the study. Looks (`src/ui/look/`) and sounds (`src/ui/sound/`) only read the game state. Boss files are changed last, after every mechanic exists and is tested.

**Tech Stack:** TypeScript (strict), Vitest, Vite, Canvas 2D, Web Audio. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-boss-identity-design.md` (analysis and identity table). Round 1 (data only) is already merged as game version 0.9.0. This plan is Rounds 2 to 4 plus the owner's extra ideas from the later conversation: a boss that gets angrier when left alone ("temper"), a boss that reacts when hit, a shield on the Brass Sentinel that only opens from behind, ground-covering attacks, and bolts from the arena sides for the Storm Kite.

## Global Constraints

- No backend, accounts or uploads. No third-party scripts, trackers or CDN-loaded code. No new dependencies.
- Strict Content Security Policy: no inline scripts, no `style="..."`. Style through CSS classes or `el.style.setProperty(...)`; write DOM with `textContent`, never `innerHTML`.
- TypeScript strict mode. `npm run typecheck` must pass after every task.
- Fixed timestep. The seeded generator is drawn only through `draw(s)` in `src/game/boss.ts`. A new mechanic must add **no** draws when a boss does not use it, and **none during the study**. `tests/duelist-golden.test.ts` must keep passing unchanged (the Ember Duelist, the Trainee and generated bosses use none of the new fields).
- Two-boss fights (`s.partners.length > 0`, the Hound and Sage pair) keep their current tuning: temper, hit reaction and shield are switched off for them.
- Looks (`src/ui/look/`) never change how a fight plays. Sound (`src/ui/sound/`) only reads the game through `cues.ts`, never changes a fight or a recording. Every tunable colour, size, volume and pitch lives in `src/ui/look/tuning.ts` or `src/ui/sound/tuning.ts`.
- Bosses are JSON files in `src/bosses/`, checked by `parseBoss`. When the format changes, `docs/bosses.md` and the tests change too.
- `GAME_VERSION` in `src/stats/record.ts` is bumped **once**, in the last task (0.9.0 to 0.10.0). The stats schema (`schemaVersion`) does not change.
- Phone performance (Galaxy S21): effects stay light: cap counts, pre-render, no per-frame blur.
- Exported stats and player data are never committed.
- **Commit messages are plain: no `Co-Authored-By`, no Claude or Anthropic attribution line, in any commit or pull request.** Do not push; the owner decides that.
- All numbers in boss files and `params.ts` are first guesses; the owner tunes them after phone play. Tests must check behaviour ("gets longer", "is blocked"), not exact tuned numbers, except where a task says otherwise.

## File Map

| File | What changes |
|---|---|
| `src/bosses/schema.ts`, `src/bosses/parse.ts` | New optional fields and their checks (every task 1 to 8) |
| `src/game/params.ts` | `TEMPER`, `EMBER` constants |
| `src/game/state.ts` | New `BossState` fields (`temper`, `comboQueue`, `holdLeft`, `blinkToX`, `reactCooldown`, `turnTicks`), event `bossBlocked`. Whether the shield is up is not a field: `shieldUp(b, boss)` is a derived function in `geometry.ts`, like `bossHidden(b, boss)` |
| `src/game/boss.ts` | Temper weighting, hold, combos, spacing, blink, reaction, shield facing |
| `src/game/shots.ts`, `src/game/geometry.ts` | Embers, side bolts |
| `src/game/step.ts` | Temper relief, shield block, reaction trigger, embers survive a hit |
| `src/game/difficulty.ts` | Dial handling for the new fields |
| `src/stats/analyze.ts` | Held wind-ups measured correctly |
| `src/ui/look/*`, `src/ui/render.ts` | Embers, blink, shield, side warning, temper cue |
| `src/ui/sound/*` | New voices and cues |
| `src/bosses/*.json` | The nine boss identities |
| `docs/bosses.md`, `docs/phone-testing.md`, `docs/SPEC.md` | Format and play-test notes |
| `tests/boss-*.test.ts` | One new test file per mechanic |

---

### Task 1: Temper (a boss left alone gets more dangerous)

A boss counts up while you do not hit it. As the count grows, attacks marked `heavy` become more likely and the pause between attacks gets shorter. A hit lowers the count. Nothing uses the random generator differently: the heavy weight only changes the size of the entries in the existing weighted pick.

**Files:**
- Modify: `src/game/params.ts` (add `TEMPER`)
- Modify: `src/bosses/schema.ts` (`BossDef.temper?`, `PhaseAttack.heavy?`)
- Modify: `src/bosses/parse.ts` (`phase()` attack entries, `parseBoss` return)
- Modify: `src/game/state.ts` (`BossState.temper`, `initialBoss`)
- Modify: `src/game/boss.ts` (`temperLevel`, `chooseAttack`, `updateGap`, `updateBoss`)
- Modify: `src/game/step.ts` (`resolvePlayerAttack` relief)
- Test: `tests/boss-temper.test.ts` (create)
- Possibly fix: any test that builds a `BossState` literal (typecheck will list them; known: `tests/step-study.test.ts` around lines 100 to 115)

**Interfaces:**
- Consumes: `draw`, `chooseAttack`, `updateGap`, `updateBoss` in `src/game/boss.ts`; `resolvePlayerAttack` in `src/game/step.ts`.
- Produces:
  - `TEMPER = { start: 240, ramp: 360, relief: 180, headWeight: 2.5, gapCut: 0.5 }` in `params.ts`.
  - `BossDef.temper?: number` (0 to 1, how strongly this boss reacts to being left alone; absent means not at all).
  - `PhaseAttack.heavy?: boolean`.
  - `BossState.temper: number` (updates spent outside the study, capped at `TEMPER.start + TEMPER.ramp`, lowered by `TEMPER.relief` per hit).
  - `export function temperLevel(s: GameState, boss: BossDef, b: BossState): number` returning 0 to 1 (0 when the boss has no `temper`, when the study is running, or when the fight has partners).

- [ ] **Step 1: Write the failing test**

Create `tests/boss-temper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { temperLevel } from '../src/game/boss';
import { TEMPER } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { isWindup, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, run, withInput } from './helpers';

const FULL = TEMPER.start + TEMPER.ramp;

const strike = (id: string): AttackDef => ({
  id,
  name: id,
  pose: 'sideways',
  class: 'mustDodge',
  damage: 1,
  windup: 6,
  active: 4,
  recovery: 4,
  range: { min: 0, max: 1e9 },
  hits: [{ from: 6, to: 10, x0: 0, x1: 50, bottom: 0, top: 50 }],
});

/** A boss with a light and a heavy attack of equal weight that never walks and never chains. */
function tempered(strength: number | undefined, gap = 1): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    predictability: 0,
    ...(strength === undefined ? {} : { temper: strength }),
    attacks: [strike('light'), strike('heavy')],
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: [
          { id: 'light', weight: 1 },
          { id: 'heavy', weight: 1, heavy: true },
        ],
        gap,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 100,
        retreatSpeed: 100,
      },
    ],
  };
}

/** The share of picks that are the heavy attack when the boss's temper is held at `temper` for the whole run. */
const heavyShare = (boss: BossDef, temper: number): number => {
  let s = createInitialState(boss, 7);
  s.player.health = 1e9;
  const ids: string[] = [];
  for (let n = 0; n < 4000; n++) {
    s.boss.temper = temper;
    s = step(s, NO_INPUT, boss);
    if (s.events.some(isWindup)) ids.push(s.boss.attackId ?? '');
  }
  return ids.filter((id) => id === 'heavy').length / ids.length;
};

describe('temper: parsing', () => {
  const base = JSON.parse(JSON.stringify(DUELIST)) as Record<string, unknown>;

  it('accepts a temper strength and a heavy flag', () => {
    const data = JSON.parse(JSON.stringify(base)) as { temper?: number; phases: { attacks: { heavy?: boolean }[] }[] };
    data.temper = 0.5;
    data.phases[0]!.attacks[0]!.heavy = true;
    const boss = parseBoss(data);
    expect(boss.temper).toBe(0.5);
    expect(boss.phases[0]!.attacks[0]!.heavy).toBe(true);
  });

  it('rejects a strength outside 0 to 1 and a heavy flag that is not true or false', () => {
    const tooBig = JSON.parse(JSON.stringify(base)) as { temper?: number };
    tooBig.temper = 2;
    expect(() => parseBoss(tooBig)).toThrow(/boss\.temper/);
    const badFlag = JSON.parse(JSON.stringify(base)) as { phases: { attacks: { heavy?: unknown }[] }[] };
    badFlag.phases[0]!.attacks[0]!.heavy = 'yes';
    expect(() => parseBoss(badFlag)).toThrow(/heavy/);
  });

  it('leaves a boss without the fields exactly as it was', () => {
    const boss = parseBoss(base);
    expect('temper' in boss).toBe(false);
    expect(boss.phases[0]!.attacks.every((a) => !('heavy' in a))).toBe(true);
  });
});

describe('temper: counting', () => {
  it('counts every update of a fight, stops at the cap, and does not count during the study', () => {
    const boss = tempered(1);
    const fight = run(createInitialState(boss, 1), 30, () => NO_INPUT, boss);
    expect(fight[29]!.boss.temper).toBe(30);
    const long = run(createInitialState(boss, 1), FULL + 50, () => NO_INPUT, boss);
    expect(long[long.length - 1]!.boss.temper).toBe(FULL);
    const studying = run(createInitialState(boss, 1, 1), 5, () => NO_INPUT, boss);
    expect(studying[4]!.boss.temper).toBe(0);
  });

  it('a hit lowers it by the relief amount', () => {
    const s = createInitialState(QUIET_BOSS, 1);
    s.boss.temper = 300;
    s.player.x = s.boss.x - 60;
    s.player.prevX = s.player.x;
    let state = s;
    let updates = 0;
    while (!state.events.includes('bossHit') && updates < 30) {
      state = step(state, withInput({ attackPressed: true }), QUIET_BOSS);
      updates += 1;
    }
    expect(state.events).toContain('bossHit');
    expect(state.boss.temper).toBe(300 + updates - TEMPER.relief);
  });
});

describe('temper: effect', () => {
  it('has no level without a strength, in the study, or in a pair fight', () => {
    const s = createInitialState(tempered(1), 1);
    s.boss.temper = FULL;
    expect(temperLevel(s, tempered(1), s.boss)).toBe(1);
    expect(temperLevel(s, tempered(undefined), s.boss)).toBe(0);
    expect(temperLevel({ ...s, study: { ...s.study, active: true } }, tempered(1), s.boss)).toBe(0);
    expect(temperLevel({ ...s, partners: [s.boss] }, tempered(1), s.boss)).toBe(0);
  });

  it('makes the heavy attack clearly more likely when it is high, and changes nothing without a strength', () => {
    const calm = heavyShare(tempered(1), 0);
    const angry = heavyShare(tempered(1), FULL);
    const none = heavyShare(tempered(undefined), FULL);
    expect(angry).toBeGreaterThan(calm + 0.15);
    expect(Math.abs(none - calm)).toBeLessThan(0.05);
  });

  it('shortens the pause between attacks when it is high', () => {
    const boss = tempered(1, 100);
    const calm = createInitialState(boss, 1);
    const angry = createInitialState(boss, 1);
    angry.boss.temper = FULL;
    const first = (s: typeof calm): number => windupUpdates(run(s, 200, () => NO_INPUT, boss))[0]!;
    expect(first(angry)).toBeLessThan(first(calm) - 20);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-temper.test.ts`
Expected: FAIL (compile errors: `temperLevel`, `TEMPER`, `temper` do not exist).

- [ ] **Step 3: Implement**

`src/game/params.ts`, append:

```ts
/**
 * Temper: a boss that is left alone gets angrier. It builds for `start` + `ramp` updates (level 0 up to `start`, then rising to 1
 * over `ramp`), each hit takes `relief` off. At level 1 a `heavy` attack is `1 + headWeight * strength` times as likely and the
 * pause between attacks is `gapCut * strength` shorter.
 */
export const TEMPER = { start: 240, ramp: 360, relief: 180, headWeight: 2.5, gapCut: 0.5 };
```

`src/bosses/schema.ts`: in `PhaseAttack` add
```ts
  /** A heavy attack becomes more likely as the boss's temper rises (see `BossDef.temper`). */
  heavy?: boolean;
```
and in `BossDef` add
```ts
  /** 0 to 1: how strongly the boss gets angrier the longer it is not hit (heavy attacks likelier, shorter pauses). Absent means not at all. */
  temper?: number;
```

`src/bosses/parse.ts`: in `phase()` replace the `attacks` map return with
```ts
    const heavy = e.heavy;
    if (heavy !== undefined && typeof heavy !== 'boolean') fail(`${path}.attacks[${i}].heavy`, 'expected true or false');
    return {
      id,
      weight: num(e.weight, `${path}.attacks[${i}].weight`, { min: 0.0001 }),
      ...(heavy === true ? { heavy: true } : {}),
    };
```
and in `parseBoss`, before the `return`, add `const parsedTemper = o.temper === undefined ? undefined : num(o.temper, 'boss.temper', { min: 0, max: 1 });` and in the returned object add `...(parsedTemper === undefined ? {} : { temper: parsedTemper }),` after the `flight` line.

`src/game/state.ts`: add to `BossState` (after `cycleIndex`):
```ts
  /** Updates spent in the real fight (not the study), capped; a hit lowers it. See `TEMPER`. */
  temper: number;
```
and `temper: 0,` after `cycleIndex: 0,` in `initialBoss`.

`src/game/boss.ts`: change the params import to `import { TEMPER, WORLD } from './params';` and add, after `draw`:

```ts
/** 0 to 1: how angry the boss is. Zero without a `temper` strength, during the study, and in a fight with partners. */
export function temperLevel(s: GameState, boss: BossDef, b: BossState): number {
  if (boss.temper === undefined || s.study.active || s.partners.length > 0) return 0;
  return Math.min(1, Math.max(0, (b.temper - TEMPER.start) / TEMPER.ramp));
}
```

In `chooseAttack`, replace the `total`/`roll` block with:

```ts
  const anger = boss.temper === undefined ? 0 : boss.temper * temperLevel(s, boss, b);
  const weightOf = (entry: PhaseAttack): number =>
    entry.heavy === true ? entry.weight * (1 + anger * TEMPER.headWeight) : entry.weight;
  const total = pool.reduce((sum, entry) => sum + weightOf(entry), 0);
  let roll = weightRoll * total;
  for (const entry of pool) {
    roll -= weightOf(entry);
    if (roll < 0) return entry.id;
  }
```
and add `PhaseAttack` to the schema import at the top of `boss.ts`.

In `updateGap`, replace `if (b.modeTick >= phase.gap && mayCommit) {` with:
```ts
  const anger = boss.temper === undefined ? 0 : boss.temper * temperLevel(s, boss, b);
  const wait = Math.round(phase.gap * (1 - TEMPER.gapCut * anger));
  if (b.modeTick >= wait && mayCommit) {
```

In `updateBoss`, right after `b.modeTick += 1;` add:
```ts
  if (!s.study.active) b.temper = Math.min(b.temper + 1, TEMPER.start + TEMPER.ramp);
```

`src/game/step.ts`: import `TEMPER` (`import { GAME, PLAYER, TEMPER, WORLD } from './params';`) and in `resolvePlayerAttack`, straight after `s.events.push('bossHit');` add `b.temper = Math.max(0, b.temper - TEMPER.relief);`.

Then run `npm run typecheck` and fix every `BossState` literal it reports by adding `temper: 0` (`tests/step-study.test.ts` is one).

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-temper.test.ts tests/duelist-golden.test.ts && npm run typecheck`
Expected: PASS. If `tests/duelist-golden.test.ts` compares whole states, add `temper` to what it expects only if it fails; the Duelist has no `temper` strength so behaviour must be identical.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Statistical tests (for example the analysis and generated-boss tests) are unaffected because no boss file uses `temper` yet. If one fails, the cause is the new `temper` field in a state comparison; fix the expectation, not the mechanic.

- [ ] **Step 6: Commit**

```bash
git add src/game/params.ts src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/boss.ts src/game/step.ts tests/boss-temper.test.ts tests/step-study.test.ts
git commit -m "feat: temper, a boss left alone gets angrier (heavy attacks likelier, shorter pauses)"
```

---

---

### Task 2: Combos and per-phase spacing

A phase can list **combos**: fixed sequences of attacks ("cut, cut, carry across"). When the normal weighted pick lands on a combo's first step, the rest of the steps follow one after another with no pause. A phase can also set its own **spacing** (how close or far the boss likes to stand), so a boss can push closer in a later phase. Neither mechanic draws extra random numbers.

**Files:**
- Modify: `src/bosses/schema.ts` (`PhaseDef.combos?`, `PhaseDef.spacing?`)
- Modify: `src/bosses/parse.ts` (`phase()`)
- Modify: `src/game/state.ts` (`BossState.comboQueue`, `initialBoss`)
- Modify: `src/game/boss.ts` (`startCombo`, `updateGap`, `finishAttack`, `enterGap`, `beginTransition`)
- Modify: `src/game/difficulty.ts` (`adjustPhase` keeps only combos whose first step survived)
- Modify: `tests/boss-helpers.ts` (add `melee`, `customBoss`; reused by later tasks)
- Test: `tests/boss-combos.test.ts` (create)
- Possibly fix: `BossState` literals that typecheck reports (add `comboQueue: []`)

**Interfaces:**
- Consumes: `chooseAttack`, `updateGap`, `finishAttack`, `enterGap`, `beginTransition` in `src/game/boss.ts`; `adjustPhase` in `src/game/difficulty.ts`; `attackLength` (exported from `boss.ts`).
- Produces:
  - `PhaseDef.combos?: string[][]` (2 to 4 attack ids per combo; the first id must be in the phase's own attack list, the others only need to exist in `BossDef.attacks`; first ids are unique inside a phase; an empty list is the same as absent).
  - `PhaseDef.spacing?: { min: number; max: number }` (replaces `BossDef.spacing` while that phase is on; `max > min`).
  - `BossState.comboQueue: string[]` (attack ids still to come in the running combo).
  - In `tests/boss-helpers.ts`:
    - `melee(id: string, over?: Partial<AttackDef>): AttackDef` (a `mustDodge` sideways swing: windup 6, active 4, recovery 4, usable from any distance, one hit window `from 6 to 10, x 0..50, height 0..50`).
    - `customBoss(attacks: AttackDef[], phaseOver: Partial<PhaseDef> & { attacks: PhaseAttack[] }, bossOver?: Partial<BossDef>): BossDef` (the Duelist with the given attacks and one phase that never walks, never chains and waits 1 update between attacks unless `phaseOver` says otherwise).

- [ ] **Step 1: Add the two test helpers**

In `tests/boss-helpers.ts` change the schema import to `import type { AttackDef, BossDef, PhaseAttack, PhaseDef } from '../src/bosses/schema';` and append:

```ts
/** A plain must-dodge swing (wind-up 6, active 4, recovery 4) that can be started from any distance. */
export const melee = (id: string, over: Partial<AttackDef> = {}): AttackDef => ({
  id,
  name: id,
  pose: 'sideways',
  class: 'mustDodge',
  damage: 1,
  windup: 6,
  active: 4,
  recovery: 4,
  range: { min: 0, max: 1e9 },
  hits: [{ from: 6, to: 10, x0: 0, x1: 50, bottom: 0, top: 50 }],
  ...over,
});

/**
 * The Duelist's body with the given attacks and a single phase that never walks and never chains. Pass what the phase
 * should change (at least its `attacks`) in `phaseOver`, and boss-level changes in `bossOver`.
 */
export function customBoss(
  attacks: AttackDef[],
  phaseOver: Partial<PhaseDef> & { attacks: PhaseAttack[] },
  bossOver: Partial<BossDef> = {},
): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    predictability: 0,
    attacks,
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        gap: 1,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: 100,
        retreatSpeed: 100,
        ...phaseOver,
      },
    ],
    ...bossOver,
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/boss-combos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength, beginTransition } from '../src/game/boss';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { attackIds, customBoss, melee, windupUpdates } from './boss-helpers';
import { advance, run } from './helpers';

const attacks = [melee('a'), melee('b'), melee('c'), melee('x')];

/** Only `a` is in the phase list; `b` and `c` can only ever be reached through the combo. */
const comboBoss = (): BossDef =>
  customBoss(attacks, { attacks: [{ id: 'a', weight: 1 }], combos: [['a', 'b', 'c']] });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

describe('combos: parsing', () => {
  it('accepts a combo and per-phase spacing', () => {
    const data = clone(comboBoss());
    data.phases[0].spacing = { min: 100, max: 200 };
    const boss = parseBoss(data);
    expect(boss.phases[0]!.combos).toEqual([['a', 'b', 'c']]);
    expect(boss.phases[0]!.spacing).toEqual({ min: 100, max: 200 });
  });

  it('rejects a bad combo', () => {
    const tooShort = clone(comboBoss());
    tooShort.phases[0].combos = [['a']];
    expect(() => parseBoss(tooShort)).toThrow(/combos\[0\]/);
    const tooLong = clone(comboBoss());
    tooLong.phases[0].combos = [['a', 'b', 'c', 'b', 'c']];
    expect(() => parseBoss(tooLong)).toThrow(/combos\[0\]/);
    const unknown = clone(comboBoss());
    unknown.phases[0].combos = [['a', 'nope']];
    expect(() => parseBoss(unknown)).toThrow(/unknown attack "nope"/);
    const firstNotInPhase = clone(comboBoss());
    firstNotInPhase.phases[0].combos = [['b', 'c']];
    expect(() => parseBoss(firstNotInPhase)).toThrow(/first step/);
    const sameFirst = clone(comboBoss());
    sameFirst.phases[0].combos = [['a', 'b'], ['a', 'c']];
    expect(() => parseBoss(sameFirst)).toThrow(/same attack/);
  });

  it('treats an empty combo list as no combos and rejects spacing whose max is not above its min', () => {
    const empty = clone(comboBoss());
    empty.phases[0].combos = [];
    expect('combos' in parseBoss(empty).phases[0]!).toBe(false);
    const bad = clone(comboBoss());
    bad.phases[0].spacing = { min: 300, max: 300 };
    expect(() => parseBoss(bad)).toThrow(/spacing/);
  });
});

describe('combos: playing', () => {
  it('runs the steps one straight after another, then waits again', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 3);
    s.player.health = 1e9;
    const states = run(s, 200, () => NO_INPUT, boss);
    const ids = attackIds(states);
    expect(ids.slice(0, 6)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    const winds = windupUpdates(states);
    const length = attackLength(attacks[0]!);
    expect(winds[1]! - winds[0]!).toBe(length + 1);
    expect(winds[2]! - winds[1]!).toBe(length + 1);
    expect(winds[3]! - winds[2]!).toBeGreaterThan(length + 1);
  });

  it('starts no combo during the study', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 3, 1);
    s.player.health = 1e9;
    const states = run(s, 120, () => NO_INPUT, boss);
    const studied = states.filter((x) => x.study.active);
    expect(studied.length).toBeGreaterThan(0);
    expect(studied.every((x) => x.boss.comboQueue.length === 0)).toBe(true);
  });

  it('forgets the rest of a combo when the boss changes phase', () => {
    const boss = comboBoss();
    const s = createInitialState(boss, 1);
    s.boss.comboQueue = ['b', 'c'];
    beginTransition(s, boss);
    expect(s.boss.comboQueue).toEqual([]);
  });
});

describe('combos: difficulty dials', () => {
  it('keeps a combo only while its first step is still in the phase', () => {
    const boss = customBoss(
      attacks,
      {
        attacks: [
          { id: 'a', weight: 1 },
          { id: 'x', weight: 5 },
        ],
        combos: [
          ['a', 'b'],
          ['x', 'c'],
        ],
      },
    );
    const full = applyDials(boss, NORMAL_DIALS);
    expect(full.phases[0]!.combos).toEqual([['a', 'b'], ['x', 'c']]);
    const fewer = applyDials(boss, { ...NORMAL_DIALS, variety: 0.5 });
    expect(fewer.phases[0]!.attacks.map((e) => e.id)).toEqual(['x']);
    expect(fewer.phases[0]!.combos).toEqual([['x', 'c']]);
  });
});

describe('per-phase spacing', () => {
  const stand = (phaseSpacing: { min: number; max: number } | undefined): number => {
    const boss = customBoss(
      [melee('a')],
      {
        attacks: [{ id: 'a', weight: 1 }],
        gap: 1e6,
        retreatSpeed: 600,
        ...(phaseSpacing === undefined ? {} : { spacing: phaseSpacing }),
      },
    );
    const s = createInitialState(boss, 1);
    s.boss.x = 700;
    s.player.x = 600;
    s.player.prevX = 600;
    const end = advance(s, 60, NO_INPUT, boss);
    return Math.abs(end.boss.x - end.player.x);
  };

  it('backs the boss off to the phase distance, and leaves it alone without one', () => {
    expect(stand({ min: 300, max: 400 })).toBeGreaterThanOrEqual(290);
    expect(stand(undefined)).toBeLessThan(110);
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run tests/boss-combos.test.ts`
Expected: FAIL (compile errors: `combos`, `spacing` on `PhaseDef`, `comboQueue` do not exist).

- [ ] **Step 4: Implement**

`src/bosses/schema.ts`, in `PhaseDef` (after `opening?`) add:

```ts
  /**
   * Fixed sequences of attacks, 2 to 4 ids each. When the boss's normal pick is the first id of a combo, the rest follow
   * straight after it, one at a time, with no pause. The first id must be in `attacks`; the others need only exist in the boss.
   */
  combos?: string[][];
  /** Where the boss likes to stand in this phase; replaces `BossDef.spacing` while the phase is on. */
  spacing?: { min: number; max: number };
```

`src/bosses/parse.ts`, in `phase()` replace the last line (`return opening === undefined ? result : { ...result, opening };`) with:

```ts
  let combos: string[][] | undefined;
  if (o.combos !== undefined) {
    const firsts = new Set<string>();
    const parsed = list(o.combos, `${path}.combos`).map((entry, i) => {
      const at = `${path}.combos[${i}]`;
      const steps = list(entry, at).map((step, j) => {
        const id = text(step, `${at}[${j}]`);
        if (!attackIds.has(id)) fail(`${at}[${j}]`, `unknown attack "${id}"`);
        return id;
      });
      if (steps.length < 2 || steps.length > 4) fail(at, 'needs 2 to 4 steps');
      const first = steps[0]!;
      if (!attacks.some((a) => a.id === first)) fail(`${at}[0]`, 'the first step must be one of the phase attacks');
      if (firsts.has(first)) fail(at, 'two combos start with the same attack');
      firsts.add(first);
      return steps;
    });
    if (parsed.length > 0) combos = parsed;
  }

  let spacing: { min: number; max: number } | undefined;
  if (o.spacing !== undefined) {
    const sp = object(o.spacing, `${path}.spacing`);
    spacing = {
      min: num(sp.min, `${path}.spacing.min`, { min: 0 }),
      max: num(sp.max, `${path}.spacing.max`, { min: 0 }),
    };
    if (spacing.max <= spacing.min) fail(`${path}.spacing`, '"max" must be greater than "min"');
  }

  return {
    ...result,
    ...(opening === undefined ? {} : { opening }),
    ...(combos === undefined ? {} : { combos }),
    ...(spacing === undefined ? {} : { spacing }),
  };
```

`src/game/state.ts`: add to `BossState` (after `temper`):

```ts
  /** The attacks still to come in the running combo (see `PhaseDef.combos`); empty when no combo is running. */
  comboQueue: string[];
```
and `comboQueue: [],` after `temper: 0,` in `initialBoss`.

`src/game/boss.ts`:

1. After `planChain` add:

```ts
/** When the pick that was just made opens one of the phase's combos, the combo's other steps wait in the queue. */
function startCombo(b: BossState, phase: PhaseDef, id: string): void {
  const combo = phase.combos?.find((steps) => steps[0] === id);
  b.comboQueue = combo === undefined ? [] : combo.slice(1);
}
```

2. In `enterGap` add `b.comboQueue = [];` after `b.chainLeft = 0;`. In `beginTransition` add `b.comboQueue = [];` after `b.chainLeft = 0;`.

3. In `updateGap`, replace the three `boss.spacing` uses by a local:

```ts
  const spacing = phase.spacing ?? boss.spacing;
  if (distance > spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
```
and in the commit block, change `id = chooseAttack(s, boss, phase, index);` to:

```ts
      id = chooseAttack(s, boss, phase, index);
      if (id !== null) startCombo(b, phase, id);
```

4. In `finishAttack`, right after the study branch (before `if (b.chainLeft > 0)`) add:

```ts
  const nextStep = b.comboQueue.shift();
  if (nextStep !== undefined) {
    b.attackId = null;
    b.attackTick = 0;
    b.pendingAttackId = nextStep;
    b.mode = 'approach';
    b.modeTick = 0;
    return;
  }
```
and in the chain branch, after `if (id !== null) {` add `startCombo(b, phase, id);` as its first line.

`src/game/difficulty.ts`, in `adjustPhase` replace the return with:

```ts
  const keptIds = new Set(kept.map((entry) => entry.id));
  const combos = phase.combos?.filter((steps) => keptIds.has(steps[0]!));
  return {
    ...phase,
    attacks: kept,
    ...(combos === undefined ? {} : { combos }),
    gap: Math.max(0, Math.round(phase.gap / d.frequency)),
    walkSpeed: phase.walkSpeed * d.speed,
    retreatSpeed: phase.retreatSpeed * d.speed,
  };
```

Run `npm run typecheck` and add `comboQueue: []` to every `BossState` literal it reports (`tests/step-study.test.ts` is one).

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run tests/boss-combos.test.ts tests/duelist-golden.test.ts tests/difficulty.test.ts && npm run typecheck`
Expected: PASS. If `duelist-golden` compares whole states and fails only because of the new `comboQueue` field, add the field to the expectation; the Duelist's behaviour must be otherwise identical.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file uses combos or spacing yet).

- [ ] **Step 7: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/boss.ts src/game/difficulty.ts tests/boss-helpers.ts tests/boss-combos.test.ts tests/step-study.test.ts
git commit -m "feat: attack combos and per-phase spacing for bosses"
```

---

### Task 3: Hold (a wind-up that lingers a random time)

A `hold` attack freezes on the last update of its wind-up for a random 0 to `hold` extra updates before it strikes, so the player cannot time it by counting. It only applies to must-dodge attacks without shots. The random number is drawn only by an attack that has `hold`, and never in the study.

**Files:**
- Modify: `src/bosses/schema.ts` (`AttackDef.hold?`)
- Modify: `src/bosses/parse.ts` (`attack()`)
- Modify: `src/game/state.ts` (`BossState.holdLeft`)
- Modify: `src/game/boss.ts` (`startAttack`, `updateAttack`)
- Modify: `src/game/difficulty.ts` (`adjustAttack` floor)
- Modify: `src/ui/sound/cues.ts` (`attackStarted`)
- Modify: `src/stats/analyze.ts` (`OpenAttack.held`, `observe`, `occurrence`, the start block)
- Test: `tests/boss-hold.test.ts` (create; NOT `tests/hold.test.ts`, which is about something else)

**Interfaces:**
- Consumes: `startAttack`, `updateAttack` in `boss.ts`; `attackStarted` in `cues.ts`; `analyzeFight` in `analyze.ts`.
- Produces:
  - `AttackDef.hold?: number` (whole number 1 to 60; only for `mustDodge`, needs `windup >= 2`, no `shots`).
  - `BossState.holdLeft: number` (extra updates of hold still to spend in the running attack).
  - `OpenAttack.held: number` in `analyze.ts` (extra updates the running attack spent frozen; the danger times in the stats are shifted by it).

- [ ] **Step 1: Write the failing test**

Create `tests/boss-hold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { analyzeFight } from '../src/stats/analyze';
import { attackStarted } from '../src/ui/sound/cues';
import { customBoss, melee, updatesWith, windupUpdates } from './boss-helpers';
import { run } from './helpers';

const holder = (hold: number | undefined, over: Partial<BossDef> = {}): BossDef =>
  customBoss(
    [melee('slam', { windup: 8, hits: [{ from: 8, to: 12, x0: 0, x1: 60, bottom: 0, top: 60 }], ...(hold === undefined ? {} : { hold }) })],
    { attacks: [{ id: 'slam', weight: 1 }] },
    over,
  );

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** For each attack: the update its wind-up began and the update the boss's attack tick first reached the strike. */
function windupToStrike(boss: BossDef, seed: number, count = 600): number[] {
  const s = createInitialState(boss, seed);
  s.player.health = 1e9;
  const states = run(s, count, () => NO_INPUT, boss);
  const starts = windupUpdates(states);
  const strikes = states.flatMap((x, i) => (x.boss.mode === 'attack' && x.boss.attackTick === 8 && (i === 0 || states[i - 1]!.boss.attackTick !== 8) ? [i + 1] : []));
  return strikes.map((strike, i) => strike - starts[i]!);
}

describe('hold: parsing', () => {
  it('accepts hold on a must-dodge attack', () => {
    expect(parseBoss(clone(holder(10))).attacks[0]!.hold).toBe(10);
  });

  it('rejects hold on a counterable attack, with shots, with a 1-update wind-up, or out of range', () => {
    const counterable = clone(holder(10));
    counterable.attacks[0].class = 'counterable';
    expect(() => parseBoss(counterable)).toThrow(/hold/);
    const shots = clone(holder(10));
    shots.attacks[0].shots = [{ kind: 'bolt', at: 8, height: 0, size: 30, speed: 600 }];
    expect(() => parseBoss(shots)).toThrow(/hold/);
    const short = clone(holder(10));
    short.attacks[0].windup = 1;
    short.attacks[0].hits[0].from = 1;
    short.attacks[0].hits[0].to = 5;
    expect(() => parseBoss(short)).toThrow(/hold/);
    const big = clone(holder(61));
    expect(() => parseBoss(big)).toThrow(/hold/);
  });
});

describe('hold: playing', () => {
  it('waits a different extra time from one attack to the next, never more than the hold, and never without it', () => {
    const waits = windupToStrike(holder(10), 5);
    expect(waits.length).toBeGreaterThan(10);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...waits)).toBeLessThanOrEqual(8 + 10);
    expect(new Set(waits).size).toBeGreaterThan(3);
    const plain = windupToStrike(holder(undefined), 5);
    expect(new Set(plain).size).toBe(1);
  });

  it('holds nothing during the study', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 5, 1);
    s.player.health = 1e9;
    const states = run(s, 60, () => NO_INPUT, boss);
    const studied = states.filter((x) => x.study.active && x.boss.mode === 'attack');
    expect(studied.every((x) => x.boss.holdLeft === 0)).toBe(true);
  });

  it('does not delay the hit window relative to the frozen tick: the strike still comes at the attack tick the file says', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 9);
    s.player.health = 1e9;
    const states = run(s, 300, () => NO_INPUT, boss);
    const first = states.find((x) => x.boss.mode === 'attack' && x.boss.attackTick === 8);
    expect(first).toBeDefined();
    expect(updatesWith(states, 'bossWindupRed').length).toBeGreaterThan(0);
  });
});

describe('hold: what reads it', () => {
  it('a frozen attack tick does not count as the attack starting again (sound)', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 1);
    const now = { ...s.boss, mode: 'attack' as const, attackId: 'slam', attackTick: 7 };
    expect(attackStarted({ ...now }, { ...now })).toBe(false);
    expect(attackStarted({ ...now, mode: 'approach' as const }, { ...now, attackTick: 0 })).toBe(true);
  });

  it('keeps the warning length and the first danger time right when the wind-up was held (stats)', () => {
    const boss = holder(10);
    const s = createInitialState(boss, 5);
    s.player.health = 1e9;
    const inputs = Array.from({ length: 400 }, () => NO_INPUT);
    const analysis = analyzeFight(s, inputs, boss);
    const occurrences = analysis.attacks.filter((a) => a.attackId === 'slam');
    expect(occurrences.length).toBeGreaterThan(5);
    for (const a of occurrences) {
      expect(a.windupTicks).toBeGreaterThanOrEqual(8);
      expect(a.windupTicks).toBeLessThanOrEqual(18);
      expect(a.firstDangerTick).toBe(a.startTick + a.windupTicks);
    }
  });
});

describe('hold: difficulty dials', () => {
  it('never lets the warning length dial shrink a held wind-up below 2', () => {
    const boss = holder(10);
    const changed = applyDials({ ...boss, attacks: boss.attacks.map((a) => ({ ...a, windup: 2, hits: [{ ...a.hits[0]!, from: 2, to: 6 }] })) }, { ...NORMAL_DIALS, readability: 0.7 });
    expect(changed.attacks[0]!.windup).toBe(2);
  });
});
```

Notes for the implementer: `analyzeFight` takes the initial state, the list of input frames and the boss or fight; check its exact parameter order in `src/stats/analyze.ts` (`export function analyzeFight`) and in `tests/analyze.test.ts` before running, and adjust the call in the last-but-one test to match. `attackLength` is imported for use by later edits of this file and may be removed if unused (lint).

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-hold.test.ts`
Expected: FAIL (compile errors: `hold`, `holdLeft` do not exist).

- [ ] **Step 3: Implement**

`src/bosses/schema.ts`, in `AttackDef` (after `dive?`) add:

```ts
  /**
   * Up to this many extra updates the boss stays frozen on the last update of the wind-up, a random number each time, so the
   * strike cannot be timed by counting. Only for a `mustDodge` attack without shots, with a wind-up of at least 2.
   */
  hold?: number;
```

`src/bosses/parse.ts`, in `attack()`: after the `shots` check that fails on `cls !== 'mustDodge'` add:

```ts
  let hold: number | undefined;
  if (o.hold !== undefined) {
    hold = num(o.hold, `${path}.hold`, { min: 1, max: 60, integer: true });
    if (cls !== 'mustDodge') fail(`${path}.hold`, 'only a "mustDodge" attack can hold');
    if (shots !== undefined) fail(`${path}.hold`, 'an attack with shots cannot hold');
    if (windup < 2) fail(`${path}.hold`, 'needs a wind-up of at least 2');
  }
```
and in the returned object add `...(hold === undefined ? {} : { hold }),` after the `shots` line.

`src/game/state.ts`: add to `BossState` (after `comboQueue`):

```ts
  /** Extra updates the running attack still spends frozen at the end of its wind-up (see `AttackDef.hold`). */
  holdLeft: number;
```
and `holdLeft: 0,` after `comboQueue: [],` in `initialBoss`.

`src/game/boss.ts`, in `startAttack` after `b.pendingAttackId = null;` add:

```ts
  // Only an attack with a hold draws, and never during the study, so every other fight keeps its random sequence.
  b.holdLeft = attack.hold !== undefined && !s.study.active ? Math.floor(draw(s) * (attack.hold + 1)) : 0;
```
In `updateAttack`, straight before `b.attackTick += 1;` add:

```ts
  if (attack.hold !== undefined && b.attackTick === attack.windup - 1 && b.holdLeft > 0) {
    b.holdLeft -= 1;
    return;
  }
```

`src/game/difficulty.ts`, in `adjustAttack` replace the `floor` line with:

```ts
  // A counterable attack keeps at least the counter window, or it could never be countered. A held one keeps 2 so it can hold.
  const floor = attack.class === 'counterable' ? boss.counter.window : attack.hold !== undefined ? 2 : 1;
```

`src/ui/sound/cues.ts`, in `attackStarted` change `now.attackTick <= was.attackTick` to `now.attackTick < was.attackTick` (a frozen tick is the same attack still winding up, not a new one).

`src/stats/analyze.ts`:
1. In the `OpenAttack` interface add `held: number;` (after `windowTaken`) with the comment `/** Updates the attack spent frozen on the end of its wind-up (a hold); danger times are shifted by it. */`.
2. In the block that builds `open = { ... }` add `held: 0,` after `windowTaken: false,`.
3. In `observe`, replace the first lines

```ts
    const { events, tick } = after;
    const t = tick - attack.startTick;
```
with
```ts
    const { events, tick } = after;
    const owner = bossAt(after, attack.boss);
    const was = bossAt(before, attack.boss);
    if (
      was.mode === 'attack' &&
      owner.mode === 'attack' &&
      was.attackId === owner.attackId &&
      owner.attackTick > 0 &&
      owner.attackTick === was.attackTick
    ) {
      attack.held += 1;
    }
    const t = tick - attack.startTick - attack.held;
```
and delete the later line `const owner = bossAt(after, attack.boss);` (it is now declared above).
4. In `occurrence`: change `const firstDanger = open.startTick + open.dangerFrom;` to `const firstDanger = open.startTick + open.held + open.dangerFrom;` and `windupTicks: open.windup,` to `windupTicks: open.windup + open.held,`.

Run `npm run typecheck`, then `npx vitest run tests/sound-cues.test.ts` (the `<` change must not break the existing sound tests).

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-hold.test.ts tests/sound-cues.test.ts tests/analyze.test.ts tests/duelist-golden.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file uses `hold` yet).

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/boss.ts src/game/difficulty.ts src/ui/sound/cues.ts src/stats/analyze.ts tests/boss-hold.test.ts tests/step-study.test.ts
git commit -m "feat: hold, a wind-up that lingers a random extra time"
```

---

### Task 4: Blink (the boss vanishes and reappears somewhere else)

A `blink` attack makes the boss disappear at update `from`. A mark shows where it will reappear (the spot is fixed at that moment, like a leap's landing, so the player can still run away from it). At update `to` the boss is there, turned toward the player. While it is gone nothing can hurt the player and nothing can hit the boss. Blink is the Dancer's and the Sage's way of moving. A "fake" cut is simply a blink whose attack has no hit window: it looks the same until the boss reappears and does nothing. This needs no extra field.

**Files:**
- Modify: `src/bosses/schema.ts` (`BlinkDef`, `AttackDef.blink?`)
- Modify: `src/bosses/parse.ts` (`attack()`)
- Modify: `src/game/state.ts` (`BossState.blinkToX`, `initialBoss`)
- Modify: `src/game/boss.ts` (`blinkLanding`, `updateBlink`, `landBoss`, `updateAttack`)
- Modify: `src/game/geometry.ts` (`bossHidden`)
- Modify: `src/game/step.ts` (`resolvePlayerAttack` skips a hidden boss)
- Modify: `src/game/difficulty.ts` (`adjustAttack`)
- Test: `tests/boss-blink.test.ts` (create)
- Possibly fix: `BossState` literals that typecheck reports (add `blinkToX: null`)

**Interfaces:**
- Consumes: `LeapTarget` (`'player' | 'forward' | 'back'`) from `schema.ts`; `customBoss`, `melee` from `tests/boss-helpers.ts` (Task 2).
- Produces:
  - `BlinkDef { from: number; to: number; target: LeapTarget; distance?: number }`. `from` is at least 1 and before `to`; `to` is at most `windup + active`. For `target: 'player'` the boss lands on the player's x plus `distance` (default 0) on the side of the player away from the boss, so a distance of 80 means "80 units behind the player". For `'forward'` and `'back'` the distance is required (at least 1) and is measured from the boss's own x.
  - `AttackDef.blink?: BlinkDef` (only `mustDodge`; not together with `leap`, `dive`, `shots` or `hold`; its `move` may not overlap it; every hit window starts at `to` or later; an attack with a blink may have no hit windows).
  - `BossState.blinkToX: number | null` (where the running blink will land; null when no blink is running; cleared by `landBoss`).
  - `bossHidden(b: BossState, boss: BossDef): boolean` in `geometry.ts`. Later tasks (looks, sounds, the hit reaction) use it and `blinkToX`.

- [ ] **Step 1: Write the failing test**

Create `tests/boss-blink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { beginTransition } from '../src/game/boss';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { bossHidden } from '../src/game/geometry';
import { PLAYER } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';
import { run } from './helpers';

const cutter = (over: Partial<AttackDef> = {}): AttackDef =>
  melee('cut', {
    windup: 14,
    active: 6,
    recovery: 4,
    hits: [{ from: 14, to: 18, x0: 0, x1: 60, bottom: 0, top: 60 }],
    blink: { from: 4, to: 12, target: 'player', distance: 80 },
    ...over,
  });

const blinker = (over: Partial<AttackDef> = {}): BossDef =>
  customBoss([cutter(over)], { attacks: [{ id: 'cut', weight: 1 }] });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The boss at 700 and the player at 600, so a blink "behind the player" by 80 lands on 520. */
function start(boss: BossDef) {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.player.x = 600;
  s.player.prevX = 600;
  s.player.health = 1e9;
  return s;
}

describe('blink: parsing', () => {
  it('accepts a blink, and an attack with a blink and no hit windows', () => {
    expect(parseBoss(clone(blinker())).attacks[0]!.blink).toEqual({ from: 4, to: 12, target: 'player', distance: 80 });
    const away = clone(blinker({ hits: [], blink: { from: 2, to: 8, target: 'back', distance: 300 } }));
    expect(() => parseBoss(away)).not.toThrow();
  });

  it('rejects a blink that breaks a rule', () => {
    const bad = (change: (attack: Record<string, any>) => void): unknown => {
      const data = clone(blinker());
      change(data.attacks[0]);
      return data;
    };
    expect(() => parseBoss(bad((a) => (a.blink.from = 0)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 4)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 21)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink = { from: 4, to: 12, target: 'forward' })))).toThrow(/distance/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 16)))).toThrow(/hit window/);
    expect(() => parseBoss(bad((a) => (a.class = 'counterable')))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.hold = 5)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.leap = { from: 14, to: 18, height: 50, target: 'player' })))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.shots = [{ kind: 'bolt', at: 14, height: 0, size: 30, speed: 600 }])))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.move = { from: 10, to: 16, speed: 200 })))).toThrow(/blink/);
  });
});

describe('blink: playing', () => {
  it('hides the boss, fixes the landing spot, then puts it there facing the player', () => {
    const boss = blinker();
    const states = run(start(boss), 25, () => NO_INPUT, boss);
    const hidden = states.filter((x) => bossHidden(x.boss, boss));
    expect(hidden.length).toBe(8);
    for (const x of hidden) {
      expect(x.boss.blinkToX).toBeCloseTo(520);
      expect(x.boss.x).toBe(700);
    }
    const back = states.find((x) => x.boss.mode === 'attack' && x.boss.attackTick === 12)!;
    expect(back.boss.x).toBeCloseTo(520);
    expect(back.boss.blinkToX).toBeNull();
    expect(back.boss.facing).toBe(1);
  });

  it('cannot be hit while hidden, and can be once it is back', () => {
    const boss = blinker();
    const swing = (attackTick: number, blinkToX: number | null) => {
      const s = start(boss);
      s.player.x = 640;
      s.player.prevX = 640;
      s.player.facing = 1;
      s.player.attackTick = PLAYER.attack.startup - 1;
      s.player.attackConnected = false;
      s.player.attackAim = 'forward';
      s.boss.mode = 'attack';
      s.boss.attackId = 'cut';
      s.boss.attackTick = attackTick;
      s.boss.blinkToX = blinkToX;
      s.boss.facing = -1;
      return step(s, NO_INPUT, boss);
    };
    const hiddenSwing = swing(6, 520);
    expect(hiddenSwing.boss.hp).toBe(boss.maxHp);
    expect(hiddenSwing.events).not.toContain('bossHit');
    const visibleSwing = swing(15, null);
    expect(visibleSwing.boss.hp).toBe(boss.maxHp - 1);
  });

  it('forgets the landing spot when the boss changes phase', () => {
    const boss = blinker();
    const s = start(boss);
    s.boss.blinkToX = 520;
    beginTransition(s, boss);
    expect(s.boss.blinkToX).toBeNull();
  });
});

describe('blink: difficulty dials', () => {
  it('shifts the blink with the warning length and scales its distance with the range', () => {
    const changed = applyDials(blinker(), { ...NORMAL_DIALS, readability: 1.3, range: 1.2 });
    const attack = changed.attacks[0]!;
    expect(attack.windup).toBe(18);
    expect(attack.blink).toEqual({ from: 8, to: 16, target: 'player', distance: 96 });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-blink.test.ts`
Expected: FAIL (compile errors: `blink`, `blinkToX`, `bossHidden` do not exist).

- [ ] **Step 3: Implement**

`src/bosses/schema.ts`, after `DiveDef` add:

```ts
/**
 * A blink: at update `from` the boss vanishes (a mark shows where it will be), and at update `to` it stands there, turned
 * toward the player. For `'player'` it lands on the player's x as it was at `from`, plus `distance` (default 0) on the side
 * of the player away from the boss; for `'forward'` and `'back'` it lands `distance` units from itself (required).
 * While it is gone it cannot hurt or be hurt.
 */
export interface BlinkDef {
  from: number;
  to: number;
  target: LeapTarget;
  distance?: number;
}
```
and in `AttackDef` (after `dive?`):

```ts
  /** A blink. Only for a `mustDodge` attack without a leap, dive, shots or hold; every hit window starts at `blink.to` or later. */
  blink?: BlinkDef;
```

`src/bosses/parse.ts`: add `BlinkDef` to the type import list. In `attack()`, after the `hold` block (Task 3) and before the "needs at least one hit window" check, add:

```ts
  let blink: BlinkDef | undefined;
  if (o.blink !== undefined) {
    const k = object(o.blink, `${path}.blink`);
    const from = num(k.from, `${path}.blink.from`, { min: 1, integer: true });
    const to = num(k.to, `${path}.blink.to`, { min: 2, integer: true });
    const target = text(k.target, `${path}.blink.target`);
    if (!LEAP_TARGETS.includes(target as LeapTarget)) {
      fail(`${path}.blink.target`, `must be one of ${LEAP_TARGETS.join(', ')}`);
    }
    blink = { from, to, target: target as LeapTarget };
    if (target === 'player') {
      if (k.distance !== undefined) blink.distance = num(k.distance, `${path}.blink.distance`, { min: 0 });
    } else {
      blink.distance = num(k.distance, `${path}.blink.distance`, { min: 1 });
    }
    if (to <= from || to > windup + active) fail(`${path}.blink`, 'must end inside the attack');
    if (cls !== 'mustDodge') fail(`${path}.blink`, 'only a "mustDodge" attack can blink');
    if (leap !== undefined || dive !== undefined || shots !== undefined || hold !== undefined) {
      fail(`${path}.blink`, 'an attack with a blink cannot also leap, dive, shoot or hold');
    }
    if (move !== undefined && from < move.to && move.from < to) fail(`${path}.blink`, 'must not overlap the move');
    hits.forEach((hit, i) => {
      if (hit.from < to) fail(`${path}.hits[${i}]`, 'a hit window cannot start while the boss is gone (it must start at "blink.to" or later)');
    });
  }
```
Change the "needs at least one" condition to also require `blink === undefined`:
`if (hits.length === 0 && move === undefined && leap === undefined && dive === undefined && shots === undefined && blink === undefined) {`
and add `...(blink === undefined ? {} : { blink }),` to the returned object after the `dive` line.

`src/game/state.ts`: add to `BossState` (after `diveFromLift`):

```ts
  /** Where the running blink will land (x); null when no blink is running. */
  blinkToX: number | null;
```
and `blinkToX: null,` after `diveFromLift: null,` in `initialBoss`.

`src/game/boss.ts`:
1. Import `BlinkDef` in the schema type import.
2. In `landBoss` add `b.blinkToX = null;` after `b.diveFromLift = null;`.
3. After `updateDive` add:

```ts
/** The x a blink will land on, fixed on its first hidden update and kept inside the arena. */
function blinkLanding(s: GameState, boss: BossDef, blink: BlinkDef, index: number): number {
  const b = bossAt(s, index);
  const half = boss.width / 2;
  let x = s.player.x;
  // The parser guarantees `distance` for 'forward' and 'back' (the 0 only satisfies the type).
  if (blink.target === 'player') x = s.player.x + (s.player.x >= b.x ? 1 : -1) * (blink.distance ?? 0);
  if (blink.target === 'forward') x = b.x + b.facing * (blink.distance ?? 0);
  if (blink.target === 'back') x = b.x - b.facing * (blink.distance ?? 0);
  return Math.min(Math.max(x, half), WORLD.width - half);
}

/** The boss is gone from update `from` to `to` (see `bossHidden`); on update `to` it stands on the spot chosen when it vanished. */
function updateBlink(s: GameState, boss: BossDef, blink: BlinkDef, index: number): void {
  const b = bossAt(s, index);
  const t = b.attackTick;
  if (t >= blink.from && t < blink.to) {
    if (b.blinkToX === null) b.blinkToX = blinkLanding(s, boss, blink, index);
  } else if (t >= blink.to && b.blinkToX !== null) {
    b.x = b.blinkToX;
    b.blinkToX = null;
    faceTarget(b, s.player.x);
  }
}
```
4. In `updateAttack`, after `if (attack.dive !== undefined) updateDive(...)` add `if (attack.blink !== undefined) updateBlink(s, boss, attack.blink, index);`.

`src/game/geometry.ts`, after `activeHitBoxes` add:

```ts
/** Whether the boss is gone right now (the vanished stretch of a blink): it cannot be hit, and the renderer does not draw it. */
export function bossHidden(b: BossState, boss: BossDef): boolean {
  if (b.mode !== 'attack' || b.attackId === null) return false;
  const blink = boss.attacks.find((a) => a.id === b.attackId)?.blink;
  return blink !== undefined && b.attackTick >= blink.from && b.attackTick < blink.to;
}
```

`src/game/step.ts`: add `bossHidden` to the geometry import, and in `resolvePlayerAttack` change

```ts
    if (isDowned(s, i) || candidate.mode === 'transition') continue;
```
to
```ts
    if (isDowned(s, i) || candidate.mode === 'transition' || bossHidden(candidate, bossDefFor(s, fight, i))) continue;
```

`src/game/difficulty.ts`, in `adjustAttack` after the `dive` block add:

```ts
  if (attack.blink !== undefined) {
    // Like a leap: only the timing shifts with the warning, and the range dial sets how far it lands. A blink onto the player keeps a distance of 0.
    next.blink = { ...attack.blink, from: attack.blink.from + shift, to: attack.blink.to + shift };
    if (attack.blink.distance !== undefined) {
      next.blink.distance = Math.max(attack.blink.target === 'player' ? 0 : 1, attack.blink.distance * d.range);
    }
  }
```

Run `npm run typecheck` and add `blinkToX: null` to every `BossState` literal it reports.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-blink.test.ts tests/duelist-golden.test.ts tests/difficulty.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file uses `blink` yet).

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/boss.ts src/game/geometry.ts src/game/step.ts src/game/difficulty.ts tests/boss-blink.test.ts tests/step-study.test.ts
git commit -m "feat: blink, a boss that vanishes and reappears on a marked spot"
```

---

### Task 5: Lingering embers (an eruption that leaves a low fire behind)

An eruption can have `linger`: after the tall blast is over it stays as a low fire, `linger` more updates, that hurts anyone standing on the floor but can be jumped over. The Golem and the Brute use it to make the floor itself a danger.

**Files:**
- Modify: `src/game/params.ts` (`EMBER`)
- Modify: `src/bosses/schema.ts` (`EruptionDef.linger?`)
- Modify: `src/bosses/parse.ts` (`shotList`, the eruption branch)
- Modify: `src/game/state.ts` (`EruptionState.linger?`)
- Modify: `src/game/shots.ts` (`spawnShots`, `moveShots`)
- Modify: `src/game/geometry.ts` (`shotBox`)
- Modify: `src/game/step.ts` (`resolveShotHits` keeps a lingering eruption)
- Modify: `src/stats/analyze.ts` (`dangerEnd`)
- Test: `tests/boss-embers.test.ts` (create)

**Interfaces:**
- Consumes: `shooter`, `eruption` from `tests/shot-helpers.ts`; `QUIET_BOSS`, `advance` from `tests/helpers.ts`.
- Produces:
  - `EMBER = { height: 40 }` in `params.ts` (a jump peaks near 163, so embers can be jumped; the blast is `ERUPTION.height` = 220 and cannot).
  - `EruptionDef.linger?: number` (whole number 1 to 600 updates after the blast).
  - `EruptionState.linger?: number` (absent unless the file gave one, so every existing state is unchanged).
  - `shotBox` returns the low `EMBER.height` box once `delay + burst <= age < delay + burst + linger`.
  - A lingering eruption is NOT used up when it hurts the player (the player's short untouchability spaces out the hits).

- [ ] **Step 1: Write the failing test**

Create `tests/boss-embers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { overlaps, playerBox, shotBox } from '../src/game/geometry';
import { EMBER, ERUPTION, WORLD } from '../src/game/params';
import { createInitialState, type EruptionState, type GameState } from '../src/game/state';
import { advance, QUIET_BOSS } from './helpers';
import { eruption, shooter } from './shot-helpers';

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** A fight with one eruption already on the floor under the player: mark from age 0, blast from age 10 for 4 updates, then 200 updates of embers. */
function embersUnderPlayer(): GameState {
  const s = createInitialState(QUIET_BOSS, 1);
  s.player.health = 3;
  const shot: EruptionState = {
    kind: 'eruption',
    attackId: 'shoot',
    originTick: 0,
    x: s.player.x,
    lift: 0,
    age: 0,
    width: 200,
    delay: 10,
    burst: 4,
    linger: 200,
  };
  s.shots.push(shot);
  return s;
}

describe('lingering embers: parsing', () => {
  it('accepts linger on an eruption and rejects a bad one', () => {
    expect(parseBoss(clone(shooter([eruption({ linger: 90 })]))).attacks[0]!.shots![0]).toMatchObject({ linger: 90 });
    for (const bad of [0, 601, 2.5]) {
      expect(() => parseBoss(clone(shooter([eruption({ linger: bad })])))).toThrow(/linger/);
    }
  });
});

describe('lingering embers: playing', () => {
  it('stays after the blast as a low box, then goes when the linger is over', () => {
    const s0 = embersUnderPlayer();
    const during = advance(s0, 12);
    expect(shotBox(during.shots[0]!)!.h).toBe(ERUPTION.height);
    const after = advance(s0, 20);
    expect(after.shots.length).toBe(1);
    expect(shotBox(after.shots[0]!)!.h).toBe(EMBER.height);
    expect(advance(s0, 10 + 4 + 200 - 1).shots.length).toBe(1);
    expect(advance(s0, 10 + 4 + 200).shots.length).toBe(0);
  });

  it('can be jumped over but not walked through', () => {
    const after = advance(embersUnderPlayer(), 20);
    const embers = shotBox(after.shots[0]!)!;
    const standing = playerBox({ ...after.player, y: WORLD.floorY });
    const jumping = playerBox({ ...after.player, y: WORLD.floorY - 100 });
    expect(overlaps(embers, standing)).toBe(true);
    expect(overlaps(embers, jumping)).toBe(false);
  });

  it('hurts again each time the player stops being untouchable, and is not used up by a hit', () => {
    let s = embersUnderPlayer();
    for (let i = 0; i < 10 + 4 + 200; i++) s = advance(s, 1, NO_INPUT, QUIET_BOSS);
    expect(s.player.health).toBeLessThan(3 - 1);
  });

  it('does not change an eruption without linger: it is used up on its first hit and gone after its blast', () => {
    const s0 = embersUnderPlayer();
    const plain = { ...s0, shots: [{ ...(s0.shots[0] as EruptionState), linger: undefined }] } as GameState;
    delete (plain.shots[0] as { linger?: number }).linger;
    const hit = advance(plain, 11);
    expect(hit.player.health).toBe(2);
    expect(hit.shots.length).toBe(0);
  });
});

describe('lingering embers: difficulty dials', () => {
  it('keeps the linger through the dials', () => {
    const boss = shooter([eruption({ linger: 120 })]);
    expect(applyDials(boss, { ...NORMAL_DIALS, readability: 1.3, range: 1.2 }).attacks[0]!.shots![0]).toMatchObject({ linger: 120 });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-embers.test.ts`
Expected: FAIL (`EMBER` and `linger` do not exist).

- [ ] **Step 3: Implement**

`src/game/params.ts`, straight after `ERUPTION` add:

```ts
/** Embers: how tall the low fire left by a lingering eruption is (from the floor up). It is below a jump's peak, so it can be jumped. */
export const EMBER = { height: 40 };
```

`src/bosses/schema.ts`, in `EruptionDef` add after `burst`:

```ts
  /** Updates the blast stays on as a low fire (`EMBER.height`, jumpable) after the tall blast is over. Absent means it just ends. */
  linger?: number;
```

`src/bosses/parse.ts`, in the eruption branch of `shotList` replace `return eruption;` with:

```ts
      if (o.linger !== undefined) eruption.linger = num(o.linger, `${at}.linger`, { min: 1, max: 600, integer: true });
      return eruption;
```

`src/game/state.ts`, in `EruptionState` add after `burst`:

```ts
  /** Updates the eruption stays on as low embers after its blast; absent for an eruption without embers. */
  linger?: number;
```

`src/game/shots.ts`:
1. In `spawnShots`, in the eruption push add after `burst: def.burst,`: `...(def.linger === undefined ? {} : { linger: def.linger }),`.
2. In `moveShots` replace `if (shot.age >= shot.delay + shot.burst) continue;` with `if (shot.age >= shot.delay + shot.burst + (shot.linger ?? 0)) continue;`.

`src/game/geometry.ts`: import `EMBER` with `ERUPTION` and replace the eruption branch of `shotBox` with:

```ts
  if (shot.kind === 'eruption') {
    if (shot.age < shot.delay) return null;
    // After the blast, only an eruption with `linger` is still around, as low embers.
    const height = shot.age < shot.delay + shot.burst ? ERUPTION.height : EMBER.height;
    return { x: shot.x - shot.width / 2, y: WORLD.floorY - height, w: shot.width, h: height };
  }
```

`src/game/step.ts`, in `resolveShotHits` replace `s.shots = s.shots.filter((shot) => !hit.includes(shot));` with:

```ts
  // A hit shot is used up, except an eruption with embers: it keeps burning, and the player's short untouchability spaces the hits out.
  s.shots = s.shots.filter((shot) => !hit.includes(shot) || (shot.kind === 'eruption' && shot.linger !== undefined));
```

`src/stats/analyze.ts`, in `dangerEnd` change the eruption case to `x.kind === 'eruption' ? x.at + x.delay + x.burst + (x.linger ?? 0)`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-embers.test.ts tests/eruptions.test.ts tests/shots.test.ts tests/stats-shots.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file uses `linger` yet).

- [ ] **Step 6: Commit**

```bash
git add src/game/params.ts src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/shots.ts src/game/geometry.ts src/game/step.ts src/stats/analyze.ts tests/boss-embers.test.ts
git commit -m "feat: eruptions can leave low embers that stay on the floor"
```

---

### Task 6: Side bolts (bolts that come in from the arena edges)

A bolt with `edge: 'left'` or `edge: 'right'` does not leave the boss. It appears at that edge of the arena, at the given height, and flies across. A boss can fire one from each side at once (a crossfire) while it does something else. The Storm Kite uses it so that not every danger comes from the sky.

**Files:**
- Modify: `src/bosses/schema.ts` (`BoltDef.edge?`)
- Modify: `src/bosses/parse.ts` (`shotList`, the bolt branch)
- Modify: `src/game/shots.ts` (`spawnShots`)
- Test: `tests/boss-side-bolts.test.ts` (create)

**Interfaces:**
- Consumes: `shooter`, `bolt` from `tests/shot-helpers.ts`; `WORLD` from `src/game/params.ts`.
- Produces:
  - `BoltDef.edge?: 'left' | 'right'`. A bolt with an edge cannot also have `dir` or `aim`. It starts fully inside the arena touching that edge (x = `size / 2` for the left, `WORLD.width - size / 2` for the right), flies inward, at `height` above the floor, ignoring where the boss is.
  - No new state: the result is an ordinary `BoltState` (`dir` 1 from the left, -1 from the right; `originX` is its start).
  - Later tasks (looks, sounds, the Kite file) read `shot.edge` from the attack definition to show a warning arrow at that edge during the wind-up.

- [ ] **Step 1: Write the failing test**

Create `tests/boss-side-bolts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { WORLD } from '../src/game/params';
import { createInitialState, type BoltState } from '../src/game/state';
import { step } from '../src/game/step';
import { bolt, shooter } from './shot-helpers';

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

function fire(boss: BossDef, updates = 80) {
  let s = createInitialState(boss, 1);
  const states = [];
  for (let i = 0; i < updates; i++) {
    s = step(s, NO_INPUT, boss);
    states.push(s);
  }
  return states;
}

describe('side bolts: parsing', () => {
  it('accepts an edge and rejects one that is combined with dir or aim, or is not left or right', () => {
    expect(parseBoss(clone(shooter([bolt({ edge: 'left' })]))).attacks[0]!.shots![0]).toMatchObject({ edge: 'left' });
    expect(() => parseBoss(clone(shooter([bolt({ edge: 'left', aim: true })])))).toThrow(/edge/);
    expect(() => parseBoss(clone(shooter([bolt({ edge: 'right', dir: 'back' })])))).toThrow(/edge/);
    const bad = clone(shooter([bolt()]));
    bad.attacks[0].shots[0].edge = 'top';
    expect(() => parseBoss(bad)).toThrow(/edge/);
  });
});

describe('side bolts: playing', () => {
  it('appears at the left edge flying right, whatever the boss is doing', () => {
    const boss = shooter([bolt({ at: 22, height: 40, size: 30, speed: 600, edge: 'left' })]);
    const states = fire(boss);
    const first = states.findIndex((x) => x.shots.length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    const born = states[first]!;
    const shot = born.shots[0] as BoltState;
    expect(born.boss.attackTick).toBe(22);
    expect(shot.x).toBeCloseTo(15);
    expect(shot.originX).toBeCloseTo(15);
    expect(shot.dir).toBe(1);
    expect(shot.lift).toBe(40);
    expect((states[first + 1]!.shots[0] as BoltState).x).toBeCloseTo(25);
  });

  it('appears at the right edge flying left', () => {
    const boss = shooter([bolt({ at: 22, size: 30, edge: 'right' })]);
    const states = fire(boss);
    const shot = states.find((x) => x.shots.length > 0)!.shots[0] as BoltState;
    expect(shot.x).toBeCloseTo(WORLD.width - 15);
    expect(shot.dir).toBe(-1);
  });

  it('a crossfire fires both bolts on the same update', () => {
    const boss = shooter([bolt({ at: 22, edge: 'left' }), bolt({ at: 22, edge: 'right' })]);
    const born = fire(boss).find((x) => x.shots.length > 0)!;
    expect(born.shots.map((x) => (x as BoltState).dir).sort()).toEqual([-1, 1]);
  });

  it('crosses the arena and hurts a standing player in the middle', () => {
    const boss = shooter([bolt({ at: 22, height: 0, size: 30, speed: 600, edge: 'left' })]);
    let s = createInitialState(boss, 1);
    s.player.x = 500;
    s.player.prevX = 500;
    s.player.health = 3;
    let hurt = false;
    for (let i = 0; i < 100 && !hurt; i++) {
      s = step(s, NO_INPUT, boss);
      hurt = s.player.health < 3;
    }
    expect(hurt).toBe(true);
  });
});

describe('side bolts: difficulty dials', () => {
  it('keeps the edge through the dials', () => {
    const changed = applyDials(shooter([bolt({ edge: 'right' })]), { ...NORMAL_DIALS, readability: 1.3 });
    expect(changed.attacks[0]!.shots![0]).toMatchObject({ kind: 'bolt', edge: 'right' });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-side-bolts.test.ts`
Expected: FAIL (compile error: `edge` does not exist on the bolt definition).

- [ ] **Step 3: Implement**

`src/bosses/schema.ts`, in `BoltDef` add after `aim?`:

```ts
  /** Comes in from that edge of the arena instead of from the boss, flying inward at `height`. Not together with `dir` or `aim`. */
  edge?: 'left' | 'right';
```

`src/bosses/parse.ts`, in the bolt branch of `shotList`, replace the `return bolt;` line with:

```ts
      if (o.edge !== undefined) {
        if (o.edge !== 'left' && o.edge !== 'right') fail(`${at}.edge`, 'must be "left" or "right"');
        if (o.dir !== undefined || o.aim === true) fail(`${at}.edge`, 'a bolt from an edge cannot also have "dir" or "aim"');
        bolt.edge = o.edge;
      }
      return bolt;
```

`src/game/shots.ts`, in `spawnShots`, at the top of the `if (def.kind === 'bolt') {` block (before `// Fired from the boss's body`) add:

```ts
      if (def.edge !== undefined) {
        const fromLeft = def.edge === 'left';
        const x = fromLeft ? def.size / 2 : WORLD.width - def.size / 2;
        s.shots.push({
          kind: 'bolt',
          attackId: attack.id,
          originTick,
          x,
          lift: def.height,
          dir: fromLeft ? 1 : -1,
          originX: x,
          size: def.size,
          speed: def.speed,
          climb: 0,
          ...owner,
        });
        continue;
      }
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-side-bolts.test.ts tests/shots.test.ts tests/shot-parse.test.ts && npm run typecheck`
Expected: PASS. (If `tests/shot-parse.test.ts` does not exist, drop it from the command; the point is to run every existing shot test.)

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/shots.ts tests/boss-side-bolts.test.ts
git commit -m "feat: bolts that come in from the left or right edge of the arena"
```

---

### Task 7: Hit reaction (a boss that answers being hit)

A boss can have a `reaction`: the name of one of its attacks and a cooldown. When the player lands a hit on it while it is waiting or walking (not attacking, not staggered, not changing phase, not defeated), it immediately does that attack (usually a short retreat or a vanish), once per cooldown. The reaction attack is listed in `attacks` but is in no phase list, so the boss never picks it by itself. Reactions are off in pair fights and never happen in the study. It gives the owner's idea: "attacking a boss should change it".

**Files:**
- Modify: `src/bosses/schema.ts` (`BossDef.reaction?`)
- Modify: `src/bosses/parse.ts` (`parseBoss`)
- Modify: `src/game/state.ts` (`BossState.reactCooldown`, `initialBoss`)
- Modify: `src/game/boss.ts` (export `startAttack`; `reactToHit`; count the cooldown down in `updateBoss`)
- Modify: `src/game/step.ts` (`resolvePlayerAttack` calls `reactToHit`)
- Test: `tests/boss-reaction.test.ts` (create)
- Possibly fix: `BossState` literals that typecheck reports (add `reactCooldown: 0`)

**Interfaces:**
- Consumes: `customBoss`, `melee` from `tests/boss-helpers.ts` (Task 2); `startAttack(s, boss, id, index)` (already in `boss.ts`, becomes exported).
- Produces:
  - `BossDef.reaction?: { attack: string; cooldown: number }` (`attack` must be an id in `attacks`; `cooldown` is a whole number from 30 to 1200 updates).
  - `BossState.reactCooldown: number` (updates left before the boss may react again; counts down by 1 per update).
  - `export function reactToHit(s: GameState, boss: BossDef, index: number): void` in `boss.ts`: does nothing unless `boss.reaction` exists, the study is not running, the fight has no partners, the cooldown is 0, the boss has health left, and its mode is `'gap'` or `'approach'`. Otherwise it clears any combo and chain, sets the cooldown and starts the reaction attack.

- [ ] **Step 1: Write the failing test**

Create `tests/boss-reaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { PLAYER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';

/** A boss that waits (a very long gap) and, when hit, slips away with the "skitter" attack. */
const skittish = (over: Partial<BossDef> = {}): BossDef =>
  customBoss(
    [
      melee('cut'),
      melee('skitter', {
        windup: 4,
        active: 10,
        recovery: 4,
        hits: [],
        move: { from: 4, to: 14, speed: 300, dir: 'back' },
      }),
    ],
    { attacks: [{ id: 'cut', weight: 1 }], gap: 100000 },
    { reaction: { attack: 'skitter', cooldown: 200 }, ...over },
  );

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The player is about to land a forward swing on a boss that stands next to them. */
function aboutToHit(boss: BossDef): GameState {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.player.x = 640;
  s.player.prevX = 640;
  s.player.facing = 1;
  s.player.health = 1e9;
  s.player.attackTick = PLAYER.attack.startup - 1;
  s.player.attackConnected = false;
  s.player.attackAim = 'forward';
  return s;
}

describe('hit reaction: parsing', () => {
  it('accepts a reaction and rejects an unknown attack or a bad cooldown', () => {
    expect(parseBoss(clone(skittish())).reaction).toEqual({ attack: 'skitter', cooldown: 200 });
    const unknown = clone(skittish());
    unknown.reaction.attack = 'nothing';
    expect(() => parseBoss(unknown)).toThrow(/reaction/);
    for (const bad of [10, 5000, 60.5]) {
      const data = clone(skittish());
      data.reaction.cooldown = bad;
      expect(() => parseBoss(data)).toThrow(/reaction/);
    }
  });

  it('survives the difficulty dials', () => {
    expect(applyDials(skittish(), { ...NORMAL_DIALS, readability: 1.3 }).reaction).toEqual({ attack: 'skitter', cooldown: 200 });
  });
});

describe('hit reaction: playing', () => {
  it('starts the reaction attack the moment a waiting boss is hit, and sets the cooldown', () => {
    const boss = skittish();
    const s = step(aboutToHit(boss), NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
    expect(s.boss.mode).toBe('attack');
    expect(s.boss.attackId).toBe('skitter');
    expect(s.boss.attackTick).toBe(0);
    expect(s.boss.reactCooldown).toBe(200);
    expect(s.boss.comboQueue).toEqual([]);
  });

  it('counts the cooldown down, and does not react again while it runs', () => {
    const boss = skittish();
    const first = step(aboutToHit(boss), NO_INPUT, boss);
    expect(step(first, NO_INPUT, boss).boss.reactCooldown).toBe(199);
    const second = aboutToHit(boss);
    second.boss.reactCooldown = 50;
    const after = step(second, NO_INPUT, boss);
    expect(after.events).toContain('bossHit');
    expect(after.boss.mode).toBe('gap');
  });

  it('does not react in the middle of an attack, or when the hit defeats it', () => {
    const boss = skittish();
    const busy = aboutToHit(boss);
    busy.boss.mode = 'attack';
    busy.boss.attackId = 'cut';
    busy.boss.attackTick = 0;
    const attacking = step(busy, NO_INPUT, boss);
    expect(attacking.boss.attackId).toBe('cut');
    expect(attacking.boss.reactCooldown).toBe(0);

    const weak = skittish({ maxHp: 1 });
    const beaten = step(aboutToHit(weak), NO_INPUT, weak);
    expect(beaten.phase).toBe('victory');
    expect(beaten.boss.attackId).not.toBe('skitter');
  });

  it('a boss without a reaction behaves as before', () => {
    const plain = skittish();
    delete plain.reaction;
    const s = step(aboutToHit(plain), NO_INPUT, plain);
    expect(s.boss.mode).toBe('gap');
    expect(s.boss.reactCooldown).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-reaction.test.ts`
Expected: FAIL (compile errors: `reaction`, `reactCooldown` do not exist).

- [ ] **Step 3: Implement**

`src/bosses/schema.ts`, in `BossDef` add after `temper?`:

```ts
  /**
   * What the boss does when the player hits it while it is waiting or walking: it starts `attack` at once (one of its
   * own attacks, normally one that is in no phase list so it is never chosen otherwise), then cannot react again for
   * `cooldown` updates. Off in a fight with partners and in the study.
   */
  reaction?: { attack: string; cooldown: number };
```

`src/bosses/parse.ts`, in `parseBoss` after `attacks` and their ids are known (the `ids` set exists after the duplicate-id check) and before the `return`, add:

```ts
  let reaction: { attack: string; cooldown: number } | undefined;
  if (o.reaction !== undefined) {
    const r = object(o.reaction, 'boss.reaction');
    const attackId = text(r.attack, 'boss.reaction.attack');
    if (!ids.has(attackId)) fail('boss.reaction.attack', `"${attackId}" is not one of the boss's attacks`);
    reaction = { attack: attackId, cooldown: num(r.cooldown, 'boss.reaction.cooldown', { min: 30, max: 1200, integer: true }) };
  }
```
and in the returned object add `...(reaction === undefined ? {} : { reaction }),` after the temper line. (`ids` is the set of attack ids built by the duplicate check; if it has another name in the file, use that one.)

`src/game/state.ts`: add to `BossState` after `holdLeft`:

```ts
  /** Updates left before the boss may react to a hit again (see `BossDef.reaction`). */
  reactCooldown: number;
```
and `reactCooldown: 0,` after `holdLeft: 0,` in `initialBoss`.

`src/game/boss.ts`:
1. Change `function startAttack(` to `export function startAttack(`.
2. In `updateBoss`, straight after `b.modeTick += 1;` add `if (b.reactCooldown > 0) b.reactCooldown -= 1;`.
3. Add after `startAttack`:

```ts
/**
 * Called when the player's hit has just landed and the boss is still standing: if the boss can react (see
 * `BossDef.reaction`) it drops what it was about to do and starts its reaction attack.
 */
export function reactToHit(s: GameState, boss: BossDef, index: number): void {
  const b = bossAt(s, index);
  if (boss.reaction === undefined || s.study.active || s.partners.length > 0) return;
  if (b.reactCooldown > 0 || b.hp <= 0) return;
  if (b.mode !== 'gap' && b.mode !== 'approach') return;
  b.reactCooldown = boss.reaction.cooldown;
  b.comboQueue = [];
  b.chainLeft = 0;
  startAttack(s, boss, boss.reaction.attack, index);
}
```

`src/game/step.ts`: add `reactToHit` to the `./boss` import, and at the end of `resolvePlayerAttack` replace

```ts
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) beginTransition(s, boss, target);
```
with
```ts
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) {
    beginTransition(s, boss, target);
    return;
  }
  reactToHit(s, boss, target);
```

Run `npm run typecheck` and add `reactCooldown: 0` to every `BossState` literal it reports.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-reaction.test.ts tests/duelist-golden.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file has a `reaction` yet).

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/boss.ts src/game/step.ts tests/boss-reaction.test.ts tests/step-study.test.ts
git commit -m "feat: a boss can react to being hit with an attack of its own"
```

---

### Task 8: Shield (a boss that can only be hit from behind)

A boss with a `shield` holds a shield in front of it while it walks, waits, or winds up an attack. A player hit that comes from the front is blocked: no damage, a `bossBlocked` event. The shield is down (front hits work) while the boss is in the active or recovery part of an attack, while it is staggered, and while it changes phase. A counter still works, and it also breaks the shield (the boss is then staggered). A downward pogo hit from above also gets through. The boss turns slowly: if the player is behind it, it takes `turnTicks` updates to turn round, and it does not walk while it is turning, so going round the back gives a short window. When the boss decides to attack it turns to face the player at once, so an attack always goes the right way. Only the Brass Sentinel gets this. Off in pair fights.

**Files:**
- Modify: `src/bosses/schema.ts` (`BossDef.shield?`)
- Modify: `src/bosses/parse.ts` (`parseBoss`)
- Modify: `src/game/state.ts` (`BossState.turnTicks`, `initialBoss`, event `'bossBlocked'`)
- Modify: `src/game/geometry.ts` (`shieldUp`)
- Modify: `src/game/boss.ts` (`turnToward`, `updateGap`, `startAttack`, `updateApproach` unchanged in facing)
- Modify: `src/game/step.ts` (`resolvePlayerAttack` blocks)
- Test: `tests/boss-shield.test.ts` (create)
- Possibly fix: `BossState` literals (add `turnTicks: 0`) and any `switch` over `GameEvent` that typecheck reports (add `case 'bossBlocked': break;`)

**Interfaces:**
- Consumes: `customBoss`, `melee` from `tests/boss-helpers.ts` (Task 2); `withInput` from `tests/helpers.ts`.
- Produces:
  - `BossDef.shield?: { turnTicks: number }` (whole number 10 to 300).
  - `BossState.turnTicks: number` (how many updates the boss has been turning toward a player who is behind it; 0 when it faces the player).
  - `GameEvent` gains `'bossBlocked'`.
  - `export function shieldUp(b: BossState, boss: BossDef): boolean` in `geometry.ts`: true when the boss has a shield and is in `'gap'`, in `'approach'`, or attacking with `attackTick < windup`. The looks and sounds use it.

- [ ] **Step 1: Write the failing test**

Create `tests/boss-shield.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { shieldUp } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';
import { advance, run, withInput } from './helpers';

const SWING = melee('swing', {
  class: 'counterable',
  windup: 30,
  active: 4,
  recovery: 4,
  hits: [{ from: 30, to: 34, x0: 0, x1: 60, bottom: 0, top: 60 }],
});

/** A shielded boss that waits (a very long gap) and, when it does attack, only uses "swing". */
const shielded = (over: Partial<BossDef> = {}, gap = 100000): BossDef =>
  customBoss([SWING], { attacks: [{ id: 'swing', weight: 1 }], gap }, { shield: { turnTicks: 40 }, ...over });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The boss at 700 facing left. The player is in front of it (left, x 640) or behind it (right, x 760), about to land a swing. */
function aboutToHit(boss: BossDef, side: 'front' | 'behind'): GameState {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.boss.facing = -1;
  s.player.x = side === 'front' ? 640 : 760;
  s.player.prevX = s.player.x;
  s.player.facing = side === 'front' ? 1 : -1;
  s.player.health = 1e9;
  s.player.attackTick = PLAYER.attack.startup - 1;
  s.player.attackConnected = false;
  s.player.attackAim = 'forward';
  return s;
}

describe('shield: parsing', () => {
  it('accepts a shield and rejects a bad turn time', () => {
    expect(parseBoss(clone(shielded())).shield).toEqual({ turnTicks: 40 });
    for (const bad of [5, 500, 20.5]) {
      const data = clone(shielded());
      data.shield.turnTicks = bad;
      expect(() => parseBoss(data)).toThrow(/shield/);
    }
  });
});

describe('shield: when it is up', () => {
  it('is up while waiting and winding up, down once the swing is out, and down in a stagger', () => {
    const boss = shielded();
    const s = createInitialState(boss, 1);
    expect(shieldUp(s.boss, boss)).toBe(true);
    s.boss.mode = 'attack';
    s.boss.attackId = 'swing';
    s.boss.attackTick = 29;
    expect(shieldUp(s.boss, boss)).toBe(true);
    s.boss.attackTick = 30;
    expect(shieldUp(s.boss, boss)).toBe(false);
    s.boss.mode = 'stagger';
    expect(shieldUp(s.boss, boss)).toBe(false);
  });

  it('is never up on a boss without a shield', () => {
    const boss = shielded();
    delete boss.shield;
    expect(shieldUp(createInitialState(boss, 1).boss, boss)).toBe(false);
  });
});

describe('shield: blocking', () => {
  it('blocks a hit from the front: no damage, a bossBlocked event, and the swing is used up', () => {
    const boss = shielded();
    const s = step(aboutToHit(boss, 'front'), NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp);
    expect(s.events).toContain('bossBlocked');
    expect(s.events).not.toContain('bossHit');
    expect(s.player.attackConnected).toBe(true);
  });

  it('lets a hit from behind through', () => {
    const boss = shielded();
    const s = step(aboutToHit(boss, 'behind'), NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp - 1);
    expect(s.events).toContain('bossHit');
    expect(s.events).not.toContain('bossBlocked');
  });

  it('lets a downward pogo hit through even from the front', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.player.attackAim = 'down';
    start.player.x = 650;
    start.player.prevX = 650;
    start.player.y = WORLD.floorY - 200;
    const s = step(start, NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
    expect(s.events).not.toContain('bossBlocked');
  });

  it('lets a hit from the front through once the swing is out', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.boss.mode = 'attack';
    start.boss.attackId = 'swing';
    start.boss.attackTick = 33;
    const s = step(start, NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
  });

  it('a counter breaks the shield: the boss is staggered and the next hit does full counter damage', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.player.attackTick = -1;
    start.boss.mode = 'attack';
    start.boss.attackId = 'swing';
    start.boss.attackTick = 27;
    let s = step(start, withInput({ attackPressed: true }), boss);
    expect(s.events).toContain('counter');
    s = advance(s, 4, NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp - boss.counter.damageMultiplier);
  });

  it('does nothing to a boss without a shield', () => {
    const plain = shielded();
    delete plain.shield;
    const s = step(aboutToHit(plain, 'front'), NO_INPUT, plain);
    expect(s.boss.hp).toBe(plain.maxHp - 1);
  });
});

describe('shield: turning', () => {
  it('turns round only after turnTicks updates of the player being behind it', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    const states = run(start, 45, () => NO_INPUT, boss);
    expect(states[38]!.boss.facing).toBe(-1);
    expect(states[38]!.boss.turnTicks).toBe(39);
    expect(states[39]!.boss.facing).toBe(1);
    expect(states[39]!.boss.turnTicks).toBe(0);
  });

  it('does not walk while it is turning, and walks afterwards', () => {
    const boss = shielded({ spacing: { min: 0, max: 100 } });
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    start.player.x = 1000;
    start.player.prevX = 1000;
    const states = run(start, 60, () => NO_INPUT, boss);
    expect(states[30]!.boss.x).toBe(700);
    expect(states[59]!.boss.x).toBeGreaterThan(700);
  });

  it('turns to face the player at once when it commits to an attack', () => {
    const boss = shielded({}, 1);
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    const states = run(start, 30, () => NO_INPUT, boss);
    const swing = states.find((x) => x.boss.mode === 'attack')!;
    expect(swing.boss.facing).toBe(1);
    expect(swing.boss.turnTicks).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/boss-shield.test.ts`
Expected: FAIL (compile errors: `shield`, `turnTicks`, `shieldUp`, `bossBlocked` do not exist).

- [ ] **Step 3: Implement**

`src/bosses/schema.ts`, in `BossDef` add after `reaction?`:

```ts
  /**
   * A shield held in front while the boss walks, waits or winds up: hits from the front are blocked (see `shieldUp`).
   * The boss takes `turnTicks` updates to turn round toward a player who is behind it. Off in a fight with partners.
   */
  shield?: { turnTicks: number };
```

`src/bosses/parse.ts`, in `parseBoss` next to the `reaction` block add:

```ts
  let shield: { turnTicks: number } | undefined;
  if (o.shield !== undefined) {
    const k = object(o.shield, 'boss.shield');
    shield = { turnTicks: num(k.turnTicks, 'boss.shield.turnTicks', { min: 10, max: 300, integer: true }) };
  }
```
and `...(shield === undefined ? {} : { shield }),` in the returned object after the `reaction` line.

`src/game/state.ts`: add `| 'bossBlocked'` to `GameEvent` (after `'bossHit'`); add to `BossState` after `reactCooldown`:

```ts
  /** Updates the boss has spent turning round toward a player behind its shield (see `BossDef.shield`). */
  turnTicks: number;
```
and `turnTicks: 0,` after `reactCooldown: 0,` in `initialBoss`.

`src/game/geometry.ts`, after `bossHidden` add:

```ts
/** Whether the boss holds its shield up right now: it has one, and is waiting, walking or winding up (not swinging, recovering, staggered or changing phase). */
export function shieldUp(b: BossState, boss: BossDef): boolean {
  if (boss.shield === undefined) return false;
  if (b.mode === 'gap' || b.mode === 'approach') return true;
  if (b.mode !== 'attack' || b.attackId === null) return false;
  const attack = boss.attacks.find((a) => a.id === b.attackId);
  return attack !== undefined && b.attackTick < attack.windup;
}
```

`src/game/boss.ts`:
1. After `faceTarget` add:

```ts
/**
 * Turns a waiting boss toward `targetX`. A boss with a shield turns slowly: while the player is behind it, it counts
 * `turnTicks` up and only turns round when the count reaches `shield.turnTicks`.
 */
function turnToward(s: GameState, boss: BossDef, b: BossState, targetX: number): void {
  const want: 1 | -1 = targetX < b.x ? -1 : 1;
  if (boss.shield === undefined || s.partners.length > 0 || b.facing === want) {
    b.facing = want;
    b.turnTicks = 0;
    return;
  }
  b.turnTicks += 1;
  if (b.turnTicks >= boss.shield.turnTicks) {
    b.facing = want;
    b.turnTicks = 0;
  }
}
```
2. In `updateGap` replace `faceTarget(b, p.x);` with `turnToward(s, boss, b, p.x);`, and guard the two moves so a turning boss stays put: replace
```ts
  if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
```
with
```ts
  const turning = b.turnTicks > 0;
  if (turning) {
    // Still turning round behind its shield: it stands still.
  } else if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
```
3. In `startAttack`, after `b.pendingAttackId = null;` add:

```ts
  if (boss.shield !== undefined) {
    faceTarget(b, s.player.x);
    b.turnTicks = 0;
  }
```
(`updateApproach` keeps its plain `faceTarget`: a boss that has decided to attack faces the player.)

`src/game/step.ts`: add `shieldUp` to the geometry import. In `resolvePlayerAttack`, straight after `p.attackConnected = true;` and before the pogo `if`, add:

```ts
  // A shield blocks a hit from the front (a downward pogo from above gets over it). Nothing is hurt and the swing is used up.
  if (
    s.partners.length === 0 &&
    p.attackAim !== 'down' &&
    shieldUp(b, boss) &&
    (p.x - b.x) * b.facing > 0
  ) {
    s.events.push('bossBlocked');
    return;
  }
```

Run `npm run typecheck`; add `turnTicks: 0` to every `BossState` literal it reports, and, if a `switch` over `GameEvent` is reported (for example in `src/ui/look/effects.ts`), add `case 'bossBlocked': break;` for now (Task 9 fills it in).

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/boss-shield.test.ts tests/duelist-golden.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (no boss file has a `shield` yet).

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/game/state.ts src/game/geometry.ts src/game/boss.ts src/game/step.ts tests/boss-shield.test.ts tests/step-study.test.ts src/ui/look/effects.ts
git commit -m "feat: a boss can hold a shield that blocks hits from the front"
```

---

### Task 9: Looks for the new mechanics

The game now has five things the player must be able to read at a glance: a boss that vanishes (blink), lingering floor fire (embers), a warning that a bolt is coming from the side edge, a shield in front of a boss, and a boss that is getting angry (temper). This task draws them. It changes nothing about how a fight plays. Every colour and size goes in `src/ui/look/tuning.ts`. Phone rule: cheap shapes only, no blur, and a hard cap on how many flame tongues one patch draws.

The shapes come from small pure functions in a new file, so they can be tested without a canvas; `render.ts` only calls them.

**Files:**
- Modify: `src/ui/look/tuning.ts` (new `blink`, `ember`, `edgeWarn`, `shield`, `temper`, `block`, `sparksOnBlock` entries)
- Create: `src/ui/look/identityfx.ts`
- Modify: `src/ui/render.ts` (`drawShots` embers, `drawBoss` hidden boss, blink mark, shield, temper outline, edge arrows)
- Modify: `src/ui/look/effects.ts` (`case 'bossBlocked'`)
- Test: `tests/look-identity.test.ts` (create)

**Interfaces:**
- Consumes (from earlier tasks): `bossHidden(b: BossState, boss: BossDef): boolean` and `shieldUp(b: BossState, boss: BossDef): boolean` in `src/game/geometry.ts`; `BossState.blinkToX: number | null`; `EruptionState.linger?: number`; `EMBER = { height: 40 }` in `src/game/params.ts`; `BoltDef.edge?: 'left' | 'right'`; `temperLevel(s: GameState, boss: BossDef, b: BossState): number` in `src/game/boss.ts`; the `'bossBlocked'` `GameEvent`.
- Produces, all exported from `src/ui/look/identityfx.ts`:
  - `blinkMark(b: BossState, boss: BossDef): { x: number; width: number } | null` (where a vanished boss will reappear).
  - `interface EdgeWarning { side: 'left' | 'right'; height: number; size: number; charge: number }` and `edgeWarnings(b: BossState, boss: BossDef): EdgeWarning[]`.
  - `edgeArrow(w: EdgeWarning, tick: number): { primitives: Primitive[]; alpha: number }`.
  - `interface EmberSpan { left: number; right: number }` and `emberSpan(shot: EruptionState): EmberSpan | null`.
  - `emberTongues(span: EmberSpan, tick: number, palette: { edge: string; core: string }): Primitive[]`.
  - `shieldPlate(b: BossState, boss: BossDef): Primitive[]`.
  - `temperGlow(level: number): number` (0 up to `LOOK.temper.alphaMax`).

- [ ] **Step 1: Write the failing test**

Create `tests/look-identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { EMBER, WORLD } from '../src/game/params';
import { createInitialState, type EruptionState } from '../src/game/state';
import { NO_FEEDBACK } from '../src/ui/feedback';
import { NO_EFFECTS, spawnEffects } from '../src/ui/look/effects';
import {
  blinkMark,
  edgeArrow,
  edgeWarnings,
  emberSpan,
  emberTongues,
  shieldPlate,
  temperGlow,
} from '../src/ui/look/identityfx';
import { attackPalette } from '../src/ui/look/attackfx';
import type { Primitive } from '../src/ui/look/figures';
import { LOOK } from '../src/ui/look/tuning';
import { drawFrame } from '../src/ui/render';
import { attackBox } from '../src/game/geometry';
import { customBoss, melee } from './boss-helpers';

const xs = (p: Primitive): number[] =>
  p.kind === 'poly' ? p.points.map((pt) => pt[0]) : p.kind === 'rect' ? [p.x, p.x + p.w] : [p.x - p.r, p.x + p.r];
const ys = (p: Primitive): number[] =>
  p.kind === 'poly' ? p.points.map((pt) => pt[1]) : p.kind === 'rect' ? [p.y, p.y + p.h] : [p.y - p.r, p.y + p.r];

const blinker: BossDef = customBoss(
  [melee('cut', { blink: { from: 4, to: 12, target: 'player', distance: 80 } })],
  { attacks: [{ id: 'cut', weight: 1 }] },
);

const volley: AttackDef = melee('volley', {
  windup: 30,
  active: 4,
  recovery: 10,
  hits: [],
  shots: [
    { kind: 'bolt', at: 30, height: 100, size: 30, speed: 600, edge: 'left' },
    { kind: 'bolt', at: 30, height: 40, size: 30, speed: 600, edge: 'right' },
    { kind: 'bolt', at: 30, height: 40, size: 30, speed: 600 },
  ],
});
const shooter: BossDef = customBoss([volley], { attacks: [{ id: 'volley', weight: 1 }] });

const shielded: BossDef = customBoss([melee('swing')], { attacks: [{ id: 'swing', weight: 1 }] }, { shield: { turnTicks: 40 } });

describe('blinkMark', () => {
  it('shows the landing spot only while the boss is vanished', () => {
    const s = createInitialState(blinker, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'cut';
    s.boss.blinkToX = 520;
    s.boss.attackTick = 6;
    expect(blinkMark(s.boss, blinker)).toEqual({ x: 520, width: blinker.width });
    s.boss.attackTick = 2;
    expect(blinkMark(s.boss, blinker)).toBeNull();
    s.boss.attackTick = 12;
    s.boss.blinkToX = null;
    expect(blinkMark(s.boss, blinker)).toBeNull();
  });
});

describe('edgeWarnings and edgeArrow', () => {
  const at = (attackTick: number) => {
    const s = createInitialState(shooter, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'volley';
    s.boss.attackTick = attackTick;
    return s.boss;
  };

  it('lists one warning per edge bolt still to come, and none for a normal bolt', () => {
    const w = edgeWarnings(at(10), shooter);
    expect(w.map((x) => x.side).sort()).toEqual(['left', 'right']);
    expect(w.find((x) => x.side === 'left')!.height).toBe(100);
    expect(w.find((x) => x.side === 'left')!.charge).toBeCloseTo(10 / 30);
  });

  it('is empty once the bolts have left, when idle, and for a boss without edge bolts', () => {
    expect(edgeWarnings(at(30), shooter)).toEqual([]);
    expect(edgeWarnings(createInitialState(shooter, 1).boss, shooter)).toEqual([]);
    expect(edgeWarnings(createInitialState(blinker, 1).boss, blinker)).toEqual([]);
  });

  it('draws an arrow inside the arena at the right edge, pointing inward, brighter as the bolt gets close', () => {
    const w = edgeWarnings(at(10), shooter);
    const left = edgeArrow(w.find((x) => x.side === 'left')!, 0);
    const right = edgeArrow(w.find((x) => x.side === 'right')!, 0);
    for (const x of left.primitives.flatMap(xs)) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of right.primitives.flatMap(xs)) expect(x).toBeLessThanOrEqual(WORLD.width);
    const tip = (p: Primitive) => (p.kind === 'poly' ? p.points[1]![0] : NaN);
    expect(tip(left.primitives[0]!)).toBeGreaterThan(xs(left.primitives[0]!)[0]!);
    expect(tip(right.primitives[0]!)).toBeLessThan(xs(right.primitives[0]!)[0]!);
    const near = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.9 }, 0);
    const far = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.1 }, 0);
    expect(near.alpha).toBeGreaterThan(far.alpha);
  });

  it('is centred where the bolt will fly', () => {
    const arrow = edgeArrow({ side: 'left', height: 100, size: 30, charge: 0.5 }, 0);
    const cy = WORLD.floorY - 100 - 15;
    const all = arrow.primitives.flatMap(ys);
    expect((Math.min(...all) + Math.max(...all)) / 2).toBeCloseTo(cy);
  });
});

describe('emberSpan and emberTongues', () => {
  const eruption = (age: number, linger: number | undefined): EruptionState => ({
    kind: 'eruption',
    attackId: 'e',
    originTick: 0,
    x: 600,
    lift: 0,
    age,
    width: 200,
    delay: 30,
    burst: 10,
    ...(linger === undefined ? {} : { linger }),
  });

  it('exists only in the stretch after the blast, and only with a linger', () => {
    expect(emberSpan(eruption(39, 60))).toBeNull();
    expect(emberSpan(eruption(40, 60))).toEqual({ left: 500, right: 700 });
    expect(emberSpan(eruption(99, 60))).not.toBeNull();
    expect(emberSpan(eruption(100, 60))).toBeNull();
    expect(emberSpan(eruption(60, undefined))).toBeNull();
  });

  it('draws flames that stay inside the real ember box and never more than the cap', () => {
    const palette = attackPalette('');
    for (const width of [40, 200, 1200]) {
      const span = { left: 300, right: 300 + width };
      for (const tick of [0, 3, 7, 11]) {
        const shapes = emberTongues(span, tick, palette);
        expect(shapes.length).toBeGreaterThan(0);
        expect(shapes.length).toBeLessThanOrEqual(LOOK.ember.maxTongues + 1);
        for (const p of shapes) {
          for (const x of xs(p)) {
            expect(x).toBeGreaterThanOrEqual(span.left - 1e-9);
            expect(x).toBeLessThanOrEqual(span.right + 1e-9);
          }
          for (const y of ys(p)) {
            expect(y).toBeGreaterThanOrEqual(WORLD.floorY - EMBER.height - 1e-9);
            expect(y).toBeLessThanOrEqual(WORLD.floorY + 1e-9);
          }
        }
      }
    }
  });

  it('flickers from one moment to the next', () => {
    const span = { left: 300, right: 500 };
    const palette = attackPalette('');
    expect(JSON.stringify(emberTongues(span, 0, palette))).not.toBe(JSON.stringify(emberTongues(span, LOOK.ember.flickerTicks, palette)));
  });
});

describe('shieldPlate', () => {
  const state = () => {
    const s = createInitialState(shielded, 1);
    s.boss.x = 800;
    s.boss.mode = 'gap';
    return s;
  };

  it('is a plate in front of the boss, on the side it faces, while the shield is up', () => {
    for (const facing of [1, -1] as const) {
      const s = state();
      s.boss.facing = facing;
      const plate = shieldPlate(s.boss, shielded);
      expect(plate.length).toBeGreaterThan(0);
      for (const p of plate) {
        for (const x of xs(p)) {
          if (facing === 1) expect(x).toBeGreaterThanOrEqual(800 + shielded.width / 2);
          else expect(x).toBeLessThanOrEqual(800 - shielded.width / 2);
        }
      }
    }
  });

  it('is gone when the shield is down, and never drawn for a boss without one', () => {
    const s = state();
    s.boss.mode = 'stagger';
    expect(shieldPlate(s.boss, shielded)).toEqual([]);
    const plain = createInitialState(blinker, 1);
    expect(shieldPlate(plain.boss, blinker)).toEqual([]);
  });
});

describe('temperGlow', () => {
  it('is nothing for a calm boss and grows to the maximum as the boss gets angrier', () => {
    expect(temperGlow(0)).toBe(0);
    expect(temperGlow(LOOK.temper.from)).toBe(0);
    expect(temperGlow(0.7)).toBeGreaterThan(0);
    expect(temperGlow(0.7)).toBeLessThan(temperGlow(1));
    expect(temperGlow(1)).toBeCloseTo(LOOK.temper.alphaMax);
  });
});

describe('the block spark', () => {
  it('a blocked hit gives sparks and a ring at the swing, and no more than a normal hit does', () => {
    const before = createInitialState(shielded, 1);
    const after = structuredClone(before);
    after.events = ['bossBlocked'];
    const fx = spawnEffects(NO_EFFECTS, before, after, shielded, true);
    const c = attackBox(after.player);
    const sparks = fx.particles.filter((p) => p.kind === 'spark');
    expect(sparks).toHaveLength(LOOK.sparksOnBlock);
    expect(sparks[0]!.x).toBe(c.x + c.w / 2);
    expect(sparks[0]!.color).toBe(LOOK.block);
    expect(fx.rings).toHaveLength(1);
    expect(LOOK.sparksOnBlock).toBeLessThanOrEqual(LOOK.sparksOnBossHit);
  });
});

/** A stand-in canvas that notes each call and the fill colour at that moment. */
function recorder() {
  const calls: { name: string; fillStyle: unknown }[] = [];
  const props: Record<string, unknown> = { fillStyle: '', globalAlpha: 1, strokeStyle: '' };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return () => {
        calls.push({ name: key, fillStyle: target.fillStyle });
        if (key === 'createLinearGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('drawFrame with the new mechanics', () => {
  it('draws the blink mark and no boss body while the boss is vanished', () => {
    const s = createInitialState(blinker, 1);
    s.boss.mode = 'attack';
    s.boss.attackId = 'cut';
    s.boss.attackTick = 6;
    s.boss.blinkToX = 520;
    const f = recorder();
    expect(() => drawFrame(f.ctx, 1280, 720, s, blinker, 0.5, NO_FEEDBACK)).not.toThrow();
    expect(f.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.blink.color)).toBe(true);
  });

  it('draws flame tongues for an ember and the shield plate for a shielded boss', () => {
    const embers = createInitialState(blinker, 1);
    embers.shots.push({
      kind: 'eruption', attackId: 'e', originTick: 0, x: 600, lift: 0, age: 50, width: 200, delay: 30, burst: 10, linger: 60,
    });
    const f = recorder();
    drawFrame(f.ctx, 1280, 720, embers, blinker, 0.5, NO_FEEDBACK);
    expect(f.calls.some((c) => c.name === 'fill' && c.fillStyle === LOOK.shot.eruptionCore)).toBe(true);

    const s = createInitialState(shielded, 1);
    s.boss.mode = 'gap';
    const g = recorder();
    drawFrame(g.ctx, 1280, 720, s, shielded, 0.5, NO_FEEDBACK);
    expect(g.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.shield.edge)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `npx vitest run tests/look-identity.test.ts`
Expected: FAIL (`identityfx` does not exist, `LOOK.blink`, `LOOK.ember`, `LOOK.shield`, `LOOK.temper`, `LOOK.block`, `LOOK.sparksOnBlock` do not exist).

- [ ] **Step 3: Add the tunables**

`src/ui/look/tuning.ts`: after `sparksOnBossHit: 8,` add:

```ts
  /** Sparks when a hit is blocked by a shield (fewer than a real hit: nothing was hurt). */
  sparksOnBlock: 5,
```

after `hurtSpark: '#ff4a44',` add:

```ts
  /** The sparks and ring of a blocked hit: cold steel, unlike the warm spark of a real hit. */
  block: '#dfe6f5',
```

after the `slash: { ... },` block (before the `mark` block) add:

```ts
  // ---- Signs of the newer boss mechanics (see identityfx.ts) ----
  /** A vanished boss: a bar on the floor where it will reappear (as wide as the boss) and a faint ghost column over it. */
  blink: { color: '#b58cff', markHeight: 6, markAlpha: 0.8, ghostAlpha: 0.16 },
  /** Lingering fire on the floor: at most `maxTongues` flames per patch, each `flickerTicks` long, over a low base. The flames never rise above the real hit box (`EMBER.height`). */
  ember: { maxTongues: 12, tongueWidth: 26, flickerTicks: 6, lowShare: 0.7, baseShare: 0.35, alpha: 0.9 },
  /** The arrow that shows a bolt is coming from a side edge: `inset` from the edge, `length` and `half` (half its height) of the arrow, dimmest at first (`minAlpha`), red like every danger. */
  edgeWarn: { inset: 6, length: 34, half: 20, minAlpha: 0.35, color: '#e0403a' },
  /** The shield plate in front of a boss: `gap` off the body, `width` thick, `heightShare` of the body's height. */
  shield: { gap: 6, width: 16, heightShare: 0.85, edge: '#6f7b93', color: '#c9d2e3' },
  /** An angry boss (see `temperLevel`): an outline that starts at `from` (0 to 1) and reaches `alphaMax` at full temper. */
  temper: { from: 0.35, alphaMax: 0.55, color: '#ff5a3a', lineWidth: 5 },
```

- [ ] **Step 4: Write `identityfx.ts`**

Create `src/ui/look/identityfx.ts`:

```ts
/**
 * The signs of the newer boss mechanics, as plain shapes: where a vanished boss will reappear, the arrow that warns
 * of a bolt from a side edge, the flames of lingering embers, the shield plate and how angry a boss looks. Purely
 * cosmetic and pure (no canvas): `render.ts` draws what these return. Every size and colour is in `tuning.ts`.
 */
import type { BossDef } from '../../bosses/schema';
import { bossHidden, shieldUp } from '../../game/geometry';
import { EMBER, WORLD } from '../../game/params';
import type { BossState, EruptionState } from '../../game/state';
import type { Primitive } from './figures';
import { bossDrawBox } from './pose';
import { LOOK } from './tuning';

/** Where a vanished boss will reappear, or null when the boss is not vanished. */
export function blinkMark(b: BossState, boss: BossDef): { x: number; width: number } | null {
  if (!bossHidden(b, boss) || b.blinkToX === null) return null;
  return { x: b.blinkToX, width: boss.width };
}

export interface EdgeWarning {
  side: 'left' | 'right';
  /** Height of the bolt's bottom edge above the floor, and the bolt's size. */
  height: number;
  size: number;
  /** 0 when the attack has just begun, 1 when the bolt leaves. */
  charge: number;
}

/** One warning for each side-edge bolt of the running attack that has not left yet. */
export function edgeWarnings(b: BossState, boss: BossDef): EdgeWarning[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const shots = boss.attacks.find((a) => a.id === b.attackId)?.shots;
  if (shots === undefined) return [];
  const out: EdgeWarning[] = [];
  for (const shot of shots) {
    if (shot.kind !== 'bolt' || shot.edge === undefined || b.attackTick >= shot.at) continue;
    out.push({ side: shot.edge, height: shot.height, size: shot.size, charge: Math.min(1, b.attackTick / shot.at) });
  }
  return out;
}

/** The arrow for one warning: inside the arena at that edge, on the line the bolt will fly, pointing inward. */
export function edgeArrow(w: EdgeWarning, tick: number): { primitives: Primitive[]; alpha: number } {
  const e = LOOK.edgeWarn;
  const cy = WORLD.floorY - w.height - w.size / 2;
  const dir = w.side === 'left' ? 1 : -1;
  const x0 = w.side === 'left' ? e.inset : WORLD.width - e.inset;
  const points: [number, number][] = [
    [x0, cy - e.half],
    [x0 + dir * e.length, cy],
    [x0, cy + e.half],
  ];
  const pulse = 0.75 + 0.25 * Math.sin(tick / 3);
  return { primitives: [{ kind: 'poly', points, color: e.color }], alpha: (e.minAlpha + (1 - e.minAlpha) * w.charge) * pulse };
}

export interface EmberSpan {
  left: number;
  right: number;
}

/** The floor the embers cover, or null unless this eruption is in its lingering stretch (after the blast, `linger` updates). */
export function emberSpan(shot: EruptionState): EmberSpan | null {
  if (shot.linger === undefined) return null;
  const start = shot.delay + shot.burst;
  if (shot.age < start || shot.age >= start + shot.linger) return null;
  return { left: shot.x - shot.width / 2, right: shot.x + shot.width / 2 };
}

/** A low base and a row of flames, each flickering between two heights. Nothing rises above `EMBER.height`, the real hit box. */
export function emberTongues(span: EmberSpan, tick: number, palette: { edge: string; core: string }): Primitive[] {
  const e = LOOK.ember;
  const width = span.right - span.left;
  const count = Math.max(1, Math.min(e.maxTongues, Math.round(width / e.tongueWidth)));
  const each = width / count;
  const out: Primitive[] = [
    { kind: 'rect', x: span.left, y: WORLD.floorY - EMBER.height * e.baseShare, w: width, h: EMBER.height * e.baseShare, color: palette.edge },
  ];
  for (let i = 0; i < count; i++) {
    const high = (tick + i * 3) % (e.flickerTicks * 2) < e.flickerTicks;
    const h = EMBER.height * (high ? 1 : e.lowShare);
    const x0 = span.left + i * each;
    out.push({
      kind: 'poly',
      color: palette.core,
      points: [
        [x0, WORLD.floorY],
        [x0 + each / 2, WORLD.floorY - h],
        [x0 + each, WORLD.floorY],
      ],
    });
  }
  return out;
}

/** The shield plate on the side the boss faces, or nothing while the shield is down (or the boss has none). */
export function shieldPlate(b: BossState, boss: BossDef): Primitive[] {
  if (!shieldUp(b, boss)) return [];
  const s = LOOK.shield;
  const { top, height } = bossDrawBox(b, boss);
  const h = height * s.heightShare;
  const y = top + (height - h) / 2;
  const near = b.x + b.facing * (boss.width / 2 + s.gap);
  const x = b.facing === 1 ? near : near - s.width;
  return [
    { kind: 'rect', x, y, w: s.width, h, color: s.edge },
    { kind: 'rect', x: x + 3, y: y + 3, w: s.width - 6, h: h - 6, color: s.color },
  ];
}

/** The opacity of the angry outline for a temper level from 0 to 1: nothing up to `LOOK.temper.from`, then rising to `alphaMax`. */
export function temperGlow(level: number): number {
  const t = LOOK.temper;
  if (level <= t.from) return 0;
  return t.alphaMax * Math.min(1, (level - t.from) / (1 - t.from));
}
```

- [ ] **Step 5: The block spark**

`src/ui/look/effects.ts`: in the `switch (event)` of `spawnEffects`, right after the `case 'bossHit': { ... }` block add:

```ts
      case 'bossBlocked': {
        const c = centreOf(attackBox(after.player));
        out.sparks(LOOK.sparksOnBlock, c.x, c.y, LOOK.block);
        out.smallRing(c.x, c.y, LOOK.block);
        break;
      }
```

If Task 8 already added a placeholder `case 'bossBlocked': break;`, replace it with the block above.

- [ ] **Step 6: Draw it in `render.ts`**

Imports: add `bossHidden` to the `../game/geometry` import; add `import { temperLevel } from '../game/boss';`; add `import { blinkMark, edgeArrow, edgeWarnings, emberSpan, emberTongues, shieldPlate, temperGlow } from './look/identityfx';`.

In `drawShots`, at the start of the `if (shot.kind === 'eruption') {` branch (before `const mark = eruptionMark(shot);`) add:

```ts
      const ember = emberSpan(shot);
      if (ember !== null) {
        drawPrimitives(ctx, emberTongues(ember, state.tick, { edge: look.edge, core: look.eruptionCore }), LOOK.ember.alpha);
        continue;
      }
```

In `drawBoss`, right after the `if (isDowned(state, index)) { ... return; }` block add:

```ts
  if (bossHidden(b, boss)) {
    const mark = blinkMark(b, boss);
    if (mark !== null) {
      const t = LOOK.blink;
      const pulse = 0.6 + 0.4 * Math.sin(state.tick / 3);
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.markAlpha * pulse;
      ctx.fillRect(mark.x - mark.width / 2, WORLD.floorY - t.markHeight, mark.width, t.markHeight);
      ctx.globalAlpha = t.ghostAlpha * pulse;
      ctx.fillRect(mark.x - mark.width / 2, WORLD.floorY - boss.height, mark.width, boss.height);
      ctx.restore();
    }
    return;
  }
```

In `drawBoss`, right after the `if (look.glow !== null) { ... }` block (the pulsing stroke) add:

```ts
  drawPrimitives(ctx, shieldPlate(b, boss));
  const anger = temperGlow(temperLevel(state, boss, b));
  if (anger > 0 && look.glow === null) {
    ctx.save();
    ctx.globalAlpha = anger * pulse;
    ctx.strokeStyle = LOOK.temper.color;
    ctx.lineWidth = LOOK.temper.lineWidth;
    ctx.strokeRect(left - 3, top - 3, boss.width + 6, height + 6);
    ctx.restore();
  }
  for (const warning of edgeWarnings(b, boss)) {
    const arrow = edgeArrow(warning, state.tick);
    drawPrimitives(ctx, arrow.primitives, arrow.alpha);
  }
```

- [ ] **Step 7: Run the tests and see them pass**

Run: `npx vitest run tests/look-identity.test.ts tests/look-wiring.test.ts tests/look-effects.test.ts tests/look-attackfx.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS. (The looks read state only, so no recording or golden test changes.)

- [ ] **Step 9: Commit**

```bash
git add src/ui/look/tuning.ts src/ui/look/identityfx.ts src/ui/look/effects.ts src/ui/render.ts tests/look-identity.test.ts
git commit -m "feat: draw the blink mark, embers, side-bolt arrows, shield and angry outline"
```

---

### Task 10: Sounds for the new mechanics

Four new sounds, all read from the game state (`cues.ts`), so no fight, recording or `GAME_VERSION` is touched: a clang when a shield turns a hit aside, a falling shimmer when a boss vanishes and a rising one when it comes back, and two quick pips when a bolt is about to come in from a side edge (panned toward that side, so the ear says where to look). They are quiet and use triangle and sine tones, not square waves (the death-sound "hornet" came from square waves).

**Files:**
- Modify: `src/ui/sound/tuning.ts` (`VoiceName`, `RECIPES`, `PRIORITY`, `EDGE_PAN`)
- Modify: `src/ui/sound/cues.ts` (`cuesFor`, `bossCues`)
- Test: `tests/sound-identity.test.ts` (create)

**Interfaces:**
- Consumes: `bossHidden(b: BossState, boss: BossDef): boolean` (`src/game/geometry.ts`); the `'bossBlocked'` event; `BoltDef.edge`; the existing `cue`, `cuesFor(before, after, fight)`, `panOf`, `attackStarted` in `cues.ts`.
- Produces:
  - `VoiceName` gains `'blockClang' | 'blinkOut' | 'blinkIn' | 'edgeWarn'`; `RECIPES` and `PRIORITY` (both `Record<VoiceName, ...>`) gain an entry for each.
  - `export const EDGE_PAN = 0.6` in `tuning.ts` (how far toward its side a one-sided edge warning is panned).
  - `cuesFor` returns `blockClang` for a `'bossBlocked'` event, `blinkOut` on the update a boss becomes hidden, `blinkIn` on the update it stops being hidden, and `edgeWarn` on the update an attack with side-edge bolts begins (panned to the one side, or unpanned for both).

- [ ] **Step 1: Write the failing test**

Create `tests/sound-identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { cuesFor, type Cue } from '../src/ui/sound/cues';
import { EDGE_PAN, PRIORITY, RECIPES } from '../src/ui/sound/tuning';
import { customBoss, melee } from './boss-helpers';

const blinker: BossDef = customBoss(
  [melee('cut', { blink: { from: 4, to: 12, target: 'player', distance: 80 } })],
  { attacks: [{ id: 'cut', weight: 1 }] },
);

const edgeBoss = (sides: ('left' | 'right' | 'none')[]): BossDef => {
  const attack: AttackDef = melee('volley', {
    windup: 30,
    active: 4,
    recovery: 10,
    hits: [],
    shots: sides.map((side) => ({
      kind: 'bolt' as const,
      at: 30,
      height: 60,
      size: 30,
      speed: 600,
      ...(side === 'none' ? {} : { edge: side }),
    })),
  });
  return customBoss([attack], { attacks: [{ id: 'volley', weight: 1 }] });
};

const voices = (cues: Cue[]): string[] => cues.map((c) => c.voice);

function at(boss: BossDef, attackId: string, tick: number | null): GameState {
  const s = createInitialState(boss, 1);
  if (tick !== null) {
    s.boss.mode = 'attack';
    s.boss.attackId = attackId;
    s.boss.attackTick = tick;
  }
  return s;
}

const played = (boss: BossDef, before: GameState, after: GameState): Cue[] => cuesFor(before, after, asFight(boss));

describe('the new voices', () => {
  it('have a recipe and a priority each, and stay quiet', () => {
    for (const name of ['blockClang', 'blinkOut', 'blinkIn', 'edgeWarn'] as const) {
      expect(RECIPES[name].length).toBeGreaterThan(0);
      expect(PRIORITY[name]).toBeGreaterThan(0);
      expect(PRIORITY[name]).toBeLessThan(PRIORITY.playerHurt);
      for (const part of RECIPES[name]) if ('tone' in part) expect(part.tone).not.toBe('square');
    }
  });
});

describe('cues for a shield', () => {
  it('a blocked hit gives the clang and nothing else', () => {
    const before = createInitialState(blinker, 1);
    const after: GameState = { ...before, events: ['bossBlocked'] as GameEvent[] };
    expect(voices(played(blinker, before, after))).toEqual(['blockClang']);
  });
});

describe('cues for a blink', () => {
  it('shimmers out on the update the boss vanishes and back on the update it returns', () => {
    expect(voices(played(blinker, at(blinker, 'cut', 3), at(blinker, 'cut', 4)))).toContain('blinkOut');
    expect(voices(played(blinker, at(blinker, 'cut', 11), at(blinker, 'cut', 12)))).toContain('blinkIn');
  });

  it('is silent while the boss stays vanished or stays visible', () => {
    for (const [a, b] of [[5, 6], [8, 9], [1, 2], [13, 14]]) {
      const v = voices(played(blinker, at(blinker, 'cut', a!), at(blinker, 'cut', b!)));
      expect(v).not.toContain('blinkOut');
      expect(v).not.toContain('blinkIn');
    }
  });
});

describe('cues for bolts from the side edges', () => {
  const start = (boss: BossDef): Cue[] => played(boss, at(boss, 'volley', null), at(boss, 'volley', 0));

  it('warns once when the attack begins, panned toward the one side', () => {
    const left = start(edgeBoss(['left'])).filter((c) => c.voice === 'edgeWarn');
    const right = start(edgeBoss(['right'])).filter((c) => c.voice === 'edgeWarn');
    expect(left).toHaveLength(1);
    expect(left[0]!.pan).toBeCloseTo(-EDGE_PAN);
    expect(right[0]!.pan).toBeCloseTo(EDGE_PAN);
  });

  it('is centred for a crossfire from both edges', () => {
    const both = start(edgeBoss(['left', 'right'])).filter((c) => c.voice === 'edgeWarn');
    expect(both).toHaveLength(1);
    expect(both[0]!.pan ?? 0).toBe(0);
  });

  it('does not warn for a normal bolt, and not in the middle of the attack', () => {
    expect(voices(start(edgeBoss(['none'])))).not.toContain('edgeWarn');
    const boss = edgeBoss(['left']);
    expect(voices(played(boss, at(boss, 'volley', 9), at(boss, 'volley', 10)))).not.toContain('edgeWarn');
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `npx vitest run tests/sound-identity.test.ts`
Expected: FAIL (`EDGE_PAN` and the four voices do not exist).

- [ ] **Step 3: Add the voices**

`src/ui/sound/tuning.ts`:

1. In `VoiceName`, after `| 'boltPass'` add `| 'blockClang' | 'blinkOut' | 'blinkIn' | 'edgeWarn'`.
2. In `RECIPES`, after the `boltPass` entry add:

```ts
  // A shield turning a hit aside: a bright metallic ring over a dull thud.
  blockClang: [
    { tone: 'triangle', from: 1400, to: 900, seconds: 0.08, volume: 0.08 },
    { tone: 'sine', from: 2100, seconds: 0.16, volume: 0.06, delay: 0.01 },
    { noise: 'bandpass', freq: 3000, q: 2, seconds: 0.05, volume: 0.08 },
    { tone: 'sine', from: 120, to: 80, seconds: 0.08, volume: 0.12 },
  ],
  // A boss vanishes: a falling shimmer.
  blinkOut: [
    { tone: 'sine', from: 1600, to: 300, seconds: 0.14, volume: 0.09 },
    { noise: 'highpass', freq: 3000, seconds: 0.08, volume: 0.05 },
  ],
  // A boss appears: a rising shimmer.
  blinkIn: [
    { tone: 'sine', from: 300, to: 1600, seconds: 0.12, volume: 0.09 },
    { noise: 'bandpass', freq: 2500, q: 1, seconds: 0.06, volume: 0.06 },
  ],
  // A bolt is about to come in from a side: two quick rising pips.
  edgeWarn: [
    { tone: 'triangle', from: 700, seconds: 0.07, volume: 0.08 },
    { tone: 'triangle', from: 990, seconds: 0.09, volume: 0.08, delay: 0.09 },
  ],
```

3. In `PRIORITY`, after `boltPass: 2,` add:

```ts
  blockClang: 7,
  blinkOut: 5,
  blinkIn: 5,
  edgeWarn: 6,
```

4. After `SHOT_PASS` add:

```ts
/** A warning for bolts from one side edge is panned this far toward that side (-1 is full left, 1 full right). */
export const EDGE_PAN = 0.6;
```

- [ ] **Step 4: Read the state in `cues.ts`**

`src/ui/sound/cues.ts`:

1. Add `import { bossHidden } from '../../game/geometry';` and add `EDGE_PAN` to the `./tuning` import.
2. After `attackOf` add:

```ts
/** The side edges an attack fires bolts from (none, one or both). */
const edgeSides = (attack: AttackDef): ('left' | 'right')[] => {
  const sides = new Set<'left' | 'right'>();
  for (const shot of attack.shots ?? []) if (shot.kind === 'bolt' && shot.edge !== undefined) sides.add(shot.edge);
  return [...sides];
};
```

3. In `bossCues`, inside `if (attackStarted(was, now)) {` after the `else push('swell', ...)` line add:

```ts
      const sides = edgeSides(attack);
      if (sides.length > 0) {
        out.push(cue('edgeWarn', extra(undefined, sides.length === 1 ? (sides[0] === 'left' ? -EDGE_PAN : EDGE_PAN) : pan)));
      }
```

4. In `bossCues`, right after the `if (was.diveFromLift === null && now.diveFromLift !== null) push('diveDown');` line add:

```ts
  const def = fight.bosses[index];
  if (def !== undefined) {
    const wasHidden = bossHidden(was, def);
    const nowHidden = bossHidden(now, def);
    if (!wasHidden && nowHidden) push('blinkOut');
    if (wasHidden && !nowHidden) push('blinkIn');
  }
```

5. In `cuesFor`, after the `phaseChange` block add:

```ts
  if (after.events.includes('bossBlocked')) cues.push(cue('blockClang'));
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run tests/sound-identity.test.ts tests/sound-cues.test.ts tests/sound-recipes.test.ts tests/sound-voices.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/sound/tuning.ts src/ui/sound/cues.ts tests/sound-identity.test.ts
git commit -m "feat: sounds for a blocked hit, a blink and a bolt from the side"
```

---

### Task 11: Boss data A: Hound, Reaver, Warden and Sentinel

Until now the engine gained new abilities (temper, combos, holds, blinks, embers, side bolts, hit reactions, the shield) but no real boss uses them. This task gives four bosses their identity, using only data edits (JSON files) plus test updates. No engine code changes. The four bosses:

- **Ashen Hound**: runs past you to the other side (a `slip` is always followed by a `bite` from behind); when you hit it, it skitters away; when you leave it alone it turns to pounces.
- **Gale Reaver**: fixed combos that end with a carry-you-across-the-arena rush; when you hit it, it backs off.
- **Quill Warden**: a new fast low poke (`snap-piercer`) that is always followed by the rising swipe; when you hit it, it vaults away; neglect makes the fast poke more common.
- **Brass Sentinel**: walks slowly behind its shield; neglect makes the long "late-herald" and the red "brass-snap" more common.

All numbers are first guesses for the owner to feel on the phone. Tests below check behaviour ("a slip is followed by a bite", "a hit on the waiting Sentinel is blocked"), never tuned numbers.

**Files:**
- Modify: `tests/boss-helpers.ts` (new helpers `openField`, `only`, `pickShare`)
- Create: `tests/boss-identity-fights.test.ts`
- Modify: `src/bosses/ashen-hound.json`, `src/bosses/gale-reaver.json`, `src/bosses/quill-warden.json`, `src/bosses/brass-sentinel.json`
- Modify: `tests/ashen-hound.test.ts`, `tests/gale-reaver.test.ts`, `tests/quill-warden.test.ts` (attack lists, one-attack helpers)
- Modify: `tests/variety-fairness.test.ts` (one-attack helper; maybe the `seer` bot)

**Interfaces:**
- Consumes (all produced by Tasks 1 to 8):
  - `BossDef.temper?: number` (0 to 1), `PhaseAttack.heavy?: boolean`, `TEMPER` in `src/game/params.ts` (`TEMPER.start + TEMPER.ramp` is the level where the boss is at full anger; `BossState.temper` counts updates).
  - `PhaseDef.combos?: string[][]`, `PhaseDef.spacing?: { min: number; max: number }`.
  - `BossDef.reaction?: { attack: string; cooldown: number }`, `BossDef.shield?: { turnTicks: number }`, the `'bossBlocked'` event.
  - `attackLength(attack: AttackDef): number` exported from `src/game/boss.ts`.
  - Existing test helpers `isWindup`, `windupUpdates`, `attackIds`, `updatesWith`, `standAt` in `tests/boss-helpers.ts`; `run`, `withInput` in `tests/helpers.ts`.
- Produces (used by Tasks 12 and 13):
  - `openField(base: BossDef): BossDef` in `tests/boss-helpers.ts`: the boss with no walking (`spacing {0, 1e9}`), every attack usable from any distance, and any per-phase spacing widened the same way.
  - `only(base: BossDef, id: string): BossDef`: `openField(base)` whose phases have gap 1, `maxChain` 1, `chainChance` 0 and only attack `id` (combos, if any, are kept).
  - `pickShare(boss: BossDef, ids: string[], temper: number, seeds?: number[], updates?: number): number`: the share of started attacks whose id is in `ids`, for a passive, unkillable player, with the boss's temper counter forced to `temper` before every update.
  - In `tests/boss-identity-fights.test.ts`: a `ROSTER` array of `[name, boss]` pairs that Tasks 12 and 13 extend, and a local `aboutToHit(boss, side)` helper that Tasks 12 and 13 reuse by copying (each test file keeps its own copy).
  - The new attacks `skitter` (Hound), `gale-carry` and `gale-recoil` (Reaver), `snap-piercer` (Warden).

- [ ] **Step 1: Add the shared test helpers**

In `tests/boss-helpers.ts`, append these three helpers at the end of the file. No new imports are needed: `BossDef`, `step`, `NO_INPUT`, `createInitialState` and `isWindup` are already there.

```ts
/** The boss with no walking and every attack usable from any distance, so a test decides when it strikes. */
export function openField(base: BossDef): BossDef {
  return {
    ...base,
    spacing: { min: 0, max: 1e9 },
    attacks: base.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: base.phases.map((p) => (p.spacing === undefined ? p : { ...p, spacing: { min: 0, max: 1e9 } })),
  };
}

/** The boss using only attack `id` (and its combo, if `id` starts one), starting a new attack one update after the last ends. */
export function only(base: BossDef, id: string): BossDef {
  const open = openField(base);
  return {
    ...open,
    phases: open.phases.map((p) => ({
      ...p,
      opening: undefined,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id, weight: 1 }],
    })),
  };
}

/**
 * The share of started attacks whose id is in `ids`, over several seeded fights against a player who does nothing and
 * cannot die. The boss's temper counter (in updates) is forced to `temper` before every update, so a test compares a
 * calm boss (0) with a furious one (`TEMPER.start + TEMPER.ramp`).
 */
export function pickShare(
  boss: BossDef,
  ids: string[],
  temper: number,
  seeds: number[] = [1, 2, 3, 4, 5, 6, 7, 8],
  updates = 6000,
): number {
  let picked = 0;
  let all = 0;
  for (const seed of seeds) {
    let s = createInitialState(boss, seed);
    s.player.health = 1e9;
    for (let n = 0; n < updates; n++) {
      s.boss.temper = temper;
      s = step(s, NO_INPUT, boss);
      if (s.events.some(isWindup)) {
        all += 1;
        if (ids.includes(s.boss.attackId ?? '')) picked += 1;
      }
    }
  }
  return picked / all;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/boss-identity-fights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BRASS_SENTINEL, GALE_REAVER, QUILL_WARDEN } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { DIALS, NORMAL_DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { PLAYER, TEMPER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { attackIds, isWindup, only, pickShare, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { run } from './helpers';

const FULL = TEMPER.start + TEMPER.ramp;

/** Every real boss that has been given an identity. Later tasks add to this list. */
const ROSTER: [string, BossDef][] = [
  ['Ashen Hound', ASHEN_HOUND],
  ['Gale Reaver', GALE_REAVER],
  ['Quill Warden', QUILL_WARDEN],
  ['Brass Sentinel', BRASS_SENTINEL],
];

/** The boss at 700 facing left. The player is in front of it (left, x 640) or behind it (right, x 760), about to land a swing. */
function aboutToHit(boss: BossDef, side: 'front' | 'behind' = 'front'): GameState {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.boss.facing = -1;
  s.player.x = side === 'front' ? 640 : 760;
  s.player.prevX = s.player.x;
  s.player.facing = side === 'front' ? 1 : -1;
  s.player.health = 1e9;
  s.player.attackTick = PLAYER.attack.startup - 1;
  s.player.attackConnected = false;
  s.player.attackAim = 'forward';
  return s;
}

const attack = (boss: BossDef, id: string) => boss.attacks.find((a) => a.id === id)!;

describe('the roster still parses with its new abilities', () => {
  it.each(ROSTER)('%s: valid at every dial extreme, and the file itself at Normal', (_name, boss) => {
    expect(applyDials(boss, NORMAL_DIALS)).toEqual(boss);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        const dials: Dials = { ...NORMAL_DIALS, [dial.id]: value };
        expect(() => applyDials(boss, dials)).not.toThrow();
      }
    }
  });
});

describe('Ashen Hound: runs past you, skitters when hit, turns to pounces when ignored', () => {
  it('a slip is always followed by a bite, and the bite comes from the far side of the player', () => {
    const boss = only(ASHEN_HOUND, 'slip');
    // The player stands at the very edge of the slip's range, on the boss's left.
    const states = run(standAt(boss, 240), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['slip', 'bite', 'slip', 'bite']);
    const firstBite = states.find((s) => s.events.some(isWindup) && s.boss.attackId === 'bite')!;
    expect(firstBite.boss.x).toBeLessThan(firstBite.player.x);
  });

  it('a hit on the waiting Hound starts a skitter: it hurts nobody and carries the Hound away from the player', () => {
    const start = aboutToHit(ASHEN_HOUND);
    const states = run(start, 60, () => NO_INPUT, ASHEN_HOUND);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.attackId).toBe('skitter');
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[59]!.boss.x - start.boss.x).toBeGreaterThan(100);
  });

  it('turns to pounces when it has been left alone for a while', () => {
    const calm = pickShare(ASHEN_HOUND, ['pounce'], 0);
    const furious = pickShare(ASHEN_HOUND, ['pounce'], FULL);
    expect(furious).toBeGreaterThanOrEqual(calm + 0.08);
  });
});

describe('Gale Reaver: fixed combos ending in a carry, backs off when hit', () => {
  it('a wind-slash starts the first combo: wind-slash, gale-jab, gale-carry, with no long pause between steps', () => {
    const boss = only(GALE_REAVER, 'wind-slash');
    const states = run(standAt(boss, 100), 500, () => NO_INPUT, boss);
    const ids = attackIds(states);
    expect(ids.slice(0, 6)).toEqual(['wind-slash', 'gale-jab', 'gale-carry', 'wind-slash', 'gale-jab', 'gale-carry']);
    const starts = windupUpdates(states);
    for (const i of [0, 1]) {
      expect(starts[i + 1]! - starts[i]!).toBeLessThanOrEqual(attackLength(attack(boss, ids[i]!)) + 2);
    }
  });

  it('a gale-jab starts the second combo: gale-jab, gale-jab, gale-cyclone', () => {
    const boss = only(GALE_REAVER, 'gale-jab');
    const states = run(standAt(boss, 100), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 3)).toEqual(['gale-jab', 'gale-jab', 'gale-cyclone']);
  });

  it('the carry drags the Reaver across the arena and hurts a player who stands still', () => {
    const boss = only(GALE_REAVER, 'gale-carry');
    const start = standAt(boss, 150);
    start.player.health = 1e9;
    const states = run(start, 120, () => NO_INPUT, boss);
    const begin = states.find((s) => s.boss.mode === 'attack' && s.boss.attackTick === 0)!;
    const end = states.find((s) => s.boss.mode === 'attack' && s.boss.attackTick >= 46)!;
    expect(Math.abs(end.boss.x - begin.boss.x)).toBeGreaterThan(450);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThan(0);
  });

  it('a hit on the waiting Reaver makes it back off without hurting anyone', () => {
    const start = aboutToHit(GALE_REAVER);
    const states = run(start, 40, () => NO_INPUT, GALE_REAVER);
    expect(states[0]!.boss.attackId).toBe('gale-recoil');
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[39]!.boss.x - start.boss.x).toBeGreaterThan(100);
  });
});

describe('Quill Warden: a quick low poke then a rising swipe, vaults away when hit', () => {
  it('a snap-piercer is always followed by the rising swipe', () => {
    const boss = only(QUILL_WARDEN, 'snap-piercer');
    const states = run(standAt(boss, 300), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['snap-piercer', 'rising-swipe', 'snap-piercer', 'rising-swipe']);
  });

  it('the quick poke becomes more common when the Warden has been left alone', () => {
    const calm = pickShare(QUILL_WARDEN, ['snap-piercer'], 0);
    const furious = pickShare(QUILL_WARDEN, ['snap-piercer'], FULL);
    expect(furious).toBeGreaterThanOrEqual(calm * 1.5);
  });

  it('a hit on the waiting Warden starts the backwards vault', () => {
    const states = run(aboutToHit(QUILL_WARDEN), 2, () => NO_INPUT, QUILL_WARDEN);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.mode).toBe('attack');
    expect(states[0]!.boss.attackId).toBe('backwards-vault');
  });
});

describe('Brass Sentinel: a shield in front, longer and redder attacks when ignored', () => {
  it('a hit from the front on the waiting Sentinel is blocked', () => {
    const s = step(aboutToHit(BRASS_SENTINEL, 'front'), NO_INPUT, BRASS_SENTINEL);
    expect(s.events).toContain('bossBlocked');
    expect(s.events).not.toContain('bossHit');
    expect(s.boss.hp).toBe(BRASS_SENTINEL.maxHp);
  });

  it('a hit from behind lands', () => {
    const s = step(aboutToHit(BRASS_SENTINEL, 'behind'), NO_INPUT, BRASS_SENTINEL);
    expect(s.events).toContain('bossHit');
    expect(s.boss.hp).toBeLessThan(BRASS_SENTINEL.maxHp);
  });

  it('the long late-herald and the red brass-snap become more common when the Sentinel has been left alone', () => {
    const heavy = ['late-herald', 'brass-snap'];
    const calm = pickShare(BRASS_SENTINEL, heavy, 0);
    const furious = pickShare(BRASS_SENTINEL, heavy, FULL);
    expect(furious).toBeGreaterThanOrEqual(calm * 1.4);
  });
});
```

Notes for the implementer: `PhaseDef` may already accept `opening: undefined` (the existing `soloOf` in `tests/variety-fairness.test.ts` does the same); if the compiler objects to it in `only`, delete the `opening: undefined` line.

- [ ] **Step 3: Run the tests and see them fail**

Run: `npx vitest run tests/boss-identity-fights.test.ts`
Expected: FAIL. The roster test passes; the Hound, Reaver, Warden and Sentinel tests fail (no `skitter`, `gale-carry`, `snap-piercer`, no shield, no combos in the files).

- [ ] **Step 4: Edit the four boss files**

Run this one-off script from the repo root. It rewrites the four JSON files in the same 2-space format they already have (each file equals `JSON.stringify(x, null, 2) + '\n'` today, so the diff shows only the new data):

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';

const load = (name) => JSON.parse(fs.readFileSync(`src/bosses/${name}.json`, 'utf8'));
const save = (name, o) => fs.writeFileSync(`src/bosses/${name}.json`, JSON.stringify(o, null, 2) + '\n');
/** New top-level keys go straight after the `after` key so the file stays tidy. */
const insertAfter = (o, after, extra) =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k === after ? [[k, v], ...Object.entries(extra)] : [[k, v]])));
const attack = (o, id) => o.attacks.find((a) => a.id === id);
const inPhase = (phase, id) => phase.attacks.find((a) => a.id === id);

// ---- Ashen Hound ----
let hound = load('ashen-hound');
attack(hound, 'slip').move.speed = 1600; // now carries it past a player standing at the edge of its range
hound.attacks.push({
  id: 'skitter',
  name: 'Skitter',
  pose: 'crouch',
  class: 'mustDodge',
  windup: 8,
  active: 12,
  recovery: 10,
  range: { min: 0, max: 1000 },
  move: { from: 8, to: 20, speed: 900, dir: 'back' },
  hits: [],
});
inPhase(hound.phases[0], 'pounce').heavy = true;
hound.phases[0].combos = [['slip', 'bite']];
hound = insertAfter(hound, 'counter', { temper: 0.6, reaction: { attack: 'skitter', cooldown: 300 } });
save('ashen-hound', hound);

// ---- Gale Reaver ----
let reaver = load('gale-reaver');
reaver.attacks.push(
  {
    id: 'gale-carry',
    name: 'Gale Carry',
    pose: 'crouch',
    class: 'mustDodge',
    windup: 22,
    active: 24,
    recovery: 24,
    range: { min: 0, max: 400 },
    move: { from: 22, to: 46, speed: 1500 },
    hits: [{ from: 22, to: 46, x0: 0, x1: 100, bottom: 0, top: 100 }],
  },
  {
    id: 'gale-recoil',
    name: 'Gale Recoil',
    pose: 'raised',
    class: 'mustDodge',
    windup: 6,
    active: 12,
    recovery: 8,
    range: { min: 0, max: 1000 },
    move: { from: 6, to: 18, speed: 1200, dir: 'back' },
    hits: [],
  },
);
reaver.phases[0].chainChance = 0.3;
reaver.phases[0].combos = [
  ['wind-slash', 'gale-jab', 'gale-carry'],
  ['gale-jab', 'gale-jab', 'gale-cyclone'],
];
reaver = insertAfter(reaver, 'counter', { reaction: { attack: 'gale-recoil', cooldown: 240 } });
save('gale-reaver', reaver);

// ---- Quill Warden ----
let warden = load('quill-warden');
warden.attacks.push({
  id: 'snap-piercer',
  name: 'Snap Piercer',
  pose: 'down',
  class: 'mustDodge',
  windup: 14,
  active: 6,
  recovery: 8,
  range: { min: 260, max: 390 },
  hits: [{ from: 14, to: 20, x0: 0, x1: 390, bottom: 0, top: 60 }],
});
warden.phases[0].attacks.push({ id: 'snap-piercer', weight: 1, heavy: true });
warden.phases[0].combos = [['snap-piercer', 'rising-swipe']];
warden = insertAfter(warden, 'counter', { temper: 0.7, reaction: { attack: 'backwards-vault', cooldown: 300 } });
save('quill-warden', warden);

// ---- Brass Sentinel ----
let sentinel = load('brass-sentinel');
for (const id of ['late-herald', 'brass-snap']) {
  const entry = inPhase(sentinel.phases[0], id);
  entry.weight = 1;
  entry.heavy = true;
}
sentinel.phases[0].walkSpeed = 150;
sentinel = insertAfter(sentinel, 'counter', { temper: 0.8, shield: { turnTicks: 90 } });
save('brass-sentinel', sentinel);
EOF
git diff --stat src/bosses
```

Expected: four files changed. Each boss file must still be valid: `npx vitest run tests/bosses-index.test.ts tests/boss-parse.test.ts` (roster import parses every file; a bad value throws with a readable message).

- [ ] **Step 5: Update the older per-boss tests**

1. `tests/ashen-hound.test.ts`:
   - In `it('is loaded and found by id', ...)` change the expected list to `['bite', 'rush', 'slip', 'pounce', 'feint', 'skitter']`.
   - In the local `solo(id, withArena)` helper (line ~36), add `combos: [],` right after `chainChance: 0,` so a solo slip stays a lone slip. Do the same for any other helper in the file that rebuilds phases with `attacks: [{ id, weight: 1 }]`.
2. `tests/gale-reaver.test.ts`:
   - Rename the test to `'is loaded, has six attacks and no arena'` and add `'gale-carry'` and `'gale-recoil'` to the expected list, after `'gale-cyclone'`.
   - In `'is fast: ...'`, change the loop to `for (const a of GALE_REAVER.attacks) if (a.id !== 'gale-recoil') expect(a.windup).toBeGreaterThanOrEqual(18);` (the recoil is a quick reaction, not a telegraphed attack).
   - The phase now has `chainChance` 0.3 and combos: keep `expect(phase.chainChance).toBeGreaterThan(0)` and `expect(phase.maxChain).toBeGreaterThanOrEqual(3)` as they are, and add `expect(phase.combos).toHaveLength(2);`.
3. `tests/quill-warden.test.ts`:
   - Rename to `'is loaded, has six attacks (four melee, an anti-air swipe and a backwards vault), ...'` and add `'snap-piercer'` at the end of the expected list.
   - In `soloWarden`, add `combos: [],` after `chainChance: 0,`.
4. `tests/brass-sentinel.test.ts`: nothing changes (the attack list did not change).
5. `tests/variety-fairness.test.ts`: in `soloOf`, add `combos: [],` after `chainChance: 0,`.

- [ ] **Step 6: Run the new and the per-boss tests**

Run: `npx vitest run tests/boss-identity-fights.test.ts tests/ashen-hound.test.ts tests/gale-reaver.test.ts tests/quill-warden.test.ts tests/brass-sentinel.test.ts && npm run typecheck`
Expected: PASS. If something fails, first decide whether the test or the data is wrong:
- A per-boss test that swings at the boss while checking one attack (an arena "wall camper", a one-attack `solo` with a player who hits back) can now trigger the boss's hit reaction or shield. Those tests are about one attack, not about identity: in their local helper add `reaction: undefined, shield: undefined, temper: undefined,` next to the `combos: []` you added, and keep the test's meaning.
- If an identity test in `tests/boss-identity-fights.test.ts` fails on a number only (for example the Hound's slip does not quite pass the player at distance 240), adjust the data (`slip.move.speed`), never weaken the assertion.

- [ ] **Step 7: Run the whole suite and triage**

Run: `npm test`
Expected: PASS. Known places that can shift, and what to do (never raise a ceiling and never delete a test):
- `tests/boss-distinct.test.ts`: the count of "two attacks look the same to the player" must stay at or under `CEILING` (12). If the new attacks push it over, change the new attack's `pose` or `windup` (a `pose` change is a look change only; a `windup` change moves it into another bucket: the key includes `round(windup / 6)`), not the ceiling.
- `tests/ashen-hound.test.ts`, "a player who knows the Hound": the bot dashes at fixed attack times, and a bite that now follows a slip has the same timings, so it should still take zero hits. If it takes a hit right after a slip, the dash is still on cooldown (24 updates): in that case lengthen the Hound's slip `recovery` by a few updates rather than changing the bot.
- `tests/variety-fairness.test.ts`, "a player who sees each hit coming and dashes ... some fight is won" for the Sentinel: the shield blocks the `seer` bot's hits while the Sentinel waits. If it fails only for the Sentinel, change the `seer` bot's swing line to `attackPressed: n % 18 === 0` (it now swings whenever it likes, and the shield decides what lands); this keeps the test's meaning ("a skilled player can win").
- `tests/generate-fairness.test.ts` (`checkFairness(ASHEN_HOUND)`) and the Hound pair tests (`tests/hound-and-sage.test.ts`, `tests/feedback-duo.test.ts`): they read the Hound's attack list. A new attack with no hits (`skitter`) should be treated like the existing `slip`; if a check counts attacks, extend it to the new list.
- Pair fights: temper, reaction and shield are switched off there on purpose, but combos still apply (the Hound's slip then bite). Pair tests that compare exact attack sequences may need the new sequence; check each failure and update the expected values only when the new sequence is what the design says.
- `tests/look-figures.test.ts`, "shows a different pose/shape for each attack": the figure at the last update of the wind-up depends on pose, wind-up length and shots, so two attacks of one boss that share all three fail. If a new attack fails it, change its `pose` or `windup` (a look change), never the test.
- Recorded-fight replays are not stored in the repo, so `GAME_VERSION` is bumped once in Task 15, not here.

- [ ] **Step 8: Commit**

```bash
git add tests/boss-helpers.ts tests/boss-identity-fights.test.ts tests/ashen-hound.test.ts tests/gale-reaver.test.ts tests/quill-warden.test.ts tests/variety-fairness.test.ts src/bosses/ashen-hound.json src/bosses/gale-reaver.json src/bosses/quill-warden.json src/bosses/brass-sentinel.json
git commit -m "feat: Hound, Reaver, Warden and Sentinel get their own identities"
```

(Add any other test file you had to touch in Step 7 to the `git add` line. Do not add any Claude or Co-Authored-By line to the message.)

---

### Task 12: Boss data B: Golem, Brute and Kite

Same method as Task 11: data edits plus tests, no engine code. The three bosses:

- **Cinder Golem**: a new `kiln-crack` leaves burning patches on the floor that stay for about six seconds (you jump over them or walk around them, so the floor slowly becomes a puzzle); its `crag-slam` now waits a random moment before it drops (`hold`); when you hit it, its anger drops; when you leave it alone it turns to the slow, big attacks (`kiln-crack`, `furnace-stomp`).
- **Tremor Brute**: a new `row-quake`, a whole row of eruptions across the arena with two safe gaps; its `hammer-fist` now waits a random moment (`hold`); neglect makes the row more common.
- **Storm Kite**: keeps its dives and swoops exactly as they are, and gains bolts that come in from the side edges: a new `crossfire` (low bolts from the left and right edges, two volleys) and, in phase 2, a `tempest-pass` (a swoop that brings two side bolts with it). Neglect makes the crossfire and the phase 2 attacks more common.

All numbers are first guesses for the owner to feel on the phone. Tests check behaviour ("some blocks leave a way out wherever the player stands", "a patch is still on the floor long after the blast"), never tuned numbers.

**Files:**
- Modify: `tests/boss-identity-fights.test.ts` (imports, `ROSTER`, three new `describe` blocks)
- Modify: `src/bosses/cinder-golem.json`, `src/bosses/tremor-brute.json`, `src/bosses/storm-kite.json`
- Modify: `tests/cinder-golem.test.ts`, `tests/tremor-brute.test.ts`, `tests/storm-kite.test.ts` (attack lists, one bot)

**Interfaces:**
- Consumes (all produced by earlier tasks):
  - `only(base, id)`, `pickShare(boss, ids, temper)`, `standAt(boss, distance)` (the player starts `distance` units to the left of the boss), `attackIds`, `isWindup`, `windupUpdates`, `updatesWith` in `tests/boss-helpers.ts`; `run`, `withInput` in `tests/helpers.ts`.
  - In `tests/boss-identity-fights.test.ts` (Task 11): `ROSTER`, `FULL`, `aboutToHit(boss, side)`, `attack(boss, id)`.
  - `AttackDef.hold?`, `BossState.holdLeft`, `EruptionDef.linger?`, `EruptionState.linger?`, `BoltDef.edge?`, `BossDef.temper?`, `PhaseAttack.heavy?`, `TEMPER` (`params.ts`).
  - `analyzeRun(boss, start, frames)` in `src/stats/analyze.ts`.
- Produces (used by Task 13):
  - The new attacks `kiln-crack` (Golem), `row-quake` (Brute), `crossfire` and `tempest-pass` (Kite).
  - In `tests/boss-identity-fights.test.ts`: `type Bot`, `framesFrom(boss, start, bot, count)`, `strikeDelays(boss, id, seed)` and `expectHeld(boss, id, hold)`, which Task 13 reuses for the Dancer's twin-cut.

- [ ] **Step 1: Write the failing tests**

In `tests/boss-identity-fights.test.ts`, replace the whole import block at the top (the lines from `import { describe, expect, it } from 'vitest';` down to `import { run } from './helpers';`) with:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BRASS_SENTINEL, CINDER_GOLEM, GALE_REAVER, QUILL_WARDEN, STORM_KITE, TREMOR_BRUTE } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { DIALS, NORMAL_DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { PLAYER, TEMPER, WORLD } from '../src/game/params';
import { createInitialState, type BoltState, type EruptionState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { attackIds, isWindup, only, pickShare, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';
```

In the same file, add three lines to the end of the `ROSTER` array (before the closing `];`):

```ts
  ['Cinder Golem', CINDER_GOLEM],
  ['Tremor Brute', TREMOR_BRUTE],
  ['Storm Kite', STORM_KITE],
```

Then append this at the end of the file:

```ts
type Bot = (n: number, prev: GameState) => InputFrame;

/** The inputs a bot would press over `count` updates from `start`, so `analyzeRun` can replay them. */
function framesFrom(boss: BossDef, start: GameState, bot: Bot, count: number): InputFrame[] {
  const frames: InputFrame[] = [];
  let s = start;
  for (let n = 1; n <= count; n++) {
    const frame = bot(n, s);
    frames.push(frame);
    s = step(s, frame, boss);
  }
  return frames;
}

/** For every use of attack `id`: the updates from the start of its wind-up to the update its strike begins. */
function strikeDelays(boss: BossDef, id: string, seed: number, count = 900): number[] {
  const windup = attack(boss, id).windup;
  const s = createInitialState(boss, seed);
  s.player.health = 1e9;
  const states = run(s, count, () => NO_INPUT, boss);
  const starts = windupUpdates(states);
  const strikes = states.flatMap((x, i) =>
    x.boss.mode === 'attack' && x.boss.attackTick === windup && (i === 0 || states[i - 1]!.boss.attackTick !== windup) ? [i + 1] : [],
  );
  return strikes.map((strike, i) => strike - starts[i]!);
}

/** The boss, using only `id`, waits a different extra time before each strike: never less than the wind-up, never more than the hold. */
function expectHeld(boss: BossDef, id: string, hold: number): void {
  expect(attack(boss, id).hold, `${id} has a hold`).toBe(hold);
  const windup = attack(boss, id).windup;
  const waits = [1, 2, 3, 4].flatMap((seed) => strikeDelays(only(boss, id), id, seed));
  expect(waits.length).toBeGreaterThan(8);
  expect(Math.min(...waits)).toBeGreaterThanOrEqual(windup);
  expect(Math.max(...waits)).toBeLessThanOrEqual(windup + hold);
  expect(new Set(waits).size).toBeGreaterThan(3);
}

/** Walks to the nearest spot outside every blast or ember (with a margin) as soon as one is on the floor, and stays out of them. */
const stepOut: Bot = (_n, prev) => {
  const p = prev.player;
  const areas = prev.shots.flatMap((s) => (s.kind === 'eruption' ? [{ left: s.x - s.width / 2 - 40, right: s.x + s.width / 2 + 40 }] : []));
  if (areas.length === 0) return NO_INPUT;
  const inside = (x: number) => areas.some((a) => x > a.left && x < a.right);
  if (!inside(p.x)) return NO_INPUT;
  const spots = areas.flatMap((a) => [a.left, a.right]).filter((x) => x > 30 && x < WORLD.width - 30 && !inside(x));
  if (spots.length === 0) return NO_INPUT;
  const goal = spots.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best));
  return withInput({ moveX: goal > p.x ? 1 : -1 });
};

describe('Cinder Golem: burning patches, a slam that waits, cooled by a hit', () => {
  const kiln = only(CINDER_GOLEM, 'kiln-crack');
  const idle = (count: number) => Array.from({ length: count }, () => NO_INPUT);

  it('a kiln-crack leaves patches that are still on the floor long after the blast', () => {
    const start = createInitialState(kiln, 1);
    start.player.health = 1e9;
    const states = run(start, 190, () => NO_INPUT, kiln);
    const late = states.flatMap((s) => s.shots).find((sh): sh is EruptionState => sh.kind === 'eruption' && sh.age > sh.delay + sh.burst + 100);
    expect(late).toBeDefined();
  });

  it('a player who stands on a patch is hurt again by the embers after the blast', () => {
    const start = standAt(kiln, 640);
    start.player.health = 1e9;
    const states = run(start, 190, () => NO_INPUT, kiln);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThanOrEqual(2);
  });

  it('walking out of the marks avoids the blast and the embers; standing still does not', () => {
    expect(analyzeRun(kiln, standAt(kiln, 640), idle(300)).attacks[0]!.outcome).toBe('hit');
    const frames = framesFrom(kiln, standAt(kiln, 640), stepOut, 300);
    expect(analyzeRun(kiln, standAt(kiln, 640), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('the crag-slam waits a random extra moment before it drops', () => {
    expectHeld(CINDER_GOLEM, 'crag-slam', 12);
  });

  it('a hit on the waiting Golem cools it down by the relief', () => {
    const s = aboutToHit(CINDER_GOLEM);
    s.boss.temper = FULL;
    const after = step(s, NO_INPUT, CINDER_GOLEM);
    expect(after.events).toContain('bossHit');
    expect(after.boss.temper).toBeLessThanOrEqual(FULL - TEMPER.relief);
  });

  it('turns to its slow, big attacks when it has been left alone', () => {
    const big = ['kiln-crack', 'furnace-stomp'];
    expect(pickShare(CINDER_GOLEM, big, FULL)).toBeGreaterThanOrEqual(pickShare(CINDER_GOLEM, big, 0) * 1.3);
  });
});

describe('Tremor Brute: rows across the arena with two ways out, a fist that waits', () => {
  const row = only(TREMOR_BRUTE, 'row-quake');

  it('marks eight blocks, and wherever the player stands there is a spot to reach in time that no block covers', () => {
    for (let px = 30; px <= WORLD.width - 30; px += 20) {
      const start = createInitialState(row, 1);
      start.player.x = px;
      start.player.prevX = px;
      start.player.health = 1e9;
      const states = run(start, 60, () => NO_INPUT, row);
      const born = states.find((s) => s.shots.some((sh) => sh.kind === 'eruption'))!;
      const blocks = born.shots.filter((sh): sh is EruptionState => sh.kind === 'eruption');
      expect(blocks, `player at ${px}`).toHaveLength(8);
      const free = (x: number) => blocks.every((e) => Math.abs(x - e.x) >= e.width / 2 + PLAYER.width / 2);
      let reachable = false;
      for (let x = PLAYER.width / 2; x <= WORLD.width - PLAYER.width / 2 && !reachable; x += 4) {
        reachable = free(x) && Math.abs(x - px) <= 290;
      }
      expect(reachable, `a way out for a player at ${px}`).toBe(true);
    }
  });

  it('the hammer-fist waits a random extra moment before it strikes', () => {
    expectHeld(TREMOR_BRUTE, 'hammer-fist', 10);
  });

  it('turns to the row when it has been left alone', () => {
    expect(pickShare(TREMOR_BRUTE, ['row-quake'], FULL)).toBeGreaterThanOrEqual(pickShare(TREMOR_BRUTE, ['row-quake'], 0) * 1.3);
  });
});

describe('Storm Kite: bolts from the sides, and a swoop that brings some', () => {
  const REST = STORM_KITE.flight!.height;

  /** For every update in which bolts appeared at an arena edge: the update and which way they fly (1 from the left, -1 from the right). */
  const volleys = (states: GameState[]) =>
    states.flatMap((st) => {
      const born = st.shots.filter((sh): sh is BoltState => sh.kind === 'bolt' && sh.x === sh.originX);
      return born.length === 0 ? [] : [{ tick: st.tick, dirs: born.map((b) => b.dir).sort() }];
    });

  it('the crossfire fires a low bolt from each edge, twice, a few updates apart', () => {
    const boss = only(STORM_KITE, 'crossfire');
    const start = createInitialState(boss, 1);
    start.player.health = 1e9;
    const found = volleys(run(start, 100, () => NO_INPUT, boss));
    expect(found).toHaveLength(2);
    for (const v of found) expect(v.dirs).toEqual([-1, 1]);
    expect(found[1]!.tick - found[0]!.tick).toBeGreaterThan(0);
    expect(found[1]!.tick - found[0]!.tick).toBeLessThan(30);
  });

  it('the crossfire hurts a player who stands still and is cleared by jumping as each bolt closes in', () => {
    const boss = only(STORM_KITE, 'crossfire');
    const hopper: Bot = (_n, prev) => {
      const p = prev.player;
      const coming = prev.shots.some((sh) => sh.kind === 'bolt' && sh.lift < 40 && Math.abs(sh.x - p.x) < 150 && (sh.dir === 1 ? sh.x < p.x : sh.x > p.x));
      if (coming && p.onGround) return withInput({ jumpPressed: true, jumpHeld: true });
      return withInput({ jumpHeld: !p.onGround });
    };
    const idle = analyzeRun(boss, standAt(boss, 300), Array.from({ length: 220 }, () => NO_INPUT));
    expect(idle.attacks[0]!.outcome).toBe('hit');
    const frames = framesFrom(boss, standAt(boss, 300), hopper, 220);
    expect(analyzeRun(boss, standAt(boss, 300), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('the tempest-pass dips to the floor like a swoop and fires one bolt from each edge while it does', () => {
    const boss = only(STORM_KITE, 'tempest-pass');
    const start = createInitialState(boss, 1);
    start.player.health = 1e9;
    const states = run(start, 120, () => NO_INPUT, boss);
    expect(states.some((s) => s.boss.lift < REST)).toBe(true);
    expect(volleys(states).map((v) => v.dirs.join())).toEqual(['-1', '1']);
  });

  it('turns to the crossfire when it has been left alone', () => {
    expect(pickShare(STORM_KITE, ['crossfire'], FULL)).toBeGreaterThanOrEqual(pickShare(STORM_KITE, ['crossfire'], 0) * 1.3);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/boss-identity-fights.test.ts`
Expected: FAIL. The roster test and the Task 11 tests still pass. The new Golem, Brute and Kite tests fail (no `kiln-crack`, `row-quake`, `crossfire`, `tempest-pass`, no holds, no temper in the files; `only(..., 'kiln-crack')` throws because the id does not exist in the phase).

- [ ] **Step 3: Edit the three boss files**

Run this one-off script from the repo root. It keeps the 2-space format the files already have, so the diff shows only the new data:

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';

const load = (name) => JSON.parse(fs.readFileSync(`src/bosses/${name}.json`, 'utf8'));
const save = (name, o) => fs.writeFileSync(`src/bosses/${name}.json`, JSON.stringify(o, null, 2) + '\n');
/** New top-level keys go straight after the `after` key so the file stays tidy. */
const insertAfter = (o, after, extra) =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k === after ? [[k, v], ...Object.entries(extra)] : [[k, v]])));
const attack = (o, id) => o.attacks.find((a) => a.id === id);
const inPhase = (phase, id) => phase.attacks.find((a) => a.id === id);

// ---- Cinder Golem ----
let golem = load('cinder-golem');
attack(golem, 'crag-slam').hold = 12;
golem.attacks.push({
  id: 'kiln-crack',
  name: 'Kiln Crack',
  pose: 'crouch',
  class: 'mustDodge',
  windup: 44,
  active: 12,
  recovery: 44,
  range: { min: 0, max: 700 },
  hits: [],
  shots: [0, -230, 230].map((offset) => ({ kind: 'eruption', at: 44, offset, width: 110, delay: 30, burst: 8, linger: 360 })),
});
golem.phases[0].attacks.push({ id: 'kiln-crack', weight: 2, heavy: true });
inPhase(golem.phases[0], 'furnace-stomp').heavy = true;
golem = insertAfter(golem, 'counter', { temper: 0.7 });
save('cinder-golem', golem);

// ---- Tremor Brute ----
let brute = load('tremor-brute');
attack(brute, 'hammer-fist').hold = 10;
// Two blocks in the middle and three each side, leaving a safe gap 130 wide on each side of the player (196 to 326 away).
// Blocks are at most 220 wide so that a block pushed back inside a wall can never cover the far gap.
const rowBlocks = [[-98, 196], [98, 196], [-436, 220], [-656, 220], [-876, 220], [436, 220], [656, 220], [876, 220]];
brute.attacks.push({
  id: 'row-quake',
  name: 'Row Quake',
  pose: 'down',
  class: 'mustDodge',
  windup: 38,
  active: 8,
  recovery: 50,
  range: { min: 0, max: 700 },
  hits: [],
  shots: rowBlocks.map(([offset, width]) => ({ kind: 'eruption', at: 38, offset, width, delay: 42, burst: 8 })),
});
brute.phases[0].attacks.push({ id: 'row-quake', weight: 2, heavy: true });
brute.phases[1].attacks.push({ id: 'row-quake', weight: 3, heavy: true });
brute = insertAfter(brute, 'counter', { temper: 0.6 });
save('tremor-brute', brute);

// ---- Storm Kite ----
let kite = load('storm-kite');
const edgeBolt = (at, edge) => ({ kind: 'bolt', at, height: 0, size: 26, speed: 500, edge });
kite.attacks.push(
  {
    id: 'crossfire',
    name: 'Crossfire',
    pose: 'down',
    class: 'mustDodge',
    windup: 30,
    active: 20,
    recovery: 34,
    range: { min: 0, max: 900 },
    hits: [],
    shots: [edgeBolt(30, 'left'), edgeBolt(30, 'right'), edgeBolt(46, 'left'), edgeBolt(46, 'right')],
  },
  {
    id: 'tempest-pass',
    name: 'Tempest Pass',
    pose: 'back',
    class: 'mustDodge',
    windup: 36,
    active: 46,
    recovery: 30,
    range: { min: 260, max: 480 },
    dive: { from: 36, to: 82, shape: 'swoop', target: 'forward', distance: 800, low: 18 },
    hits: [{ from: 50, to: 68, x0: -30, x1: 90, bottom: 0, top: 100 }],
    shots: [edgeBolt(44, 'right'), edgeBolt(56, 'left')],
  },
);
kite.phases[0].attacks.push({ id: 'crossfire', weight: 2, heavy: true });
kite.phases[1].attacks.push({ id: 'crossfire', weight: 2 }, { id: 'tempest-pass', weight: 2, heavy: true });
inPhase(kite.phases[1], 'long-strafe').heavy = true;
kite = insertAfter(kite, 'counter', { temper: 0.4 });
save('storm-kite', kite);
EOF
git diff --stat src/bosses
```

Expected: three files changed. `npx vitest run tests/boss-identity-fights.test.ts -t "roster still parses"` must pass: a bad value makes the boss file fail to load with a readable message that names the field.

- [ ] **Step 4: Update the older per-boss tests**

1. `tests/cinder-golem.test.ts`:
   - Rename the first test to `'is loaded, has five attacks, no arena and exactly one counterable attack'` and add `'kiln-crack',` after `'furnace-stomp',` in the expected list.
   - Nothing else changes: the new attack has a wind-up of 44 and a recovery of 44, so `'is slow, ...'` still holds.
2. `tests/tremor-brute.test.ts`:
   - In the first test, rename to `'... with seven attacks ...'` and append `'row-quake'` to the expected list.
   - In `describe('each eruption attack has an answer', ...)`, rename the test to `'stepping out of the marks avoids the fissure, both quakes of the twin quake and the row quake'` and change `for (const id of ['fissure', 'twin-quake'])` to `for (const id of ['fissure', 'twin-quake', 'row-quake'])`.
   - In the `knower` bot (`describe('the Brute can be beaten', ...)`), replace the hammer-fist line
     `if (b.mode === 'attack' && b.attackId === 'hammer-fist' && b.attackTick + 1 === 22) return withInput({ dashPressed: true, moveX: away });`
     with
     `if (b.mode === 'attack' && b.attackId === 'hammer-fist' && b.attackTick === 25 && b.holdLeft <= 4) return withInput({ dashPressed: true, moveX: away });`
     (The old line dashed at a fixed count from the start of the wind-up, which is exactly what the hold is there to defeat. The new one dashes a few updates before the strike whenever it comes.)
   - The `solo` helper needs no change: the Brute has no combos.
3. `tests/storm-kite.test.ts`:
   - In `'is loaded and found by id, with four attacks, ...'` rename `four` to `six` and set the expected list to `['plunge', 'swoop', 'bolt-volley', 'long-strafe', 'crossfire', 'tempest-pass']`.
   - The `solo` helper and `IDLE_KITE` need no change.

- [ ] **Step 5: Run the new and the per-boss tests**

Run: `npx vitest run tests/boss-identity-fights.test.ts tests/cinder-golem.test.ts tests/tremor-brute.test.ts tests/storm-kite.test.ts && npm run typecheck`
Expected: PASS. If something fails, decide first whether the test or the data is wrong:
- A failing number in an identity test (for example the crossfire's `hopper` bot is hit, or one Brute row gap is too tight at some `px`) means the data needs a nudge: change the bolt timing or speed (`crossfire`), or the block offsets (`row-quake`), never the assertion. The row must always leave a way out; that is the point of the test.
- A per-boss test that builds a one-attack fight and swings at the boss is about one attack, not about identity: in its local helper add `temper: undefined,` next to the other overrides.

- [ ] **Step 6: Run the whole suite and triage**

Run: `npm test`
Expected: PASS. Known places that can shift, and what to do (never raise a ceiling and never delete a test):
- `tests/boss-distinct.test.ts`: the new attacks have their own kind mix (`eruption` on Golem and Brute, `lowBolt` from the edges on the Kite), so "no special kind on more than three bosses" still holds (eruption is on two bosses, `lowBolt` is on the same three as before). If the count of near-copies goes over `CEILING` (12) or "two attacks look the same to the player" fails, change the new attack's `pose` (a look change only) or `windup`, not the ceiling.
- `tests/variety-fairness.test.ts`, "a player who sees each hit coming and dashes ... some fight is won": the seer bot looks ahead by really stepping the game, so holds and side bolts are seen. If the Golem fails, the likely cause is repeated ember hits while the seer stands still: shorten `linger` in `kiln-crack` (360 to 240) rather than changing the bot.
- `tests/storm-kite.test.ts`, "a player who knows its dives wins some fights at Normal, barely touched": if it takes more than 2 damage, the cause is the new side bolts. First make its bolt reaction wider: change `Math.abs(sh.x - p.x) < 130` to `Math.abs(sh.x - p.x) < 170` in the `near` line. If it still fails, lower the Kite's `temper` in the JSON from 0.4 to 0.25 (neglect matters less to a boss that is rarely hittable).
- `tests/tremor-brute.test.ts`, "a player who knows its attacks wins some fights ... barely touched": the knower now waits for the end of the hold (edit in Step 4). If it still fails, check that `holdLeft` is what the bot reads, not `attackTick + 1`.
- `tests/generate-fairness.test.ts` and the pair tests do not use these three bosses by hand; nothing to change unless they list every attack of a roster boss, in which case add the new ids.
- `tests/look-figures.test.ts`, "shows a different pose/shape for each attack": the figure at the last update of the wind-up depends on pose, wind-up length and shots, so two attacks of one boss that share all three fail. If a new attack fails it, change its `pose` or `windup` (a look change), never the test.
- Recorded-fight replays are not stored in the repo, so `GAME_VERSION` is bumped once in Task 15, not here.

- [ ] **Step 7: Commit**

```bash
git add tests/boss-identity-fights.test.ts tests/cinder-golem.test.ts tests/tremor-brute.test.ts tests/storm-kite.test.ts src/bosses/cinder-golem.json src/bosses/tremor-brute.json src/bosses/storm-kite.json
git commit -m "feat: Golem, Brute and Kite get their own identities"
```

(Add any other test file you had to touch in Step 6 to the `git add` line. Do not add any Claude or Co-Authored-By line to the message.)

---

### Task 13: Boss data C: Veil Dancer and Vesper Sage

Same method as Tasks 11 and 12: data edits plus tests, plus one small edit to the distinctness guard so it knows about blinks. No engine code.

- **Veil Dancer** (question: "where will it be next?"): a new `shadow-cut` (it vanishes, appears just behind you and cuts; the hit box starts 10 updates after it lands, so it can be read and dashed), and a new `blink-away` (it vanishes and appears far away, a pure reposition that never hurts). Its fixed combination is `blink-away` then `shadow-cut`: it disappears to one side and comes back behind you at once. When you leave it alone it turns to the shadow cut. (The spec's "fan of needles that spread out" is not built: the bolt format has no spread, so the fan stays aimed. It is listed as later work in Task 14.)
- **Vesper Sage** (question: "can you weave through a pattern of shots?"): fixed patterns of shots with no gap (`single-bolt` then `lob`; `triple-volley` then `single-bolt`; in phase 2 `lob`, `single-bolt`, `triple-volley` and `triple-volley`, `lob-and-low`), it keeps farther away in phase 2, and when you hit it, it blinks away with a new `float-away`. `float-away` sits in `attacks` but in no phase list: only a hit on the Sage starts it. Neglect makes the long patterns (`triple-volley`, `lob-and-low`) more common.

All numbers are first guesses. Tests check behaviour ("it stands behind the player after the blink", "a dash timed to the strike avoids the cut"), never tuned numbers.

**Files:**
- Modify: `tests/boss-identity-fights.test.ts` (imports, `ROSTER`, two new `describe` blocks)
- Modify: `tests/boss-distinct.test.ts` (`kinds` learns `'blink'`)
- Modify: `src/bosses/veil-dancer.json`, `src/bosses/vesper-sage.json`
- Modify: `tests/veil-dancer.test.ts`, `tests/vesper-sage.test.ts`, `tests/variety-fairness.test.ts`

**Interfaces:**
- Consumes (all produced by earlier tasks):
  - `AttackDef.blink { from, to, target: 'player' | 'forward' | 'back', distance? }`, `bossHidden(b: BossState, boss: BossDef): boolean` (`src/game/geometry.ts`), `PhaseDef.combos`, `PhaseDef.spacing`, `BossDef.reaction`, `BossDef.temper`, `PhaseAttack.heavy`, `attackLength(attack)` (`src/game/boss.ts`).
  - `only(base, id)`, `pickShare(boss, ids, temper)`, `standAt(boss, distance)` (the player starts `distance` units to the left of the boss), `attackIds`, `windupUpdates`, `updatesWith` in `tests/boss-helpers.ts`; `run`, `withInput` in `tests/helpers.ts`.
  - In `tests/boss-identity-fights.test.ts` (Tasks 11 and 12): `ROSTER`, `FULL`, `aboutToHit(boss, side)`, `attack(boss, id)`, `type Bot`, `framesFrom(boss, start, bot, count)`.
- Produces (used by Tasks 14 and 15):
  - The new attacks `shadow-cut` and `blink-away` (Dancer), `float-away` (Sage).
  - `kinds()` in `tests/boss-distinct.test.ts` returns `'blink'` for an attack with a `blink`.

- [ ] **Step 1: Write the failing tests**

In `tests/boss-identity-fights.test.ts`, replace the whole import block at the top (the lines from `import { describe, expect, it } from 'vitest';` down to `import { run, withInput } from './helpers';`) with:

```ts
import { describe, expect, it } from 'vitest';
import {
  ASHEN_HOUND,
  BRASS_SENTINEL,
  CINDER_GOLEM,
  GALE_REAVER,
  QUILL_WARDEN,
  STORM_KITE,
  TREMOR_BRUTE,
  VEIL_DANCER,
  VESPER_SAGE,
} from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { DIALS, NORMAL_DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { bossHidden } from '../src/game/geometry';
import { PLAYER, TEMPER, WORLD } from '../src/game/params';
import { createInitialState, type BoltState, type EruptionState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { attackIds, isWindup, only, pickShare, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';
```

In the same file, add two lines to the end of the `ROSTER` array (before the closing `];`):

```ts
  ['Veil Dancer', VEIL_DANCER],
  ['Vesper Sage', VESPER_SAGE],
```

Then append this at the end of the file:

```ts
describe('Veil Dancer: vanishes, comes back behind you, vanishes somewhere else', () => {
  const cut = only(VEIL_DANCER, 'shadow-cut');
  const away = only(VEIL_DANCER, 'blink-away');
  const still = (count: number): InputFrame[] => Array.from({ length: count }, () => NO_INPUT);

  it('a shadow-cut hides the boss, then it stands just behind the player, facing them', () => {
    const start = standAt(cut, 150);
    start.player.health = 1e9;
    const states = run(start, 80, () => NO_INPUT, cut);
    expect(states.filter((s) => bossHidden(s.boss, cut)).length).toBeGreaterThan(8);
    const back = states.find((s, i) => i > 0 && !bossHidden(s.boss, cut) && bossHidden(states[i - 1]!.boss, cut))!;
    expect(back).toBeDefined();
    expect(back.boss.x).toBeLessThan(back.player.x);
    expect(back.player.x - back.boss.x).toBeLessThan(120);
    expect(back.boss.facing).toBe(1);
  });

  it('a player who stands still is cut, and a dash timed to the strike avoids it', () => {
    expect(analyzeRun(cut, standAt(cut, 150), still(200)).attacks[0]!.outcome).toBe('hit');
    const dasher: Bot = (_n, prev) =>
      prev.boss.mode === 'attack' && prev.boss.attackId === 'shadow-cut' && prev.boss.attackTick === 32 ? withInput({ dashPressed: true }) : NO_INPUT;
    const frames = framesFrom(cut, standAt(cut, 150), dasher, 200);
    expect(analyzeRun(cut, standAt(cut, 150), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('a blink-away reappears far from the player and hurts nobody', () => {
    const start = standAt(away, 150);
    start.player.health = 1e9;
    const states = run(start, 60, () => NO_INPUT, away);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    const back = states.find((s, i) => i > 0 && !bossHidden(s.boss, away) && bossHidden(states[i - 1]!.boss, away))!;
    expect(back).toBeDefined();
    expect(Math.abs(back.boss.x - back.player.x)).toBeGreaterThan(350);
  });

  it('a blink-away is followed at once by a shadow-cut, every time', () => {
    const start = standAt(away, 150);
    start.player.health = 1e9;
    const states = run(start, 600, () => NO_INPUT, away);
    expect(attackIds(states).slice(0, 4)).toEqual(['blink-away', 'shadow-cut', 'blink-away', 'shadow-cut']);
    const starts = windupUpdates(states);
    expect(starts[1]! - starts[0]!).toBeLessThanOrEqual(attackLength(attack(away, 'blink-away')) + 2);
  });

  it('turns to the shadow cut when it has been left alone', () => {
    expect(pickShare(VEIL_DANCER, ['shadow-cut'], FULL)).toBeGreaterThanOrEqual(pickShare(VEIL_DANCER, ['shadow-cut'], 0) * 1.3);
  });
});

describe('Vesper Sage: fixed patterns of shots, floats away when hit', () => {
  it('a single-bolt is always followed by a lob', () => {
    const boss = only(VESPER_SAGE, 'single-bolt');
    const start = standAt(boss, 500);
    start.player.health = 1e9;
    const states = run(start, 600, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['single-bolt', 'lob', 'single-bolt', 'lob']);
  });

  it('a triple-volley is always followed by a single-bolt', () => {
    const boss = only(VESPER_SAGE, 'triple-volley');
    const start = standAt(boss, 500);
    start.player.health = 1e9;
    const states = run(start, 700, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['triple-volley', 'single-bolt', 'triple-volley', 'single-bolt']);
  });

  it('phase 2 has its own patterns and keeps farther away', () => {
    expect(VESPER_SAGE.phases[1]!.combos).toHaveLength(2);
    expect(VESPER_SAGE.phases[1]!.spacing!.min).toBeGreaterThan(VESPER_SAGE.spacing.min);
  });

  it('a hit on the waiting Sage makes it blink away, and it does not hurt anyone', () => {
    const states = run(aboutToHit(VESPER_SAGE), 60, () => NO_INPUT, VESPER_SAGE);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.attackId).toBe('float-away');
    expect(states.some((s) => bossHidden(s.boss, VESPER_SAGE))).toBe(true);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    const last = states[59]!;
    expect(Math.abs(last.boss.x - last.player.x)).toBeGreaterThan(350);
  });

  it('turns to its long patterns when it has been left alone', () => {
    const long = ['triple-volley', 'lob-and-low'];
    expect(pickShare(VESPER_SAGE, long, FULL)).toBeGreaterThanOrEqual(pickShare(VESPER_SAGE, long, 0) * 1.3);
  });
});
```

In `tests/boss-distinct.test.ts`, in `kinds`, add one line after the `if (a.leap !== undefined) out.push('leap');` line:

```ts
  if (a.blink !== undefined) out.push('blink');
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run tests/boss-identity-fights.test.ts`
Expected: FAIL. The roster test and the Task 11 and 12 tests still pass. The new Dancer and Sage tests fail (no `shadow-cut`, `blink-away`, `float-away`, no combos or temper in the two files; `only(..., 'shadow-cut')` throws because the id is not in the phase).

- [ ] **Step 3: Edit the two boss files**

Run this one-off script from the repo root:

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';

const load = (name) => JSON.parse(fs.readFileSync(`src/bosses/${name}.json`, 'utf8'));
const save = (name, o) => fs.writeFileSync(`src/bosses/${name}.json`, JSON.stringify(o, null, 2) + '\n');
const insertAfter = (o, after, extra) =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k === after ? [[k, v], ...Object.entries(extra)] : [[k, v]])));
const inPhase = (phase, id) => {
  const entry = phase.attacks.find((a) => a.id === id);
  if (entry === undefined) throw new Error(`${id} is not in phase ${phase.name}`);
  return entry;
};

// ---- Veil Dancer ----
let dancer = load('veil-dancer');
dancer.attacks.push(
  {
    id: 'blink-away',
    name: 'Blink Away',
    pose: 'down',
    class: 'mustDodge',
    windup: 14,
    active: 6,
    recovery: 10,
    range: { min: 0, max: 320 },
    blink: { from: 3, to: 12, target: 'back', distance: 380 },
    hits: [],
  },
  {
    id: 'shadow-cut',
    name: 'Shadow Cut',
    pose: 'raised',
    class: 'mustDodge',
    windup: 34,
    active: 12,
    recovery: 30,
    range: { min: 80, max: 450 },
    blink: { from: 8, to: 24, target: 'player', distance: 70 },
    hits: [{ from: 34, to: 40, x0: -20, x1: 170, bottom: 0, top: 130 }],
  },
);
dancer.phases[0].attacks.push({ id: 'blink-away', weight: 2 }, { id: 'shadow-cut', weight: 2, heavy: true });
dancer.phases[0].combos = [['blink-away', 'shadow-cut']];
dancer = insertAfter(dancer, 'counter', { temper: 0.5 });
save('veil-dancer', dancer);

// ---- Vesper Sage ----
let sage = load('vesper-sage');
sage.attacks.push({
  id: 'float-away',
  name: 'Float Away',
  pose: 'raised',
  class: 'mustDodge',
  windup: 26,
  active: 6,
  recovery: 16,
  range: { min: 0, max: 350 },
  blink: { from: 4, to: 22, target: 'back', distance: 420 },
  hits: [],
});
const [calm, angry] = sage.phases;
for (const id of ['triple-volley', 'lob-and-low']) {
  inPhase(calm, id).heavy = true;
  inPhase(angry, id).heavy = true;
}
calm.combos = [
  ['single-bolt', 'lob'],
  ['triple-volley', 'single-bolt'],
];
angry.combos = [
  ['lob', 'single-bolt', 'triple-volley'],
  ['triple-volley', 'lob-and-low'],
];
angry.spacing = { min: 500, max: 700 };
sage = insertAfter(sage, 'counter', { temper: 0.5, reaction: { attack: 'float-away', cooldown: 300 } });
save('vesper-sage', sage);
EOF
git diff --stat src/bosses
```

Expected: two files changed. `npx vitest run tests/boss-identity-fights.test.ts -t "roster still parses"` must pass. A parse failure names the field: the usual causes are a blink rule (`from < to <= windup + active`, every hit window at or after `to`, blink only on a `mustDodge` attack) or a combo whose first id is not in that phase's list.

- [ ] **Step 4: Update the older tests**

1. `tests/veil-dancer.test.ts`:
   - In the first test rename `'is loaded, has four attacks and no arena'` to `'is loaded, has six attacks and no arena'` and set the expected list to `['piercing-veil', 'veil-slip', 'needle-fan', 'twin-cut', 'blink-away', 'shadow-cut']`.
   - In `solo`, add `reaction: undefined,` and `temper: undefined,` after `...VEIL_DANCER,`, and add `combos: [],` after `chainChance: 0,`.
2. `tests/vesper-sage.test.ts`:
   - Rename `'is loaded and found by id, with five attacks, no arena and two phases'` to `'... with six attacks ...'` and set the expected list to `['single-bolt', 'triple-volley', 'lob', 'point-blank-burst', 'lob-and-low', 'float-away']`.
   - Replace the test `'warns for at least 21 updates and marks every attack with shots as must-dodge'` with:

```ts
  it('warns for at least 21 updates before anything hurts and marks every attack with shots as must-dodge', () => {
    for (const a of VESPER_SAGE.attacks) {
      if (a.hits.length > 0 || (a.shots ?? []).length > 0) expect(a.windup).toBeGreaterThanOrEqual(21);
      if (a.shots !== undefined) expect(a.class).toBe('mustDodge');
    }
  });
```

   - In `solo`, add `reaction: undefined,` and `temper: undefined,` after `...VESPER_SAGE,`, and add `combos: [],` after `chainChance: 0,`.
   - In `describe('the Sage can be beaten', ...)`, in the test that builds `const boss = applyDials(VESPER_SAGE, presetDials('normal'));`, change that line to `const boss: BossDef = { ...applyDials(VESPER_SAGE, presetDials('normal')), reaction: undefined, temper: undefined };` (the bot swings at the boss, and this test is about the shots, not about the Sage's answer to being hit).
3. `tests/variety-fairness.test.ts`:
   - In `soloOf`, make sure the returned object has `reaction: undefined, temper: undefined,` after `...base,` and `combos: []` inside the phase object (Tasks 11 and 12 may already have added them: add only what is missing).
   - In `NEW_ATTACKS`, add `[VEIL_DANCER, 'shadow-cut'],` after `[VEIL_DANCER, 'twin-cut'],`.

- [ ] **Step 5: Run the new and the per-boss tests**

Run: `npx vitest run tests/boss-identity-fights.test.ts tests/boss-distinct.test.ts tests/veil-dancer.test.ts tests/vesper-sage.test.ts tests/variety-fairness.test.ts && npm run typecheck`
Expected: PASS. If something fails, decide first whether the test or the data is wrong:
- A failing number in an identity test (the dash in the shadow-cut test is hit, the blink lands too near, a combo drifts) means the data needs a nudge: the hit window of `shadow-cut` (`from`/`to`, keep both inside `[windup, windup + active]`), the `blink` `from`/`to`/`distance`, never the assertion. Keep `to` of each blink at or below `windup - 1` so the boss is visible when it lands and starts to strike.
- `tests/veil-dancer.test.ts` "an idle player eventually loses" or a bot test fails only if a bot walks into the Dancer while it is hidden or has no answer to `shadow-cut`. Fix the bot, not the boss: in that bot add `if (b.mode === 'attack' && b.attackId === 'shadow-cut' && b.attackTick === 32) return withInput({ dashPressed: true });` before its other rules (`b` is `prev.boss`).
- `still parses and plays at every dial extreme` for the Dancer or Sage failing with a blink error means Task 4's `applyDials` handling does not scale `blink.from` and `blink.to` with the wind-up: fix `applyDials` in `src/game/difficulty.ts` (round the same way `move`, `leap` and `dive` are rounded), and add a case to `tests/difficulty.test.ts`.

- [ ] **Step 6: Run the whole suite and triage**

Run: `npm test`
Expected: PASS. Known places that can shift, and what to do (never raise a ceiling and never delete a test):
- `tests/look-figures.test.ts`, "shows a different pose/shape for each attack" (Sage, Dancer and the roster `describe.each`; also Warden, Reaver, Golem, Kite, Brute and Sentinel from Tasks 11 and 12): the figure at the last update of the wind-up depends on the pose, the wind-up length and the shots. Two attacks of one boss that share all three fail. The new attacks here differ (Dancer: `down` 14, `raised` 34; Sage: `raised` 26 against `triple-volley` `raised` 32 with shots). If any boss still fails, change the new attack's `pose` or `windup` (a look change), never the test.
- `tests/look-attackfx.test.ts`, "are gone when the attack is over": a blink attack has no hit box and no shots. If it fails because the attack has nothing to draw, make the test skip attacks with neither hits, shots, move, leap, dive nor blink.
- `tests/boss-distinct.test.ts`: `'blink'` is on two bosses (limit three). The two blinks that look alike (`blink-away` and `float-away`) differ in pose (`down` and `raised`) and wind-up (14 and 26). If "two attacks look the same to the player" or the near-copy `CEILING` (12) fails, change a `pose` or a `windup`, never the ceiling.
- Pair fights (`tests/hound-and-sage.test.ts`, `tests/difficulty-fight.test.ts`, `tests/look-duo.test.ts`, `tests/render-duo.test.ts`, `tests/sound-cues.test.ts`): the Sage now uses combos in a pair (temper, reaction and shield stay off in a pair). If a test lists the Sage's attacks or expects a fixed order of them, update the expected list; if a pair fight test fails on damage, first check that it does not depend on the Sage's old random order.
- `tests/variety-fairness.test.ts`, "a player who sees each hit coming and dashes ... some fight is won": the seer looks ahead by really stepping the game, so it sees the blink land. If the Dancer or the Sage fails, give the seer bot's boss `reaction: undefined, temper: undefined` (the bot swings at the boss) before changing any data.
- `tests/generate-fairness.test.ts` does not use these bosses by hand.
- Recorded-fight replays are not stored in the repo, so `GAME_VERSION` is bumped once in Task 15, not here.

- [ ] **Step 7: Commit**

```bash
git add tests/boss-identity-fights.test.ts tests/boss-distinct.test.ts tests/veil-dancer.test.ts tests/vesper-sage.test.ts tests/variety-fairness.test.ts src/bosses/veil-dancer.json src/bosses/vesper-sage.json
git commit -m "feat: Dancer and Sage get their own identities"
```

(Add any other test file you had to touch in Step 6 to the `git add` line. Do not add any Claude or Co-Authored-By line to the message.)

---

### Task 14: Documentation

The docs are part of the deliverable (the project rules say a format change must update `docs/bosses.md`, the stats docs must mention a version bump, and every round adds phone-test questions). No code and no tests change in this task, so the check is reading the result and running the suite once.

**Files:**
- Modify: `docs/bosses.md` (new fields in the field tables, new section "3a-septies")
- Modify: `docs/phone-testing.md` (new section after "Boss identity, Round 1")
- Modify: `docs/SPEC.md` (end of section "7. Bosses")
- Modify: `docs/stats.md` (game version note, section 9)

**Interfaces:**
- Consumes: the field names and rules produced by Tasks 1 to 8 and the boss ids produced by Tasks 11 to 13. Use them exactly as written there.
- Produces: nothing for later tasks (Task 15 only bumps the version the docs already name, 0.10.0).

- [ ] **Step 1: Document the new fields in `docs/bosses.md`**

1. In the top-level table ("Top level"), after the last row, add:

```markdown
| `temper` (optional) | How much the boss's anger grows while the player does not hit it, 0 to 1 (0 or absent means it never gets angry). The boss's anger counts up after 240 updates without being hit, reaches its full value 360 updates later, and every hit on the boss takes 180 updates off. An angry boss picks attacks marked `heavy` more often (see the phase table). Off in the study rounds and in pair fights. | number, 0 to 1 |
| `reaction` (optional) | `{ attack, cooldown }`: when the player hits the boss while it is walking (a gap or approach), it answers with this attack at once instead of waiting. `cooldown` is the least number of updates between two answers. Off in the study rounds, in pair fights and on the killing blow. The answering attack is listed in `attacks` but in no phase list, so it is never picked at random. | `attack` an existing id; `cooldown` a whole number, 30 to 1200 |
| `shield` (optional) | `{ turnTicks }`: the boss holds a shield in front of it while it is walking or waiting. A hit from the front is blocked (the boss is not hurt and the hit is used up), a hit from behind, a downward pogo hit and a counter get through. After the boss turns round, the shield stays down for `turnTicks` updates. Off in pair fights. | `turnTicks` a whole number, at least 0 |
```

2. In the "Each attack" table, after the last row, add:

```markdown
| `hold` (optional) | The strike waits a random number of extra updates, 0 up to `hold`, after the wind-up, with the pose held. The number is drawn from the fight's seed, so a replay matches. Only for `mustDodge` attacks without shots and with a `windup` of at least 2. Not drawn during the study rounds. | whole number, 1 to 60 |
| `blink` (optional) | `{ from, to, target, distance? }`: the boss vanishes at update `from` of the attack and reappears at update `to`. `target` is `player` (the boss lands `distance` units behind the player, on the side away from where the boss was), `forward` or `back` (`distance` units in front of or behind the boss, measured from where it was). The landing spot is fixed on the first hidden update and kept inside the arena, and the boss faces the player when it lands. A hidden boss cannot be hit and cannot hurt. Only for `mustDodge` attacks, and not together with `shots`, `leap`, `dive` or `hold`; a `move` may not overlap it. Every hit window must begin at `to` or later. | `from` at least 1, `from < to <= windup + active`; `distance` required for every target |
```

3. In the "Shots" table (two bolt and eruption fields), add these rows at the end of it:

```markdown
| `linger` (eruption only, optional) | After the blast the spot stays as a low fire (40 units high) for `linger` more updates. It hurts a player standing in it, at the same rate as the blast, and a hit does not use it up, so a jump or a step aside is the answer. | whole number, 1 to 900 |
| `edge` (bolt only, optional) | `left` or `right`: the bolt appears at that side of the arena instead of at the boss and flies across it (from the left it goes right, from the right it goes left). Not combined with `dir` or `aim`. | `left` or `right` |
```

4. In the "Each phase" table, after the `retreatSpeed` row, add:

```markdown
| `combos` (optional) | Fixed sequences of 2 to 4 attack ids that run one straight after the other with no gap, in the same order every time. The first id of each combo must be in this phase's `attacks` list and must be different in every combo of the phase; the other ids only need to exist in the top-level `attacks`. When the boss picks a first id it starts the combo. | each id an existing attack |
| `spacing` (optional) | `{ min, max }`: the distance the boss keeps in this phase, in place of the top-level `spacing`. | `min` at least 0, `max` above `min` |
```

And in the "Each attack in `phases[].attacks`" entry (the list of `{ id, weight }` in the row `attacks` above), append this sentence to the `weight` explanation: ``A list entry may also carry `heavy: true`: while the boss is angry (see `temper`) its weight is multiplied by 1 + anger × 2.5.``

- [ ] **Step 2: Add the section for Rounds 2 and 3**

In `docs/bosses.md`, before the line `## 3b. The boss generator`, add:

```markdown
## 3a-septies. Boss identity, Rounds 2 and 3 (game version 0.10.0)

Design and reasoning: `docs/superpowers/specs/2026-09-29-boss-identity-design.md`; the plan is `docs/superpowers/plans/2026-09-29-boss-identity-round-2-plus.md`. Round 2 and 3 added eight small mechanics to the game (the fields above), looks and sounds for them, and used them to finish each boss's identity. All numbers are first guesses, to tune from play. Generated bosses do not use the new fields yet (offering them to the generator is a separate decision).

| Boss | Question | New fields it uses | New attacks |
|---|---|---|---|
| Ashen Hound | Can you react fast and not fall for a fake? | `temper`, `reaction`, a combo (`slip`, `bite`) | `skitter` (its answer to a hit: a quick run past you) |
| Gale Reaver | Can you stay calm under a learnt combination? | `reaction`, two combos, more chaining | `gale-carry` (a rush that carries it across the arena), `gale-recoil` (its answer to a hit: it backs off) |
| Brass Sentinel | Can you counter? | `shield`, `hold` on its late gold strike, `temper` | none (its strikes are longer and redder when ignored) |
| Cinder Golem | Can you manage space as it gets crowded? | `linger`, `hold`, `temper` | `kiln-crack` (three patches that burn for about six seconds) |
| Quill Warden | Can you approach without being punished? | a combo, `reaction`, `temper` | `snap-piercer` (a quick low poke, always followed by the rising swipe) |
| Storm Kite | Do you know where it will land? | `edge`, `temper` | `crossfire` (low bolts from both edges), `tempest-pass` (phase 2: a swoop that brings two side bolts) |
| Tremor Brute | Can you move when the floor is the weapon? | `hold`, `temper` | `row-quake` (eight blocks across the arena with two ways out) |
| Veil Dancer | Where will it be next? | `blink`, a combo (`blink-away`, `shadow-cut`), `temper` | `blink-away`, `shadow-cut` |
| Vesper Sage | Can you weave through a pattern of shots? | `blink`, `combos`, per-phase `spacing`, `reaction`, `temper` | `float-away` (its answer to a hit: it blinks away) |

Not built: a Dancer fan of needles that spread out (the bolt format has no spread), arenas on hand-built bosses, and anything for the generator. The Ember Duelist is unchanged and still pinned by `tests/duelist-golden.test.ts`.

**Rules of thumb for the new fields**
- A combo is not an attack chain: a chain is a random extra pick after an attack (`maxChain`, `chainChance`); a combo is a fixed order named in the file.
- The reaction attack is only ever started by a hit on the boss. Pair fights (the Hound and the Sage together) turn off `temper`, `reaction` and `shield`, but combos and per-phase `spacing` still apply.
- `hold` and `blink` are the two mechanics that make an attack's total length vary or hide the boss; both are covered by the rule that every hit window lies in `[windup, windup + active]`, and the strike is delayed by the hold, not the wind-up.
- A blink's landing spot and a hold's length are decided when the attack starts, from the fight's seed, so a recorded fight replays exactly.
```

The per-boss table must match what Tasks 11 to 13 actually built. Before saving, compare each row against `git diff main --stat -- src/bosses` and the JSON files; correct any attack id or field that differs (the plan's numbers are first guesses, but the ids and fields are what this table promises).

- [ ] **Step 3: Add the phone-testing section**

In `docs/phone-testing.md`, before the line `## Redo after a fight`, add:

```markdown
## Boss identity, Rounds 2 and 3
Every hand-built boss now has one question it asks you, and the game has new mechanics to ask it with (`docs/bosses.md` section 3a-septies). Play each boss for a few fights. Fights are recorded, so the export will show the new attack ids; older exports of these bosses do not line up with them (`docs/stats.md`, game version 0.10.0).

### What to expect
- **Angry bosses.** If you do not hit a boss for about four seconds it starts choosing its heavy attacks more often (the Golem's big slams, the Brute's row of quakes, the Kite's crossfire, the Warden's quick poke, the Dancer's shadow cut, the Sage's long shot patterns). A hit on it calms it down again.
- **Bosses that answer a hit.** The Hound, Reaver, Warden and Sage react when you land a hit while they are walking: a quick run, a back-off, a vault, a blink. This does not happen in a two-boss fight or on the last hit.
- **The Sentinel's shield.** A hit from the front is blocked with a clang. Hit it from behind, with a downward hit from above, or with a counter.
- **Vanishing bosses.** The Dancer and the Sage disappear and come back; while hidden they cannot be hit. Look for the mark on the floor where they will land.
- **Attacks that wait.** The Golem's slam, the Brute's fist and the Sentinel's late strike hold their pose for a different time each time.
- **Fire that stays.** The Golem's kiln crack leaves patches that burn for about six seconds.
- **Bolts from the sides.** The Kite's crossfire comes from the edges of the arena, with two quick pips (panned to the side it comes from) before it does.

### Checklist
- [ ] **Ashen Hound:** does hitting it and seeing it skitter past you feel fair? Is the slip-then-bite combination readable?
- [ ] **Gale Reaver:** are the two fixed combinations learnable after a few fights (wind slash, jab, carry; jab, jab, cyclone)? Can you tell the carry from a normal rush?
- [ ] **Brass Sentinel:** is it clear when a hit is blocked (the clang, the sparks)? Do you find the behind or above hit without thinking about it?
- [ ] **Cinder Golem:** do the burning patches turn the floor into a puzzle without making it unfair? Is six seconds too long or too short?
- [ ] **Quill Warden:** is the quick poke followed by the rising swipe a trap you can read?
- [ ] **Storm Kite:** can you tell from the pips and the picture that bolts are coming from the sides, and jump them?
- [ ] **Tremor Brute:** can you always find the way out of the row of quakes in time?
- [ ] **Veil Dancer:** does the shadow cut leave enough time to dash after it appears behind you? Is the blink away then shadow cut combination a fair surprise?
- [ ] **Vesper Sage:** are the shot patterns learnable? Does it feel right that a hit on it makes it blink away?
- [ ] Does leaving a boss alone (and it getting angry) make the fight feel more dangerous, or just longer?
- [ ] Does anything feel slow or choppy on the phone (the blink shimmer, the fire patches, the shield sparks)?

### Questions
- Which boss now feels most different from the others? Which two still feel alike?
- Is any new attack unfair, or unreadable before it hits? Which one, and why?
- Are the new sounds (clang, blink, side warning) too loud, too quiet, or annoying? Any buzzing?
```

- [ ] **Step 4: Update the spec**

In `docs/SPEC.md`, at the end of the section "7. Bosses" (just before the next `## ` heading), add:

```markdown
**Boss identity (design in `docs/superpowers/specs/2026-09-29-boss-identity-design.md`, plan in `docs/superpowers/plans/2026-09-29-boss-identity-round-2-plus.md`)**
- **LOCKED** (owner, 2026-09-29): every hand-built boss asks the player one question, moves in its own way and has an attack family only it uses; a special kind of attack sits on at most three bosses (guard test `tests/boss-distinct.test.ts`). The Ember Duelist is the fixed reference and does not change.
- **LOCKED** (owner, 2026-09-29): the directions taken from the owner's play: a boss should be less predictable by combining attacks with movement; the flying boss keeps its sky attacks and gains bolts from the sides; the drum boss's frontal guard is a shield that only lets a hit through from behind; some bosses cover a lot of ground; not hitting a boss makes its hard attacks more likely.
- **DELEGATED**: the mechanics that carry it (temper, combos, hold, blink, embers, side bolts, reaction, shield) and all their numbers (documented in `docs/bosses.md`), and the looks and sounds. Reopen after play.
- **OPEN**: whether the generator should offer the new mechanics; a spreading needle fan for the Dancer; arenas for hand-built bosses.
```

- [ ] **Step 5: Update the stats docs**

In `docs/stats.md`, section 9, directly after the line that starts `- **Game version 0.9.0: boss identity, Round 1.**`, add:

```markdown
- **Game version 0.10.0: boss identity, Rounds 2 and 3.** New mechanics changed how the hand-built bosses fight (`docs/bosses.md` section 3a-septies): all bosses except the Ember Duelist gained anger from not being hit (`temper`), several answer a hit (`reaction`), the Sentinel has a shield, and the Golem, Brute, Kite, Dancer and Sage have new attacks. Records made by 0.9.0 or earlier of those bosses no longer replay exactly. New attack ids (`skitter`, `gale-carry`, `gale-recoil`, `snap-piercer`, `kiln-crack`, `row-quake`, `crossfire`, `tempest-pass`, `blink-away`, `shadow-cut`, `float-away`) start fresh in per-attack stats. The Ember Duelist and generated bosses are unaffected. Schema stays 6.
```

Check that the ids in this note match the ids in Tasks 11 to 13 (in particular the Hound's and Sentinel's new attacks); correct the note if a task used a different id.

- [ ] **Step 6: Check and commit**

Run: `npm test` and `npm run typecheck`
Expected: PASS (only docs changed).

```bash
git add docs/bosses.md docs/phone-testing.md docs/SPEC.md docs/stats.md
git commit -m "docs: boss identity rounds 2 and 3 (fields, per-boss table, phone test, spec, stats)"
```

(Do not add any Claude or Co-Authored-By line to the message.)

---

### Task 15: Release: game version, ceiling and final checks

`GAME_VERSION` changes here, once, because Tasks 1 to 13 changed the game numbers and the boss files. Looks and sounds (Tasks 9 and 10) do not need it, but the version tells old recordings apart from new ones.

**Files:**
- Modify: `src/stats/record.ts` (`GAME_VERSION`)
- Modify: `tests/boss-distinct.test.ts` (`CEILING`, only downward)
- Test: all of it

**Interfaces:**
- Consumes: everything from Tasks 1 to 14.
- Produces: `GAME_VERSION = '0.10.0'`; a ceiling that matches the measured number of near-copies.

- [ ] **Step 1: See what a version check expects**

Run: `grep -rn "0\.9\.0" src tests docs | grep -v "docs/superpowers"`
Expected: the definition in `src/stats/record.ts`, the doc notes already written for 0.9.0, and possibly a test that pins the version. Note every test that mentions `0.9.0` as the current version.

- [ ] **Step 2: Bump the version**

In `src/stats/record.ts` change `export const GAME_VERSION = '0.9.0';` to `export const GAME_VERSION = '0.10.0';`. In any test found in Step 1 that pins the current version, change `0.9.0` to `0.10.0` (leave tests that use `0.9.0` as an example of an old version).

- [ ] **Step 3: Measure the near-copies and lower the ceiling**

Run: `npx vitest run tests/boss-distinct.test.ts`
Expected: PASS. The third test lists near-copies when it fails, so to measure the count temporarily set `const CEILING = 0;`, run the file, and read the number from the failure message (`expected N to be less than or equal to 0`). Then set `CEILING` to that number N (never above 12, and lower than 12 if the roster now has fewer) and update the comment above it to say `after Rounds 2 and 3`. If N is above 12, do not raise the ceiling: change a `pose` or `windup` of one of the listed near-copy attacks in its boss file until N is 12 or lower, and re-run that boss's tests.

- [ ] **Step 4: Run every check the project has**

Run, one after the other:

```bash
npm test
npm run typecheck
npm run build
npm run check:dist
npm run audit:deps
```

Expected: all pass. `npm run check:dist` confirms no inline script or style and that every file is in the service worker's precache list. Nothing was added to the dependencies (no `package.json` change), so `audit:deps` is unchanged.

If a statistical test fails (a bot "wins some fights" test, a fairness test that plays whole fights), do not weaken it: the numbers are first guesses. Find which boss it is, and lower its `temper`, lengthen a wind-up, or shorten a `linger` in that boss's file. Note the change in the commit message.

- [ ] **Step 5: Look at the fights once in a browser (no automated test can do this)**

Run: `npm run dev`, open http://localhost:5173, and play one fight each against the Sentinel (a blocked hit), the Golem (a kiln crack), the Kite (a crossfire), the Dancer (a shadow cut) and the Sage (a hit that makes it blink). Check that the effects draw, nothing flickers, and there is no console error. If the browser cannot be used here, say so in the hand-off instead of saying it works.

- [ ] **Step 6: Commit**

```bash
git add src/stats/record.ts tests/boss-distinct.test.ts
git commit -m "chore: game version 0.10.0 and a tighter near-copy ceiling for boss identity rounds 2 and 3"
```

(Add any test file changed in Step 2 to the `git add` line. Do not add any Claude or Co-Authored-By line to the message. Do not push: the owner plays on the phone first, and pushing is their call.)

- [ ] **Step 7: Hand off**

Report to the owner, in plain words: what changed per boss (the table in `docs/bosses.md` section 3a-septies), that the numbers are first guesses, the phone-test checklist in `docs/phone-testing.md`, anything found in Step 4 or 5, and that nothing has been pushed.

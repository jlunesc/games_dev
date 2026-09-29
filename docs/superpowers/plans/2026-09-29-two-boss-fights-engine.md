# Two Bosses in One Fight: Engine Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game engine able to run a fight with two bosses (a primary and one partner) under a "one boss attacks at a time" turn rule, with a nearest-boss sword, separate health, an enraged survivor and a win when both are beaten, while every one-boss fight, stored replay and the Ember Duelist golden test stay exactly as they are.

**Architecture:** `GameState.boss` stays the primary boss; new `GameState.partners: BossState[]` holds the others (empty in a normal fight), so the ~385 test references and every `{...s, boss: {...}}` spread keep working. Per-boss functions in `boss.ts` and `shots.ts` gain a trailing `index = 0` parameter (0 is the primary) and the step accepts `BossDef | FightDef`. A boss asks for permission at its commit moments (end of its wait, opening after a phase change); the permission comes from a pure function in `src/game/turns.ts`. Nothing here adds a pair file, a menu entry, stats, or screen changes: those are Plan 2.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-two-boss-fights-design.md` (read it first; this plan implements its "Engine approach", "Order of work" steps 1 and 2 minus the pair file).

## Global Constraints

- TypeScript strict; `npm run typecheck` includes `tests/` and must stay clean (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`: use `import type` for types).
- A fight with one boss must behave bit-identically to today: same random draws in the same order, same state fields, same numbers. `tests/duelist-golden.test.ts` and every existing test must pass **unedited**.
- Do not bump `GAME_VERSION` (`src/stats/record.ts`) and do not touch the stats schema: nothing here changes a single-boss replay. If the golden test or any replay test fails, the refactor is wrong; fix the code, never the test.
- The game loop is a fixed timestep; `step` stays pure (it clones the state and never touches the one it is given).
- A blocked boss must not draw random numbers. The number and order of draws for a one-boss fight must not change.
- No third-party code, no new dependencies, CSP untouched (engine work only, no DOM).
- Default to no comments; one short line where the reason is not obvious.
- Git: commit steps below apply only once the owner has approved executing this plan. Never add a `Co-Authored-By` line or any Claude/Anthropic attribution to a commit message (the owner's global rule, overriding any default).
- Do not push. Do not edit `docs/SPEC.md` in this plan (the spec entry is added when Plan 2 ships something the owner can see).

## File Structure

- Create `src/game/fight.ts`: `EnrageDef`, `FightDef`, `enrageBoss`, `makeFight`, `asFight`. Types and pure builders only, no game state.
- Create `src/game/turns.ts`: `holdsTurn`, `isEnraged`, `bossDefFor`, `pickCommitter`. The turn rule and which numbers a boss uses.
- Modify `src/game/state.ts`: `partners`, shot `owner`, event `'bossDown'`, helpers `bossAt`, `bossCount`, `allBosses`, `isDowned`, and `createInitialState` accepting a fight.
- Modify `src/game/boss.ts`: index and `mayCommit` threading, `updateBosses`.
- Modify `src/game/shots.ts`: index threading and shot `owner`.
- Modify `src/game/step.ts`: fight-aware step, counter, sword, hits, downing, victory.
- Create tests: `tests/fight.test.ts`, `tests/duo-helpers.ts`, `tests/two-boss-update.test.ts`, `tests/two-boss-turns.test.ts`, `tests/two-boss-fight.test.ts`.

Task order: 1 (fight file and state) → 2 (per-boss functions) → **checkpoint with the owner** → 3 (turn rule) → 4 (sword, downing, enrage, victory).

---

### Task 1: Fight definition and state fields

**Files:**
- Create: `src/game/fight.ts`
- Modify: `src/game/state.ts`
- Test: `tests/fight.test.ts`

**Interfaces:**
- Consumes: `BossDef` from `src/bosses/schema.ts`.
- Produces (later tasks rely on these exact names):
  - `interface EnrageDef { gapScale: number; walkScale: number }`
  - `interface FightDef { bosses: readonly BossDef[]; enrage: EnrageDef | null; enraged: readonly BossDef[] }` (index 0 is the primary boss; `enraged[i]` is the boosted copy of `bosses[i]`, the same object when `enrage` is null)
  - `enrageBoss(boss: BossDef, enrage: EnrageDef): BossDef`
  - `makeFight(bosses: readonly BossDef[], enrage?: EnrageDef | null): FightDef`
  - `asFight(source: BossDef | FightDef): FightDef`
  - In `state.ts`: `GameState.partners: BossState[]`, `ShotBase.owner?: number`, event `'bossDown'`, `bossAt(s, index): BossState`, `bossCount(s): number`, `allBosses(s): BossState[]`, `isDowned(s, index): boolean`, and `createInitialState(source: BossDef | FightDef, seed?, studyRounds?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/fight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import { asFight, enrageBoss, makeFight } from '../src/game/fight';
import { allBosses, bossAt, bossCount, createInitialState, isDowned } from '../src/game/state';
import { DUELIST } from './helpers';

describe('enrageBoss', () => {
  it('shortens every wait and speeds up walking, and leaves the original alone', () => {
    const before = JSON.stringify(DUELIST);
    const angry = enrageBoss(DUELIST, { gapScale: 0.5, walkScale: 2 });
    DUELIST.phases.forEach((phase, i) => {
      const boosted = angry.phases[i]!;
      expect(boosted.gap).toBe(Math.max(1, Math.round(phase.gap * 0.5)));
      expect(boosted.walkSpeed).toBe(phase.walkSpeed * 2);
      expect(boosted.retreatSpeed).toBe(phase.retreatSpeed * 2);
      expect(boosted.attacks).toEqual(phase.attacks);
    });
    expect(JSON.stringify(DUELIST)).toBe(before);
  });

  it('never makes a wait shorter than one update', () => {
    const angry = enrageBoss(DUELIST, { gapScale: 0.0001, walkScale: 1 });
    for (const phase of angry.phases) expect(phase.gap).toBe(1);
  });
});

describe('makeFight and asFight', () => {
  it('needs at least one boss', () => {
    expect(() => makeFight([])).toThrow();
  });

  it('keeps the enraged copies equal to the originals when there is no enrage', () => {
    const fight = makeFight([DUELIST, ASHEN_HOUND]);
    expect(fight.enrage).toBeNull();
    expect(fight.enraged[0]).toBe(DUELIST);
    expect(fight.enraged[1]).toBe(ASHEN_HOUND);
  });

  it('builds a boosted copy per boss when there is an enrage', () => {
    const fight = makeFight([DUELIST, ASHEN_HOUND], { gapScale: 0.5, walkScale: 1.5 });
    expect(fight.enraged[1]!.phases[0]!.walkSpeed).toBe(ASHEN_HOUND.phases[0]!.walkSpeed * 1.5);
  });

  it('wraps a plain boss as a fight of one and passes a fight through', () => {
    const solo = asFight(DUELIST);
    expect(solo.bosses).toEqual([DUELIST]);
    expect(solo.enrage).toBeNull();
    const fight = makeFight([DUELIST, ASHEN_HOUND]);
    expect(asFight(fight)).toBe(fight);
  });
});

describe('the state of a fight', () => {
  it('has no partners in a one-boss fight', () => {
    const s = createInitialState(DUELIST, 3);
    expect(s.partners).toEqual([]);
    expect(bossCount(s)).toBe(1);
    expect(allBosses(s)).toEqual([s.boss]);
    expect(isDowned(s, 0)).toBe(false);
  });

  it('starts the partner where its own file says, at full health', () => {
    const s = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3);
    expect(bossCount(s)).toBe(2);
    expect(s.boss.x).toBe(DUELIST.startX);
    expect(s.boss.hp).toBe(DUELIST.maxHp);
    const partner = bossAt(s, 1);
    expect(partner).toBe(s.partners[0]);
    expect(partner.x).toBe(ASHEN_HOUND.startX);
    expect(partner.hp).toBe(ASHEN_HOUND.maxHp);
    expect(partner.mode).toBe('gap');
    expect(() => bossAt(s, 2)).toThrow();
  });

  it('skips the study in a fight with partners', () => {
    const s = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3, 2);
    expect(s.study.active).toBe(false);
    expect(s.study.queue).toEqual([]);
  });

  it('still plans the study in a one-boss fight', () => {
    const s = createInitialState(DUELIST, 3, 1);
    expect(s.study.active).toBe(true);
  });

  it('only calls a boss downed when it has partners', () => {
    const solo = createInitialState(DUELIST, 3);
    solo.boss.hp = 0;
    expect(isDowned(solo, 0)).toBe(false);
    const duo = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3);
    duo.partners[0]!.hp = 0;
    expect(isDowned(duo, 1)).toBe(true);
    expect(isDowned(duo, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/fight.test.ts`
Expected: FAIL (cannot resolve `../src/game/fight`).

- [ ] **Step 3: Create `src/game/fight.ts`**

```ts
import type { BossDef } from '../bosses/schema';

/** How much angrier the survivor gets when its partner falls: its waits are multiplied by `gapScale` (below 1 is shorter), its walking speed by `walkScale`. */
export interface EnrageDef {
  gapScale: number;
  walkScale: number;
}

/** Who fights: index 0 is the primary boss (the one `GameState.boss` holds), the rest are its partners. */
export interface FightDef {
  bosses: readonly BossDef[];
  enrage: EnrageDef | null;
  /** `enraged[i]` is the boosted copy of `bosses[i]` the boss uses once a partner is down; the same object when there is no enrage. */
  enraged: readonly BossDef[];
}

/** A copy of the boss with shorter waits and faster walking. The boss file itself is not changed. */
export function enrageBoss(boss: BossDef, enrage: EnrageDef): BossDef {
  return {
    ...boss,
    phases: boss.phases.map((phase) => ({
      ...phase,
      gap: Math.max(1, Math.round(phase.gap * enrage.gapScale)),
      walkSpeed: phase.walkSpeed * enrage.walkScale,
      retreatSpeed: phase.retreatSpeed * enrage.walkScale,
    })),
  };
}

export function makeFight(bosses: readonly BossDef[], enrage: EnrageDef | null = null): FightDef {
  if (bosses.length === 0) throw new Error('A fight needs at least one boss');
  return {
    bosses,
    enrage,
    enraged: enrage === null ? bosses : bosses.map((boss) => enrageBoss(boss, enrage)),
  };
}

/** A plain boss is a fight of one; a fight is left as it is. */
export function asFight(source: BossDef | FightDef): FightDef {
  return 'bosses' in source ? source : { bosses: [source], enrage: null, enraged: [source] };
}
```

- [ ] **Step 4: Edit `src/game/state.ts`**

4a. Replace the import block at the top:

```ts
import type { BossDef } from '../bosses/schema';
import { asFight, type FightDef } from './fight';
import { PLAYER, WORLD } from './params';
import { nextRandom } from './rng';
```

4b. In `interface ShotBase`, add after `lift: number;`:

```ts
  /** Which boss fired it: an index into the fight's bosses. Absent means the primary boss, so a one-boss fight's shots are unchanged. */
  owner?: number;
```

4c. In `type GameEvent`, add `| 'bossDown'` after `| 'bossDefeated'`:

```ts
  | 'bossDefeated'
  | 'bossDown'
  | 'playerDefeated'
```

4d. In `interface GameState`, replace `boss: BossState;` with:

```ts
  /** The primary boss (index 0). */
  boss: BossState;
  /** The other bosses of a fight with more than one (index 1 and up); empty in a normal fight. */
  partners: BossState[];
```

4e. Replace everything from `export function createInitialState` to the end of the file with:

```ts
/** The boss with this index: 0 is `boss`, 1 and up are `partners`. */
export function bossAt(s: GameState, index: number): BossState {
  const found = index === 0 ? s.boss : s.partners[index - 1];
  if (found === undefined) throw new Error(`The fight has no boss ${index}`);
  return found;
}

export const bossCount = (s: GameState): number => 1 + s.partners.length;

export const allBosses = (s: GameState): BossState[] => [s.boss, ...s.partners];

/**
 * A boss of a fight with partners that has been beaten. A lone boss at 0 health ends the fight at once, so in a
 * one-boss fight no boss is ever downed.
 */
export const isDowned = (s: GameState, index: number): boolean =>
  s.partners.length > 0 && bossAt(s, index).hp <= 0;

function initialBoss(boss: BossDef): BossState {
  return {
    x: boss.startX,
    lift: boss.flight?.height ?? 0,
    leapFromX: null,
    leapToX: null,
    diveFromLift: null,
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
  };
}

export function createInitialState(source: BossDef | FightDef, seed = 1, studyRounds = 0): GameState {
  const fight = asFight(source);
  const boss = fight.bosses[0]!;
  const start = seed >>> 0;
  // The study demonstrates one boss's attacks; a fight with partners has none until it is built for them.
  const rounds = fight.bosses.length > 1 ? 0 : Math.min(2, Math.floor(Math.max(0, studyRounds)));
  const study = rounds > 0 ? planStudy(boss, start, rounds) : { queue: [], rng: start };
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
      attackAim: 'forward',
      dashTick: -1,
      dashDir: 1,
      dashCooldown: 0,
      buffer: { jump: 0, attack: 0, dash: 0 },
    },
    boss: initialBoss(boss),
    partners: fight.bosses.slice(1).map(initialBoss),
    events: [],
    rng: study.rng,
    seed: start,
    study: { active: study.queue.length > 0, queue: study.queue, endTick: 0 },
    shots: [],
    shotHits: [],
  };
}
```

- [ ] **Step 5: Run the new test and the whole suite**

Run: `npx vitest run tests/fight.test.ts`
Expected: PASS.

Run: `npm test && npm run typecheck`
Expected: everything passes, no edits to existing tests needed (they all spread `boss`, and no test builds a `GameState` literal without a spread).

- [ ] **Step 6: Commit**

```bash
git add src/game/fight.ts src/game/state.ts tests/fight.test.ts
git commit -m "feat: add the fight definition and partner bosses to the game state (one-boss fights unchanged)"
```

---

### Task 2: Per-boss functions in boss.ts and shots.ts

A pure refactor: every function that reads `s.boss` learns which boss it works on, defaulting to the primary. `step.ts` is **not** touched in this task, so one-boss behaviour cannot change.

**Files:**
- Modify: `src/game/boss.ts`
- Modify: `src/game/shots.ts`
- Create: `tests/duo-helpers.ts`
- Test: `tests/two-boss-update.test.ts`

**Interfaces:**
- Consumes: `bossAt` from Task 1.
- Produces:
  - `updateBoss(s: GameState, boss: BossDef, index = 0, mayCommit = true): void`
  - `beginTransition(s: GameState, boss: BossDef, index = 0): void` (now clears only the shots that boss owns)
  - `spawnShots(s: GameState, boss: BossDef, attack: AttackDef, index = 0): void` (shots of a partner carry `owner: index`; the primary's carry no `owner` key)
  - `attackById`, `attackLength`, `landBoss` unchanged.
  - Test helpers in `tests/duo-helpers.ts`: `unit(gap, startX, maxHp?, height?)`, `dummy(startX, maxHp?)`, `pair(a, b, enrage?)`.

- [ ] **Step 1: Create the test helpers**

Create `tests/duo-helpers.ts`:

```ts
import type { BossDef } from '../src/bosses/schema';
import { makeFight, type EnrageDef, type FightDef } from '../src/game/fight';
import { bolt, shooter } from './shot-helpers';

/**
 * A boss that fires one bolt per attack, waits `gap` updates between attacks and never walks. The bolt flies at
 * `height` above the floor (the default is over the player's head), so the player is never hurt.
 */
export function unit(gap: number, startX: number, maxHp = 30, height = 400): BossDef {
  const base = shooter([bolt({ height })]);
  return { ...base, startX, maxHp, phases: [{ ...base.phases[0]!, gap }] };
}

/** A target that stands still and never attacks. */
export function dummy(startX: number, maxHp = 30): BossDef {
  const base = unit(1, startX, maxHp);
  return { ...base, phases: base.phases.map((phase) => ({ ...phase, attacks: [] })) };
}

export const pair = (a: BossDef, b: BossDef, enrage: EnrageDef | null = null): FightDef =>
  makeFight([a, b], enrage);
```

- [ ] **Step 2: Write the failing test**

Create `tests/two-boss-update.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { beginTransition, updateBoss } from '../src/game/boss';
import { createInitialState } from '../src/game/state';
import { dummy, pair, unit } from './duo-helpers';

describe('updateBoss with an index', () => {
  it('moves only the boss it is asked about', () => {
    const b = unit(5, 1100);
    const s = createInitialState(pair(unit(5, 960), b));
    for (let i = 0; i < 5; i++) {
      s.tick += 1;
      updateBoss(s, b, 1);
    }
    expect(s.partners[0]!.mode).toBe('approach');
    expect(s.boss.mode).toBe('gap');
    expect(s.boss.modeTick).toBe(0);
  });

  it('waits and draws no random numbers while it may not commit, then commits when it may', () => {
    const b = unit(5, 1100);
    const s = createInitialState(pair(unit(5, 960), b));
    const before = s.rng;
    for (let i = 0; i < 9; i++) {
      s.tick += 1;
      updateBoss(s, b, 1, false);
    }
    expect(s.partners[0]!.mode).toBe('gap');
    expect(s.rng).toBe(before);
    s.tick += 1;
    updateBoss(s, b, 1, true);
    expect(s.partners[0]!.mode).toBe('approach');
    expect(s.rng).not.toBe(before);
  });

  it('marks the shots of a partner with its index and leaves the primary shots unmarked', () => {
    const a = unit(5, 960);
    const b = unit(5, 1100);
    const s = createInitialState(pair(a, b));
    for (let i = 0; i < 100 && s.shots.length === 0; i++) {
      s.tick += 1;
      updateBoss(s, b, 1);
    }
    expect(s.shots[0]!.owner).toBe(1);

    const t = createInitialState(pair(a, b));
    for (let i = 0; i < 100 && t.shots.length === 0; i++) {
      t.tick += 1;
      updateBoss(t, a, 0);
    }
    expect(t.shots.length).toBeGreaterThan(0);
    expect('owner' in t.shots[0]!).toBe(false);
  });

  it('a phase change of one boss clears only its own shots', () => {
    const a = unit(5, 960);
    const b = unit(5, 1100);
    const s = createInitialState(pair(a, b));
    s.shots.push(
      { kind: 'bolt', attackId: 'shoot', originTick: 0, x: 500, lift: 400, dir: -1, originX: 500, size: 30, speed: 600, climb: 0 },
      { kind: 'bolt', attackId: 'shoot', originTick: 0, x: 600, lift: 400, dir: -1, originX: 600, size: 30, speed: 600, climb: 0, owner: 1 },
    );
    beginTransition(s, b, 1);
    expect(s.shots.map((shot) => shot.owner)).toEqual([undefined]);
  });
});

describe('a dummy partner', () => {
  it('never leaves its wait', () => {
    const d = dummy(1100);
    const s = createInitialState(pair(unit(5, 960), d));
    for (let i = 0; i < 50; i++) {
      s.tick += 1;
      updateBoss(s, d, 1);
    }
    expect(s.partners[0]!.mode).toBe('gap');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/two-boss-update.test.ts`
Expected: FAIL (the extra parameters are not accepted / partner does not move).

- [ ] **Step 4: Edit `src/game/shots.ts`**

4a. Replace the import line `import type { GameState, ShotState } from './state';` with:

```ts
import { bossAt, type BossState, type GameState, type ShotState } from './state';
```

4b. Replace the `muzzleX` and `arcLanding` definitions (the first two declarations after the imports) with:

```ts
/** Where a shot leaving the boss towards `dir` starts: at that edge of its body. */
const muzzleX = (b: BossState, boss: BossDef, dir: 1 | -1): number => b.x + dir * (boss.width / 2);

/** The x an arc will land on, fixed at launch and kept inside the arena (the same targeting as a leap). */
function arcLanding(s: GameState, b: BossState, boss: BossDef, shot: Extract<ShotDef, { kind: 'arc' }>): number {
  let x = s.player.x;
  // The parser guarantees `distance` for 'forward' and 'back' (the 0 only satisfies the type).
  if (shot.target === 'forward') x = b.x + b.facing * (shot.distance ?? 0);
  if (shot.target === 'back') x = b.x - b.facing * (shot.distance ?? 0);
  const half = boss.width / 2;
  return Math.min(Math.max(x, half), WORLD.width - half);
}
```

4b'. Replace the whole `spawnShots` function with:

```ts
/** Fires the shots of `attack` that are due on the current attack update. Called by the boss after it advances. */
export function spawnShots(s: GameState, boss: BossDef, attack: AttackDef, index = 0): void {
  const b = bossAt(s, index);
  if (attack.shots === undefined) return;
  const originTick = s.tick - b.attackTick;
  // Only a partner's shots carry an owner, so the shots of a one-boss fight are exactly what they always were.
  const owner = index > 0 ? { owner: index } : {};
  for (const def of attack.shots) {
    if (def.at !== b.attackTick) continue;
    if (def.kind === 'eruption') {
      const half = def.width / 2;
      s.shots.push({
        kind: 'eruption',
        attackId: attack.id,
        originTick,
        x: Math.min(Math.max(s.player.x + def.offset, half), WORLD.width - half),
        lift: 0,
        age: 0,
        width: def.width,
        delay: def.delay,
        burst: def.burst,
        ...owner,
      });
      continue;
    }
    if (def.kind === 'bolt') {
      // Fired from the boss's body: a hovering boss fires from up in the air.
      const lift = def.height + b.lift;
      let dir: 1 | -1 = def.dir === 'back' ? (b.facing === 1 ? -1 : 1) : b.facing;
      let speed = def.speed;
      let climb = 0;
      if (def.aim === true) {
        // A straight line at the player's body as it is now. Square roots are exact in every engine, so a replay agrees.
        const dx = s.player.x - muzzleX(b, boss, b.facing);
        const dy = WORLD.floorY - s.player.y + PLAYER.height / 2 - (lift + def.size / 2);
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1) {
          dir = dx === 0 ? b.facing : dx > 0 ? 1 : -1;
          speed = (def.speed * Math.abs(dx)) / length;
          climb = (def.speed * dy) / length;
        }
      }
      const x = muzzleX(b, boss, dir);
      s.shots.push({
        kind: 'bolt',
        attackId: attack.id,
        originTick,
        x,
        lift,
        dir,
        originX: x,
        size: def.size,
        speed,
        climb,
        ...owner,
      });
    } else {
      const x = muzzleX(b, boss, b.facing);
      const launchLift = boss.height * 0.6 + b.lift;
      s.shots.push({
        kind: 'arc',
        attackId: attack.id,
        originTick,
        x,
        lift: launchLift,
        age: 0,
        flight: def.flight,
        fromX: x,
        toX: arcLanding(s, b, boss, def),
        launchLift,
        peak: def.peak,
        radius: def.radius,
        burst: def.burst,
        ...owner,
      });
    }
  }
}
```

`stoppedByCover` and `moveShots` stay exactly as they are (a fight's arena is the primary boss's).

- [ ] **Step 5: Edit `src/game/boss.ts`**

5a. Replace the last import line `import type { BossState, GameState } from './state';` with:

```ts
import { bossAt, type BossState, type GameState } from './state';
```

5b. `chooseAttack`: change the signature and its first line.

Old:
```ts
function chooseAttack(s: GameState, boss: BossDef, phase: PhaseDef): string | null {
  if (phase.attacks.length === 0) return null;
  const b = s.boss;
```
New:
```ts
function chooseAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): string | null {
  if (phase.attacks.length === 0) return null;
  const b = bossAt(s, index);
```

5c. `startAttack`: old `function startAttack(s: GameState, boss: BossDef, id: string): void {\n  const b = s.boss;` → new:
```ts
function startAttack(s: GameState, boss: BossDef, id: string, index: number): void {
  const b = bossAt(s, index);
```

5d. Replace the whole `updateGap` with (`mayCommit` gates only the moment the boss chooses its attack):

```ts
function updateGap(s: GameState, boss: BossDef, phase: PhaseDef, index: number, mayCommit: boolean): void {
  const b = bossAt(s, index);
  const p = s.player;
  faceTarget(b, p.x);
  const distance = Math.abs(p.x - b.x);
  const toward: 1 | -1 = p.x < b.x ? -1 : 1;
  if (distance > boss.spacing.max) {
    moveBoss(b, boss, toward, phase.walkSpeed);
  } else if (distance < boss.spacing.min) {
    moveBoss(b, boss, toward === 1 ? -1 : 1, phase.retreatSpeed);
  }
  if (b.modeTick >= phase.gap && mayCommit) {
    // During the study the attacks come from the planned queue: no random draws, no chains.
    let id: string | null;
    if (s.study.active) {
      // Everything has been shown but its shots are still in the air: the study is not over yet.
      if (s.study.queue.length === 0 && s.shots.length > 0) return;
      id = s.study.queue.shift() ?? null;
      // Nothing left to show (cannot happen): end the study and let the fight go on as a normal one.
      if (id === null) endStudy(s);
    } else {
      id = chooseAttack(s, boss, phase, index);
    }
    if (id !== null) {
      b.pendingAttackId = id;
      b.chainLeft = s.study.active ? 0 : planChain(s, phase);
      b.mode = 'approach';
      b.modeTick = 0;
    }
  }
}
```

5e. `updateApproach`: signature `function updateApproach(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {`, first line `const b = bossAt(s, index);`, and both `startAttack(s, boss, id);` / `startAttack(s, boss, id);` calls become `startAttack(s, boss, id, index);` (the one inside `if (inRange || ...)` and the one after `if (!moved)`).

5f. `finishAttack`: signature `function finishAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {`, first line `const b = bossAt(s, index);`, and `const id = chooseAttack(s, boss, phase);` becomes `const id = chooseAttack(s, boss, phase, index);`.

5g. `updateAttack`: signature `function updateAttack(s: GameState, boss: BossDef, phase: PhaseDef, index: number): void {`, first line `const b = bossAt(s, index);`, and its four calls become:
```ts
  if (attack.leap !== undefined) updateLeap(s, boss, attack.leap, index);
  if (attack.dive !== undefined) updateDive(s, boss, attack.dive, index);
  spawnShots(s, boss, attack, index);
  if (b.attackTick >= attackLength(attack)) finishAttack(s, boss, phase, index);
```

5h. `leapLanding`: signature becomes `function leapLanding(s: GameState, boss: BossDef, leap: { target: LeapTarget; distance?: number }, index: number): number {` and its `const b = s.boss;` becomes `const b = bossAt(s, index);`.

5i. `updateLeap`: signature `function updateLeap(s: GameState, boss: BossDef, leap: LeapDef, index: number): void {`; `const b = s.boss;` → `const b = bossAt(s, index);`; `b.leapToX = leapLanding(s, boss, leap);` → `b.leapToX = leapLanding(s, boss, leap, index);`.

5j. `updateDive`: signature `function updateDive(s: GameState, boss: BossDef, dive: DiveDef, index: number): void {`; `const b = s.boss;` → `const b = bossAt(s, index);`; `b.leapToX = leapLanding(s, boss, dive);` → `b.leapToX = leapLanding(s, boss, dive, index);`.

5k. Replace `finishTransition`, `beginTransition` and `updateBoss` (the last three functions) with:

```ts
/** After the powering-up pause the boss opens with the new phase's opening attack, if it has one and it may start it. */
function finishTransition(s: GameState, boss: BossDef, phase: PhaseDef, index: number, mayCommit: boolean): void {
  const b = bossAt(s, index);
  if (phase.opening !== undefined && mayCommit) {
    b.pendingAttackId = phase.opening;
    b.chainLeft = planChain(s, phase);
    b.mode = 'approach';
    b.modeTick = 0;
  } else {
    enterGap(b, boss);
  }
}

/** The boss moves on to the next phase: it drops what it was doing and powers up, unhurtable. Its own shots vanish. */
export function beginTransition(s: GameState, boss: BossDef, index = 0): void {
  const b = bossAt(s, index);
  b.phase += 1;
  endMotion(b, boss);
  b.mode = 'transition';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.shots = s.shots.filter((shot) => (shot.owner ?? 0) !== index);
  s.events.push('phaseChange');
}

/**
 * Moves boss `index` one update. Mutates the (already cloned) state. `mayCommit` says whether the boss may start
 * choosing an attack on this update (its chance to take the turn); a blocked boss keeps waiting and draws nothing.
 */
export function updateBoss(s: GameState, boss: BossDef, index = 0, mayCommit = true): void {
  const b = bossAt(s, index);
  const phase = boss.phases[b.phase];
  if (phase === undefined) return;
  b.modeTick += 1;
  if (boss.flight !== undefined && (b.mode === 'gap' || b.mode === 'approach' || b.mode === 'transition')) {
    settleLift(b, boss.flight);
  }
  switch (b.mode) {
    case 'gap':
      updateGap(s, boss, phase, index, mayCommit);
      break;
    case 'approach':
      updateApproach(s, boss, phase, index);
      break;
    case 'attack':
      updateAttack(s, boss, phase, index);
      break;
    case 'stagger':
      if (b.modeTick >= boss.counter.staggerTicks) enterGap(b, boss);
      break;
    case 'transition':
      if (b.modeTick >= boss.transitionTicks) finishTransition(s, boss, phase, index, mayCommit);
      break;
  }
}
```

- [ ] **Step 6: Run the new test, then the full gate**

Run: `npx vitest run tests/two-boss-update.test.ts`
Expected: PASS.

Run: `npm test && npm run typecheck`
Expected: PASS with no edits to any existing test. In particular `tests/duelist-golden.test.ts`, `tests/shots.test.ts` (which calls `beginTransition(s, boss)`), `tests/eruptions.test.ts` and `tests/step-study.test.ts` must pass untouched.

- [ ] **Step 7: Commit**

```bash
git add src/game/boss.ts src/game/shots.ts tests/duo-helpers.ts tests/two-boss-update.test.ts
git commit -m "refactor: let the boss and shot functions work on any boss of a fight (one-boss fights unchanged)"
```

---

### CHECKPOINT (stop here and tell the owner)

Before Task 3, report to the owner in plain language: the refactor is done, every existing test and the Ember Duelist golden test pass unedited, nothing visible changed. Then ask whether to continue with Task 3. Do not start Task 3 without a yes.

Also run these once as the "did anything visible change" gate and include the result:

Run: `npm run build && npm run check:dist`
Expected: both succeed.

---

### Task 3: The turn rule and a fight-aware step

**Files:**
- Create: `src/game/turns.ts`
- Modify: `src/game/boss.ts` (add `updateBosses`)
- Modify: `src/game/step.ts`
- Test: `tests/two-boss-turns.test.ts`

**Interfaces:**
- Consumes: `FightDef`, `asFight` (Task 1); `bossAt`, `bossCount`, `isDowned`, per-boss `updateBoss(s, boss, index, mayCommit)` (Tasks 1 and 2).
- Produces:
  - `holdsTurn(s: GameState, index: number): boolean`
  - `isEnraged(s: GameState, fight: FightDef, index: number): boolean`
  - `bossDefFor(s: GameState, fight: FightDef, index: number): BossDef`
  - `pickCommitter(s: GameState, fight: FightDef): number | null`
  - `updateBosses(s: GameState, fight: FightDef): void`
  - `step(prev: GameState, input: InputFrame, source: BossDef | FightDef): GameState`

**The rule, exactly:**
- A boss *holds the turn* when it is walking into range of a chosen attack (`approach`), attacking (`attack`, chains stay in `approach`/`attack` so they keep it), or owns any shot or eruption still on the field. A staggered or powering-up boss holds nothing unless it owns shots.
- A boss is *ready* when, after this update's `modeTick += 1`, it is in `gap` with `modeTick >= gap` and its phase has attacks, or in `transition` with `modeTick >= transitionTicks` and its phase has an opening attack. Its *wait* is how many updates past ready it is.
- Among ready bosses the longest wait wins, the lowest index on a tie. The winner commits only if no other boss holds the turn; otherwise nobody commits (the ready boss with the longest wait is never leapfrogged, so nobody starves).
- A boss that is not the committer keeps walking to its spacing and asks again next update. A powering-up boss that is not the committer skips its opening and goes to its wait.

- [ ] **Step 1: Write the failing tests**

Create `tests/two-boss-turns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState, type GameState, type ShotState } from '../src/game/state';
import { step } from '../src/game/step';
import { pickCommitter } from '../src/game/turns';
import { pair, unit } from './duo-helpers';

const fakeShot = (owner?: number): ShotState => ({
  kind: 'bolt',
  attackId: 'shoot',
  originTick: 0,
  x: 500,
  lift: 400,
  dir: -1,
  originX: 500,
  size: 30,
  speed: 600,
  climb: 0,
  ...(owner === undefined ? {} : { owner }),
});

describe('pickCommitter', () => {
  const fight = pair(unit(5, 960), unit(5, 1100));

  it('picks nobody while no boss is ready', () => {
    expect(pickCommitter(createInitialState(fight), fight)).toBeNull();
  });

  it('picks the only ready boss', () => {
    const s = createInitialState(fight);
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('picks the boss that has waited longer', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.partners[0]!.modeTick = 20;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('picks the first-listed boss when both have waited the same', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(0);
  });

  it('picks nobody while the other boss walks into range or attacks', () => {
    for (const mode of ['approach', 'attack'] as const) {
      const s = createInitialState(fight);
      s.boss.mode = mode;
      s.partners[0]!.modeTick = 10;
      expect(pickCommitter(s, fight)).toBeNull();
    }
  });

  it('picks nobody while the other boss has shots on the field', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.shots.push(fakeShot(1));
    expect(pickCommitter(s, fight)).toBeNull();
  });

  it('lets a boss commit while only its own shots are on the field', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.shots.push(fakeShot());
    expect(pickCommitter(s, fight)).toBe(0);
  });

  it('does not let a boss with a short wait leapfrog one that waited longer and is blocked', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 6;
    s.partners[0]!.modeTick = 30;
    s.shots.push(fakeShot());
    expect(pickCommitter(s, fight)).toBeNull();
  });

  it('a staggered boss holds no turn', () => {
    const s = createInitialState(fight);
    s.boss.mode = 'stagger';
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('does not count a boss without attacks as ready', () => {
    const quiet = { ...unit(5, 960), phases: unit(5, 960).phases.map((phase) => ({ ...phase, attacks: [] })) };
    const f = pair(quiet, unit(5, 1100));
    const s = createInitialState(f);
    s.boss.modeTick = 50;
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, f)).toBe(1);
  });
});

describe('two bosses in a running fight', () => {
  const fight = pair(unit(5, 960), unit(5, 1100));

  function run(count: number): GameState[] {
    const states: GameState[] = [];
    let s = createInitialState(fight);
    for (let i = 0; i < count; i++) {
      s = step(s, NO_INPUT, fight);
      states.push(s);
    }
    return states;
  }

  it('never lets two bosses take their turn at once, and never lets one start while the other has shots up', () => {
    for (const s of run(900)) {
      const busy = [s.boss, ...s.partners]
        .map((b, i) => ({ i, on: b.mode === 'approach' || b.mode === 'attack' }))
        .filter((entry) => entry.on);
      expect(busy.length).toBeLessThanOrEqual(1);
      for (const { i } of busy) {
        expect(s.shots.every((shot) => (shot.owner ?? 0) === i)).toBe(true);
      }
    }
  });

  it('gives the bosses their turns alternately, the one that waited longer first', () => {
    const starts: number[] = [];
    let previous = createInitialState(fight);
    for (const s of run(900)) {
      [s.boss, ...s.partners].forEach((b, i) => {
        const before = [previous.boss, ...previous.partners][i]!;
        if (b.mode === 'attack' && before.mode !== 'attack') starts.push(i);
      });
      previous = s;
    }
    expect(starts.slice(0, 4)).toEqual([0, 1, 0, 1]);
  });

  it('draws random numbers only when a boss commits, so a blocked boss draws none', () => {
    let previous = createInitialState(fight);
    let compared = 0;
    for (const s of run(900)) {
      const before = [previous.boss, ...previous.partners];
      const sameModes = [s.boss, ...s.partners].every((b, i) => b.mode === before[i]!.mode);
      if (sameModes) {
        expect(s.rng).toBe(previous.rng);
        compared += 1;
      }
      previous = s;
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('marks the shots of the partner and not those of the primary boss', () => {
    let primary = false;
    let partner = false;
    for (const s of run(900)) {
      for (const shot of s.shots) {
        if ('owner' in shot) {
          expect(shot.owner).toBe(1);
          partner = true;
        } else {
          primary = true;
        }
      }
    }
    expect(primary && partner).toBe(true);
  });

  it('is deterministic: the same seed and inputs give the same fight', () => {
    expect(run(400)).toEqual(run(400));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/two-boss-turns.test.ts`
Expected: FAIL (cannot resolve `../src/game/turns`).

- [ ] **Step 3: Create `src/game/turns.ts`**

```ts
import type { BossDef } from '../bosses/schema';
import type { FightDef } from './fight';
import { allBosses, bossAt, bossCount, isDowned, type GameState } from './state';

/**
 * A boss holds the turn while it walks into range of a chosen attack, attacks (a chain never lets go), or owns a shot or
 * eruption that is still on the field. A boss that is staggered or powering up holds nothing unless it owns shots.
 */
export function holdsTurn(s: GameState, index: number): boolean {
  const b = bossAt(s, index);
  if (!isDowned(s, index) && (b.mode === 'approach' || b.mode === 'attack')) return true;
  return s.shots.some((shot) => (shot.owner ?? 0) === index);
}

/** A boss of a fight with an enrage is enraged once any partner is down. */
export function isEnraged(s: GameState, fight: FightDef, index: number): boolean {
  if (fight.enrage === null) return false;
  return allBosses(s).some((_, other) => other !== index && isDowned(s, other));
}

/** The numbers boss `index` fights with right now: its own, or its boosted copy once it is enraged. */
export function bossDefFor(s: GameState, fight: FightDef, index: number): BossDef {
  const def = (isEnraged(s, fight, index) ? fight.enraged : fight.bosses)[index];
  if (def === undefined) throw new Error(`The fight has no boss ${index}`);
  return def;
}

/**
 * How many updates past its commit moment boss `index` will be once this update's `modeTick += 1` has happened,
 * or null when it will not be at a commit moment: the end of its wait (with attacks to choose from), or the end of a
 * phase change when the new phase has an opening attack.
 */
function readyWait(s: GameState, fight: FightDef, index: number): number | null {
  if (isDowned(s, index)) return null;
  const b = bossAt(s, index);
  const def = bossDefFor(s, fight, index);
  const phase = def.phases[b.phase];
  if (phase === undefined) return null;
  if (b.mode === 'gap' && phase.attacks.length > 0) {
    const wait = b.modeTick + 1 - phase.gap;
    return wait >= 0 ? wait : null;
  }
  if (b.mode === 'transition' && phase.opening !== undefined) {
    const wait = b.modeTick + 1 - def.transitionTicks;
    return wait >= 0 ? wait : null;
  }
  return null;
}

/**
 * The boss allowed to start an attack on this update, or null. Among the bosses at a commit moment the one that has
 * waited longest wins (the first-listed on a tie); it goes ahead only when no other boss holds the turn. Nobody else
 * jumps the queue while it is held back.
 */
export function pickCommitter(s: GameState, fight: FightDef): number | null {
  let winner: number | null = null;
  let longest = -1;
  for (let i = 0; i < bossCount(s); i++) {
    const wait = readyWait(s, fight, i);
    if (wait !== null && wait > longest) {
      winner = i;
      longest = wait;
    }
  }
  if (winner === null) return null;
  for (let other = 0; other < bossCount(s); other++) {
    if (other !== winner && holdsTurn(s, other)) return null;
  }
  return winner;
}
```

- [ ] **Step 4: Add `updateBosses` to `src/game/boss.ts`**

Add these imports near the top (after the existing import lines):

```ts
import type { FightDef } from './fight';
import { bossCount, isDowned } from './state';
import { bossDefFor, pickCommitter } from './turns';
```
and merge the existing `import { bossAt, type BossState, type GameState } from './state';` with `bossCount, isDowned` so there is a single import from `./state`:

```ts
import { bossAt, bossCount, isDowned, type BossState, type GameState } from './state';
```

Append at the end of the file:

```ts
/**
 * Moves every boss of the fight one update. With partners, only the boss that wins `pickCommitter` may start an attack
 * on this update; a lone boss always may, so a one-boss fight behaves exactly as it did before turns existed.
 */
export function updateBosses(s: GameState, fight: FightDef): void {
  const count = bossCount(s);
  const committer = count > 1 ? pickCommitter(s, fight) : 0;
  for (let i = 0; i < count; i++) {
    if (isDowned(s, i)) continue;
    updateBoss(s, bossDefFor(s, fight, i), i, i === committer);
  }
}
```

- [ ] **Step 5: Edit `src/game/step.ts`**

5a. Replace the imports of `./boss`, `./state` and add `./fight` and `./turns`:

```ts
import { attackById, beginTransition, landBoss, updateBosses } from './boss';
import { asFight, type FightDef } from './fight';
```
(`./geometry`, `./params`, `./rng`, `./shots` imports unchanged), and

```ts
import { bossAt, bossCount, createInitialState, isDowned, type GameEvent, type GameState, type PlayerState } from './state';
import { bossDefFor } from './turns';
```
replacing the old multi-line `./state` import.

5b. Replace `tryCounter` (whole function, including its doc comment) with:

```ts
/**
 * A swing that starts inside the counter window of a counterable attack, close enough, staggers the boss
 * and cancels the attack. It runs before the hits are resolved, so the cancelled attack cannot hurt.
 * Only one boss attacks at a time, so at most one boss can be countered by a swing.
 */
function tryCounter(s: GameState, fight: FightDef, studying: boolean): void {
  if (studying) return;
  for (let i = 0; i < bossCount(s); i++) {
    if (!isDowned(s, i) && counterBoss(s, bossDefFor(s, fight, i), i)) return;
  }
}

function counterBoss(s: GameState, boss: BossDef, index: number): boolean {
  const p = s.player;
  const b = bossAt(s, index);
  if (b.mode !== 'attack' || b.attackId === null || p.attackTick !== 0 || p.attackAim !== 'forward') return false;
  const attack = attackById(boss, b.attackId);
  if (attack.class !== 'counterable') return false;
  if (b.attackTick < attack.windup - boss.counter.window || b.attackTick >= attack.windup) return false;
  if (Math.abs(p.x - b.x) > boss.counter.range) return false;
  // With an arena, the swing must also be able to reach the boss vertically (a player high on a platform
  // above a boss on the floor cannot counter it). Only the y ranges count: x stays governed by `counter.range`.
  // A bare arena keeps the old rule (distance only), which the recorded duelist scenarios and the counter of a
  // leaping boss from the floor rely on.
  if (boss.arena !== undefined && (boss.arena.platforms.length > 0 || boss.arena.covers.length > 0)) {
    const swing = attackBox(p);
    const body = bossBox(b, boss);
    if (swing.y >= body.y + body.h || body.y >= swing.y + swing.h) return false;
  }
  landBoss(b);
  b.mode = 'stagger';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.events.push('counter');
  return true;
}
```

5c. Replace `resolvePlayerAttack` (whole function) with the version below. (`allBosses` is added to the state import in 5a's line: add `allBosses,` to it.)

```ts
/** A boss is beaten in a fight with partners: it falls, its own shots vanish, and the fight goes on. */
function downBoss(s: GameState, index: number): void {
  const b = bossAt(s, index);
  landBoss(b);
  b.mode = 'gap';
  b.modeTick = 0;
  b.attackId = null;
  b.attackTick = 0;
  b.pendingAttackId = null;
  b.chainLeft = 0;
  s.shots = s.shots.filter((shot) => (shot.owner ?? 0) !== index);
  s.events.push('bossDown');
}

/**
 * The player's swing hurts one boss once per swing: the nearest one it reaches (the first-listed on a tie).
 * The last boss at 0 health ends the fight; an earlier one falls and the rest go on. A hit can start the next phase.
 */
function resolvePlayerAttack(s: GameState, fight: FightDef, studying: boolean): void {
  const p = s.player;
  if (studying || !attackActive(p) || p.attackConnected) return;
  const swing = attackBox(p);
  let target = -1;
  let nearest = Infinity;
  for (let i = 0; i < bossCount(s); i++) {
    const candidate = bossAt(s, i);
    if (isDowned(s, i) || candidate.mode === 'transition') continue;
    if (!overlaps(swing, bossBox(candidate, bossDefFor(s, fight, i)))) continue;
    const distance = Math.abs(p.x - candidate.x);
    if (distance < nearest) {
      target = i;
      nearest = distance;
    }
  }
  if (target < 0) return;
  const boss = bossDefFor(s, fight, target);
  const b = bossAt(s, target);
  p.attackConnected = true;
  if (p.attackAim === 'down') {
    // The pogo: a downward hit bounces the player up, and the bounce is not cut short by letting go of jump.
    p.vy = -PLAYER.attack.pogoSpeed;
    p.onGround = false;
    p.jumpCut = true;
  }
  const damage = b.mode === 'stagger' ? boss.counter.damageMultiplier : 1;
  b.hp = Math.max(0, b.hp - damage);
  s.events.push('bossHit');
  if (b.hp <= 0) {
    if (allBosses(s).every((each) => each.hp <= 0)) {
      s.phase = 'victory';
      s.endTicks = GAME.defeatRestartTicks;
      s.events.push('bossDefeated');
    } else {
      downBoss(s, target);
    }
    return;
  }
  const next = boss.phases[b.phase + 1];
  if (next !== undefined && b.hp <= boss.maxHp * next.startsAtHpFraction) beginTransition(s, boss, target);
}
```

5d. Replace `resolveBossHits` (whole function) with:

```ts
/** The active hit boxes of a boss hurt a player who is not untouchable, for the damage of the attack that is landing. */
function resolveBossHits(s: GameState, fight: FightDef, studying: boolean): void {
  const p = s.player;
  if (isInvulnerable(p)) return;
  const box = playerBox(p);
  for (let i = 0; i < bossCount(s); i++) {
    if (isDowned(s, i)) continue;
    const boss = bossDefFor(s, fight, i);
    const b = bossAt(s, i);
    if (!activeHitBoxes(b, boss).some((hit) => overlaps(hit, box))) continue;
    if (studying) {
      // A demonstration: it reaches the player but hurts nobody. The short untouchability makes it count once.
      p.invulnerableTicks = PLAYER.hitInvulnerability;
      s.events.push('studyHit');
      return;
    }
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    hurtPlayer(s, attack?.damage ?? 1);
    return;
  }
}
```

5e. In `resolveShotHits`: change the signature to `function resolveShotHits(s: GameState, fight: FightDef, studying: boolean): void {` and replace the damage line

```ts
  const damage = Math.max(...hit.map((shot) => boss.attacks.find((a) => a.id === shot.attackId)?.damage ?? 1));
```
with
```ts
  const damage = Math.max(
    ...hit.map((shot) => fight.bosses[shot.owner ?? 0]?.attacks.find((a) => a.id === shot.attackId)?.damage ?? 1),
  );
```

5f. Replace `step` (whole function, keep its doc comment) with:

```ts
/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame, source: BossDef | FightDef): GameState {
  const fight = asFight(source);
  // The arena of a fight is the primary boss's.
  const boss = fight.bosses[0]!;
  const s = structuredClone(prev);
  s.events = [];
  s.shotHits = [];
  s.tick += 1;

  if (s.phase !== 'fight') {
    s.endTicks -= 1;
    // The player is frozen: without this the renderer would keep blending from the last move.
    s.player.prevX = s.player.x;
    s.player.prevY = s.player.y;
    // The next fight gets a new seed derived from this one, so it plays out differently but stays reproducible.
    // The restarted fight deliberately has no study (it is only offered before the first fight).
    return s.endTicks <= 0 ? createInitialState(fight, nextRandom(s.rng).state) : s;
  }

  // Whether this update is part of the study is fixed now: the update on which the last demonstration finishes
  // still counts as study (nothing hurts anyone on it), and the real fight starts on the next one.
  const studying = s.study.active;
  updatePlayer(s.player, input, s.events, boss.arena);
  // Shots already in the air move first: a shot fired on this update appears at the boss and first moves on the next.
  moveShots(s, boss);
  updateBosses(s, fight);
  tryCounter(s, fight, studying);
  resolvePlayerAttack(s, fight, studying);
  if (s.phase === 'fight') resolveBossHits(s, fight, studying);
  if (s.phase === 'fight') resolveShotHits(s, fight, studying);
  // The fight is over: a boss that was mid-leap must not hang in the air for the whole end countdown, and no shot lingers.
  if (s.phase !== 'fight') {
    for (let i = 0; i < bossCount(s); i++) landBoss(bossAt(s, i));
    s.shots = [];
  }
  return s;
}
```

- [ ] **Step 6: Run the new tests, then the full gate**

Run: `npx vitest run tests/two-boss-turns.test.ts`
Expected: PASS. If "gives the bosses their turns alternately" fails, print `starts.slice(0, 8)` and check the tie-break and the no-leapfrog rule in `pickCommitter` before touching the test.

Run: `npm test && npm run typecheck`
Expected: PASS, no existing test edited. The Ember Duelist golden test and all replay tests must still pass; if not, the one-boss path changed and must be fixed in the code.

- [ ] **Step 7: Commit**

```bash
git add src/game/turns.ts src/game/boss.ts src/game/step.ts tests/two-boss-turns.test.ts
git commit -m "feat: bosses of a fight take turns; the step drives every boss of a fight"
```

---

### Task 4: Nearest-boss sword, downing, enrage and victory

The behaviour was implemented in Task 3's step (`resolvePlayerAttack`, `downBoss`, `bossDefFor`, `updateBosses`); this task proves it with tests and fixes whatever they reveal.

**Files:**
- Test: `tests/two-boss-fight.test.ts`
- Modify (only if a test reveals a bug): `src/game/step.ts`, `src/game/turns.ts`, `src/game/boss.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3, plus `withInput` from `tests/helpers.ts`, `NO_INPUT`, `shootingAttack` from `tests/shot-helpers.ts`.
- Produces: nothing new for later code; Plan 2 relies on the behaviour tested here (`'bossDown'` event, `partners[i].hp <= 0` meaning down, survivor enrage, victory when all are at 0).

- [ ] **Step 1: Write the tests**

Create `tests/two-boss-fight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import type { FightDef } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { dummy, pair, unit } from './duo-helpers';
import { DUELIST, withInput } from './helpers';
import { shootingAttack } from './shot-helpers';

/** One swing at the current spot, then 25 idle updates (a swing takes 16), returning the final state and every event. */
function swing(s: GameState, fight: FightDef): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let cur = step(s, withInput({ attackPressed: true }), fight);
  events.push(...cur.events);
  for (let i = 0; i < 25; i++) {
    cur = step(cur, NO_INPUT, fight);
    events.push(...cur.events);
  }
  return { state: cur, events };
}

/** The player stands at x = 600 facing right: the swing reaches 624 to 714. */
function stand(fight: FightDef): GameState {
  const s = createInitialState(fight);
  s.player.x = 600;
  s.player.prevX = 600;
  return s;
}

describe('the sword in a fight with two bosses', () => {
  it('hurts only the nearest boss in reach, whichever is listed first', () => {
    const fight = pair(dummy(700, 5), dummy(650, 5));
    const { state } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(5);
    expect(state.partners[0]!.hp).toBe(4);
  });

  it('hurts the first-listed boss when both are the same distance away', () => {
    const fight = pair(dummy(650, 5), dummy(650, 5));
    const { state } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(4);
    expect(state.partners[0]!.hp).toBe(5);
  });

  it('hurts nobody when neither boss is in reach', () => {
    const fight = pair(dummy(1000, 5), dummy(1100, 5));
    const { state, events } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(5);
    expect(state.partners[0]!.hp).toBe(5);
    expect(events).not.toContain('bossHit');
  });
});

describe('counters in a fight with two bosses', () => {
  it('staggers the boss that was countered and nobody else', () => {
    const counterable = {
      ...unit(5, 960),
      attacks: [shootingAttack([], { class: 'counterable' })],
    };
    const fight = pair(dummy(1100), counterable);
    let s = createInitialState(fight);
    s.player.x = 910;
    s.player.prevX = 910;
    const windup = counterable.attacks[0]!.windup;
    let countered = false;
    for (let n = 0; n < 200 && !countered; n++) {
      const b = s.partners[0]!;
      const press = b.mode === 'attack' && b.attackTick === windup - 3;
      s = step(s, withInput({ attackPressed: press }), fight);
      countered = s.events.includes('counter');
    }
    expect(countered).toBe(true);
    expect(s.partners[0]!.mode).toBe('stagger');
    expect(s.boss.mode).toBe('gap');
  });
});

describe('beating one boss', () => {
  it('lets the fight go on: the boss falls, its shots vanish, and no victory is declared', () => {
    const fight = pair(dummy(1000, 5), dummy(650, 1));
    const s0 = stand(fight);
    s0.shots.push({
      kind: 'bolt', attackId: 'shoot', originTick: 0, x: 900, lift: 400, dir: -1, originX: 900, size: 30, speed: 0, climb: 0, owner: 1,
    });
    const { state, events } = swing(s0, fight);
    expect(events).toContain('bossDown');
    expect(events).not.toContain('bossDefeated');
    expect(state.phase).toBe('fight');
    expect(state.partners[0]!.hp).toBe(0);
    expect(state.boss.hp).toBe(5);
    expect(state.shots).toEqual([]);
  });

  it('never lets a fallen boss act, be hit again or hold the turn', () => {
    const fight = pair(unit(5, 960), dummy(650, 1));
    let s = stand(fight);
    s = swing(s, fight).state;
    const before = JSON.stringify(s.partners[0]);
    for (let i = 0; i < 300; i++) {
      s = step(s, NO_INPUT, fight);
      expect(s.phase).toBe('fight');
    }
    expect(JSON.stringify(s.partners[0])).toBe(before);
    // The survivor kept attacking, so the fallen boss did not block its turns.
    expect(s.boss.mode === 'attack' || s.boss.mode === 'approach' || s.shots.length > 0 || s.boss.lastAttacks.length > 0).toBe(true);
  });

  it('enrages the survivor: it starts its next attack sooner than it would without the enrage', () => {
    const strong = { gapScale: 0.25, walkScale: 2 };
    const angry = pair(unit(60, 960), dummy(650, 1), strong);
    const calm = pair(unit(60, 960), dummy(650, 1));
    const a = swing(stand(angry), angry).state;
    const c = swing(stand(calm), calm).state;
    expect(a.boss.mode).not.toBe('gap');
    expect(c.boss.mode).toBe('gap');
  });

  it('does not enrage anyone while both bosses stand', () => {
    const fight = pair(unit(60, 960), unit(60, 1100), { gapScale: 0.25, walkScale: 2 });
    let s = createInitialState(fight);
    for (let i = 0; i < 20; i++) s = step(s, NO_INPUT, fight);
    expect(s.boss.mode).toBe('gap');
    expect(s.partners[0]!.mode).toBe('gap');
  });
});

describe('beating both bosses', () => {
  it('is a victory, with the usual event, once the last boss is at 0', () => {
    const fight = pair(dummy(700, 1), dummy(650, 1));
    const first = swing(stand(fight), fight);
    expect(first.events).toContain('bossDown');
    expect(first.state.phase).toBe('fight');
    const second = swing(first.state, fight);
    expect(second.events).toContain('bossDefeated');
    expect(second.state.phase).toBe('victory');
    expect(second.state.boss.hp).toBe(0);
    expect(second.state.partners[0]!.hp).toBe(0);
  });

  it('starts a fresh fight of the same two bosses after the end countdown', () => {
    const fight = pair(dummy(700, 1), dummy(650, 1));
    let s = swing(swing(stand(fight), fight).state, fight).state;
    expect(s.phase).toBe('victory');
    for (let i = 0; i < 200 && s.phase !== 'fight'; i++) s = step(s, NO_INPUT, fight);
    expect(s.phase).toBe('fight');
    expect(s.partners.length).toBe(1);
    expect(s.boss.hp).toBe(1);
    expect(s.partners[0]!.hp).toBe(1);
  });
});

describe('a plain boss still works as a fight of one', () => {
  it('accepts a BossDef and a one-boss fight alike, with the same result', () => {
    const solo = createInitialState(DUELIST, 4);
    let a = solo;
    let b = createInitialState(DUELIST, 4);
    for (let i = 0; i < 300; i++) {
      a = step(a, NO_INPUT, DUELIST);
      b = step(b, NO_INPUT, { bosses: [DUELIST], enrage: null, enraged: [DUELIST] });
    }
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/two-boss-fight.test.ts`
Expected: PASS. If a test fails, find out whether the test or the engine is wrong by re-reading the rule in Task 3 and the spec; fix the engine (the tests encode the agreed rules). Likely trouble spots: the shot-clearing test (a fake shot with `speed: 0` in `moveShots` stays put until cleared), and the enrage test (the survivor's `modeTick` continues across the downing, so with `gapScale: 0.25` its gap of 60 becomes 15).

- [ ] **Step 3: Full gate**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: everything passes with no existing test edited. Confirm with `git diff --stat -- tests` that only the new test files appear (no existing file under `tests/` modified).

- [ ] **Step 4: Commit**

```bash
git add tests/two-boss-fight.test.ts
git commit -m "test: sword, counter, downing, enrage and victory in a two-boss fight"
```

---

## What Plan 2 covers (not in this plan)

The pair file and its parser (health scale per boss, enrage strength), the pair entries in the Boss row and `resolveBoss`, recording and replay of a pair (pair id, `schemaVersion` bump, older records still valid), per-boss stats plus a whole-fight line, `docs/stats.md`, `docs/bosses.md` and `docs/phone-testing.md`, the two health bars, the turn marker, per-boss study, effects and audio for `'bossDown'`, the first real pair and its tuning, and the `docs/SPEC.md` entry. The UI files that read `state.boss` (`src/ui/render.ts`, `src/ui/app.ts`, `src/ui/look/*`, `src/stats/*`, `src/bosses/generate/fairness.ts`) keep working on the primary boss until then.

## Self-review notes

- **Spec coverage.** Turns (whole attack, shots, chain): Task 3 (`holdsTurn`, `pickCommitter`). Separate health and both must fall: Task 4 (`downBoss`, victory). Nearest-boss sword: Task 4 tests, `resolvePlayerAttack`. Survivor enrage: `enrageBoss`, `bossDefFor`, Task 4 test. Tie rule (longer wait, then lowest index, no extra draws): `pickCommitter`, Task 3 tests. Dials on both bosses, pair file, study per boss, recording/stats/screen: Plan 2 (study is skipped for partners in `createInitialState` until then). Solo unchanged: Task 2 gate, Task 3 gate, golden test, the equality test in Task 4.
- **Deviations from the spec text, to be written into the spec:** state keeps `boss` as the primary plus `partners` instead of one list; a staggered or powering-up boss holds no turn unless it owns shots; a powering-up boss that may not open goes to its wait instead of opening; a ready boss that has waited longest is never leapfrogged.
- **Type consistency.** `updateBoss(s, boss, index, mayCommit)`, `beginTransition(s, boss, index)`, `spawnShots(s, boss, attack, index)`, `pickCommitter(s, fight)`, `bossDefFor(s, fight, index)` and `FightDef` are named identically in every task.

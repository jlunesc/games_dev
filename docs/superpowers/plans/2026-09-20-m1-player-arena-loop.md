# M1: Player, Arena, Fixed Loop and Hit Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable single-screen fight against a throwaway training dummy, controlled with the owner's gamepads through per-controller profiles, with the spec's hit feedback, deployed as part of the existing PWA.

**Architecture:** The whole game is one plain state object advanced by a pure `step(state, input)` function at a fixed 60 updates per second. Input reading, rendering, feedback and sound live outside it. A thin browser loop turns real time into whole updates (`planUpdates`), holds the hit-freeze itself, and draws the state on a Canvas 2D in a fixed 1280x720 world scaled to fit.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Canvas 2D, Web Audio, Gamepad API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-m1-design.md` (implements M1 of `docs/SPEC.md` section 11; controller facts in `docs/controllers.md`). Read the spec and `CLAUDE.md` first.

## Global Constraints

- TypeScript strict mode, `noUncheckedIndexedAccess` is on (tests may use `!` on array elements). No `any`. Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- **Purity:** nothing under `src/game/` and `src/engine/loop.ts` may read a clock, `Math.random`, the DOM or the gamepad. `step` must not mutate the state it is given.
- **No new dependencies.** No backend, third-party scripts, or CDN code. No touch or keyboard game controls (spec: controller only).
- **Strict CSP is not loosened:** no inline scripts, no `style="..."` attributes and no `setAttribute('style', ...)`. Style through CSS classes or `el.style.setProperty(...)`. Assigning `canvas.style.*` or `canvas.width` is fine. Write DOM with `createElement` and `textContent`, never `innerHTML`.
- Every tunable number lives in `src/game/params.ts`. Durations are in updates (60 per second), distances in world units (world 1280 by 720), speeds in units per second.
- Movement input is digital: a stick beyond the dead zone counts as full left or right, the same as the d-pad, so timings are identical on both.
- Buttons 6 and 7 and the right stick of the SN30 Pro profile are ignored entirely (`docs/controllers.md`).
- **Commit messages: never add a `Co-Authored-By` line or any Claude/Anthropic attribution.** Do not change git config or pass `--author`; the repo identity is already correct. Use explicit paths with `git add`. **Never `git push`**; the controller decides when to push.
- Follow the working style in `CLAUDE.md`: do not add features that are not in this plan without asking.

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/time.ts` | `TICK_RATE`, `DT`, `TICK_MS` constants |
| `src/engine/input-frame.ts` | `InputFrame`, `NO_INPUT`, pending-press helpers |
| `src/engine/input-profile.ts` | Controller profiles, `selectProfile`, `sampleInput` |
| `src/engine/loop.ts` | Pure `planUpdates` |
| `src/game/params.ts` | All tunable values |
| `src/game/state.ts` | State and event types, `createInitialState` |
| `src/game/geometry.ts` | Boxes, overlap, attack and invulnerability predicates |
| `src/game/step.ts` | `step` and the player and dummy update logic |
| `src/ui/dom.ts` | The shared `el` helper |
| `src/ui/feedback.ts` | Pure feedback counters, freeze lengths, shake offset |
| `src/ui/render.ts` | `computeViewport` (pure) and `drawFrame` (Canvas 2D) |
| `src/ui/audio.ts` | Sounds generated in code |
| `src/ui/app.ts` | Start screen, fight loop, pause, controller test switching |
| `src/ui/controller-screen.ts` | (modify) stop function and Back button |
| `src/ui/style.css`, `src/main.ts` | (modify) |
| `tests/helpers.ts`, `tests/*.test.ts` | Tests |
| `docs/phone-testing.md` | (modify) M1 play checklist |

---

### Task 1: Foundations (time, input frame, params, state)

**Files:**
- Create: `src/engine/time.ts`, `src/engine/input-frame.ts`, `src/game/params.ts`, `src/game/state.ts`
- Test: `tests/state.test.ts`

**Interfaces:**
- Produces: `TICK_RATE`, `DT`, `TICK_MS` (`src/engine/time.ts`); `InputFrame`, `NO_INPUT` (`src/engine/input-frame.ts`); `WORLD`, `PLAYER`, `DUMMY`, `GAME`, `FEEDBACK` (`src/game/params.ts`); `Buffered`, `PlayerState`, `DummyPhase`, `DummyState`, `GameEvent`, `GameState`, `createInitialState()` (`src/game/state.ts`).

- [ ] **Step 1: Write the failing test**

`tests/state.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DUMMY, PLAYER, WORLD } from '../src/game/params';
import { createInitialState } from '../src/game/state';

describe('createInitialState', () => {
  it('starts a fight with the player standing on the floor at full health', () => {
    const s = createInitialState();
    expect(s.tick).toBe(0);
    expect(s.phase).toBe('fight');
    expect(s.player.x).toBe(PLAYER.startX);
    expect(s.player.y).toBe(WORLD.floorY);
    expect(s.player.onGround).toBe(true);
    expect(s.player.health).toBe(PLAYER.maxHealth);
    expect(s.player.attackTick).toBe(-1);
    expect(s.player.dashTick).toBe(-1);
    expect(s.player.dashCooldown).toBe(0);
    expect(s.events).toEqual([]);
  });

  it('starts the dummy idle with the first sweep two seconds away', () => {
    const s = createInitialState();
    expect(s.dummy.x).toBe(DUMMY.x);
    expect(s.dummy.phase).toBe('idle');
    expect(s.dummy.nextSweepIn).toBe(DUMMY.firstSweepIn);
    expect(DUMMY.firstSweepIn).toBe(120);
    expect(s.dummy.hp).toBe(DUMMY.maxHp);
  });

  it('gives an independent state every time', () => {
    const a = createInitialState();
    a.player.x = 1;
    a.player.buffer.jump = 3;
    a.events.push('dash');
    const b = createInitialState();
    expect(b.player.x).toBe(PLAYER.startX);
    expect(b.player.buffer.jump).toBe(0);
    expect(b.events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/state.test.ts`
Expected: FAIL, `../src/game/params` cannot be resolved.

- [ ] **Step 3: Implement the four files**

`src/engine/time.ts`:
```ts
/** The simulation runs at a fixed number of updates per second. */
export const TICK_RATE = 60;
/** Seconds per update. */
export const DT = 1 / TICK_RATE;
/** Milliseconds per update. */
export const TICK_MS = 1000 / TICK_RATE;
```

`src/engine/input-frame.ts`:
```ts
/** What the player asked for during one update. `*Pressed` and `confirm`/`alt` are true only on the update where the button went down. */
export interface InputFrame {
  moveX: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  attackPressed: boolean;
  dashPressed: boolean;
  confirm: boolean;
  alt: boolean;
}

export const NO_INPUT: InputFrame = {
  moveX: 0,
  jumpHeld: false,
  jumpPressed: false,
  attackPressed: false,
  dashPressed: false,
  confirm: false,
  alt: false,
};
```

`src/game/params.ts`:
```ts
/**
 * Every tunable value of the game in one place.
 * Durations are in updates (60 per second), distances in world units, speeds in units per second.
 * The values are first guesses; they are tuned from the owner's play feedback.
 */
export const WORLD = { width: 1280, height: 720, floorY: 640 };

export const PLAYER = {
  width: 48,
  height: 96,
  startX: 320,
  runSpeed: 420,
  gravity: 2600,
  maxFallSpeed: 1100,
  jumpSpeed: 900,
  jumpReleaseFactor: 0.4,
  inputBuffer: 3,
  maxHealth: 5,
  hitInvulnerability: 60,
  attack: { startup: 3, active: 4, recovery: 9, reach: 90, height: 80, moveFactor: 0.5 },
  dash: { duration: 11, speed: 1450, cooldown: 24 },
};

export const DUMMY = {
  width: 96,
  height: 160,
  x: 960,
  maxHp: 20,
  firstSweepIn: 120,
  sweep: { every: 180, windup: 30, active: 8, recovery: 24, reach: 220, height: 120 },
};

export const GAME = {
  defeatRestartTicks: 60,
  deadZone: 0.25,
};

export const FEEDBACK = {
  freezeOnDummyHit: 4,
  freezeOnPlayerHit: 8,
  shakeTicks: 10,
  shakeAmplitude: 6,
  dummyFlashTicks: 6,
  playerFlashTicks: 12,
};
```

`src/game/state.ts`:
```ts
import { DUMMY, PLAYER, WORLD } from './params';

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

export type DummyPhase = 'idle' | 'windup' | 'sweep' | 'recovery';

export interface DummyState {
  x: number;
  /** Direction of the coming or current sweep. */
  facing: 1 | -1;
  /** Display only: refills when it reaches zero, the dummy never dies. */
  hp: number;
  phase: DummyPhase;
  phaseTick: number;
  nextSweepIn: number;
}

export type GameEvent = 'dummyHit' | 'playerHit' | 'dash' | 'dummyWindup' | 'playerDefeated';

export interface GameState {
  tick: number;
  phase: 'fight' | 'defeated';
  defeatTicks: number;
  player: PlayerState;
  dummy: DummyState;
  /** Events produced by the last update. */
  events: GameEvent[];
}

export function createInitialState(): GameState {
  return {
    tick: 0,
    phase: 'fight',
    defeatTicks: 0,
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
    dummy: {
      x: DUMMY.x,
      facing: -1,
      hp: DUMMY.maxHp,
      phase: 'idle',
      phaseTick: 0,
      nextSweepIn: DUMMY.firstSweepIn,
    },
    events: [],
  };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/state.test.ts && npm run typecheck`
Expected: 3 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/time.ts src/engine/input-frame.ts src/game/params.ts src/game/state.ts tests/state.test.ts
git commit -m "feat: add game state, tunable params and time constants"
```

---

### Task 2: Player movement and jump (TDD)

**Files:**
- Create: `tests/helpers.ts`, `src/game/step.ts`
- Test: `tests/step-movement.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `updatePlayer(p: PlayerState, input: InputFrame): void` and `step(prev: GameState, input: InputFrame): GameState` from `src/game/step.ts` (Task 3 replaces both with versions that also take events); test helpers `withInput`, `advance`, `run` from `tests/helpers.ts`.

- [ ] **Step 1: Write the helpers and the failing tests**

`tests/helpers.ts`:
```ts
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import type { GameState } from '../src/game/state';

export const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

/** Runs `count` updates with the same input and returns the final state. */
export function advance(state: GameState, count: number, input: InputFrame = NO_INPUT): GameState {
  let s = state;
  for (let i = 0; i < count; i++) s = step(s, input);
  return s;
}

/** Runs updates numbered 1..count, asking `inputFor(n)` for update n, and returns every resulting state (index 0 is update 1). */
export function run(
  state: GameState,
  count: number,
  inputFor: (update: number) => InputFrame,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= count; n++) {
    s = step(s, inputFor(n));
    states.push(s);
  }
  return states;
}
```

`tests/step-movement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER, WORLD } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import { advance, run, withInput } from './helpers';

const maxHeight = (states: GameState[]): number =>
  WORLD.floorY - Math.min(...states.map((s) => s.player.y));

describe('running', () => {
  it('stays put on the floor with no input', () => {
    const s = advance(createInitialState(), 10);
    expect(s.player.x).toBe(PLAYER.startX);
    expect(s.player.y).toBe(WORLD.floorY);
    expect(s.player.onGround).toBe(true);
  });

  it('runs right at the run speed and faces right', () => {
    const s = advance(createInitialState(), 60, withInput({ moveX: 1 }));
    expect(s.player.x).toBeCloseTo(PLAYER.startX + PLAYER.runSpeed, 5);
    expect(s.player.facing).toBe(1);
  });

  it('runs left and faces left', () => {
    const s = advance(createInitialState(), 30, withInput({ moveX: -1 }));
    expect(s.player.x).toBeCloseTo(PLAYER.startX - PLAYER.runSpeed / 2, 5);
    expect(s.player.facing).toBe(-1);
  });

  it('stops at the walls', () => {
    const left = advance(createInitialState(), 300, withInput({ moveX: -1 }));
    expect(left.player.x).toBe(PLAYER.width / 2);
    const right = advance(createInitialState(), 300, withInput({ moveX: 1 }));
    expect(right.player.x).toBe(WORLD.width - PLAYER.width / 2);
  });
});

describe('jumping', () => {
  it('a held jump reaches roughly the planned height and lands again', () => {
    const states = run(createInitialState(), 60, (n) =>
      withInput({ jumpPressed: n === 1, jumpHeld: true }),
    );
    const height = maxHeight(states);
    expect(height).toBeGreaterThan(150);
    expect(height).toBeLessThan(175);
    expect(states[19]!.player.onGround).toBe(false);
    expect(states[59]!.player.onGround).toBe(true);
  });

  it('releasing early makes a much smaller jump', () => {
    const full = maxHeight(
      run(createInitialState(), 60, (n) => withInput({ jumpPressed: n === 1, jumpHeld: true })),
    );
    const short = maxHeight(
      run(createInitialState(), 60, (n) => withInput({ jumpPressed: n === 1, jumpHeld: n === 1 })),
    );
    expect(short).toBeGreaterThan(20);
    expect(short).toBeLessThan(full * 0.6);
  });

  it('cannot jump again in the air', () => {
    const states = run(createInitialState(), 30, (n) =>
      withInput({ jumpPressed: n === 1 || n === 10, jumpHeld: true }),
    );
    const single = run(createInitialState(), 30, (n) =>
      withInput({ jumpPressed: n === 1, jumpHeld: true }),
    );
    expect(states.map((s) => s.player.y)).toEqual(single.map((s) => s.player.y));
  });
});

describe('the jump input buffer', () => {
  const fall = (pressAt: number): GameState[] => {
    const start = createInitialState();
    start.player.y = WORLD.floorY - 60;
    start.player.onGround = false;
    return run(start, 30, (n) => withInput({ jumpPressed: n === pressAt, jumpHeld: n === pressAt }));
  };
  const landing = fall(-1).findIndex((s) => s.player.onGround) + 1;

  it('lands after a few updates (sanity check of the scenario)', () => {
    expect(landing).toBeGreaterThan(3);
  });

  it('a press one update before landing still jumps', () => {
    const states = fall(landing - 1);
    expect(states[landing]!.player.vy).toBeLessThan(0);
  });

  it('a press two updates before landing has expired and does not jump', () => {
    const states = fall(landing - 2);
    expect(states[landing]!.player.onGround).toBe(true);
    expect(states[landing]!.player.vy).toBe(0);
  });
});

describe('step purity', () => {
  it('does not change the state it was given', () => {
    const before = createInitialState();
    const snapshot = JSON.stringify(before);
    step(before, withInput({ moveX: 1, jumpPressed: true, jumpHeld: true }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('gives identical results for identical inputs', () => {
    const script = (n: number) =>
      withInput({ moveX: n % 7 < 3 ? 1 : -1, jumpPressed: n % 20 === 1, jumpHeld: n % 20 < 12 });
    expect(run(createInitialState(), 200, script)).toEqual(run(createInitialState(), 200, script));
  });

  it('counts updates', () => {
    expect(advance(createInitialState(), 5, NO_INPUT).tick).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/step-movement.test.ts`
Expected: FAIL, `../src/game/step` cannot be resolved.

- [ ] **Step 3: Implement `src/game/step.ts` (movement and jump only)**

```ts
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { PLAYER, WORLD } from './params';
import type { GameState, PlayerState } from './state';

/** Moves the player one update: run, jump (with an input buffer and early-release cut), gravity, walls and floor. */
export function updatePlayer(p: PlayerState, input: InputFrame): void {
  p.prevX = p.x;
  p.prevY = p.y;

  p.buffer.jump = input.jumpPressed ? PLAYER.inputBuffer : Math.max(0, p.buffer.jump - 1);

  if (input.moveX !== 0) p.facing = input.moveX > 0 ? 1 : -1;

  p.vx = input.moveX * PLAYER.runSpeed;
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

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;
  updatePlayer(s.player, input);
  return s;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/step-movement.test.ts && npm run typecheck`
Expected: all tests PASS, typecheck exits 0. If the jump-height bounds fail by a small margin, report the measured value; do not change `params.ts` values to make a test pass.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers.ts tests/step-movement.test.ts src/game/step.ts
git commit -m "feat: add player movement and variable-height jump"
```

---

### Task 3: Attack, dash and geometry (TDD)

**Files:**
- Create: `src/game/geometry.ts`
- Modify: `src/game/step.ts` (replace the whole file with the version below)
- Test: `tests/geometry.test.ts`, `tests/step-combat.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 (`updatePlayer`, `step`, test helpers).
- Produces: from `src/game/geometry.ts`: `Box`, `overlaps(a, b)`, `playerBox(p)`, `dummyBox(d)`, `attackBox(p)`, `attackActive(p)`, `isInvulnerable(p)` (Task 4 appends `sweepBox`). From `step.ts`: `updatePlayer(p, input, events)` and `step(prev, input)` now also attack, dash, and the attack-vs-dummy collision (event `dummyHit`, event `dash`).

- [ ] **Step 1: Write the failing tests**

`tests/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  attackActive,
  attackBox,
  dummyBox,
  isInvulnerable,
  overlaps,
  playerBox,
} from '../src/game/geometry';
import { createInitialState } from '../src/game/state';

describe('overlaps', () => {
  it('is true for overlapping boxes and false for touching ones', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });
});

describe('boxes', () => {
  it('places the player box around its centre and feet', () => {
    const p = createInitialState().player;
    expect(playerBox(p)).toEqual({ x: 296, y: 544, w: 48, h: 96 });
  });

  it('places the dummy box on the floor', () => {
    const d = createInitialState().dummy;
    expect(dummyBox(d)).toEqual({ x: 912, y: 480, w: 96, h: 160 });
  });

  it('puts the attack box in front of the player, vertically centred', () => {
    const p = createInitialState().player;
    p.x = 850;
    p.facing = 1;
    expect(attackBox(p)).toEqual({ x: 874, y: 552, w: 90, h: 80 });
    p.facing = -1;
    expect(attackBox(p)).toEqual({ x: 736, y: 552, w: 90, h: 80 });
  });
});

describe('predicates', () => {
  it('the attack is active only during its active updates', () => {
    const p = createInitialState().player;
    const active = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) => {
      p.attackTick = t;
      return attackActive(p);
    });
    expect(active).toEqual([false, false, false, false, true, true, true, true, false, false]);
  });

  it('the player is untouchable after a hit or while dashing', () => {
    const p = createInitialState().player;
    expect(isInvulnerable(p)).toBe(false);
    p.invulnerableTicks = 5;
    expect(isInvulnerable(p)).toBe(true);
    p.invulnerableTicks = 0;
    p.dashTick = 0;
    expect(isInvulnerable(p)).toBe(true);
  });
});
```

`tests/step-combat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isInvulnerable } from '../src/game/geometry';
import { DUMMY, PLAYER } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { run, withInput } from './helpers';

/** A fresh fight where the dummy will not sweep for a very long time. */
function quiet(): GameState {
  const s = createInitialState();
  s.dummy.nextSweepIn = 100000;
  return s;
}

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

describe('attack', () => {
  const swing = (playerX: number): GameState[] => {
    const start = quiet();
    start.player.x = playerX;
    start.player.prevX = playerX;
    return run(start, 30, (n) => withInput({ attackPressed: n === 1 }));
  };

  it('hits the dummy once, on the fourth update of the swing', () => {
    expect(updatesWith(swing(850), 'dummyHit')).toEqual([4]);
  });

  it('misses when the dummy is out of reach', () => {
    expect(updatesWith(swing(320), 'dummyHit')).toEqual([]);
  });

  it('lasts 16 updates in total', () => {
    const states = run(quiet(), 20, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[15]!.player.attackTick).toBe(15);
    expect(states[16]!.player.attackTick).toBe(-1);
  });

  it('slows the player to half speed while swinging', () => {
    const states = run(quiet(), 2, (n) => withInput({ attackPressed: n === 1, moveX: 1 }));
    const moved = states[1]!.player.x - states[0]!.player.x;
    expect(moved).toBeCloseTo((PLAYER.runSpeed * PLAYER.attack.moveFactor) / 60, 5);
  });

  it('locks the facing direction for the whole swing', () => {
    const states = run(quiet(), 6, (n) => withInput({ attackPressed: n === 1, moveX: n === 1 ? 1 : -1 }));
    expect(states[5]!.player.facing).toBe(1);
  });

  it('refills the dummy display health instead of letting it die', () => {
    const start = quiet();
    start.player.x = 850;
    start.dummy.hp = 1;
    const states = run(start, 5, (n) => withInput({ attackPressed: n === 1 }));
    expect(states[3]!.events).toContain('dummyHit');
    expect(states[3]!.dummy.hp).toBe(DUMMY.maxHp);
  });
});

describe('dash', () => {
  it('starts at once and makes the player untouchable for exactly 11 updates', () => {
    const states = run(quiet(), 15, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    expect(states[0]!.events).toContain('dash');
    const untouchable = states.map((s) => isInvulnerable(s.player));
    expect(untouchable.slice(0, 11).every(Boolean)).toBe(true);
    expect(untouchable[11]).toBe(false);
  });

  it('covers the planned distance', () => {
    const states = run(quiet(), 11, (n) => withInput({ dashPressed: n === 1, moveX: 1 }));
    const expected = PLAYER.startX + (PLAYER.dash.duration * PLAYER.dash.speed) / 60;
    expect(states[10]!.player.x).toBeCloseTo(expected, 3);
  });

  it('cannot be repeated until the cooldown after it has ended is over', () => {
    const states = run(quiet(), 60, () => withInput({ dashPressed: true }));
    expect(updatesWith(states, 'dash')).toEqual([1, 36]);
  });

  it('is not pulled down by gravity while dashing in the air', () => {
    const start = quiet();
    start.player.y = 540;
    start.player.onGround = false;
    const states = run(start, 12, (n) => withInput({ dashPressed: n === 1 }));
    expect(states.slice(0, 11).every((s) => s.player.y === 540)).toBe(true);
    expect(states[11]!.player.y).toBeGreaterThan(540);
  });

  it('goes the way the player faces when no direction is held', () => {
    const start = quiet();
    start.player.facing = -1;
    const states = run(start, 3, (n) => withInput({ dashPressed: n === 1 }));
    expect(states[2]!.player.x).toBeLessThan(PLAYER.startX);
  });

  it('cancels a swing in progress', () => {
    const states = run(quiet(), 3, (n) => withInput({ attackPressed: n === 1, dashPressed: n === 2 }));
    expect(states[1]!.player.attackTick).toBe(-1);
    expect(states[1]!.player.dashTick).toBe(0);
  });

  it('wins over an attack pressed on the same update', () => {
    const states = run(quiet(), 1, () => withInput({ attackPressed: true, dashPressed: true }));
    expect(states[0]!.player.dashTick).toBe(0);
    expect(states[0]!.player.attackTick).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/geometry.test.ts tests/step-combat.test.ts`
Expected: FAIL, `../src/game/geometry` cannot be resolved.

- [ ] **Step 3: Create `src/game/geometry.ts`**

```ts
import { DUMMY, PLAYER, WORLD } from './params';
import type { DummyState, PlayerState } from './state';

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

export function dummyBox(d: DummyState): Box {
  return {
    x: d.x - DUMMY.width / 2,
    y: WORLD.floorY - DUMMY.height,
    w: DUMMY.width,
    h: DUMMY.height,
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

- [ ] **Step 4: Replace `src/game/step.ts` with the version that adds attack and dash**

```ts
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import { attackActive, attackBox, dummyBox, overlaps } from './geometry';
import { DUMMY, PLAYER, WORLD } from './params';
import type { GameEvent, GameState, PlayerState } from './state';

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

/** The player's swing hurts the dummy once per swing. The dummy's display health refills instead of reaching zero. */
function resolveAttack(s: GameState): void {
  const { player: p, dummy: d } = s;
  if (attackActive(p) && !p.attackConnected && overlaps(attackBox(p), dummyBox(d))) {
    p.attackConnected = true;
    d.hp -= 1;
    if (d.hp <= 0) d.hp = DUMMY.maxHp;
    s.events.push('dummyHit');
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;
  updatePlayer(s.player, input, s.events);
  resolveAttack(s);
  return s;
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (Task 2's movement tests still pass), typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/geometry.ts src/game/step.ts tests/geometry.test.ts tests/step-combat.test.ts
git commit -m "feat: add attack, dash with cooldown, and hit boxes"
```

---

### Task 4: Dummy, damage, defeat and restart (TDD)

**Files:**
- Modify: `src/game/geometry.ts` (append `sweepBox`), `src/game/step.ts` (replace whole file)
- Test: `tests/step-dummy.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `sweepBox(d: DummyState): Box` in `geometry.ts`; `step` now also runs the dummy state machine, hurts the player, and restarts after defeat (events `dummyWindup`, `playerHit`, `playerDefeated`).

- [ ] **Step 1: Write the failing tests**

`tests/step-dummy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import { sweepBox } from '../src/game/geometry';
import { PLAYER } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { run, withInput } from './helpers';

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

/** The player stands 112 units left of the dummy's edge, inside the sweep's reach. */
function standingInReach(): GameState {
  const s = createInitialState();
  s.player.x = 800;
  s.player.prevX = 800;
  return s;
}

describe('the dummy sweep timeline', () => {
  const states = run(createInitialState(), 320, () => NO_INPUT);

  it('warns at update 120 and again every 180 updates', () => {
    expect(updatesWith(states, 'dummyWindup')).toEqual([120, 300]);
  });

  it('is sweeping on exactly 8 updates, starting 30 updates after the warning', () => {
    const sweeping = states.flatMap((s, i) => (s.dummy.phase === 'sweep' ? [i + 1] : []));
    expect(sweeping).toEqual(Array.from({ length: 8 }, (_, i) => 150 + i));
  });

  it('does not touch a player who stays far away', () => {
    expect(states[319]!.player.health).toBe(PLAYER.maxHealth);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
  });

  it('turns towards the player when the warning starts', () => {
    expect(states[119]!.dummy.facing).toBe(-1);
  });
});

describe('the sweep hurts', () => {
  it('hits a player standing in reach on the first sweeping update, once', () => {
    const states = run(standingInReach(), 200, () => NO_INPUT);
    expect(updatesWith(states, 'playerHit')).toEqual([150]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('cannot hit twice within the same sweep', () => {
    const start = standingInReach();
    start.dummy.phase = 'sweep';
    start.dummy.phaseTick = 0;
    start.dummy.facing = -1;
    start.dummy.nextSweepIn = 100000;
    const states = run(start, 3, () => NO_INPUT);
    expect(states[0]!.events).toContain('playerHit');
    expect(states[1]!.events).not.toContain('playerHit');
    expect(states[2]!.player.health).toBe(PLAYER.maxHealth - 1);
    expect(states[0]!.player.invulnerableTicks).toBe(PLAYER.hitInvulnerability);
  });

  it('can be jumped over', () => {
    const states = run(standingInReach(), 200, (n) =>
      withInput({ jumpPressed: n === 137, jumpHeld: n >= 137 && n <= 170 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth);
  });

  it('can be dashed through', () => {
    const states = run(standingInReach(), 200, (n) =>
      withInput({ dashPressed: n === 148, moveX: n === 148 ? 1 : 0 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth);
  });
});

describe('sweepBox', () => {
  it('reaches out low in front of the dummy, on the side it faces', () => {
    const d = createInitialState().dummy;
    d.facing = -1;
    expect(sweepBox(d)).toEqual({ x: 692, y: 520, w: 220, h: 120 });
    d.facing = 1;
    expect(sweepBox(d)).toEqual({ x: 1008, y: 520, w: 220, h: 120 });
  });
});

describe('defeat', () => {
  const defeated = (): GameState[] => {
    const start = standingInReach();
    start.player.health = 1;
    start.dummy.phase = 'sweep';
    start.dummy.phaseTick = 0;
    start.dummy.facing = -1;
    start.dummy.nextSweepIn = 100000;
    return run(start, 70, () => NO_INPUT);
  };

  it('ends the fight when the last hit lands', () => {
    const states = defeated();
    expect(states[0]!.phase).toBe('defeated');
    expect(states[0]!.player.health).toBe(0);
    expect(states[0]!.events).toContain('playerDefeated');
  });

  it('restarts a fresh fight exactly 60 updates later', () => {
    const states = defeated();
    expect(states[59]!.phase).toBe('defeated');
    expect(states[60]!.phase).toBe('fight');
    expect(states[60]!.tick).toBe(0);
    expect(states[60]!.player.health).toBe(PLAYER.maxHealth);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/step-dummy.test.ts`
Expected: FAIL, `sweepBox` is not exported from `../src/game/geometry`.

- [ ] **Step 3: Append `sweepBox` to `src/game/geometry.ts`**

Add at the end of the file:
```ts

/** The area the dummy's sweep hurts: low, on the side the dummy faces, so it can be jumped over. */
export function sweepBox(d: DummyState): Box {
  const { reach, height } = DUMMY.sweep;
  const x = d.facing === 1 ? d.x + DUMMY.width / 2 : d.x - DUMMY.width / 2 - reach;
  return { x, y: WORLD.floorY - height, w: reach, h: height };
}
```

- [ ] **Step 4: Replace `src/game/step.ts` with the full version**

```ts
import type { InputFrame } from '../engine/input-frame';
import { DT } from '../engine/time';
import {
  attackActive,
  attackBox,
  dummyBox,
  isInvulnerable,
  overlaps,
  playerBox,
  sweepBox,
} from './geometry';
import { DUMMY, GAME, PLAYER, WORLD } from './params';
import {
  createInitialState,
  type DummyState,
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

/** The dummy waits, warns (turning towards the player), sweeps, recovers, and waits again. */
function updateDummy(d: DummyState, p: PlayerState, events: GameEvent[]): void {
  const sweep = DUMMY.sweep;
  switch (d.phase) {
    case 'idle':
      d.nextSweepIn -= 1;
      if (d.nextSweepIn <= 0) {
        d.phase = 'windup';
        d.phaseTick = 0;
        d.facing = p.x < d.x ? -1 : 1;
        events.push('dummyWindup');
      }
      break;
    case 'windup':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.windup) {
        d.phase = 'sweep';
        d.phaseTick = 0;
      }
      break;
    case 'sweep':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.active) {
        d.phase = 'recovery';
        d.phaseTick = 0;
      }
      break;
    case 'recovery':
      d.phaseTick += 1;
      if (d.phaseTick >= sweep.recovery) {
        d.phase = 'idle';
        d.nextSweepIn = sweep.every - sweep.windup - sweep.active - sweep.recovery;
      }
      break;
  }
}

/** The player's swing hurts the dummy once per swing. The dummy's display health refills instead of reaching zero. */
function resolveAttack(s: GameState): void {
  const { player: p, dummy: d } = s;
  if (attackActive(p) && !p.attackConnected && overlaps(attackBox(p), dummyBox(d))) {
    p.attackConnected = true;
    d.hp -= 1;
    if (d.hp <= 0) d.hp = DUMMY.maxHp;
    s.events.push('dummyHit');
  }
}

/** The sweep hurts a player who is not untouchable. The last hit ends the fight. */
function resolveSweep(s: GameState): void {
  const { player: p, dummy: d } = s;
  if (d.phase !== 'sweep' || isInvulnerable(p) || !overlaps(sweepBox(d), playerBox(p))) return;
  p.health -= 1;
  p.invulnerableTicks = PLAYER.hitInvulnerability;
  s.events.push('playerHit');
  if (p.health <= 0) {
    p.health = 0;
    s.phase = 'defeated';
    s.defeatTicks = GAME.defeatRestartTicks;
    s.events.push('playerDefeated');
  }
}

/** Advances the game by one update. Pure: returns a new state and never touches the one it is given. */
export function step(prev: GameState, input: InputFrame): GameState {
  const s = structuredClone(prev);
  s.events = [];
  s.tick += 1;

  if (s.phase === 'defeated') {
    s.defeatTicks -= 1;
    return s.defeatTicks <= 0 ? createInitialState() : s;
  }

  updatePlayer(s.player, input, s.events);
  updateDummy(s.dummy, s.player, s.events);
  resolveAttack(s);
  resolveSweep(s);
  return s;
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (Tasks 1 to 3 still pass), typecheck exits 0. If a timeline number in the new tests is off by one, first re-derive it from the code; only report a discrepancy, do not silently change the code or the numbers.

- [ ] **Step 6: Commit**

```bash
git add src/game/geometry.ts src/game/step.ts tests/step-dummy.test.ts
git commit -m "feat: add the training dummy, damage, defeat and restart"
```

---

### Task 5: Fixed-step loop planner (TDD)

**Files:**
- Create: `src/engine/loop.ts`
- Test: `tests/loop.test.ts`

**Interfaces:**
- Consumes: `TICK_MS` from `src/engine/time.ts`.
- Produces: `MAX_UPDATES_PER_FRAME` (5), `UpdatePlan { updates: number; leftoverMs: number; alpha: number }`, `planUpdates(leftoverMs: number, frameMs: number): UpdatePlan`.

- [ ] **Step 1: Write the failing tests**

`tests/loop.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/engine/time';
import { MAX_UPDATES_PER_FRAME, planUpdates } from '../src/engine/loop';

describe('planUpdates', () => {
  it('does nothing when no time has passed', () => {
    expect(planUpdates(0, 0)).toEqual({ updates: 0, leftoverMs: 0, alpha: 0 });
  });

  it('runs one update per full tick of elapsed time', () => {
    const plan = planUpdates(0, 3 * TICK_MS);
    expect(plan.updates).toBe(3);
    expect(plan.leftoverMs).toBeCloseTo(0, 6);
  });

  it('keeps a partial tick as leftover and reports how far into the next tick we are', () => {
    const plan = planUpdates(0, 1.5 * TICK_MS);
    expect(plan.updates).toBe(1);
    expect(plan.leftoverMs).toBeCloseTo(0.5 * TICK_MS, 6);
    expect(plan.alpha).toBeCloseTo(0.5, 6);
  });

  it('adds the leftover from the previous frame', () => {
    const plan = planUpdates(0.5 * TICK_MS, 0.5 * TICK_MS);
    expect(plan.updates).toBe(1);
    expect(plan.leftoverMs).toBeCloseTo(0, 6);
  });

  it('on a 120 Hz screen alternates between zero and one update', () => {
    const half = TICK_MS / 2;
    let leftover = 0;
    const counts: number[] = [];
    for (let frame = 0; frame < 6; frame++) {
      const plan = planUpdates(leftover, half);
      leftover = plan.leftoverMs;
      counts.push(plan.updates);
    }
    expect(counts).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('never runs more than the cap after a long stall, and drops the backlog', () => {
    const plan = planUpdates(0, 5000);
    expect(plan.updates).toBe(MAX_UPDATES_PER_FRAME);
    expect(plan.leftoverMs).toBe(0);
    expect(plan.alpha).toBe(0);
  });

  it('treats negative elapsed time as zero', () => {
    expect(planUpdates(0, -20).updates).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/loop.test.ts`
Expected: FAIL, `../src/engine/loop` cannot be resolved.

- [ ] **Step 3: Implement `src/engine/loop.ts`**

```ts
import { TICK_MS } from './time';

/** After a long stall (a hidden tab, a slow frame) at most this many updates run at once; the rest of the backlog is dropped. */
export const MAX_UPDATES_PER_FRAME = 5;

export interface UpdatePlan {
  /** Whole updates to run for this frame. */
  updates: number;
  /** Time carried over to the next frame. */
  leftoverMs: number;
  /** How far the picture is between the last update and the next one, from 0 up to just under 1. */
  alpha: number;
}

/** Turns real elapsed time into a number of fixed updates. Pure, so it can be tested without a clock. */
export function planUpdates(leftoverMs: number, frameMs: number): UpdatePlan {
  const total = leftoverMs + Math.max(0, frameMs);
  const due = Math.floor(total / TICK_MS + 1e-9);
  if (due > MAX_UPDATES_PER_FRAME) {
    return { updates: MAX_UPDATES_PER_FRAME, leftoverMs: 0, alpha: 0 };
  }
  const left = Math.max(0, total - due * TICK_MS);
  return { updates: due, leftoverMs: left, alpha: left / TICK_MS };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/loop.test.ts && npm run typecheck`
Expected: 7 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/loop.ts tests/loop.test.ts
git commit -m "feat: add the fixed-step update planner"
```

---

### Task 6: Controller profiles and input sampling (TDD)

**Files:**
- Create: `src/engine/input-profile.ts`
- Modify: `src/engine/input-frame.ts` (append the pending-press helpers)
- Test: `tests/input-profile.test.ts`, `tests/input-frame.test.ts`

**Interfaces:**
- Consumes: `InputFrame`, `NO_INPUT` from `src/engine/input-frame.ts`.
- Produces: from `input-frame.ts`: `PendingPresses { jump; attack; dash }`, `NO_PRESSES`, `addPresses(pending, input)`, `applyPresses(input, pending)`. From `input-profile.ts`: `PadLike`, `ControllerProfile`, `SN30_PRO_ID`, `SN30_PRO_PROFILE`, `STANDARD_PROFILE`, `ProfileSelection`, `selectProfile(id, mapping)`, `HeldButtons`, `NOTHING_HELD`, `sampleInput(pad, profile, previous, deadZone)`.

- [ ] **Step 1: Write the failing tests**

`tests/input-frame.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NO_INPUT, NO_PRESSES, addPresses, applyPresses } from '../src/engine/input-frame';

describe('pending presses', () => {
  it('remember a press seen on a frame that ran no update', () => {
    const pressed = { ...NO_INPUT, jumpPressed: true };
    const later = { ...NO_INPUT };
    const pending = addPresses(addPresses(NO_PRESSES, pressed), later);
    expect(pending).toEqual({ jump: true, attack: false, dash: false });
  });

  it('are applied onto the input of the update that runs, keeping the rest', () => {
    const input = { ...NO_INPUT, moveX: -1, jumpHeld: true };
    const applied = applyPresses(input, { jump: true, attack: false, dash: true });
    expect(applied).toEqual({
      ...NO_INPUT,
      moveX: -1,
      jumpHeld: true,
      jumpPressed: true,
      attackPressed: false,
      dashPressed: true,
    });
  });
});
```

`tests/input-profile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  NOTHING_HELD,
  SN30_PRO_ID,
  SN30_PRO_PROFILE,
  STANDARD_PROFILE,
  sampleInput,
  selectProfile,
  type PadLike,
} from '../src/engine/input-profile';

/** A pad with 16 buttons and 4 axes, with the listed buttons down and the given axis values. */
function pad(down: number[] = [], axes: number[] = [0, 0, 0, 0], mapping = 'standard'): PadLike {
  return {
    id: SN30_PRO_ID,
    mapping,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })),
    axes,
  };
}

const sample = (p: PadLike, profile = SN30_PRO_PROFILE, held = NOTHING_HELD) =>
  sampleInput(p, profile, held, 0.25);

describe('SN30 Pro profile (X-input on Android)', () => {
  it('maps bottom to jump and confirm', () => {
    const { input } = sample(pad([0]));
    expect(input.jumpPressed).toBe(true);
    expect(input.jumpHeld).toBe(true);
    expect(input.confirm).toBe(true);
  });

  it('maps left to attack, right shoulder to dash and top to alt', () => {
    expect(sample(pad([3])).input.attackPressed).toBe(true);
    expect(sample(pad([9])).input.dashPressed).toBe(true);
    expect(sample(pad([4])).input.alt).toBe(true);
  });

  it('ignores buttons 6 and 7 completely, which sit at half value at rest', () => {
    const { input } = sample(pad([6, 7]));
    expect(input).toEqual({
      moveX: 0,
      jumpHeld: false,
      jumpPressed: false,
      attackPressed: false,
      dashPressed: false,
      confirm: false,
      alt: false,
    });
  });

  it('ignores buttons that have no action (2, 10, 11 and the d-pad up and down)', () => {
    const { input } = sample(pad([2, 10, 11, 12, 13]));
    expect(input.moveX).toBe(0);
    expect(input.jumpHeld).toBe(false);
  });

  it('moves with the d-pad', () => {
    expect(sample(pad([15])).input.moveX).toBe(1);
    expect(sample(pad([14])).input.moveX).toBe(-1);
    expect(sample(pad([14, 15])).input.moveX).toBe(0);
  });
});

describe('the left stick', () => {
  it('counts as full speed beyond the dead zone, like the d-pad', () => {
    expect(sample(pad([], [0.3, 0, 0, 0])).input.moveX).toBe(1);
    expect(sample(pad([], [-0.9, 0, 0, 0])).input.moveX).toBe(-1);
  });

  it('is ignored inside the dead zone', () => {
    expect(sample(pad([], [0.2, 0, 0, 0])).input.moveX).toBe(0);
    expect(sample(pad([], [-0.03, 0.03, 0, 0])).input.moveX).toBe(0);
  });

  it('gives way to the d-pad when both are used', () => {
    expect(sample(pad([14], [1, 0, 0, 0])).input.moveX).toBe(-1);
  });
});

describe('press edges', () => {
  it('reports a press only on the update where the button went down', () => {
    const first = sample(pad([0]));
    expect(first.input.jumpPressed).toBe(true);
    const second = sampleInput(pad([0]), SN30_PRO_PROFILE, first.held, 0.25);
    expect(second.input.jumpPressed).toBe(false);
    expect(second.input.jumpHeld).toBe(true);
    expect(second.held.jump).toBe(true);
  });
});

describe('the standard profile', () => {
  it('uses bottom, left, top and the right shoulder at their standard numbers', () => {
    expect(sampleInput(pad([0]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.jumpPressed).toBe(true);
    expect(sampleInput(pad([2]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.attackPressed).toBe(true);
    expect(sampleInput(pad([5]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.dashPressed).toBe(true);
    expect(sampleInput(pad([3]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.alt).toBe(true);
  });
});

describe('selectProfile', () => {
  it('picks the SN30 Pro profile by its exact id', () => {
    expect(selectProfile(SN30_PRO_ID, 'standard')).toEqual({
      kind: 'profile',
      profile: SN30_PRO_PROFILE,
    });
  });

  it('falls back to the standard profile for an unknown pad that reports a standard layout', () => {
    expect(selectProfile('146b-0609-Generic X-Box pad', 'standard')).toEqual({
      kind: 'profile',
      profile: STANDARD_PROFILE,
    });
  });

  it('refuses an unknown pad with a non-standard layout instead of guessing', () => {
    expect(selectProfile('Some Pad', '')).toEqual({ kind: 'unsupported', id: 'Some Pad' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/input-frame.test.ts tests/input-profile.test.ts`
Expected: FAIL (`NO_PRESSES` is not exported; `input-profile` cannot be resolved).

- [ ] **Step 3: Append the pending-press helpers to `src/engine/input-frame.ts`**

Add at the end of the file:
```ts

/** Presses seen on a frame but not yet used by an update (a 120 Hz screen has frames with no update). */
export interface PendingPresses {
  jump: boolean;
  attack: boolean;
  dash: boolean;
}

export const NO_PRESSES: PendingPresses = { jump: false, attack: false, dash: false };

/** Remembers any press in `input` until an update uses it. */
export function addPresses(pending: PendingPresses, input: InputFrame): PendingPresses {
  return {
    jump: pending.jump || input.jumpPressed,
    attack: pending.attack || input.attackPressed,
    dash: pending.dash || input.dashPressed,
  };
}

/** The input for the update that runs: the latest held state and movement, with the remembered presses. */
export function applyPresses(input: InputFrame, pending: PendingPresses): InputFrame {
  return {
    ...input,
    jumpPressed: pending.jump,
    attackPressed: pending.attack,
    dashPressed: pending.dash,
  };
}
```

- [ ] **Step 4: Create `src/engine/input-profile.ts`**

```ts
import { NO_INPUT, type InputFrame } from './input-frame';

/** The part of a browser Gamepad the game reads. The real `Gamepad` satisfies it. */
export interface PadLike {
  readonly id: string;
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: ReadonlyArray<number>;
}

/** Which physical button numbers do which action. Measured values are in docs/controllers.md. */
export interface ControllerProfile {
  name: string;
  jump: number;
  attack: number;
  dash: number;
  alt: number;
  dpadLeft: number;
  dpadRight: number;
  /** Axis number of the left stick, sideways. */
  stickX: number;
}

export const SN30_PRO_ID = '8Bitdo SN30 Pro (STANDARD GAMEPAD Vendor: 045e Product: 02e0)';

/** 8BitDo SN30 Pro in X-input mode on Android Chrome. Buttons 6 and 7 and the right stick are deliberately unused. */
export const SN30_PRO_PROFILE: ControllerProfile = {
  name: '8BitDo SN30 Pro',
  jump: 0,
  attack: 3,
  dash: 9,
  alt: 4,
  dpadLeft: 14,
  dpadRight: 15,
  stickX: 0,
};

/** The standard layout, for pads whose browser reports `mapping: standard` and that have no profile of their own. */
export const STANDARD_PROFILE: ControllerProfile = {
  name: 'Standard layout',
  jump: 0,
  attack: 2,
  dash: 5,
  alt: 3,
  dpadLeft: 14,
  dpadRight: 15,
  stickX: 0,
};

export type ProfileSelection =
  | { kind: 'profile'; profile: ControllerProfile }
  | { kind: 'unsupported'; id: string };

const KNOWN: ReadonlyArray<{ id: string; profile: ControllerProfile }> = [
  { id: SN30_PRO_ID, profile: SN30_PRO_PROFILE },
];

/** Picks the profile for a pad by its full id text; never guesses for an unknown non-standard layout. */
export function selectProfile(id: string, mapping: string): ProfileSelection {
  const known = KNOWN.find((entry) => entry.id === id);
  if (known) return { kind: 'profile', profile: known.profile };
  if (mapping === 'standard') return { kind: 'profile', profile: STANDARD_PROFILE };
  return { kind: 'unsupported', id };
}

export interface HeldButtons {
  jump: boolean;
  attack: boolean;
  dash: boolean;
  alt: boolean;
}

export const NOTHING_HELD: HeldButtons = { jump: false, attack: false, dash: false, alt: false };

const isDown = (pad: PadLike, index: number): boolean => pad.buttons[index]?.pressed ?? false;

/** Reads the pad once through a profile. `previous` is what was held on the last read, to find new presses. */
export function sampleInput(
  pad: PadLike,
  profile: ControllerProfile,
  previous: HeldButtons,
  deadZone: number,
): { input: InputFrame; held: HeldButtons } {
  const held: HeldButtons = {
    jump: isDown(pad, profile.jump),
    attack: isDown(pad, profile.attack),
    dash: isDown(pad, profile.dash),
    alt: isDown(pad, profile.alt),
  };
  const dpad = (isDown(pad, profile.dpadRight) ? 1 : 0) - (isDown(pad, profile.dpadLeft) ? 1 : 0);
  const stick = pad.axes[profile.stickX] ?? 0;
  const stickDirection = Math.abs(stick) < deadZone ? 0 : stick > 0 ? 1 : -1;

  const input: InputFrame = {
    ...NO_INPUT,
    moveX: dpad !== 0 ? dpad : stickDirection,
    jumpHeld: held.jump,
    jumpPressed: held.jump && !previous.jump,
    attackPressed: held.attack && !previous.attack,
    dashPressed: held.dash && !previous.dash,
    confirm: held.jump && !previous.jump,
    alt: held.alt && !previous.alt,
  };
  return { input, held };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/input-profile.ts src/engine/input-frame.ts tests/input-profile.test.ts tests/input-frame.test.ts
git commit -m "feat: add controller profiles and input sampling"
```

---

### Task 7: Feedback, viewport, drawing and sound

**Files:**
- Create: `src/ui/feedback.ts`, `src/ui/render.ts`, `src/ui/audio.ts`
- Test: `tests/feedback.test.ts`, `tests/viewport.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `GameState` (Task 1), `FEEDBACK`, `WORLD`, `PLAYER`, `DUMMY` (Task 1), `attackActive`, `attackBox`, `sweepBox` (Tasks 3, 4).
- Produces: from `feedback.ts`: `FeedbackState`, `NO_FEEDBACK`, `freezeFor(events)`, `applyEvents(fb, events)`, `advanceFeedback(fb)`, `shakeOffset(fb)`. From `render.ts`: `Viewport`, `computeViewport(w, h)`, `drawFrame(ctx, canvasW, canvasH, state, alpha, feedback)`. From `audio.ts`: `Sound { unlock(): void; play(events: readonly GameEvent[]): void }`, `createSound(): Sound`.

`drawFrame` and `createSound` need a browser (canvas, audio) and have no unit tests; they are checked by typecheck, build, and the owner's play test. The pure parts are tested.

- [ ] **Step 1: Write the failing tests**

`tests/feedback.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../src/game/params';
import {
  NO_FEEDBACK,
  advanceFeedback,
  applyEvents,
  freezeFor,
  shakeOffset,
} from '../src/ui/feedback';

describe('freezeFor', () => {
  it('freezes 4 updates when the dummy is hit and 8 when the player is hurt', () => {
    expect(freezeFor(['dummyHit'])).toBe(FEEDBACK.freezeOnDummyHit);
    expect(freezeFor(['playerHit'])).toBe(FEEDBACK.freezeOnPlayerHit);
    expect(FEEDBACK.freezeOnDummyHit).toBe(4);
    expect(FEEDBACK.freezeOnPlayerHit).toBe(8);
  });

  it('takes the longer freeze when both happen at once, and none for other events', () => {
    expect(freezeFor(['dummyHit', 'playerHit'])).toBe(8);
    expect(freezeFor(['dash', 'dummyWindup'])).toBe(0);
    expect(freezeFor([])).toBe(0);
  });
});

describe('applyEvents', () => {
  it('starts the shake and the dummy flash when the dummy is hit', () => {
    const fb = applyEvents(NO_FEEDBACK, ['dummyHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.dummyFlashTicks).toBe(FEEDBACK.dummyFlashTicks);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('starts the shake and the player flash when the player is hurt', () => {
    const fb = applyEvents(NO_FEEDBACK, ['playerHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.playerFlashTicks).toBe(FEEDBACK.playerFlashTicks);
    expect(fb.dummyFlashTicks).toBe(0);
  });

  it('does not change anything for other events and does not modify its input', () => {
    const before = { ...NO_FEEDBACK };
    expect(applyEvents(before, ['dash'])).toEqual(NO_FEEDBACK);
    expect(before).toEqual(NO_FEEDBACK);
  });
});

describe('advanceFeedback', () => {
  it('counts every effect down by one and stops at zero', () => {
    const fb = advanceFeedback({ shakeTicks: 2, dummyFlashTicks: 1, playerFlashTicks: 0 });
    expect(fb).toEqual({ shakeTicks: 1, dummyFlashTicks: 0, playerFlashTicks: 0 });
    expect(advanceFeedback(fb).shakeTicks).toBe(0);
    expect(advanceFeedback(advanceFeedback(fb)).shakeTicks).toBe(0);
  });
});

describe('shakeOffset', () => {
  it('is zero without a shake', () => {
    expect(shakeOffset(NO_FEEDBACK)).toBe(0);
  });

  it('starts at the full amplitude, alternates sides and fades out', () => {
    const start = shakeOffset({ ...NO_FEEDBACK, shakeTicks: FEEDBACK.shakeTicks });
    expect(Math.abs(start)).toBeCloseTo(FEEDBACK.shakeAmplitude, 6);
    const next = shakeOffset({ ...NO_FEEDBACK, shakeTicks: FEEDBACK.shakeTicks - 1 });
    expect(Math.sign(next)).toBe(-Math.sign(start));
    expect(Math.abs(next)).toBeLessThan(Math.abs(start));
    expect(Math.abs(shakeOffset({ ...NO_FEEDBACK, shakeTicks: 1 }))).toBeLessThan(1);
  });
});
```

`tests/viewport.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeViewport } from '../src/ui/render';

describe('computeViewport', () => {
  it('uses the whole screen when it is exactly 16:9', () => {
    expect(computeViewport(1280, 720)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('adds side bars on a wider screen such as the S21 in landscape', () => {
    const view = computeViewport(2400, 1080);
    expect(view.scale).toBeCloseTo(1.5, 6);
    expect(view.offsetX).toBeCloseTo(240, 6);
    expect(view.offsetY).toBeCloseTo(0, 6);
  });

  it('adds top and bottom bars on a taller screen', () => {
    const view = computeViewport(640, 720);
    expect(view.scale).toBeCloseTo(0.5, 6);
    expect(view.offsetX).toBeCloseTo(0, 6);
    expect(view.offsetY).toBeCloseTo(180, 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/feedback.test.ts tests/viewport.test.ts`
Expected: FAIL, `../src/ui/feedback` cannot be resolved.

- [ ] **Step 3: Create `src/ui/feedback.ts`**

```ts
import { FEEDBACK } from '../game/params';
import type { GameEvent } from '../game/state';

/** Effect timers that only exist for the eyes: they never feed back into the simulation. */
export interface FeedbackState {
  shakeTicks: number;
  dummyFlashTicks: number;
  playerFlashTicks: number;
}

export const NO_FEEDBACK: FeedbackState = { shakeTicks: 0, dummyFlashTicks: 0, playerFlashTicks: 0 };

/** How many updates the loop should hold still after these events (the longest one wins). */
export function freezeFor(events: readonly GameEvent[]): number {
  let freeze = 0;
  for (const event of events) {
    if (event === 'dummyHit') freeze = Math.max(freeze, FEEDBACK.freezeOnDummyHit);
    if (event === 'playerHit') freeze = Math.max(freeze, FEEDBACK.freezeOnPlayerHit);
  }
  return freeze;
}

export function applyEvents(fb: FeedbackState, events: readonly GameEvent[]): FeedbackState {
  const next = { ...fb };
  for (const event of events) {
    if (event === 'dummyHit') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.dummyFlashTicks = FEEDBACK.dummyFlashTicks;
    }
    if (event === 'playerHit') {
      next.shakeTicks = FEEDBACK.shakeTicks;
      next.playerFlashTicks = FEEDBACK.playerFlashTicks;
    }
  }
  return next;
}

/** Called once per real 60th of a second, including during a freeze, so effects fade in real time. */
export function advanceFeedback(fb: FeedbackState): FeedbackState {
  return {
    shakeTicks: Math.max(0, fb.shakeTicks - 1),
    dummyFlashTicks: Math.max(0, fb.dummyFlashTicks - 1),
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

- [ ] **Step 4: Create `src/ui/render.ts`**

```ts
import { attackActive, attackBox, sweepBox } from '../game/geometry';
import { DUMMY, PLAYER, WORLD } from '../game/params';
import type { DummyPhase, GameState } from '../game/state';
import { shakeOffset, type FeedbackState } from './feedback';

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fits the fixed 16:9 world into the canvas as large as possible and centres it, leaving bars where the screen is wider or taller. */
export function computeViewport(canvasWidth: number, canvasHeight: number): Viewport {
  const scale = Math.min(canvasWidth / WORLD.width, canvasHeight / WORLD.height);
  return {
    scale,
    offsetX: (canvasWidth - WORLD.width * scale) / 2,
    offsetY: (canvasHeight - WORLD.height * scale) / 2,
  };
}

const COLORS = {
  bars: '#000000',
  arena: '#12121a',
  floor: '#2a2a3a',
  floorLine: '#8a8aa0',
  player: '#e8e8f0',
  playerDash: '#7fd6ff',
  playerHurt: '#ff3b3b',
  dummyIdle: '#5a6b8c',
  dummyWindup: '#f5a742',
  dummySweep: '#e0403a',
  dummyRecovery: '#7a6b6b',
  flash: '#ffffff',
  slash: '#ffffff',
  hud: '#e8e8f0',
  hudBack: '#3a3a4a',
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const dummyColor = (phase: DummyPhase): string => {
  switch (phase) {
    case 'windup':
      return COLORS.dummyWindup;
    case 'sweep':
      return COLORS.dummySweep;
    case 'recovery':
      return COLORS.dummyRecovery;
    case 'idle':
      return COLORS.dummyIdle;
  }
};

function drawDummy(ctx: CanvasRenderingContext2D, state: GameState, feedback: FeedbackState): void {
  const d = state.dummy;
  // During the warning the dummy pulls back, away from the side it will sweep to.
  const pullBack = d.phase === 'windup' ? -d.facing * 14 * (d.phaseTick / DUMMY.sweep.windup) : 0;
  ctx.fillStyle = feedback.dummyFlashTicks > 0 ? COLORS.flash : dummyColor(d.phase);
  ctx.fillRect(
    d.x - DUMMY.width / 2 + pullBack,
    WORLD.floorY - DUMMY.height,
    DUMMY.width,
    DUMMY.height,
  );
  if (d.phase === 'sweep') {
    const box = sweepBox(d);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COLORS.dummySweep;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  alpha: number,
  feedback: FeedbackState,
): void {
  const p = state.player;
  const x = lerp(p.prevX, p.x, alpha);
  const y = lerp(p.prevY, p.y, alpha);
  const blinking = p.invulnerableTicks > 0 && p.dashTick < 0 && Math.floor(state.tick / 3) % 2 === 1;

  ctx.globalAlpha = blinking ? 0.35 : 1;
  ctx.fillStyle =
    feedback.playerFlashTicks > 0
      ? COLORS.playerHurt
      : p.dashTick >= 0
        ? COLORS.playerDash
        : COLORS.player;
  ctx.fillRect(x - PLAYER.width / 2, y - PLAYER.height, PLAYER.width, PLAYER.height);
  // A small notch on the side the player faces.
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(x + p.facing * (PLAYER.width / 2 - 8) - 4, y - PLAYER.height + 16, 8, 8);
  ctx.globalAlpha = 1;

  if (attackActive(p)) {
    const box = attackBox(p);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.slash;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (let i = 0; i < PLAYER.maxHealth; i++) {
    ctx.globalAlpha = i < state.player.health ? 1 : 0.25;
    ctx.fillStyle = COLORS.hud;
    ctx.fillRect(24 + i * 30, 24, 22, 22);
  }
  ctx.globalAlpha = 1;
  const width = 220;
  const left = WORLD.width - 24 - width;
  ctx.fillStyle = COLORS.hudBack;
  ctx.fillRect(left, 24, width, 14);
  ctx.fillStyle = COLORS.dummySweep;
  ctx.fillRect(left, 24, (width * state.dummy.hp) / DUMMY.maxHp, 14);
}

/** Draws one frame. `alpha` (0 to just under 1) blends the player between the last two updates. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: GameState,
  alpha: number,
  feedback: FeedbackState,
): void {
  const view = computeViewport(canvasWidth, canvasHeight);
  const shake = shakeOffset(feedback);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.bars;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.setTransform(
    view.scale,
    0,
    0,
    view.scale,
    view.offsetX + shake * view.scale,
    view.offsetY + shake * 0.5 * view.scale,
  );
  ctx.fillStyle = COLORS.arena;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, WORLD.floorY, WORLD.width, WORLD.height - WORLD.floorY);
  ctx.fillStyle = COLORS.floorLine;
  ctx.fillRect(0, WORLD.floorY, WORLD.width, 3);

  drawDummy(ctx, state, feedback);
  drawPlayer(ctx, state, alpha, feedback);
  drawHud(ctx, state);

  if (state.phase === 'defeated') {
    ctx.fillStyle = COLORS.hud;
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Defeated', WORLD.width / 2, WORLD.height / 2);
  }
}
```

- [ ] **Step 5: Create `src/ui/audio.ts`**

```ts
import type { GameEvent } from '../game/state';

export interface Sound {
  /** Browsers only allow sound after a user gesture; call this from a tap or button press. */
  unlock(): void;
  play(events: readonly GameEvent[]): void;
}

/** Simple beeps generated in code (no sound files, so nothing extra to load). */
export function createSound(): Sound {
  let context: AudioContext | null = null;

  const beep = (frequency: number, milliseconds: number, type: OscillatorType, volume: number): void => {
    if (context === null || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + milliseconds / 1000);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + milliseconds / 1000);
  };

  return {
    unlock(): void {
      try {
        context ??= new AudioContext();
        void context.resume();
      } catch {
        context = null;
      }
    },
    play(events): void {
      for (const event of events) {
        if (event === 'dummyHit') beep(220, 90, 'square', 0.15);
        if (event === 'playerHit') beep(110, 200, 'sawtooth', 0.2);
        if (event === 'dash') beep(660, 70, 'triangle', 0.1);
        if (event === 'dummyWindup') beep(440, 120, 'sine', 0.12);
        if (event === 'playerDefeated') beep(80, 500, 'sawtooth', 0.2);
      }
    },
  };
}
```

- [ ] **Step 6: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS, typecheck and build exit 0. (`render.ts` and `audio.ts` are not imported by the app yet; typecheck still checks them. If `noUnusedLocals` flags an unused import, remove it.)

- [ ] **Step 7: Commit**

```bash
git add src/ui/feedback.ts src/ui/render.ts src/ui/audio.ts tests/feedback.test.ts tests/viewport.test.ts
git commit -m "feat: add hit feedback, fixed-world drawing and generated sounds"
```

---

### Task 8: The app: start screen, fight loop, pause, controller test

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/app.ts`
- Modify: `src/ui/controller-screen.ts`, `src/ui/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 7; `mountControllerScreen` from M0.
- Produces: `el(tag, className?, text?)` from `src/ui/dom.ts`; `mountApp(root: HTMLElement): void` from `src/ui/app.ts`; `mountControllerScreen(root, onBack?)` now returns a `stop` function.

This task is browser-only code with no unit tests; it is verified by typecheck, all tests, build, the `check:dist` script, and a preview smoke check. The in-browser play check is the owner's.

- [ ] **Step 1: Create `src/ui/dom.ts`**

```ts
/** Creates an element with an optional class and text. Text is set with `textContent`, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
```

- [ ] **Step 2: Modify `src/ui/controller-screen.ts`**

Read the file first, then make exactly these changes and no others:
1. Delete the local `function el ...` definition and add `import { el } from './dom';` to the imports.
2. Change the signature to `export function mountControllerScreen(root: HTMLElement, onBack?: () => void): () => void {`.
3. Just before `root.replaceChildren(...)`, add:
   ```ts
   let running = true;
   ```
   and, if `onBack` is given, add a Back button as the last child: build `const backButton = el('button', 'action', 'Back'); backButton.type = 'button'; backButton.addEventListener('click', onBack);` and append it after the other children (for example `root.append(backButton)` right after the `root.replaceChildren(...)` call, only when `onBack` is defined).
4. In the early-return branch for a missing `navigator.getGamepads`, change `return;` to `return () => {};`.
5. At the very start of `function frame(): void {` add `if (!running) return;`.
6. Make the function end with `return () => { running = false; };` after `requestAnimationFrame(frame);`.

Nothing else in that file changes (the report, history, clipboard fallback and rendering stay as they are).

- [ ] **Step 3: Create `src/ui/app.ts`**

```ts
import {
  NO_INPUT,
  NO_PRESSES,
  addPresses,
  applyPresses,
  type InputFrame,
  type PendingPresses,
} from '../engine/input-frame';
import {
  NOTHING_HELD,
  sampleInput,
  selectProfile,
  type HeldButtons,
  type ProfileSelection,
} from '../engine/input-profile';
import { planUpdates } from '../engine/loop';
import { GAME } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState } from '../game/state';
import { createSound } from './audio';
import { mountControllerScreen } from './controller-screen';
import { el } from './dom';
import {
  NO_FEEDBACK,
  advanceFeedback,
  applyEvents,
  freezeFor,
  type FeedbackState,
} from './feedback';
import { drawFrame } from './render';

type Screen = 'start' | 'fight' | 'test';

function firstPad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) {
    if (pad !== null && pad.connected) return pad;
  }
  return null;
}

function describeController(pad: Gamepad | null, selection: ProfileSelection | null): string {
  if (pad === null || selection === null) {
    return 'No controller detected. Press a button on your controller.';
  }
  if (selection.kind === 'unsupported') {
    return `This controller (${selection.id}) has no button profile yet, so the game cannot use it. Open the controller test and send me the report.`;
  }
  return `Controller: ${selection.profile.name}`;
}

export function mountApp(root: HTMLElement): void {
  const canvas = el('canvas', 'game-canvas');
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D is not available');
  const panel = el('div', 'panel');
  const banner = el('p', 'banner');
  banner.hidden = true;
  root.replaceChildren(canvas, panel, banner);

  const sound = createSound();
  root.addEventListener('pointerdown', () => sound.unlock());

  let screen: Screen = 'start';
  let held: HeldButtons = NOTHING_HELD;
  let pending: PendingPresses = NO_PRESSES;
  let state: GameState = createInitialState();
  let feedback: FeedbackState = NO_FEEDBACK;
  let leftoverMs = 0;
  let freezeLeft = 0;
  let lastTime = performance.now();
  let paused = false;
  let stopTest: (() => void) | null = null;
  let statusLine = el('p', 'status');
  let fightButton = el('button', 'action', 'Fight the dummy');

  function setBanner(text: string | null): void {
    banner.hidden = text === null;
    if (text !== null) banner.textContent = text;
  }

  function showStart(): void {
    screen = 'start';
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
    statusLine = el('p', 'status');
    fightButton = el('button', 'action', 'Fight the dummy (bottom button)');
    fightButton.type = 'button';
    fightButton.addEventListener('click', startFight);
    const testButton = el('button', 'action', 'Controller test (top button)');
    testButton.type = 'button';
    testButton.addEventListener('click', showTest);
    panel.replaceChildren(
      el('h1', undefined, 'Boss Trainer'),
      el('p', 'hint', 'During a fight, the top button returns to this screen.'),
      fightButton,
      testButton,
      statusLine,
    );
  }

  function showTest(): void {
    screen = 'test';
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
    stopTest = mountControllerScreen(panel, () => {
      stopTest?.();
      stopTest = null;
      showStart();
    });
  }

  function startFight(): void {
    screen = 'fight';
    state = createInitialState();
    feedback = NO_FEEDBACK;
    leftoverMs = 0;
    freezeLeft = 0;
    pending = NO_PRESSES;
    paused = false;
    lastTime = performance.now();
    panel.hidden = true;
    canvas.hidden = false;
    setBanner(null);
    sound.unlock();
  }

  banner.addEventListener('click', () => {
    if (screen === 'fight' && paused) showStart();
  });

  function draw(alpha: number): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawFrame(context, width, height, state, alpha, feedback);
  }

  function runFight(now: number, selection: ProfileSelection | null, input: InputFrame): void {
    if (selection?.kind !== 'profile') {
      paused = true;
      setBanner('No usable controller. Reconnect it and press a button (or tap here to go back).');
      lastTime = now;
      draw(0);
      return;
    }
    if (input.alt) {
      showStart();
      return;
    }
    if (paused) {
      if (input.confirm || input.attackPressed || input.dashPressed) {
        paused = false;
        setBanner(null);
        pending = NO_PRESSES;
      }
      lastTime = now;
      draw(0);
      return;
    }

    pending = addPresses(pending, input);
    const plan = planUpdates(leftoverMs, now - lastTime);
    leftoverMs = plan.leftoverMs;
    lastTime = now;

    for (let i = 0; i < plan.updates; i++) {
      feedback = advanceFeedback(feedback);
      if (freezeLeft > 0) {
        freezeLeft -= 1;
        continue;
      }
      state = step(state, applyPresses(input, pending));
      pending = NO_PRESSES;
      feedback = applyEvents(feedback, state.events);
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events));
      sound.play(state.events);
    }
    draw(plan.alpha);
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (screen === 'test') {
      lastTime = now;
      return;
    }

    const pad = firstPad();
    const selection = pad === null ? null : selectProfile(pad.id, pad.mapping);
    let input = NO_INPUT;
    if (pad !== null && selection?.kind === 'profile') {
      const sampled = sampleInput(pad, selection.profile, held, GAME.deadZone);
      input = sampled.input;
      held = sampled.held;
    } else {
      held = NOTHING_HELD;
    }

    if (screen === 'start') {
      statusLine.textContent = describeController(pad, selection);
      fightButton.disabled = selection?.kind !== 'profile';
      if (selection?.kind === 'profile') {
        if (input.confirm) startFight();
        else if (input.alt) showTest();
      }
      lastTime = now;
      return;
    }
    runFight(now, selection, input);
  }

  showStart();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 4: Rewrite `src/main.ts` to start the app**

Read the file first. Replace the import and the mount call so it reads as below, keeping the service worker registration block at the end unchanged:
```ts
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountApp(root);
```
(followed by the existing `if ('serviceWorker' in navigator && import.meta.env.PROD) { ... }` block, untouched).

- [ ] **Step 5: Extend `src/ui/style.css`**

Read the file first. Change the two selectors `.copy {` and `.copy:disabled {` so they also apply to `.action`, that is `.copy,\n.action {` and `.copy:disabled,\n.action:disabled {` (keep their declarations). Then append at the end of the file:
```css

.action {
  display: block;
  width: 100%;
  max-width: 24rem;
  margin: 0.75rem 0;
  padding: 0.9rem 1.2rem;
}

.game-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  touch-action: none;
}

.banner {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  max-width: 90vw;
  margin: 0;
  padding: 0.8rem 1.2rem;
  background: var(--panel);
  border: 2px solid var(--accent);
  border-radius: 0.5rem;
  text-align: center;
}

body {
  overscroll-behavior: none;
}
```
(`display: block` is on `.action` only; the `hidden` attribute is used on the canvas, the panel and the banner, and none of those classes set `display`, so `hidden` keeps working.)

- [ ] **Step 6: Verify typecheck, tests, build and the built output**

Run: `npm run typecheck && npm test && npm run build && npm run check:dist`
Expected: everything exits 0 and `check:dist` prints `dist check ok` (the CSP, no inline code, and the precache list still hold with the new files).

- [ ] **Step 7: Smoke check the preview server**

Run in the background: `npm run preview -- --port 4173 --strictPort`, then `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:4173/` and the same for `/sw.js`, then stop the server and confirm nothing listens on 4173.
Expected: `200 text/html` and `200 application/javascript`. State clearly in your report that the in-browser play check (controller feel, drawing, sound, pause on disconnect, the start screen buttons) is NOT done and remains for the owner.

- [ ] **Step 8: Commit**

```bash
git add src/ui/dom.ts src/ui/app.ts src/ui/controller-screen.ts src/ui/style.css src/main.ts
git commit -m "feat: add the start screen, fight loop, pause and controller test switching"
```

---

### Task 9: Play-test checklist in the docs

**Files:**
- Modify: `docs/phone-testing.md`

- [ ] **Step 1: Append the M1 section to `docs/phone-testing.md`**

Read the file first, then append at the end:
```markdown

## Playing the fight (M1)
Open the app with the controller connected. The start screen shows which controller it found. Press the bottom button (or tap "Fight the dummy") to start. During a fight, the top button returns to the start screen, where you can also open the controller test.

Controls: left stick or d-pad to move, bottom button to jump (hold it for a higher jump), left button to attack, right shoulder to dash.

Try each of these and note anything that feels off:
- [ ] Moving with the stick and with the d-pad feels the same and responds at once.
- [ ] A quick tap of jump gives a small hop, holding gives a high jump.
- [ ] Attack: a short swing in front of you. Hitting the dummy makes it flash white, the screen shakes a little, and the game freezes for a moment.
- [ ] Dash: a quick burst, and you cannot dash again for a short moment.
- [ ] The dummy changes color and pulls back as a warning, then sweeps low along the floor. You can jump over it or dash through it.
- [ ] Getting hit: red flash, a short freeze, blinking for about a second. Five hits end the round and the arena restarts by itself.
- [ ] Sounds play for hits, dashes and the dummy's warning. If there is no sound, tap the screen once.
- [ ] Turn the controller off in the middle of a fight. The game pauses and says so. Turn it on and press a button to continue.
- [ ] Pressing several buttons at once (for example moving while jumping and attacking) works, and fast repeated taps are not lost.

Send me your impressions in plain words: what feels too fast, too slow, too floaty, too heavy, too easy or too hard. Every number is tunable, so "the jump is too floaty" is enough.
```

- [ ] **Step 2: Final full verification**

Run: `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`
Expected: everything exits 0 from a clean install; `git status --short` shows only `docs/phone-testing.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/phone-testing.md
git commit -m "docs: add the M1 play-test checklist"
```

---

## M1 done when

- All nine tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout.
- The controller pushes the branch, CI is green and the site is deployed (the controller does this, not the task agents).
- The owner has played it on the PC pad and on the S21 with the checklist in `docs/phone-testing.md`, and any feel changes they ask for are made in `src/game/params.ts`.

## Self-review notes

- **Spec coverage** (`docs/superpowers/specs/2026-09-20-m1-design.md`): decisions list (Tasks 1, 3, 4, 7, 8), architecture and freeze held by the loop (Tasks 5, 7, 8), modules table (all), InputFrame and profiles incl. exact-id matching, standard fallback, unsupported message, dead zone, disconnect pause (Tasks 6, 8), starting values table (Task 1 `params.ts`, used in Tasks 2 to 4), `step` order (Tasks 2 to 4), feedback (Tasks 7, 8), tests list (Tasks 2 to 7), start screen with controller test and Back (Task 8), out-of-scope items (none added), done criteria (this section).
- **Deliberate refinement of the spec:** movement is digital (a stick beyond the dead zone counts as full speed, like the d-pad), noted in Global Constraints; the design document said "-1 to 1", which this still satisfies.
- **Names used across tasks:** `updatePlayer(p, input, events)` and `step(prev, input)` (Tasks 2 to 4), `isInvulnerable`, `attackActive`, `attackBox`, `dummyBox`, `playerBox`, `sweepBox`, `overlaps` (`geometry.ts`), `planUpdates`, `MAX_UPDATES_PER_FRAME`, `TICK_MS`, `DT`, `addPresses`, `applyPresses`, `NO_PRESSES`, `selectProfile`, `sampleInput`, `NOTHING_HELD`, `freezeFor`, `applyEvents`, `advanceFeedback`, `shakeOffset`, `computeViewport`, `drawFrame`, `createSound`, `mountApp`, `mountControllerScreen`. Test helpers `withInput`, `advance`, `run` are defined in Task 2 and reused later.

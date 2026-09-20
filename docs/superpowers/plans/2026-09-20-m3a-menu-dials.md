# M3a: Menu, Difficulty Dials, Summary and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the start screen with a controller-navigable menu (boss, difficulty, Tweak, Settings), add the difficulty dials and presets that adjust the boss, show a summary after every fight, and add settings for the effects and sound, all remembered on the device.

**Architecture:** Difficulty is a pure function that turns a boss file plus a set of dial values into an adjusted, re-validated boss definition; the simulation and drawing use that copy. Each screen is a pure "model" (rows, focus, what a press does) with tests, rendered by thin browser code. A pure tracker turns the update stream into the fight summary. Settings and remembered choices go through a small storage interface so tests use memory.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Canvas 2D, Web Audio, `localStorage`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-m3-design.md` (M3a part; M3b, the stats recording and export, is a later plan). Also read `docs/superpowers/specs/2026-09-20-m2-design.md`, `docs/bosses.md`, `CLAUDE.md` and `docs/backlog.md`.

## Global Constraints

- TypeScript strict mode, `noUncheckedIndexedAccess` on (tests may use `!` on array elements), `noUnusedLocals`/`noUnusedParameters` on. No `any`. Use `import type` for type-only imports.
- **Purity:** nothing under `src/game/`, `src/bosses/` and `src/engine/` may read a clock, `Math.random`, the DOM, storage or the gamepad (input sampling functions take the pad as an argument). `step` must not mutate the state it is given. All simulation randomness comes from `nextRandom`.
- **No new dependencies.** No backend, third-party scripts or CDN code. Nothing leaves the device.
- **Strict CSP is not loosened:** no inline scripts, no `style="..."` attributes, no `innerHTML`. Write DOM with `createElement` and `textContent` (use the `el` helper in `src/ui/dom.ts`). Storage access goes through `localStorage` inside try/catch (it can throw or be empty).
- The boss file is never modified at run time: dials produce an adjusted copy. The boss stays data: no Duelist attack names or numbers in code outside `src/bosses/*.json` and tests.
- Every tunable number lives in `src/game/params.ts`, the boss files, or `src/game/difficulty.ts` (dial ranges and presets). Times are updates (60 per second), distances world units.
- **Commit messages: never add a `Co-Authored-By` line or any Claude/Anthropic attribution** (the owner's rule for this repo; it overrides any default). Do not change git config or pass `--author`. Use explicit paths with `git add`. **Never `git push`**; the controller decides when to push.
- Follow `CLAUDE.md`: do not add features that are not in this plan without asking.

## Deviation from the design document (decided while planning)
The design says the fight HUD draws the player's hearts from the player's real maximum. In M3a the player's health does not change with any dial (player traits are a later idea), so the HUD keeps using `PLAYER.maxHealth`. Everything else follows the design.

## File Structure

| File | Responsibility |
|---|---|
| `src/bosses/schema.ts`, `parse.ts`, `index.ts` | (modify) `damage` per attack; `BOSSES` and `bossById` |
| `src/game/difficulty.ts` | Dials, presets, `applyDials`, `clampDial`, `changedDials` |
| `src/game/step.ts` | (modify) attacks cost their `damage` in hits |
| `src/game/summary.ts` | Tracker that turns the update stream into a fight summary |
| `src/ui/settings.ts`, `src/ui/prefs.ts` | Settings and remembered choices, storage interface |
| `src/ui/feedback.ts`, `src/ui/audio.ts` | (modify) honour the settings |
| `src/engine/input-frame.ts`, `src/engine/input-profile.ts` | (modify) `moveY`, d-pad up and down, stick vertical |
| `src/ui/nav.ts` | One menu step per press, with repeat while held |
| `src/ui/menu-model.ts`, `tweak-model.ts`, `settings-model.ts`, `summary-text.ts` | Screen models and text (pure) |
| `src/ui/screens.ts`, `src/ui/app.ts`, `src/ui/style.css` | Browser code: rendering the models, the app shell |
| `docs/phone-testing.md`, `docs/bosses.md`, `CLAUDE.md` | Docs |
| `tests/*.test.ts` | Tests |

---

### Task 1: Attack damage in the boss format, boss list, and the difficulty dials (TDD)

**Files:**
- Modify: `src/bosses/schema.ts`, `src/bosses/parse.ts`, `src/bosses/index.ts`, `tests/boss-parse.test.ts` (append cases)
- Create: `src/game/difficulty.ts`
- Test: `tests/difficulty.test.ts`, `tests/bosses-index.test.ts`

**Interfaces:**
- Consumes: `BossDef`, `AttackDef`, `PhaseDef`, `parseBoss`, `EMBER_DUELIST`, `nextRandom`.
- Produces: `AttackDef.damage: number` (whole number, at least 1, default 1 when absent in a file); `BOSSES: readonly BossDef[]`, `bossById(id): BossDef` (falls back to the Duelist); from `difficulty.ts`: `DialId`, `Dials`, `DialDef`, `DIALS`, `NORMAL_DIALS`, `PresetId`, `Preset`, `PRESETS`, `clampDial(id, value): number`, `dialsEqual(a, b): boolean`, `changedDials(base, dials): DialId[]`, `applyDials(boss: BossDef, dials: Dials): BossDef`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/boss-parse.test.ts` (inside the file, after the existing describes; reuse its `copy` and `rejects` helpers):
```ts
describe('attack damage', () => {
  it('defaults to 1 hit when a file does not say', () => {
    expect(EMBER_DUELIST.attacks.every((a) => a.damage === 1)).toBe(true);
  });

  it('accepts a whole number of hits', () => {
    const b = copy();
    b.attacks[0]!.damage = 3;
    expect(parseBoss(b).attacks[0]!.damage).toBe(3);
  });

  it('rejects zero, negative and fractional damage', () => {
    for (const bad of [0, -1, 1.5]) {
      const b = copy();
      b.attacks[0]!.damage = bad;
      rejects(b, 'boss.attacks[0].damage');
    }
  });
});
```

`tests/bosses-index.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BOSSES, EMBER_DUELIST, bossById } from '../src/bosses';

describe('the boss list', () => {
  it('lists the Ember Duelist', () => {
    expect(BOSSES).toContain(EMBER_DUELIST);
    expect(BOSSES.map((b) => b.id)).toEqual(['ember-duelist']);
  });

  it('finds a boss by id and falls back to the first boss for an unknown id', () => {
    expect(bossById('ember-duelist')).toBe(EMBER_DUELIST);
    expect(bossById('nobody')).toBe(BOSSES[0]);
  });
});
```

`tests/difficulty.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import {
  DIALS,
  NORMAL_DIALS,
  PRESETS,
  applyDials,
  changedDials,
  clampDial,
  dialsEqual,
  type Dials,
} from '../src/game/difficulty';
import { nextRandom } from '../src/game/rng';
import { DUELIST } from './helpers';

const only = (over: Partial<Dials>): Dials => ({ ...NORMAL_DIALS, ...over });

function randomDials(seed: number): Dials {
  let state = seed;
  const out: Record<string, number> = {};
  for (const dial of DIALS) {
    const next = nextRandom(state);
    state = next.state;
    out[dial.id] = clampDial(dial.id, dial.min + next.value * (dial.max - dial.min));
  }
  return out as Dials;
}

describe('the dial definitions', () => {
  it('cover exactly the seven dials the owner asked for, each containing 1 in its range', () => {
    expect(DIALS.map((d) => d.id)).toEqual([
      'speed',
      'frequency',
      'readability',
      'health',
      'damage',
      'range',
      'variety',
    ]);
    for (const d of DIALS) {
      expect(d.min).toBeLessThanOrEqual(1);
      expect(d.max).toBeGreaterThanOrEqual(1);
      expect(d.step).toBeGreaterThan(0);
    }
    expect(NORMAL_DIALS).toEqual(Object.fromEntries(DIALS.map((d) => [d.id, 1])));
  });

  it('have three presets, and every preset value lies inside its dial range', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['easy', 'normal', 'hard']);
    expect(PRESETS[1]!.dials).toEqual(NORMAL_DIALS);
    for (const preset of PRESETS) {
      for (const d of DIALS) {
        expect(preset.dials[d.id]).toBeGreaterThanOrEqual(d.min);
        expect(preset.dials[d.id]).toBeLessThanOrEqual(d.max);
      }
    }
  });
});

describe('clampDial, dialsEqual and changedDials', () => {
  it('clamps to the range and snaps to the step', () => {
    expect(clampDial('speed', 5)).toBe(1.4);
    expect(clampDial('speed', 0)).toBe(0.7);
    expect(clampDial('speed', 1.234)).toBe(1.25);
    expect(clampDial('damage', 2.4)).toBe(2);
    expect(clampDial('frequency', 1.04)).toBe(1);
  });

  it('compares dial sets and lists what changed', () => {
    expect(dialsEqual(NORMAL_DIALS, { ...NORMAL_DIALS })).toBe(true);
    expect(dialsEqual(NORMAL_DIALS, only({ health: 1.1 }))).toBe(false);
    expect(changedDials(NORMAL_DIALS, only({ health: 1.1, damage: 2 }))).toEqual(['health', 'damage']);
    expect(changedDials(NORMAL_DIALS, NORMAL_DIALS)).toEqual([]);
  });
});

describe('applyDials', () => {
  it('changes nothing at the Normal dials', () => {
    expect(applyDials(DUELIST, NORMAL_DIALS)).toEqual(DUELIST);
  });

  it('never modifies the boss it is given', () => {
    const before = JSON.stringify(DUELIST);
    applyDials(DUELIST, PRESETS[2]!.dials);
    expect(JSON.stringify(DUELIST)).toBe(before);
  });

  it.each(PRESETS)('gives a valid boss for the $label preset', ({ dials }) => {
    expect(() => applyDials(DUELIST, dials)).not.toThrow();
  });

  it('gives a valid boss at both ends of every dial, together, and for many random mixes', () => {
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(() => applyDials(DUELIST, only({ [dial.id]: value }))).not.toThrow();
      }
    }
    const lows = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highs = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(DUELIST, lows)).not.toThrow();
    expect(() => applyDials(DUELIST, highs)).not.toThrow();
    for (let seed = 1; seed <= 200; seed++) {
      expect(() => applyDials(DUELIST, randomDials(seed))).not.toThrow();
    }
  });

  it('speed scales walking and moves and shortens recovery', () => {
    const fast = applyDials(DUELIST, only({ speed: 1.2 }));
    DUELIST.phases.forEach((p, i) => {
      expect(fast.phases[i]!.walkSpeed).toBeCloseTo(p.walkSpeed * 1.2, 6);
      expect(fast.phases[i]!.retreatSpeed).toBeCloseTo(p.retreatSpeed * 1.2, 6);
    });
    DUELIST.attacks.forEach((a, i) => {
      expect(fast.attacks[i]!.recovery).toBe(Math.round(a.recovery / 1.2));
      if (a.move) expect(fast.attacks[i]!.move!.speed).toBeCloseTo(a.move.speed * 1.2, 6);
    });
  });

  it('frequency divides the pause between attacks', () => {
    const often = applyDials(DUELIST, only({ frequency: 2 }));
    DUELIST.phases.forEach((p, i) => expect(often.phases[i]!.gap).toBe(Math.round(p.gap / 2)));
  });

  it('readability scales every warning and shifts hit windows and moves with it', () => {
    const easier = applyDials(DUELIST, only({ readability: 1.5 }));
    DUELIST.attacks.forEach((a, i) => {
      const b = easier.attacks[i]!;
      const windup = Math.round(a.windup * 1.5);
      const shift = windup - a.windup;
      expect(b.windup).toBe(windup);
      expect(b.active).toBe(a.active);
      b.hits.forEach((hit, j) => {
        expect(hit.from).toBe(a.hits[j]!.from + shift);
        expect(hit.to).toBe(a.hits[j]!.to + shift);
      });
      if (a.move) {
        expect(b.move!.from).toBe(a.move.from + shift);
        expect(b.move!.to).toBe(a.move.to + shift);
      }
    });
  });

  it('readability never shortens a counterable warning below the counter window', () => {
    const wide: BossDef = { ...DUELIST, counter: { ...DUELIST.counter, window: 25 } };
    const hard = applyDials(wide, only({ readability: 0.6 }));
    expect(hard.attacks.find((a) => a.id === 'slam')!.windup).toBe(25);
    expect(hard.attacks.find((a) => a.id === 'sweep')!.windup).toBe(
      Math.round(DUELIST.attacks.find((a) => a.id === 'sweep')!.windup * 0.6),
    );
  });

  it('health scales the boss health, rounded, never below 1', () => {
    expect(applyDials(DUELIST, only({ health: 1.4 })).maxHp).toBe(Math.round(DUELIST.maxHp * 1.4));
    expect(applyDials(DUELIST, only({ health: 0.5 })).maxHp).toBe(Math.round(DUELIST.maxHp * 0.5));
  });

  it('damage scales what every attack costs, at least 1', () => {
    expect(applyDials(DUELIST, only({ damage: 2 })).attacks.every((a) => a.damage === 2)).toBe(true);
    expect(applyDials(DUELIST, only({ damage: 3 })).attacks.every((a) => a.damage === 3)).toBe(true);
  });

  it('range scales the reach of the hit windows and the distance attacks start from, keeping the burst continuous', () => {
    const far = applyDials(DUELIST, only({ range: 1.2 }));
    DUELIST.attacks.forEach((a, i) => {
      const b = far.attacks[i]!;
      expect(b.range.min).toBeCloseTo(a.range.min * 1.2, 6);
      expect(b.range.max).toBeCloseTo(a.range.max * 1.2, 6);
      b.hits.forEach((hit, j) => {
        expect(hit.x0).toBeCloseTo(a.hits[j]!.x0 * 1.2, 6);
        expect(hit.x1).toBeCloseTo(a.hits[j]!.x1 * 1.2, 6);
      });
    });
    const burst = far.attacks.find((a) => a.id === 'burst')!;
    for (let i = 1; i < burst.hits.length; i++) {
      expect(burst.hits[i]!.x0).toBeCloseTo(burst.hits[i - 1]!.x1, 6);
    }
  });

  it('variety keeps the most frequent attacks of each phase, at least one', () => {
    const fewer = applyDials(DUELIST, only({ variety: 0.65 }));
    DUELIST.phases.forEach((p, i) => {
      const kept = fewer.phases[i]!.attacks;
      expect(kept).toHaveLength(Math.max(1, Math.round(p.attacks.length * 0.65)));
      const removed = p.attacks.filter((a) => !kept.some((k) => k.id === a.id));
      const lowestKept = Math.min(...kept.map((k) => k.weight));
      for (const r of removed) expect(r.weight).toBeLessThanOrEqual(lowestKept);
      // The kept attacks stay in their original order.
      const order = p.attacks.map((a) => a.id).filter((id) => kept.some((k) => k.id === id));
      expect(kept.map((k) => k.id)).toEqual(order);
    });
    const minimal = applyDials(DUELIST, only({ variety: 0.5 }));
    expect(minimal.phases.every((p) => p.attacks.length >= 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/boss-parse.test.ts tests/bosses-index.test.ts tests/difficulty.test.ts`
Expected: FAIL (no `damage` field, no `BOSSES`, no `difficulty` module).

- [ ] **Step 3: Add damage to the format and the boss list**

In `src/bosses/schema.ts`, inside `AttackDef` add after `class: AttackClass;`:
```ts
  /** How many of the player's hits this attack costs when it lands (a whole number, 1 when a file does not say). */
  damage: number;
```
In `src/bosses/parse.ts`, in `attack()` add to the object literal `def` (after `class: cls,`):
```ts
    damage:
      o.damage === undefined ? 1 : num(o.damage, `${path}.damage`, { min: 1, integer: true }),
```
Replace `src/bosses/index.ts` with:
```ts
import raw from './ember-duelist.json';
import { parseBoss } from './parse';
import type { BossDef } from './schema';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);

/** Every boss the menu offers, in menu order. */
export const BOSSES: readonly BossDef[] = [EMBER_DUELIST];

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}
```

- [ ] **Step 4: Create `src/game/difficulty.ts`**

```ts
import { parseBoss } from '../bosses/parse';
import type { AttackDef, BossDef, PhaseDef } from '../bosses/schema';

/** The things that make a boss harder or easier. Each is a number where 1 is the boss file as written. */
export type DialId =
  | 'speed'
  | 'frequency'
  | 'readability'
  | 'health'
  | 'damage'
  | 'range'
  | 'variety';

export type Dials = Record<DialId, number>;

export interface DialDef {
  id: DialId;
  label: string;
  /** One line in plain language for the Tweak screen. */
  help: string;
  min: number;
  max: number;
  step: number;
}

export const DIALS: readonly DialDef[] = [
  {
    id: 'speed',
    label: 'Speed',
    help: 'How fast the boss moves, and how quickly it recovers after an attack.',
    min: 0.7,
    max: 1.4,
    step: 0.05,
  },
  {
    id: 'frequency',
    label: 'Attack frequency',
    help: 'How often the boss attacks. Higher means shorter pauses between attacks.',
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  {
    id: 'readability',
    label: 'Warning length',
    help: 'How long you get to read an attack before it lands. Lower is harder.',
    min: 0.6,
    max: 1.6,
    step: 0.05,
  },
  {
    id: 'health',
    label: 'Boss health',
    help: 'How much it takes to beat the boss.',
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  {
    id: 'damage',
    label: 'Damage',
    help: 'How many of your hits each attack costs.',
    min: 1,
    max: 3,
    step: 1,
  },
  {
    id: 'range',
    label: 'Attack range',
    help: 'How far the attacks reach, and how far away the boss starts them.',
    min: 0.8,
    max: 1.2,
    step: 0.05,
  },
  {
    id: 'variety',
    label: 'Variety',
    help: 'How many different attacks the boss uses. Lower means fewer kinds.',
    min: 0.5,
    max: 1,
    step: 0.05,
  },
];

export const NORMAL_DIALS: Dials = {
  speed: 1,
  frequency: 1,
  readability: 1,
  health: 1,
  damage: 1,
  range: 1,
  variety: 1,
};

export type PresetId = 'easy' | 'normal' | 'hard';

export interface Preset {
  id: PresetId;
  label: string;
  dials: Dials;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'easy',
    label: 'Easy',
    dials: {
      speed: 0.85,
      frequency: 0.7,
      readability: 1.3,
      health: 0.7,
      damage: 1,
      range: 0.9,
      variety: 0.65,
    },
  },
  { id: 'normal', label: 'Normal', dials: NORMAL_DIALS },
  {
    id: 'hard',
    label: 'Hard',
    dials: {
      speed: 1.15,
      frequency: 1.4,
      readability: 0.8,
      health: 1.4,
      damage: 2,
      range: 1.1,
      variety: 1,
    },
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Keeps a dial value inside its range and on its step (so repeated tweaks never drift). */
export function clampDial(id: DialId, value: number): number {
  const def = DIALS.find((d) => d.id === id);
  if (def === undefined) return value;
  const clamped = Math.min(def.max, Math.max(def.min, value));
  return round2(Math.round((clamped - def.min) / def.step) * def.step + def.min);
}

export function dialsEqual(a: Dials, b: Dials): boolean {
  return DIALS.every((d) => Math.abs(a[d.id] - b[d.id]) < 1e-9);
}

/** The dials whose value differs from `base` (in dial order). */
export function changedDials(base: Dials, dials: Dials): DialId[] {
  return DIALS.filter((d) => Math.abs(base[d.id] - dials[d.id]) >= 1e-9).map((d) => d.id);
}

const atLeastOne = (n: number): number => Math.max(1, Math.round(n));

function adjustAttack(attack: AttackDef, boss: BossDef, d: Dials): AttackDef {
  // A counterable attack keeps at least the counter window, or it could never be countered.
  const floor = attack.class === 'counterable' ? boss.counter.window : 1;
  const windup = Math.max(floor, Math.round(attack.windup * d.readability));
  // Hit windows and moves are timed from the start of the attack, so they move with the warning.
  const shift = windup - attack.windup;
  const next: AttackDef = {
    ...attack,
    windup,
    recovery: Math.round(attack.recovery / d.speed),
    damage: atLeastOne(attack.damage * d.damage),
    range: { min: attack.range.min * d.range, max: attack.range.max * d.range },
    hits: attack.hits.map((hit) => ({
      ...hit,
      from: hit.from + shift,
      to: hit.to + shift,
      x0: hit.x0 * d.range,
      x1: hit.x1 * d.range,
    })),
  };
  if (attack.move !== undefined) {
    next.move = {
      from: attack.move.from + shift,
      to: attack.move.to + shift,
      speed: attack.move.speed * d.speed,
    };
  }
  return next;
}

function adjustPhase(phase: PhaseDef, d: Dials): PhaseDef {
  const keep = atLeastOne(phase.attacks.length * d.variety);
  // Keep the most frequent attacks (ties keep list order), then put them back in list order.
  const kept = phase.attacks
    .map((attack, index) => ({ attack, index }))
    .sort((a, b) => b.attack.weight - a.attack.weight || a.index - b.index)
    .slice(0, keep)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.attack);
  return {
    ...phase,
    attacks: kept,
    gap: Math.max(0, Math.round(phase.gap / d.frequency)),
    walkSpeed: phase.walkSpeed * d.speed,
    retreatSpeed: phase.retreatSpeed * d.speed,
  };
}

/**
 * The boss with the dials applied: an adjusted copy, checked by the validator, so a dial can never produce a
 * boss the game cannot run. The boss file itself is never touched.
 */
export function applyDials(boss: BossDef, dials: Dials): BossDef {
  return parseBoss({
    ...boss,
    maxHp: atLeastOne(boss.maxHp * dials.health),
    attacks: boss.attacks.map((attack) => adjustAttack(attack, boss, dials)),
    phases: boss.phases.map((phase) => adjustPhase(phase, dials)),
  });
}
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0. If a dial extreme makes the validator reject the adjusted boss, that is a real bug in `applyDials` or a dial range that is too wide: report the exact dial and value, fix `applyDials` if it is a bug, and do not silently narrow a range.

- [ ] **Step 6: Commit**

```bash
git add src/bosses/schema.ts src/bosses/parse.ts src/bosses/index.ts src/game/difficulty.ts tests/boss-parse.test.ts tests/bosses-index.test.ts tests/difficulty.test.ts
git commit -m "feat: add attack damage, the boss list and the difficulty dials"
```

---

### Task 2: Attacks cost their damage (TDD)

**Files:**
- Modify: `src/game/step.ts`
- Test: `tests/step-damage.test.ts`

**Interfaces:**
- Consumes: Task 1 (`AttackDef.damage`).
- Produces: `hurtPlayer(s: GameState, amount: number): void` (health never below 0); the player loses the landing attack's `damage` in hits.

- [ ] **Step 1: Write the failing tests**

`tests/step-damage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER } from '../src/game/params';
import { solo, standAt, updatesWith } from './boss-helpers';
import { run } from './helpers';

/** The Duelist using only `id`, with that attack costing `damage` hits. */
function costing(id: string, damage: number): BossDef {
  const boss = solo(id);
  return { ...boss, attacks: boss.attacks.map((a) => (a.id === id ? { ...a, damage } : a)) };
}

describe('attack damage', () => {
  it('an attack costs one hit by default', () => {
    const boss = solo('slam');
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('an attack costs as many hits as its damage', () => {
    const boss = costing('slam', 2);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(PLAYER.maxHealth - 2);
  });

  it('a hit costing more than the player has ends the fight and health stops at zero', () => {
    const boss = costing('slam', PLAYER.maxHealth + 4);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(0);
    expect(states[hit - 1]!.phase).toBe('defeated');
    expect(states[hit - 1]!.events).toContain('playerDefeated');
  });

  it('the player is still untouchable for the same time after a costly hit', () => {
    const boss = costing('slam', 2);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.invulnerableTicks).toBe(PLAYER.hitInvulnerability);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/step-damage.test.ts`
Expected: FAIL (a hit always costs 1).

- [ ] **Step 3: Implement**

In `src/game/step.ts`, change `hurtPlayer` to take the amount:
```ts
/** The player takes `amount` hits. The last hit ends the fight. */
export function hurtPlayer(s: GameState, amount: number): void {
  const p = s.player;
  p.health = Math.max(0, p.health - amount);
  p.invulnerableTicks = PLAYER.hitInvulnerability;
  s.events.push('playerHit');
  if (p.health <= 0) {
    s.phase = 'defeated';
    s.endTicks = GAME.defeatRestartTicks;
    s.events.push('playerDefeated');
  }
}
```
(keep the file's existing doc comment style) and change `resolveBossHits` to pass the damage of the attack that is landing:
```ts
/** The boss's active hit boxes hurt a player who is not untouchable, for the damage of the attack that is landing. */
function resolveBossHits(s: GameState, boss: BossDef): void {
  const p = s.player;
  if (isInvulnerable(p)) return;
  const box = playerBox(p);
  if (!activeHitBoxes(s.boss, boss).some((hit) => overlaps(hit, box))) return;
  const attack = boss.attacks.find((a) => a.id === s.boss.attackId);
  hurtPlayer(s, attack?.damage ?? 1);
}
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0 (the earlier defeat tests still pass because damage defaults to 1).

- [ ] **Step 5: Commit**

```bash
git add src/game/step.ts tests/step-damage.test.ts
git commit -m "feat: attacks cost their damage in hits"
```

---

### Task 3: The fight summary tracker (TDD)

**Files:**
- Create: `src/game/summary.ts`
- Test: `tests/summary.test.ts`

**Interfaces:**
- Consumes: `GameState`, `BossDef`, `TICK_RATE`.
- Produces: `FightResult` (`'victory' | 'defeat' | 'left'`), `SummaryTracker`, `createTracker()`, `trackUpdate(tracker, state, previous): SummaryTracker` (pure, returns a new tracker), `FightSummary`, `summarize(tracker, state, boss, result): FightSummary`.

`FightSummary` fields: `result`, `ticks` (updates played, `state.tick`), `seconds` (`ticks / 60`, not counting the hit freeze because the freeze is not part of the simulation), `phaseReached` (1-based) and `phaseCount`, `hitsTaken` (number of times the player was hit), `bossHpLeft`, `bossMaxHp`, and `mostDangerousAttack: { id, name, hits } | null` (the attack that hurt the player most often; ties go to the attack listed first in the boss file; `null` when the player was never hit).

- [ ] **Step 1: Write the failing tests**

`tests/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import {
  createTracker,
  summarize,
  trackUpdate,
  type SummaryTracker,
} from '../src/game/summary';
import { solo, standAt, updatesWith } from './boss-helpers';
import { DUELIST, run } from './helpers';

/** Plays `count` updates from `start`, feeding every update to a tracker. */
function play(
  start: GameState,
  count: number,
  boss: BossDef,
  inputFor: (n: number) => InputFrame = () => NO_INPUT,
): { tracker: SummaryTracker; last: GameState } {
  let tracker = createTracker();
  let previous = start;
  for (let n = 1; n <= count; n++) {
    const next = step(previous, inputFor(n), boss);
    tracker = trackUpdate(tracker, next, previous);
    previous = next;
  }
  return { tracker, last: previous };
}

describe('a fight with no hits taken', () => {
  const start = createInitialState(DUELIST);
  const { tracker, last } = play(start, 30, DUELIST);
  const summary = summarize(tracker, last, DUELIST, 'left');

  it('reports the time in seconds from the updates played', () => {
    expect(summary.ticks).toBe(30);
    expect(summary.seconds).toBe(0.5);
  });

  it('has no hits and no most dangerous attack', () => {
    expect(summary.hitsTaken).toBe(0);
    expect(summary.mostDangerousAttack).toBeNull();
  });

  it('starts at phase 1 of the boss phases and passes the result and boss health through', () => {
    expect(summary.result).toBe('left');
    expect(summary.phaseReached).toBe(1);
    expect(summary.phaseCount).toBe(DUELIST.phases.length);
    expect(summary.bossHpLeft).toBe(DUELIST.maxHp);
    expect(summary.bossMaxHp).toBe(DUELIST.maxHp);
  });
});

describe('a fight where the player is hit', () => {
  const boss = solo('slam');
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const start = standAt(boss, 120);
  start.player.health = 1000;
  const states = run(start, 200, () => NO_INPUT, boss);
  const hits = updatesWith(states, 'playerHit').length;
  const { tracker, last } = play(start, 200, boss);
  const summary = summarize(tracker, last, boss, 'defeat');

  it('counts every hit taken', () => {
    expect(hits).toBeGreaterThan(1);
    expect(summary.hitsTaken).toBe(hits);
  });

  it('names the attack that hurt the player most', () => {
    expect(summary.mostDangerousAttack).toEqual({ id: 'slam', name: slam.name, hits });
  });
});

describe('the most dangerous attack', () => {
  const someState = createInitialState(DUELIST);

  it('goes to the attack listed first in the boss file when two are tied', () => {
    const tied: SummaryTracker = { hitsByAttack: { sweep: 2, slam: 2 }, hitsTaken: 4, phaseReached: 1 };
    expect(summarize(tied, someState, DUELIST, 'defeat').mostDangerousAttack!.id).toBe(
      DUELIST.attacks[0]!.id,
    );
  });

  it('ignores hits by an attack the boss file does not know', () => {
    const odd: SummaryTracker = { hitsByAttack: { mystery: 5 }, hitsTaken: 5, phaseReached: 1 };
    expect(summarize(odd, someState, DUELIST, 'defeat').mostDangerousAttack).toBeNull();
  });
});

describe('the phase reached', () => {
  it('follows the boss and never goes back', () => {
    const a = createInitialState(DUELIST);
    const b = createInitialState(DUELIST);
    b.boss.phase = 1;
    let tracker = trackUpdate(createTracker(), b, a);
    expect(tracker.phaseReached).toBe(2);
    tracker = trackUpdate(tracker, a, b);
    expect(tracker.phaseReached).toBe(2);
  });
});

describe('trackUpdate', () => {
  it('does not modify the tracker it is given', () => {
    const t = createTracker();
    const before = JSON.stringify(t);
    const s = createInitialState(DUELIST);
    s.events.push('playerHit');
    trackUpdate(t, s, createInitialState(DUELIST));
    expect(JSON.stringify(t)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/summary.test.ts`
Expected: FAIL (`../src/game/summary` does not exist).

- [ ] **Step 3: Implement `src/game/summary.ts`**

```ts
import type { BossDef } from '../bosses/schema';
import { TICK_RATE } from '../engine/time';
import type { GameState } from './state';

export type FightResult = 'victory' | 'defeat' | 'left';

/** What the summary needs to remember while a fight is played. Plain data, updated without mutation. */
export interface SummaryTracker {
  hitsByAttack: Record<string, number>;
  hitsTaken: number;
  /** 1-based: the highest boss phase seen. */
  phaseReached: number;
}

export const createTracker = (): SummaryTracker => ({
  hitsByAttack: {},
  hitsTaken: 0,
  phaseReached: 1,
});

/** Feeds one update (the state after it and the state before it) to the tracker and returns the new tracker. */
export function trackUpdate(
  tracker: SummaryTracker,
  state: GameState,
  previous: GameState,
): SummaryTracker {
  let hitsByAttack = tracker.hitsByAttack;
  let hitsTaken = tracker.hitsTaken;
  for (const event of state.events) {
    if (event !== 'playerHit') continue;
    const id = state.boss.attackId ?? previous.boss.attackId ?? 'unknown';
    hitsByAttack = { ...hitsByAttack, [id]: (hitsByAttack[id] ?? 0) + 1 };
    hitsTaken += 1;
  }
  return {
    hitsByAttack,
    hitsTaken,
    phaseReached: Math.max(tracker.phaseReached, state.boss.phase + 1),
  };
}

export interface FightSummary {
  result: FightResult;
  /** Updates played. */
  ticks: number;
  seconds: number;
  phaseReached: number;
  phaseCount: number;
  hitsTaken: number;
  bossHpLeft: number;
  bossMaxHp: number;
  mostDangerousAttack: { id: string; name: string; hits: number } | null;
}

/** The summary of a fight from its tracker and its final state. */
export function summarize(
  tracker: SummaryTracker,
  state: GameState,
  boss: BossDef,
  result: FightResult,
): FightSummary {
  let worst: { id: string; name: string; hits: number } | null = null;
  for (const attack of boss.attacks) {
    const hits = tracker.hitsByAttack[attack.id] ?? 0;
    if (hits > (worst?.hits ?? 0)) worst = { id: attack.id, name: attack.name, hits };
  }
  return {
    result,
    ticks: state.tick,
    seconds: state.tick / TICK_RATE,
    phaseReached: tracker.phaseReached,
    phaseCount: boss.phases.length,
    hitsTaken: tracker.hitsTaken,
    bossHpLeft: state.boss.hp,
    bossMaxHp: boss.maxHp,
    mostDangerousAttack: worst,
  };
}
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/summary.ts tests/summary.test.ts
git commit -m "feat: add the fight summary tracker"
```

---

### Task 4: Settings, remembered choices, and effects that respect the settings (TDD)

**Files:**
- Create: `src/ui/storage.ts`, `src/ui/settings.ts`, `src/ui/prefs.ts`, `tests/memory-storage.ts`
- Modify: `src/ui/feedback.ts`, `src/ui/audio.ts`, `tests/feedback.test.ts` (append)
- Test: `tests/settings.test.ts`, `tests/prefs.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Dials`, `DIALS`, `PRESETS`, `clampDial`, `dialsEqual`, `changedDials`), `EMBER_DUELIST`.
- Produces: `StorageLike`, `browserStorage()` (`storage.ts`); `Settings`, `DEFAULT_SETTINGS`, `parseSettings(raw)`, `loadSettings(storage)`, `saveSettings(storage, settings)` (`settings.ts`); `Prefs`, `DEFAULT_PREFS`, `presetDials(id)`, `isCustom(prefs)`, `selectPreset(prefs, id)`, `nudgeDial(prefs, id, direction)`, `resetDials(prefs)`, `changedFromPreset(prefs)`, `parsePrefs(raw)`, `loadPrefs(storage)`, `savePrefs(storage, prefs)` (`prefs.ts`); `freezeFor(events, settings?)` and `applyEvents(fb, events, settings?)` (settings default to all on); `Sound.setEnabled(enabled: boolean)`; `tests/memory-storage.ts` exports `MemoryStorage` and `BrokenStorage`.

- [ ] **Step 1: Write the failing tests and the test storage helpers**

`tests/memory-storage.ts`:
```ts
import type { StorageLike } from '../src/ui/storage';

/** A storage that lives in memory, for tests. */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** A storage that throws on every use, like a browser that blocks site data. */
export class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage blocked');
  }
  setItem(): void {
    throw new Error('storage blocked');
  }
}
```

`tests/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/ui/settings';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('settings', () => {
  it('start with everything on', () => {
    expect(DEFAULT_SETTINGS).toEqual({ freeze: true, shake: true, flash: true, sound: true });
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('are remembered', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { freeze: false, shake: true, flash: false, sound: true });
    expect(loadSettings(storage)).toEqual({ freeze: false, shake: true, flash: false, sound: true });
  });

  it('fall back to the defaults for broken or partial stored data', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"shake": false, "sound": "no"}')).toEqual({
      ...DEFAULT_SETTINGS,
      shake: false,
    });
  });

  it('survive a browser that blocks storage', () => {
    const broken = new BrokenStorage();
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('never hand out the shared default object', () => {
    const a = loadSettings(null);
    a.sound = false;
    expect(DEFAULT_SETTINGS.sound).toBe(true);
  });
});
```

`tests/prefs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { DIALS, NORMAL_DIALS, PRESETS } from '../src/game/difficulty';
import {
  DEFAULT_PREFS,
  changedFromPreset,
  isCustom,
  loadPrefs,
  nudgeDial,
  parsePrefs,
  presetDials,
  resetDials,
  savePrefs,
  selectPreset,
} from '../src/ui/prefs';
import { BrokenStorage, MemoryStorage } from './memory-storage';

describe('the remembered choices', () => {
  it('start with the first boss on Normal, not custom', () => {
    expect(DEFAULT_PREFS).toEqual({
      bossId: EMBER_DUELIST.id,
      presetId: 'normal',
      dials: NORMAL_DIALS,
    });
    expect(isCustom(DEFAULT_PREFS)).toBe(false);
  });

  it('selecting a preset loads its dials and is not custom', () => {
    const hard = selectPreset(DEFAULT_PREFS, 'hard');
    expect(hard.presetId).toBe('hard');
    expect(hard.dials).toEqual(presetDials('hard'));
    expect(isCustom(hard)).toBe(false);
  });

  it('nudging a dial changes it by one step, makes the choice custom, and remembers the preset it began from', () => {
    const tweaked = nudgeDial(selectPreset(DEFAULT_PREFS, 'hard'), 'speed', 1);
    expect(tweaked.presetId).toBe('hard');
    expect(tweaked.dials.speed).toBeCloseTo(presetDials('hard').speed + 0.05, 9);
    expect(isCustom(tweaked)).toBe(true);
    expect(changedFromPreset(tweaked)).toEqual(['speed']);
  });

  it('nudging back to the preset value is no longer custom', () => {
    const there = nudgeDial(DEFAULT_PREFS, 'health', 1);
    const back = nudgeDial(there, 'health', -1);
    expect(isCustom(back)).toBe(false);
    expect(changedFromPreset(back)).toEqual([]);
  });

  it('never leaves a dial range and stays on the step after many nudges', () => {
    for (const dial of DIALS) {
      let prefs = DEFAULT_PREFS;
      for (let i = 0; i < 60; i++) prefs = nudgeDial(prefs, dial.id, 1);
      expect(prefs.dials[dial.id]).toBe(dial.max);
      for (let i = 0; i < 120; i++) prefs = nudgeDial(prefs, dial.id, -1);
      expect(prefs.dials[dial.id]).toBe(dial.min);
    }
  });

  it('resetting goes back to the preset values', () => {
    const tweaked = nudgeDial(selectPreset(DEFAULT_PREFS, 'easy'), 'damage', 1);
    expect(resetDials(tweaked)).toEqual(selectPreset(DEFAULT_PREFS, 'easy'));
  });

  it('do not share dial objects between choices', () => {
    const a = selectPreset(DEFAULT_PREFS, 'normal');
    a.dials.speed = 9;
    expect(presetDials('normal').speed).toBe(1);
    expect(DEFAULT_PREFS.dials.speed).toBe(1);
  });
});

describe('storing the choices', () => {
  it('remembers a full choice', () => {
    const storage = new MemoryStorage();
    const chosen = nudgeDial(selectPreset(DEFAULT_PREFS, 'easy'), 'frequency', 1);
    savePrefs(storage, chosen);
    expect(loadPrefs(storage)).toEqual(chosen);
  });

  it('falls back to the defaults for broken data, an unknown preset or out-of-range dials', () => {
    expect(parsePrefs('nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"presetId":"impossible"}').presetId).toBe('normal');
    const wild = parsePrefs(JSON.stringify({ presetId: 'normal', dials: { speed: 99, health: -4, damage: 'x' } }));
    expect(wild.dials.speed).toBe(DIALS.find((d) => d.id === 'speed')!.max);
    expect(wild.dials.health).toBe(DIALS.find((d) => d.id === 'health')!.min);
    expect(wild.dials.damage).toBe(1);
  });

  it('fills dials missing from old stored data from the preset', () => {
    const partial = parsePrefs(JSON.stringify({ presetId: 'hard', dials: { speed: 1.2 } }));
    expect(partial.dials.speed).toBe(1.2);
    expect(partial.dials.health).toBe(PRESETS[2]!.dials.health);
  });

  it('survive a browser that blocks storage', () => {
    const broken = new BrokenStorage();
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, DEFAULT_PREFS)).not.toThrow();
  });
});
```

Append to `tests/feedback.test.ts` (adapt the imports; the file already imports `applyEvents`, `freezeFor`, `NO_FEEDBACK`, `FEEDBACK`):
```ts
describe('the settings', () => {
  const off = { freeze: false, shake: false, flash: false, sound: true };

  it('turning the freeze off removes every freeze', () => {
    expect(freezeFor(['bossHit', 'counter', 'playerHit'], { ...off, freeze: false })).toBe(0);
    expect(freezeFor(['bossHit'], { freeze: true, shake: false, flash: false, sound: true })).toBe(
      FEEDBACK.freezeOnBossHit,
    );
  });

  it('turning the shake off keeps the flashes, and the other way round', () => {
    const noShake = applyEvents(NO_FEEDBACK, ['bossHit', 'playerHit'], {
      freeze: true,
      shake: false,
      flash: true,
      sound: true,
    });
    expect(noShake.shakeTicks).toBe(0);
    expect(noShake.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    expect(noShake.playerFlashTicks).toBe(FEEDBACK.playerFlashTicks);
    const noFlash = applyEvents(NO_FEEDBACK, ['bossHit', 'playerHit'], {
      freeze: true,
      shake: true,
      flash: false,
      sound: true,
    });
    expect(noFlash.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(noFlash.bossFlashTicks).toBe(0);
    expect(noFlash.playerFlashTicks).toBe(0);
  });

  it('with everything off the effects do nothing at all', () => {
    expect(applyEvents(NO_FEEDBACK, ['bossHit', 'counter', 'playerHit', 'phaseChange'], off)).toEqual(
      NO_FEEDBACK,
    );
  });

  it('default to everything on when no settings are given', () => {
    expect(freezeFor(['counter'])).toBe(FEEDBACK.freezeOnCounter);
    expect(applyEvents(NO_FEEDBACK, ['playerHit']).shakeTicks).toBe(FEEDBACK.shakeTicks);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/settings.test.ts tests/prefs.test.ts tests/feedback.test.ts`
Expected: FAIL (the modules and the settings parameters do not exist).

- [ ] **Step 3: Implement storage, settings and prefs**

`src/ui/storage.ts`:
```ts
/** The part of `localStorage` the game uses, so tests can use memory instead. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's storage, or null when it is missing or blocked (private windows, blocked site data). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

`src/ui/settings.ts`:
```ts
import type { StorageLike } from './storage';

/** The switches on the Settings screen. Switching one off never changes how a fight plays. */
export interface Settings {
  freeze: boolean;
  shake: boolean;
  flash: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { freeze: true, shake: true, flash: true, sound: true };

const KEY = 'boss-trainer.settings';

/** Reads stored settings; anything missing or broken falls back to on. Always returns a new object. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
    const o = data as Record<string, unknown>;
    const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : true);
    return { freeze: flag(o.freeze), shake: flag(o.shake), flash: flag(o.flash), sound: flag(o.sound) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    return parseSettings(storage?.getItem(KEY) ?? null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is full or blocked: the settings just will not be remembered.
  }
}
```

`src/ui/prefs.ts`:
```ts
import { EMBER_DUELIST } from '../bosses';
import {
  DIALS,
  NORMAL_DIALS,
  PRESETS,
  changedDials,
  clampDial,
  dialsEqual,
  type DialId,
  type Dials,
  type PresetId,
} from '../game/difficulty';
import type { StorageLike } from './storage';

/** What the menu remembers: the boss, the preset, and the dial values (which differ from the preset once tweaked). */
export interface Prefs {
  bossId: string;
  presetId: PresetId;
  dials: Dials;
}

export const DEFAULT_PREFS: Prefs = {
  bossId: EMBER_DUELIST.id,
  presetId: 'normal',
  dials: NORMAL_DIALS,
};

const KEY = 'boss-trainer.prefs';

/** The dial values of a preset, as a new object. */
export function presetDials(id: PresetId): Dials {
  return { ...(PRESETS.find((p) => p.id === id)?.dials ?? NORMAL_DIALS) };
}

/** True once the dials differ from the preset the choice began from. */
export function isCustom(prefs: Prefs): boolean {
  return !dialsEqual(prefs.dials, presetDials(prefs.presetId));
}

export function selectPreset(prefs: Prefs, id: PresetId): Prefs {
  return { ...prefs, presetId: id, dials: presetDials(id) };
}

/** Moves one dial by one step up (1) or down (-1), staying inside its range. */
export function nudgeDial(prefs: Prefs, id: DialId, direction: 1 | -1): Prefs {
  const def = DIALS.find((d) => d.id === id);
  if (def === undefined) return prefs;
  const next = clampDial(id, prefs.dials[id] + direction * def.step);
  return { ...prefs, dials: { ...prefs.dials, [id]: next } };
}

/** Back to the values of the preset the choice began from. */
export function resetDials(prefs: Prefs): Prefs {
  return selectPreset(prefs, prefs.presetId);
}

/** The dials that differ from the preset, for the record of a fight. */
export function changedFromPreset(prefs: Prefs): DialId[] {
  return changedDials(presetDials(prefs.presetId), prefs.dials);
}

/** Reads stored choices; anything missing, unknown or out of range falls back safely. */
export function parsePrefs(raw: string | null): Prefs {
  const fallback: Prefs = { ...DEFAULT_PREFS, dials: { ...NORMAL_DIALS } };
  if (raw === null) return fallback;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return fallback;
    const o = data as Record<string, unknown>;
    const presetId = PRESETS.some((p) => p.id === o.presetId) ? (o.presetId as PresetId) : 'normal';
    const base = presetDials(presetId);
    const stored = typeof o.dials === 'object' && o.dials !== null ? (o.dials as Record<string, unknown>) : {};
    const dials = { ...base };
    for (const dial of DIALS) {
      const value = stored[dial.id];
      if (typeof value === 'number' && Number.isFinite(value)) dials[dial.id] = clampDial(dial.id, value);
    }
    return {
      bossId: typeof o.bossId === 'string' ? o.bossId : fallback.bossId,
      presetId,
      dials,
    };
  } catch {
    return fallback;
  }
}

export function loadPrefs(storage: StorageLike | null): Prefs {
  try {
    return parsePrefs(storage?.getItem(KEY) ?? null);
  } catch {
    return parsePrefs(null);
  }
}

export function savePrefs(storage: StorageLike | null, prefs: Prefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage is full or blocked: the choices just will not be remembered.
  }
}
```

- [ ] **Step 4: Make the effects and the sound respect the settings**

In `src/ui/feedback.ts`: add `import { DEFAULT_SETTINGS, type Settings } from './settings';`, then change the signatures and bodies:
```ts
export function freezeFor(
  events: readonly GameEvent[],
  settings: Settings = DEFAULT_SETTINGS,
): number {
  if (!settings.freeze) return 0;
  // ... the existing loop over events, unchanged ...
}

export function applyEvents(
  fb: FeedbackState,
  events: readonly GameEvent[],
  settings: Settings = DEFAULT_SETTINGS,
): FeedbackState {
  const next = { ...fb };
  for (const event of events) {
    if (event === 'bossHit' || event === 'counter' || event === 'bossDefeated') {
      if (settings.shake) next.shakeTicks = FEEDBACK.shakeTicks;
      if (settings.flash) next.bossFlashTicks = FEEDBACK.bossFlashTicks;
    }
    if (event === 'playerHit') {
      if (settings.shake) next.shakeTicks = FEEDBACK.shakeTicks;
      if (settings.flash) next.playerFlashTicks = FEEDBACK.playerFlashTicks;
    }
    if (event === 'phaseChange' && settings.shake) next.shakeTicks = FEEDBACK.shakeTicks;
  }
  return next;
}
```
(keep `advanceFeedback` and `shakeOffset` unchanged; keep the existing freeze loop body exactly.)

In `src/ui/audio.ts`: add `setEnabled(enabled: boolean): void;` to the `Sound` interface; in `createSound` add `let enabled = true;`, implement `setEnabled(value): void { enabled = value; }` in the returned object, and make `play` start with `if (!enabled) return;`.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/storage.ts src/ui/settings.ts src/ui/prefs.ts src/ui/feedback.ts src/ui/audio.ts tests/memory-storage.ts tests/settings.test.ts tests/prefs.test.ts tests/feedback.test.ts
git commit -m "feat: add settings, remembered choices, and effects that respect the settings"
```

---

### Task 5: Menu input: up and down, and one step per press (TDD)

**Files:**
- Modify: `src/engine/input-frame.ts`, `src/engine/input-profile.ts`, `tests/input-profile.test.ts`
- Create: `src/ui/nav.ts`
- Test: `tests/nav.test.ts`

**Interfaces:**
- Consumes: the existing input modules.
- Produces: `InputFrame.moveY` (-1 up, 1 down, digital like `moveX`; `NO_INPUT.moveY` is 0); `ControllerProfile.dpadUp`, `dpadDown`, `stickY`; from `nav.ts`: `NavAction` (`'up' | 'down' | 'left' | 'right'`), `NavState`, `NAV_START`, `NAV_REPEAT_DELAY_MS` (400), `NAV_REPEAT_INTERVAL_MS` (120), `advanceNav(state, moveX, moveY, now): { state: NavState; action: NavAction | null }`.

- [ ] **Step 1: Write the failing tests**

`tests/nav.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  NAV_REPEAT_DELAY_MS,
  NAV_REPEAT_INTERVAL_MS,
  NAV_START,
  advanceNav,
  type NavAction,
  type NavState,
} from '../src/ui/nav';

/** Feeds one direction held from `from` to `to` (in ms) at a 60 Hz frame rate; returns the actions fired. */
function hold(moveX: number, moveY: number, from: number, to: number): NavAction[] {
  const fired: NavAction[] = [];
  let state: NavState = NAV_START;
  for (let now = from; now <= to; now += 1000 / 60) {
    const result = advanceNav(state, moveX, moveY, now);
    state = result.state;
    if (result.action !== null) fired.push(result.action);
  }
  return fired;
}

describe('advanceNav', () => {
  it('does nothing while nothing is pressed', () => {
    expect(advanceNav(NAV_START, 0, 0, 1000)).toEqual({ state: NAV_START, action: null });
  });

  it('fires once on a press and each direction maps to its action', () => {
    expect(advanceNav(NAV_START, 0, -1, 0).action).toBe('up');
    expect(advanceNav(NAV_START, 0, 1, 0).action).toBe('down');
    expect(advanceNav(NAV_START, -1, 0, 0).action).toBe('left');
    expect(advanceNav(NAV_START, 1, 0, 0).action).toBe('right');
  });

  it('a short tap fires exactly once', () => {
    expect(hold(0, 1, 0, NAV_REPEAT_DELAY_MS - 20)).toEqual(['down']);
  });

  it('holding repeats after the delay, once per interval', () => {
    const fired = hold(0, 1, 0, NAV_REPEAT_DELAY_MS + 5 * NAV_REPEAT_INTERVAL_MS);
    expect(fired[0]).toBe('down');
    // The first repeat comes at the delay; then about one every interval.
    expect(fired.length).toBeGreaterThanOrEqual(5);
    expect(fired.length).toBeLessThanOrEqual(7);
    expect(fired.every((a) => a === 'down')).toBe(true);
  });

  it('releasing resets, so the next press fires at once', () => {
    const first = advanceNav(NAV_START, 1, 0, 0);
    const released = advanceNav(first.state, 0, 0, 50);
    expect(released.state).toEqual(NAV_START);
    expect(advanceNav(released.state, 1, 0, 60).action).toBe('right');
  });

  it('a new direction fires at once even while another was held', () => {
    const first = advanceNav(NAV_START, 0, 1, 0);
    expect(advanceNav(first.state, 1, 0, 30).action).toBe('right');
  });

  it('vertical wins when both are held', () => {
    expect(advanceNav(NAV_START, 1, -1, 0).action).toBe('up');
  });
});
```

In `tests/input-profile.test.ts` make these changes (read the file first):
- In the test "ignores buttons 6 and 7 completely", add `moveY: 0,` to the expected object right after `moveX: 0,`.
- Replace the test "ignores buttons that have no action (2, 10, 11 and the d-pad up and down)" with the same test using `pad([2, 10, 11])` and titled "ignores buttons that have no action (2, 10 and 11)", expecting `moveX` 0, `moveY` 0 and `jumpHeld` false.
- Add a new describe:
```ts
describe('moving up and down (menus)', () => {
  it('reads the d-pad up and down on both profiles', () => {
    expect(sample(pad([12])).input.moveY).toBe(-1);
    expect(sample(pad([13])).input.moveY).toBe(1);
    expect(sample(pad([12, 13])).input.moveY).toBe(0);
    expect(sampleInput(pad([12]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.moveY).toBe(-1);
    expect(sampleInput(pad([13]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.moveY).toBe(1);
  });

  it('reads the left stick vertically beyond the dead zone, like the d-pad', () => {
    expect(sample(pad([], [0, 0.5, 0, 0])).input.moveY).toBe(1);
    expect(sample(pad([], [0, -0.9, 0, 0])).input.moveY).toBe(-1);
    expect(sample(pad([], [0, 0.2, 0, 0])).input.moveY).toBe(0);
  });

  it('lets the d-pad win over the stick', () => {
    expect(sample(pad([12], [0, 1, 0, 0])).input.moveY).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/nav.test.ts tests/input-profile.test.ts`
Expected: FAIL (no `nav` module, no `moveY`).

- [ ] **Step 3: Implement**

`src/engine/input-frame.ts`: in `InputFrame` add after `moveX: number;` the field `/** Menu movement: -1 up, 1 down (digital, like moveX). Unused during a fight. */ moveY: number;` and add `moveY: 0,` to `NO_INPUT` after `moveX: 0,`.

`src/engine/input-profile.ts`:
- In `ControllerProfile` add `dpadUp: number; dpadDown: number;` after `dpadRight` and `/** Axis number of the left stick, up and down. */ stickY: number;` after `stickX`.
- In both `SN30_PRO_PROFILE` and `STANDARD_PROFILE` add `dpadUp: 12, dpadDown: 13,` after `dpadRight: 15,` and `stickY: 1,` after `stickX: 0,`.
- In `sampleInput`, next to the horizontal computation add
```ts
  const dpadY = (isDown(pad, profile.dpadDown) ? 1 : 0) - (isDown(pad, profile.dpadUp) ? 1 : 0);
  const stickYValue = pad.axes[profile.stickY] ?? 0;
  const stickYDirection = Math.abs(stickYValue) < deadZone ? 0 : stickYValue > 0 ? 1 : -1;
```
and add `moveY: dpadY !== 0 ? dpadY : stickYDirection,` to the returned `input` right after `moveX`.

`src/ui/nav.ts`:
```ts
/** One step of menu navigation. */
export type NavAction = 'up' | 'down' | 'left' | 'right';

export interface NavState {
  direction: NavAction | null;
  /** When the current direction was first pressed, in ms. */
  since: number;
  /** When it last fired, in ms. */
  lastFired: number;
}

export const NAV_START: NavState = { direction: null, since: 0, lastFired: 0 };

/** A held direction repeats after this long, then once per interval. */
export const NAV_REPEAT_DELAY_MS = 400;
export const NAV_REPEAT_INTERVAL_MS = 120;

function directionOf(moveX: number, moveY: number): NavAction | null {
  if (moveY < 0) return 'up';
  if (moveY > 0) return 'down';
  if (moveX < 0) return 'left';
  if (moveX > 0) return 'right';
  return null;
}

/**
 * Turns the held direction of a frame into at most one menu step: one on the press itself, then repeats
 * while it stays held. Pure: the caller keeps the state and supplies the time.
 */
export function advanceNav(
  state: NavState,
  moveX: number,
  moveY: number,
  now: number,
): { state: NavState; action: NavAction | null } {
  const direction = directionOf(moveX, moveY);
  if (direction === null) return { state: NAV_START, action: null };
  if (direction !== state.direction) {
    return { state: { direction, since: now, lastFired: now }, action: direction };
  }
  if (now - state.since >= NAV_REPEAT_DELAY_MS && now - state.lastFired >= NAV_REPEAT_INTERVAL_MS) {
    return { state: { ...state, lastFired: now }, action: direction };
  }
  return { state, action: null };
}
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0. If another existing test builds an `InputFrame` or profile literal by hand and now fails to compile, add the missing fields there (`moveY: 0`, the new profile fields) and say which.

- [ ] **Step 5: Commit**

```bash
git add src/engine/input-frame.ts src/engine/input-profile.ts src/ui/nav.ts tests/nav.test.ts tests/input-profile.test.ts
git commit -m "feat: add menu input, up and down and one step per press"
```

---

### Task 6: The screen models and the summary text (TDD)

**Files:**
- Create: `src/ui/menu-model.ts`, `src/ui/tweak-model.ts`, `src/ui/settings-model.ts`, `src/ui/summary-text.ts`
- Test: `tests/menu-model.test.ts`, `tests/tweak-model.test.ts`, `tests/settings-model.test.ts`, `tests/summary-text.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4 and 5 (`BOSSES`, `bossById`, `PRESETS`, `DIALS`, prefs functions, `Settings`, `NavAction`, `FightSummary`).
- Produces:
  - `menu-model.ts`: `MenuItemId`, `MENU_ITEMS`, `MenuAction` (`NavAction | 'confirm' | 'back'`), `MenuModel { focus; prefs }`, `MenuOutcome`, `MenuRow`, `createMenu(prefs)`, `difficultyLabel(prefs)`, `menuRows(model)`, `menuStep(model, action): { model; outcome }`.
  - `tweak-model.ts`: `TweakModel { focus; prefs }`, `TweakRow`, `createTweak(prefs)`, `formatDial(id, value)`, `tweakRows(model)`, `tweakStep(model, action): { model; outcome: 'stay' | 'back' }`.
  - `settings-model.ts`: `SettingsModel { focus; settings }`, `SettingsRow`, `createSettingsModel(settings)`, `settingsRows(model)`, `settingsStep(model, action): { model; outcome: 'stay' | 'back' }`.
  - `summary-text.ts`: `formatTime(seconds): string`, `summaryLines(summary): { title: string; lines: string[] }`.

Rules. **Menu**: rows in this order: Fight, Boss, Difficulty, Tweak difficulty, Settings, Controller test; focus starts on Fight; up and down move the focus and wrap; on the Difficulty row left, right and confirm cycle Easy, Normal, Hard (wrapping) and load that preset's dials (this drops any tweaks); on the Boss row left, right and confirm cycle the boss list; confirm on Fight starts a fight, on Tweak, Settings and Controller test opens that screen; everything else does nothing; the difficulty shows as the preset name, or `Custom (from <preset>)` once the dials differ from it. **Tweak**: one row per dial (label, value, help line) plus a last row "Reset to preset"; up and down move and wrap; left and right change the focused dial by one step within its range; confirm on a dial adds one step and wraps from the maximum to the minimum (for touch); confirm on the reset row restores the preset's dials; back leaves; dial values show as percentages, except damage which shows as `1 hit` or `N hits`. **Settings**: one row per switch (Hit freeze, Screen shake, Flashes, Sound) showing On or Off; left, right and confirm toggle the focused one; up and down move and wrap; back leaves.

- [ ] **Step 1: Write the failing tests**

`tests/menu-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { PRESETS } from '../src/game/difficulty';
import {
  MENU_ITEMS,
  createMenu,
  difficultyLabel,
  menuRows,
  menuStep,
  type MenuAction,
  type MenuModel,
} from '../src/ui/menu-model';
import { DEFAULT_PREFS, nudgeDial, selectPreset } from '../src/ui/prefs';

const at = (item: (typeof MENU_ITEMS)[number], model = createMenu(DEFAULT_PREFS)): MenuModel => ({
  ...model,
  focus: MENU_ITEMS.indexOf(item),
});
const press = (model: MenuModel, ...actions: MenuAction[]): MenuModel =>
  actions.reduce((m, a) => menuStep(m, a).model, model);

describe('the menu rows', () => {
  it('are in order and show the boss and the difficulty', () => {
    const rows = menuRows(createMenu(DEFAULT_PREFS));
    expect(rows.map((r) => r.id)).toEqual(['fight', 'boss', 'difficulty', 'tweak', 'settings', 'test']);
    expect(rows.find((r) => r.id === 'boss')!.value).toBe(EMBER_DUELIST.name);
    expect(rows.find((r) => r.id === 'difficulty')!.value).toBe('Normal');
  });

  it('starts with Fight focused', () => {
    expect(MENU_ITEMS[createMenu(DEFAULT_PREFS).focus]).toBe('fight');
  });

  it('shows Custom, with the preset it started from, once the dials differ', () => {
    const custom = nudgeDial(selectPreset(DEFAULT_PREFS, 'hard'), 'speed', -1);
    expect(difficultyLabel(custom)).toBe('Custom (from Hard)');
    expect(difficultyLabel(selectPreset(DEFAULT_PREFS, 'easy'))).toBe('Easy');
  });
});

describe('moving in the menu', () => {
  it('up and down move the focus and wrap around', () => {
    const start = createMenu(DEFAULT_PREFS);
    expect(press(start, 'down').focus).toBe(1);
    expect(press(start, 'up').focus).toBe(MENU_ITEMS.length - 1);
    expect(press(start, ...Array<MenuAction>(MENU_ITEMS.length).fill('down')).focus).toBe(0);
  });

  it('left and right do nothing on rows that have no choice, and back does nothing in the menu', () => {
    const start = at('settings');
    expect(menuStep(start, 'left')).toEqual({ model: start, outcome: { kind: 'stay' } });
    expect(menuStep(start, 'right')).toEqual({ model: start, outcome: { kind: 'stay' } });
    expect(menuStep(start, 'back')).toEqual({ model: start, outcome: { kind: 'stay' } });
  });
});

describe('choosing in the menu', () => {
  it('confirm on Fight starts a fight', () => {
    expect(menuStep(createMenu(DEFAULT_PREFS), 'confirm').outcome).toEqual({ kind: 'fight' });
  });

  it.each(['tweak', 'settings', 'test'] as const)('confirm on %s opens that screen', (item) => {
    expect(menuStep(at(item), 'confirm').outcome).toEqual({ kind: 'open', screen: item });
  });

  it('left and right cycle the difficulty presets and wrap', () => {
    const ids = PRESETS.map((p) => p.id);
    let m = at('difficulty');
    expect(m.prefs.presetId).toBe('normal');
    m = press(m, 'right');
    expect(m.prefs.presetId).toBe(ids[2]);
    m = press(m, 'right');
    expect(m.prefs.presetId).toBe(ids[0]);
    m = press(m, 'left');
    expect(m.prefs.presetId).toBe(ids[2]);
  });

  it('confirm on Difficulty also moves to the next preset', () => {
    expect(press(at('difficulty'), 'confirm').prefs.presetId).toBe('hard');
  });

  it('choosing a preset drops any tweaks and loads the preset dials', () => {
    const custom = nudgeDial(DEFAULT_PREFS, 'health', 1);
    const m = press({ focus: MENU_ITEMS.indexOf('difficulty'), prefs: custom }, 'right');
    expect(difficultyLabel(m.prefs)).toBe('Hard');
    expect(m.prefs.dials).toEqual(selectPreset(DEFAULT_PREFS, 'hard').dials);
  });

  it('with one boss the Boss row keeps that boss', () => {
    expect(press(at('boss'), 'right').prefs.bossId).toBe(EMBER_DUELIST.id);
    expect(menuStep(at('boss'), 'confirm').outcome).toEqual({ kind: 'stay' });
  });

  it('does not change the model it is given', () => {
    const start = at('difficulty');
    const before = JSON.stringify(start);
    menuStep(start, 'right');
    expect(JSON.stringify(start)).toBe(before);
  });
});
```

`tests/tweak-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DIALS } from '../src/game/difficulty';
import {
  createTweak,
  formatDial,
  tweakRows,
  tweakStep,
  type TweakModel,
} from '../src/ui/tweak-model';
import { DEFAULT_PREFS, isCustom, selectPreset } from '../src/ui/prefs';

const row = (model: TweakModel, id: string) => tweakRows(model).findIndex((r) => r.id === id);
const at = (index: number, model = createTweak(DEFAULT_PREFS)): TweakModel => ({ ...model, focus: index });

describe('the tweak rows', () => {
  it('list every dial and then the reset row, with values and help', () => {
    const rows = tweakRows(createTweak(DEFAULT_PREFS));
    expect(rows.map((r) => r.id)).toEqual([...DIALS.map((d) => d.id), 'reset']);
    for (const r of rows) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.help.length).toBeGreaterThan(0);
    }
    expect(rows[row(createTweak(DEFAULT_PREFS), 'speed')]!.value).toBe('100%');
    expect(rows[row(createTweak(DEFAULT_PREFS), 'damage')]!.value).toBe('1 hit');
  });

  it('formats dial values as percentages, and damage as hits', () => {
    expect(formatDial('speed', 1.05)).toBe('105%');
    expect(formatDial('variety', 0.65)).toBe('65%');
    expect(formatDial('damage', 1)).toBe('1 hit');
    expect(formatDial('damage', 2)).toBe('2 hits');
  });
});

describe('the tweak screen', () => {
  it('up and down move the focus and wrap over the rows including reset', () => {
    const count = DIALS.length + 1;
    const start = createTweak(DEFAULT_PREFS);
    expect(tweakStep(start, 'up').model.focus).toBe(count - 1);
    expect(tweakStep(at(count - 1), 'down').model.focus).toBe(0);
  });

  it('right and left change the focused dial by one step and make the choice custom', () => {
    const speed = row(createTweak(DEFAULT_PREFS), 'speed');
    const up = tweakStep(at(speed), 'right').model;
    expect(up.prefs.dials.speed).toBeCloseTo(1.05, 9);
    expect(isCustom(up.prefs)).toBe(true);
    const down = tweakStep(at(speed), 'left').model;
    expect(down.prefs.dials.speed).toBeCloseTo(0.95, 9);
  });

  it('never goes past the ends of a dial', () => {
    const damage = row(createTweak(DEFAULT_PREFS), 'damage');
    let m = at(damage);
    for (let i = 0; i < 6; i++) m = tweakStep(m, 'right').model;
    expect(m.prefs.dials.damage).toBe(3);
  });

  it('confirm on a dial adds a step and wraps from the maximum to the minimum', () => {
    const damage = row(createTweak(DEFAULT_PREFS), 'damage');
    let m = at(damage);
    m = tweakStep(m, 'confirm').model;
    m = tweakStep(m, 'confirm').model;
    expect(m.prefs.dials.damage).toBe(3);
    expect(tweakStep(m, 'confirm').model.prefs.dials.damage).toBe(1);
  });

  it('the reset row restores the preset dials', () => {
    const tweaked = at(row(createTweak(DEFAULT_PREFS), 'health'), createTweak(selectPreset(DEFAULT_PREFS, 'hard')));
    const changed = tweakStep(tweakStep(tweaked, 'right').model, 'right').model;
    expect(isCustom(changed.prefs)).toBe(true);
    const reset = tweakStep({ ...changed, focus: DIALS.length }, 'confirm').model;
    expect(reset.prefs).toEqual(selectPreset(DEFAULT_PREFS, 'hard'));
  });

  it('left and right do nothing on the reset row, and back leaves', () => {
    const resetRow = at(DIALS.length);
    expect(tweakStep(resetRow, 'right')).toEqual({ model: resetRow, outcome: 'stay' });
    expect(tweakStep(createTweak(DEFAULT_PREFS), 'back').outcome).toBe('back');
    expect(tweakStep(createTweak(DEFAULT_PREFS), 'down').outcome).toBe('stay');
  });
});
```

`tests/settings-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import {
  createSettingsModel,
  settingsRows,
  settingsStep,
  type SettingsModel,
} from '../src/ui/settings-model';

const at = (focus: number): SettingsModel => ({ ...createSettingsModel(DEFAULT_SETTINGS), focus });

describe('the settings rows', () => {
  it('list the four switches with On or Off and a help line', () => {
    const rows = settingsRows(createSettingsModel(DEFAULT_SETTINGS));
    expect(rows.map((r) => r.id)).toEqual(['freeze', 'shake', 'flash', 'sound']);
    expect(rows.every((r) => r.value === 'On' && r.help.length > 0)).toBe(true);
    const off = settingsRows(createSettingsModel({ ...DEFAULT_SETTINGS, shake: false }));
    expect(off.find((r) => r.id === 'shake')!.value).toBe('Off');
  });
});

describe('the settings screen', () => {
  it('up and down move the focus and wrap', () => {
    expect(settingsStep(createSettingsModel(DEFAULT_SETTINGS), 'up').model.focus).toBe(3);
    expect(settingsStep(at(3), 'down').model.focus).toBe(0);
  });

  it('left, right and confirm toggle the focused switch', () => {
    for (const action of ['left', 'right', 'confirm'] as const) {
      const toggled = settingsStep(at(1), action).model;
      expect(toggled.settings).toEqual({ ...DEFAULT_SETTINGS, shake: false });
      expect(settingsStep(toggled, action).model.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('back leaves and nothing else does', () => {
    expect(settingsStep(at(0), 'back').outcome).toBe('back');
    expect(settingsStep(at(0), 'confirm').outcome).toBe('stay');
  });

  it('does not change the model it is given', () => {
    const start = at(2);
    const before = JSON.stringify(start);
    settingsStep(start, 'confirm');
    expect(JSON.stringify(start)).toBe(before);
  });
});
```

`tests/summary-text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { FightSummary } from '../src/game/summary';
import { formatTime, summaryLines } from '../src/ui/summary-text';

const base: FightSummary = {
  result: 'victory',
  ticks: 4344,
  seconds: 72.4,
  phaseReached: 2,
  phaseCount: 2,
  hitsTaken: 3,
  bossHpLeft: 0,
  bossMaxHp: 30,
  mostDangerousAttack: { id: 'slam', name: 'Ember slam', hits: 2 },
};

describe('formatTime', () => {
  it('shows minutes and two-digit seconds, rounding down', () => {
    expect(formatTime(72.4)).toBe('1:12');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(59.99)).toBe('0:59');
  });
});

describe('summaryLines', () => {
  it('has a title for each result', () => {
    expect(summaryLines(base).title).toBe('Victory!');
    expect(summaryLines({ ...base, result: 'defeat' }).title).toBe('Defeated');
    expect(summaryLines({ ...base, result: 'left' }).title).toBe('You left the fight');
  });

  it('lists time, phase, hits, boss health and the attack that hurt most', () => {
    expect(summaryLines(base).lines).toEqual([
      'Time: 1:12',
      'Phase reached: 2 of 2',
      'Hits taken: 3',
      'Boss health left: 0 of 30',
      'Hurt you most: Ember slam (2 hits)',
    ]);
  });

  it('says so when nothing hurt the player, and uses the singular for one hit', () => {
    expect(summaryLines({ ...base, hitsTaken: 0, mostDangerousAttack: null }).lines.at(-1)).toBe(
      'You were never hit.',
    );
    expect(
      summaryLines({ ...base, mostDangerousAttack: { id: 'slam', name: 'Ember slam', hits: 1 } }).lines.at(-1),
    ).toBe('Hurt you most: Ember slam (1 hit)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/menu-model.test.ts tests/tweak-model.test.ts tests/settings-model.test.ts tests/summary-text.test.ts`
Expected: FAIL (the modules do not exist).

- [ ] **Step 3: Implement the models**

`src/ui/menu-model.ts`:
```ts
import { BOSSES, bossById } from '../bosses';
import { PRESETS } from '../game/difficulty';
import type { NavAction } from './nav';
import { isCustom, selectPreset, type Prefs } from './prefs';

export type MenuItemId = 'fight' | 'boss' | 'difficulty' | 'tweak' | 'settings' | 'test';

export const MENU_ITEMS: readonly MenuItemId[] = [
  'fight',
  'boss',
  'difficulty',
  'tweak',
  'settings',
  'test',
];

export type MenuAction = NavAction | 'confirm' | 'back';

export interface MenuModel {
  focus: number;
  prefs: Prefs;
}

export type MenuOutcome =
  | { kind: 'stay' }
  | { kind: 'fight' }
  | { kind: 'open'; screen: 'tweak' | 'settings' | 'test' };

export interface MenuRow {
  id: MenuItemId;
  label: string;
  value?: string;
}

/** The menu opens with Fight focused, so two presses of the bottom button start the same fight again. */
export const createMenu = (prefs: Prefs): MenuModel => ({ focus: 0, prefs });

/** The preset name, or `Custom (from <preset>)` once the dials differ from it. */
export function difficultyLabel(prefs: Prefs): string {
  const name = PRESETS.find((p) => p.id === prefs.presetId)?.label ?? 'Normal';
  return isCustom(prefs) ? `Custom (from ${name})` : name;
}

export function menuRows(model: MenuModel): MenuRow[] {
  return [
    { id: 'fight', label: 'Fight' },
    { id: 'boss', label: 'Boss', value: bossById(model.prefs.bossId).name },
    { id: 'difficulty', label: 'Difficulty', value: difficultyLabel(model.prefs) },
    { id: 'tweak', label: 'Tweak difficulty' },
    { id: 'settings', label: 'Settings' },
    { id: 'test', label: 'Controller test' },
  ];
}

const wrap = (index: number, direction: 1 | -1, length: number): number =>
  (index + direction + length) % length;

/** What a press does in the menu. Pure: returns the new model and what the app should do next. */
export function menuStep(
  model: MenuModel,
  action: MenuAction,
): { model: MenuModel; outcome: MenuOutcome } {
  const stay = (next: MenuModel): { model: MenuModel; outcome: MenuOutcome } => ({
    model: next,
    outcome: { kind: 'stay' },
  });
  const item = MENU_ITEMS[model.focus] ?? 'fight';

  if (action === 'up' || action === 'down') {
    return stay({ ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, MENU_ITEMS.length) });
  }
  if (action === 'back') return stay(model);

  if (action === 'confirm') {
    if (item === 'fight') return { model, outcome: { kind: 'fight' } };
    if (item === 'tweak' || item === 'settings' || item === 'test') {
      return { model, outcome: { kind: 'open', screen: item } };
    }
  }

  const direction: 1 | -1 = action === 'left' ? -1 : 1;
  if (item === 'difficulty') {
    const current = PRESETS.findIndex((p) => p.id === model.prefs.presetId);
    const next = PRESETS[wrap(Math.max(0, current), direction, PRESETS.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: selectPreset(model.prefs, next.id) });
  }
  if (item === 'boss') {
    const current = BOSSES.findIndex((b) => b.id === model.prefs.bossId);
    const next = BOSSES[wrap(Math.max(0, current), direction, BOSSES.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: { ...model.prefs, bossId: next.id } });
  }
  return stay(model);
}
```

`src/ui/tweak-model.ts`:
```ts
import { DIALS, PRESETS, type DialId } from '../game/difficulty';
import type { MenuAction } from './menu-model';
import { nudgeDial, resetDials, type Prefs } from './prefs';

export interface TweakModel {
  focus: number;
  prefs: Prefs;
}

export interface TweakRow {
  id: DialId | 'reset';
  label: string;
  value: string;
  help: string;
}

export const createTweak = (prefs: Prefs): TweakModel => ({ focus: 0, prefs });

/** Dial values as people read them: percentages, and damage as a number of hits. */
export function formatDial(id: DialId, value: number): string {
  if (id === 'damage') return `${value} hit${value === 1 ? '' : 's'}`;
  return `${Math.round(value * 100)}%`;
}

export function tweakRows(model: TweakModel): TweakRow[] {
  const rows: TweakRow[] = DIALS.map((dial) => ({
    id: dial.id,
    label: dial.label,
    value: formatDial(dial.id, model.prefs.dials[dial.id]),
    help: dial.help,
  }));
  const preset = PRESETS.find((p) => p.id === model.prefs.presetId)?.label ?? 'Normal';
  rows.push({
    id: 'reset',
    label: 'Reset to preset',
    value: preset,
    help: 'Go back to the values of the preset you started from.',
  });
  return rows;
}

const wrap = (index: number, direction: 1 | -1, length: number): number =>
  (index + direction + length) % length;

/** What a press does on the Tweak screen. */
export function tweakStep(
  model: TweakModel,
  action: MenuAction,
): { model: TweakModel; outcome: 'stay' | 'back' } {
  if (action === 'back') return { model, outcome: 'back' };
  const count = DIALS.length + 1;
  if (action === 'up' || action === 'down') {
    return { model: { ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, count) }, outcome: 'stay' };
  }
  const dial = DIALS[model.focus];
  if (dial === undefined) {
    // The reset row.
    if (action === 'confirm') return { model: { ...model, prefs: resetDials(model.prefs) }, outcome: 'stay' };
    return { model, outcome: 'stay' };
  }
  if (action === 'left') return { model: { ...model, prefs: nudgeDial(model.prefs, dial.id, -1) }, outcome: 'stay' };
  if (action === 'right') return { model: { ...model, prefs: nudgeDial(model.prefs, dial.id, 1) }, outcome: 'stay' };
  // Confirm (used by touch): one step up, wrapping from the top back to the bottom.
  const atMax = model.prefs.dials[dial.id] >= dial.max;
  const prefs = atMax
    ? { ...model.prefs, dials: { ...model.prefs.dials, [dial.id]: dial.min } }
    : nudgeDial(model.prefs, dial.id, 1);
  return { model: { ...model, prefs }, outcome: 'stay' };
}
```

`src/ui/settings-model.ts`:
```ts
import type { MenuAction } from './menu-model';
import type { Settings } from './settings';

export interface SettingsModel {
  focus: number;
  settings: Settings;
}

export interface SettingsRow {
  id: keyof Settings;
  label: string;
  value: 'On' | 'Off';
  help: string;
}

const ROWS: ReadonlyArray<{ id: keyof Settings; label: string; help: string }> = [
  { id: 'freeze', label: 'Hit freeze', help: 'A tiny pause when a hit lands, so hits feel heavy.' },
  { id: 'shake', label: 'Screen shake', help: 'The screen shakes a little when something is hit.' },
  { id: 'flash', label: 'Flashes', help: 'White and red flashes when something is hit.' },
  { id: 'sound', label: 'Sound', help: 'The beeps for hits, dashes and warnings.' },
];

export const createSettingsModel = (settings: Settings): SettingsModel => ({ focus: 0, settings });

export function settingsRows(model: SettingsModel): SettingsRow[] {
  return ROWS.map((row) => ({ ...row, value: model.settings[row.id] ? 'On' : 'Off' }));
}

/** What a press does on the Settings screen. Switching a setting never changes how a fight plays. */
export function settingsStep(
  model: SettingsModel,
  action: MenuAction,
): { model: SettingsModel; outcome: 'stay' | 'back' } {
  if (action === 'back') return { model, outcome: 'back' };
  if (action === 'up' || action === 'down') {
    const direction = action === 'up' ? -1 : 1;
    const focus = (model.focus + direction + ROWS.length) % ROWS.length;
    return { model: { ...model, focus }, outcome: 'stay' };
  }
  const row = ROWS[model.focus];
  if (row === undefined) return { model, outcome: 'stay' };
  const settings = { ...model.settings, [row.id]: !model.settings[row.id] };
  return { model: { ...model, settings }, outcome: 'stay' };
}
```

`src/ui/summary-text.ts`:
```ts
import type { FightSummary } from '../game/summary';

/** Minutes and two-digit seconds, rounding down: 72.4 becomes 1:12. */
export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

const TITLES = {
  victory: 'Victory!',
  defeat: 'Defeated',
  left: 'You left the fight',
} as const;

/** The words of the summary screen. */
export function summaryLines(summary: FightSummary): { title: string; lines: string[] } {
  const worst = summary.mostDangerousAttack;
  return {
    title: TITLES[summary.result],
    lines: [
      `Time: ${formatTime(summary.seconds)}`,
      `Phase reached: ${summary.phaseReached} of ${summary.phaseCount}`,
      `Hits taken: ${summary.hitsTaken}`,
      `Boss health left: ${summary.bossHpLeft} of ${summary.bossMaxHp}`,
      worst === null
        ? 'You were never hit.'
        : `Hurt you most: ${worst.name} (${worst.hits} hit${worst.hits === 1 ? '' : 's'})`,
    ],
  };
}
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run check:dist`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/menu-model.ts src/ui/tweak-model.ts src/ui/settings-model.ts src/ui/summary-text.ts tests/menu-model.test.ts tests/tweak-model.test.ts tests/settings-model.test.ts tests/summary-text.test.ts
git commit -m "feat: add the menu, tweak, settings and summary models"
```

---

### Task 7: The screens and the app shell

**Files:**
- Create: `src/ui/screens.ts`
- Modify: `src/ui/app.ts` (replace whole file), `src/ui/style.css` (append), `src/ui/controller-screen.ts` (only if its Back button text or callback needs it: see Step 3)

**Interfaces:**
- Consumes: everything from Tasks 1 to 6, `mountControllerScreen(root, onBack)`, `drawFrame`, `createSound`.
- Produces: `renderList(panel, title, hint, rows, focus, onPick, footer?)` and `renderSummary(panel, title, lines, onDone)` from `screens.ts`; `mountApp(root)` runs the menu, Tweak, Settings, fight, summary and controller test screens.

This task is browser code with no unit tests; the pure models it uses are tested in Task 6. It is verified by typecheck, all tests, build, `check:dist` and a preview smoke check. The in-browser check is the owner's.

- [ ] **Step 1: Create `src/ui/screens.ts`**

```ts
import { el } from './dom';

export interface ListRow {
  label: string;
  value?: string;
  help?: string;
}

/**
 * Draws a titled list of rows with the focused one highlighted and its help line below. Text only (set with
 * `textContent`); tapping a row calls `onPick(index)`. `footer` elements are added at the end.
 */
export function renderList(
  panel: HTMLElement,
  title: string,
  hint: string,
  rows: readonly ListRow[],
  focus: number,
  onPick: (index: number) => void,
  footer: readonly HTMLElement[] = [],
): void {
  const list = el('div', 'rows');
  rows.forEach((row, index) => {
    const button = el('button', index === focus ? 'row focused' : 'row');
    button.type = 'button';
    button.append(el('span', 'row-label', row.label));
    if (row.value !== undefined) button.append(el('span', 'row-value', row.value));
    button.addEventListener('click', () => onPick(index));
    list.append(button);
  });
  panel.replaceChildren(
    el('h1', undefined, title),
    el('p', 'hint', hint),
    list,
    el('p', 'help', rows[focus]?.help ?? ''),
    ...footer,
  );
  // With a controller only the focus moves: keep the focused row on screen.
  list.children[focus]?.scrollIntoView({ block: 'nearest' });
}

/** Draws the summary screen: a title, one line per fact, and a button back to the menu. */
export function renderSummary(
  panel: HTMLElement,
  title: string,
  lines: readonly string[],
  onDone: () => void,
): void {
  const done = el('button', 'action', 'Back to the menu');
  done.type = 'button';
  done.addEventListener('click', onDone);
  panel.replaceChildren(
    el('h1', undefined, title),
    ...lines.map((line) => el('p', 'summary-line', line)),
    done,
    el('p', 'hint', 'Press the bottom button to go back to the menu.'),
  );
}
```

- [ ] **Step 2: Replace `src/ui/app.ts`**

Read the current file first: keep its behavior for the fight loop, the pad sampling (`padSeen`, `held`), `hitStopView`, hold-to-leave, the pause banner, the sound unlock listeners, `firstPad`, `describeController` and `newSeed`, and the controller test switching. The new version:

```ts
import { bossById } from '../bosses';
import type { BossDef } from '../bosses/schema';
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
import { advanceHold } from '../engine/hold';
import { planUpdates } from '../engine/loop';
import { applyDials } from '../game/difficulty';
import { GAME } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState } from '../game/state';
import {
  createTracker,
  summarize,
  trackUpdate,
  type FightSummary,
  type SummaryTracker,
} from '../game/summary';
import { createSound } from './audio';
import { mountControllerScreen } from './controller-screen';
import { el } from './dom';
import { NO_FEEDBACK, advanceFeedback, applyEvents, freezeFor, type FeedbackState } from './feedback';
import { createMenu, menuRows, menuStep, type MenuAction, type MenuModel } from './menu-model';
import { NAV_START, advanceNav, type NavState } from './nav';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { drawFrame } from './render';
import { renderList, renderSummary } from './screens';
import { loadSettings, saveSettings, type Settings } from './settings';
import {
  createSettingsModel,
  settingsRows,
  settingsStep,
  type SettingsModel,
} from './settings-model';
import { browserStorage } from './storage';
import { summaryLines } from './summary-text';
import { createTweak, tweakRows, tweakStep, type TweakModel } from './tweak-model';

type Screen = 'menu' | 'tweak' | 'settings' | 'summary' | 'fight' | 'test';

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

/** A fresh seed for a fight, from the browser's random source (outside the simulation, which stays reproducible). */
function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

export function mountApp(root: HTMLElement): void {
  const storage = browserStorage();
  let prefs: Prefs = loadPrefs(storage);
  let settings: Settings = loadSettings(storage);

  const canvas = el('canvas', 'game-canvas');
  canvas.hidden = true;
  const maybeContext = canvas.getContext('2d');
  if (maybeContext === null) throw new Error('Canvas 2D is not available');
  const context: CanvasRenderingContext2D = maybeContext;
  const panel = el('div', 'panel');
  const banner = el('p', 'banner');
  banner.hidden = true;
  const leaveHint = el('p', 'banner leave', 'Keep holding to leave the fight…');
  leaveHint.hidden = true;
  root.replaceChildren(canvas, panel, banner, leaveHint);

  const sound = createSound();
  sound.setEnabled(settings.sound);
  // A phone only counts some events as a tap for sound: touch needs pointerup or click, not just pointerdown.
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    root.addEventListener(type, () => sound.unlock());
  }

  let screen: Screen = 'menu';
  let menu: MenuModel = createMenu(prefs);
  let tweak: TweakModel = createTweak(prefs);
  let settingsModel: SettingsModel = createSettingsModel(settings);
  let nav: NavState = NAV_START;
  let held: HeldButtons = NOTHING_HELD;
  let pending: PendingPresses = NO_PRESSES;
  // The boss as adjusted by the dials for the current fight.
  let boss: BossDef = bossById(prefs.bossId);
  let state: GameState = createInitialState(boss);
  let tracker: SummaryTracker = createTracker();
  // Set when the fight ends (win or loss); the summary shows once the end pause is over.
  let ended: FightSummary | null = null;
  let feedback: FeedbackState = NO_FEEDBACK;
  let leftoverMs = 0;
  let freezeLeft = 0;
  // True from the start of a hit-stop until the next real update: the picture stays on the newest state.
  let hitStopView = false;
  // False until the first usable read of a pad, so buttons already held then do not count as presses.
  let padSeen = false;
  let lastTime = performance.now();
  let paused = false;
  // How long the top button has been held during a fight (leaving needs GAME.exitHoldMs).
  let exitHoldMs = 0;
  let stopTest: (() => void) | null = null;
  // The summary ignores controller presses for a moment, so a player still mashing a button in the fight does not skip it by accident.
  const SUMMARY_LOCK_MS = 600;
  let summaryUnlockAt = 0;
  const statusLine = el('p', 'status');

  function setBanner(text: string | null): void {
    banner.hidden = text === null;
    if (text !== null) banner.textContent = text;
  }

  /** Hides the fight and its overlays; the next screen fills the panel. */
  function leaveFightScreen(): void {
    exitHoldMs = 0;
    leaveHint.hidden = true;
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
  }

  function updatePrefs(next: Prefs): void {
    if (next === prefs) return;
    prefs = next;
    savePrefs(storage, prefs);
  }

  function updateSettings(next: Settings): void {
    if (next === settings) return;
    settings = next;
    saveSettings(storage, settings);
    sound.setEnabled(settings.sound);
  }

  // Menu
  function renderMenu(): void {
    renderList(
      panel,
      'Boss Trainer',
      'Up and down to move, bottom button to choose, top button to go back. During a fight, hold the top button for a second to leave.',
      menuRows(menu).map((row) => ({ label: row.label, value: row.value })),
      menu.focus,
      (index) => {
        menu = { ...menu, focus: index };
        handleMenu('confirm');
      },
      [statusLine],
    );
  }

  function showMenu(): void {
    screen = 'menu';
    leaveFightScreen();
    menu = createMenu(prefs);
    renderMenu();
  }

  function handleMenu(action: MenuAction): void {
    const result = menuStep(menu, action);
    menu = result.model;
    updatePrefs(menu.prefs);
    if (result.outcome.kind === 'fight') {
      startFight();
    } else if (result.outcome.kind === 'open') {
      if (result.outcome.screen === 'tweak') showTweak();
      else if (result.outcome.screen === 'settings') showSettings();
      else showTest();
    } else {
      renderMenu();
    }
  }

  // Tweak
  function renderTweak(): void {
    renderList(
      panel,
      'Tweak difficulty',
      'Left and right change a value, up and down move, top button goes back.',
      tweakRows(tweak).map((row) => ({ label: row.label, value: row.value, help: row.help })),
      tweak.focus,
      (index) => {
        tweak = { ...tweak, focus: index };
        handleTweak('confirm');
      },
    );
  }

  function showTweak(): void {
    screen = 'tweak';
    tweak = createTweak(prefs);
    renderTweak();
  }

  function handleTweak(action: MenuAction): void {
    const result = tweakStep(tweak, action);
    tweak = result.model;
    updatePrefs(tweak.prefs);
    if (result.outcome === 'back') showMenu();
    else renderTweak();
  }

  // Settings
  function renderSettings(): void {
    renderList(
      panel,
      'Settings',
      'Left, right or the bottom button switch a setting, top button goes back.',
      settingsRows(settingsModel).map((row) => ({ label: row.label, value: row.value, help: row.help })),
      settingsModel.focus,
      (index) => {
        settingsModel = { ...settingsModel, focus: index };
        handleSettings('confirm');
      },
    );
  }

  function showSettings(): void {
    screen = 'settings';
    settingsModel = createSettingsModel(settings);
    renderSettings();
  }

  function handleSettings(action: MenuAction): void {
    const result = settingsStep(settingsModel, action);
    settingsModel = result.model;
    updateSettings(settingsModel.settings);
    if (result.outcome === 'back') showMenu();
    else renderSettings();
  }

  // Controller test
  function showTest(): void {
    screen = 'test';
    stopTest = mountControllerScreen(panel, () => {
      stopTest?.();
      stopTest = null;
      showMenu();
    });
  }

  // Summary
  function showSummary(summary: FightSummary): void {
    screen = 'summary';
    summaryUnlockAt = performance.now() + SUMMARY_LOCK_MS;
    leaveFightScreen();
    const text = summaryLines(summary);
    renderSummary(panel, text.title, text.lines, showMenu);
  }

  /** Leaves the fight for the summary: how it ended, or "left" if it was still going. */
  function endFight(): void {
    showSummary(ended ?? summarize(tracker, state, boss, 'left'));
  }

  function startFight(): void {
    screen = 'fight';
    boss = applyDials(bossById(prefs.bossId), prefs.dials);
    state = createInitialState(boss, newSeed());
    tracker = createTracker();
    ended = null;
    exitHoldMs = 0;
    leaveHint.hidden = true;
    feedback = NO_FEEDBACK;
    leftoverMs = 0;
    freezeLeft = 0;
    hitStopView = false;
    pending = NO_PRESSES;
    paused = false;
    lastTime = performance.now();
    panel.hidden = true;
    canvas.hidden = false;
    setBanner(null);
    sound.unlock();
  }

  banner.addEventListener('click', () => {
    if (screen === 'fight' && paused) endFight();
  });

  function draw(alpha: number): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawFrame(context, width, height, state, boss, alpha, feedback);
  }

  function runFight(now: number, selection: ProfileSelection | null, input: InputFrame): void {
    if (selection?.kind !== 'profile') {
      paused = true;
      exitHoldMs = 0;
      leaveHint.hidden = true;
      setBanner('No usable controller. Reconnect it and press a button (or tap here to go back).');
      lastTime = now;
      draw(0);
      return;
    }
    const hold = advanceHold(exitHoldMs, held.alt, now - lastTime, GAME.exitHoldMs);
    exitHoldMs = hold.heldMs;
    leaveHint.hidden = exitHoldMs === 0;
    if (hold.done) {
      endFight();
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
      hitStopView = false;
      const before = state;
      state = step(state, applyPresses(input, pending), boss);
      pending = NO_PRESSES;
      // After a win or a loss the game shows its message, then starts a new fight: show the summary instead.
      if (ended !== null && state.phase === 'fight') {
        showSummary(ended);
        return;
      }
      tracker = trackUpdate(tracker, state, before);
      if (ended === null && state.phase !== 'fight') {
        ended = summarize(tracker, state, boss, state.phase === 'victory' ? 'victory' : 'defeat');
      }
      feedback = applyEvents(feedback, state.events, settings);
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events, settings));
      if (freezeLeft > 0) hitStopView = true;
      sound.play(state.events);
    }
    // During a hit-stop nothing moves, so blend at 1 instead of the sweeping leftover (that would make the player judder).
    draw(hitStopView ? 1 : plan.alpha);
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    // Sample the pad on every frame, on the controller test screen too, so `held` never goes stale.
    const pad = firstPad();
    const selection = pad === null ? null : selectProfile(pad.id, pad.mapping);
    let input = NO_INPUT;
    if (pad !== null && selection?.kind === 'profile') {
      const sampled = sampleInput(pad, selection.profile, held, GAME.deadZone);
      held = sampled.held;
      // The first read after a pad (re)appears only seeds `held`: what is already down is not a new press.
      if (padSeen) input = sampled.input;
      padSeen = true;
    } else {
      held = NOTHING_HELD;
      padSeen = false;
    }

    if (screen === 'test') {
      lastTime = now;
      return;
    }

    if (screen === 'fight') {
      runFight(now, selection, input);
      return;
    }

    // Menu, Tweak, Settings and Summary: one step per press, with repeat while a direction is held.
    statusLine.textContent = describeController(pad, selection);
    const walked = advanceNav(nav, input.moveX, input.moveY, now);
    nav = walked.state;
    const action: MenuAction | null = input.confirm ? 'confirm' : input.alt ? 'back' : walked.action;
    lastTime = now;
    if (action === null) return;
    if (screen === 'menu') handleMenu(action);
    else if (screen === 'tweak') handleTweak(action);
    else if (screen === 'settings') handleSettings(action);
    else if ((action === 'confirm' || action === 'back') && now >= summaryUnlockAt) showMenu();
  }

  showMenu();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 3: Styles**

Append to `src/ui/style.css` (none of these classes may set `display` on anything that also uses the `hidden` attribute; these are only used on list rows and text):
```css

.rows {
  display: grid;
  gap: 0.4rem;
  max-width: 28rem;
  margin: 0.75rem 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.6rem 0.9rem;
  border: 2px solid transparent;
  border-radius: 0.4rem;
  background: var(--panel);
  color: var(--fg);
  font: inherit;
  text-align: left;
}

.row.focused {
  border-color: var(--accent);
}

.row-value {
  color: var(--accent);
  font-weight: 700;
}

.help {
  max-width: 28rem;
  min-height: 3em;
  color: var(--dim);
}

.summary-line {
  margin: 0.25rem 0;
  font-size: 1.1rem;
}
```
In `src/ui/controller-screen.ts` change nothing unless typecheck fails; its Back button already calls the `onBack` callback (which now returns to the menu).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build && npm run check:dist`
Expected: all exit 0. Then run the preview server in the background (`npm run preview -- --port 4173 --strictPort`), `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:4173/` and the same for `/sw.js`, then stop the server and confirm port 4173 is free. Expected `200 text/html` and a 200 JavaScript type. State clearly in your report that the in-browser check (menu navigation with the controller, Tweak, Settings, a full fight to the summary, leaving a fight, the controller test round trip) is NOT done and remains for the owner. Re-read your `app.ts` once against the current one for lost behavior: `padSeen` seeding, the summary's short input lock, `hitStopView`, hold-to-leave, the pause banner and its tap, the sound unlock listeners, and that `innerHTML` and `style=` appear nowhere.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/app.ts src/ui/style.css
git commit -m "feat: add the menu, tweak, settings and summary screens and the new app shell"
```

---

### Task 8: Docs and the M3a play-test checklist

**Files:**
- Modify: `docs/phone-testing.md`, `docs/bosses.md`, `CLAUDE.md`

- [ ] **Step 1: `docs/bosses.md`**

Read it first. (a) In the attack field list add `damage` (whole number, at least 1, default 1 when absent: how many of the player's hits the attack costs). (b) Add a short section "Difficulty dials" explaining that the difficulty presets and the Tweak screen adjust a copy of the boss through `applyDials` in `src/game/difficulty.ts`, list the seven dials and what each changes in the boss file (speed: `walkSpeed`, `retreatSpeed`, `move.speed`, `recovery`; frequency: `gap`; readability: `windup` with the hit windows and moves shifting with it and a counterable attack never below `counter.window`; health: `maxHp`; damage: each attack's `damage`; range: hit window `x0`/`x1` and the attack `range`; variety: how many of a phase's attacks are used, keeping the highest weights), and state that the boss file itself is never changed and that the adjusted copy is re-checked by `parseBoss`. Verify every statement against `src/game/difficulty.ts`. (c) In the tuning section note that a boss file must still make sense at the dial extremes (the tests run every dial at both ends).

- [ ] **Step 2: `CLAUDE.md`**

Add to "Conventions": `- Difficulty dials (speed, frequency, warning length, health, damage, range, variety) and the Easy, Normal and Hard presets live in `src/game/difficulty.ts`. A new dial is a new entry there plus its effect in `applyDials` and a test; player and environment dials come later (`docs/backlog.md`).`

- [ ] **Step 3: `docs/phone-testing.md`**

Read it first. Keep the install, offline, controller-check and PC sections. Replace the paragraphs of "Playing the fight (M2)" that describe the start screen ("Open the app with the controller connected. The start screen shows...") and the controls line with a new plain-language description of the menu, keeping the landscape paragraph, the controls, and every checklist item about the fight itself. New text to add (plain language for a non-programmer): the menu rows and how to move (d-pad or left stick up and down, left and right to change, bottom button to choose, top button to go back; hold the top button for a second during a fight to leave); it remembers your last choices so pressing the bottom button twice starts the same fight; the difficulty names and what Custom means; the Tweak screen and the seven dials in one line each; Settings; the summary after every fight, including after leaving. Add these checklist items:
- [ ] The menu opens with Fight highlighted; up and down move the highlight and it wraps around.
- [ ] Left and right on Difficulty switch between Easy, Normal and Hard. Easy feels clearly easier (longer warnings, slower and less frequent attacks, less boss health) and Hard clearly harder.
- [ ] In Tweak, each dial changes with left and right, the menu then shows "Custom (from ...)", "Reset to preset" puts it back, and your choice is still there after closing and reopening the app.
- [ ] In Settings, switching off Hit freeze, Screen shake, Flashes or Sound removes exactly that effect in a fight, and the fight itself plays the same.
- [ ] After a win, a loss, and after leaving with the top button, the summary appears with time, phase reached, hits taken, boss health left, and the attack that hurt you most; the bottom button returns to the menu.
- [ ] The menu no longer shows button names on the buttons.
- [ ] Tapping the rows with a finger works too.
Add to the questions list at the end: which dial matters most for how hard it feels, whether the Easy and Hard presets feel right, and anything confusing in the menu.

- [ ] **Step 4: Final verification**

Run: `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist`
Expected: everything exits 0 from a clean install; `git status --short` shows only the three docs files before the commit.

- [ ] **Step 5: Commit**

```bash
git add docs/bosses.md docs/phone-testing.md CLAUDE.md
git commit -m "docs: document the difficulty dials, the menu and the M3a play test"
```

---

## M3a done when

- All eight tasks are committed and `npm ci && npm run typecheck && npm test && npm run audit:deps && npm run build && npm run check:dist` passes from a clean checkout.
- The controller pushes (together with the start-screen text fix already on `main`), CI is green and the site is deployed (the controller does this, not the task agents).
- The owner has used the menu, the presets and the Tweak screen, finished fights on the PC and the S21 and seen the summary, and any changes they asked for are made (dial ranges and preset values in `src/game/difficulty.ts`).

## Self-review notes

- **Spec coverage** (`docs/superpowers/specs/2026-09-20-m3-design.md`, M3a): the seven dials and three presets with their tables (Task 1), attacks costing damage (Task 2), the summary with result, time, phase, hits, most dangerous attack for a win, a loss and leaving (Tasks 3 and 7), settings honoured by the effects and the sound (Task 4), menu input up and down with one step per press and repeat (Task 5), the menu, Tweak, Settings and summary models and their rules (Task 6), the screens, remembered choices, controller navigation, tappable rows, the fight flow menu, fight, summary, menu (Task 7), docs and checklist (Task 8). The start-screen text fix is covered because the buttons are gone. M3b (stats recording, storage, export) is a later plan.
- **Names used across tasks:** `DialId`, `Dials`, `DIALS`, `NORMAL_DIALS`, `PRESETS`, `applyDials`, `clampDial`, `dialsEqual`, `changedDials`, `BOSSES`, `bossById`, `hurtPlayer(s, amount)`, `createTracker`, `trackUpdate`, `summarize`, `FightSummary`, `Settings`, `DEFAULT_SETTINGS`, `loadSettings`, `saveSettings`, `Prefs`, `DEFAULT_PREFS`, `selectPreset`, `nudgeDial`, `resetDials`, `isCustom`, `changedFromPreset`, `loadPrefs`, `savePrefs`, `StorageLike`, `browserStorage`, `MemoryStorage`, `BrokenStorage`, `NavAction`, `advanceNav`, `NAV_START`, `MenuAction`, `MenuModel`, `menuStep`, `menuRows`, `createMenu`, `TweakModel`, `tweakStep`, `tweakRows`, `SettingsModel`, `settingsStep`, `settingsRows`, `summaryLines`, `formatTime`, `renderList`, `renderSummary`.

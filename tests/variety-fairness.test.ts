import { describe, expect, it } from 'vitest';
import { BRASS_SENTINEL, CINDER_GOLEM, GALE_REAVER, QUILL_WARDEN, TREMOR_BRUTE, VEIL_DANCER } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DIALS, NORMAL_DIALS, applyDials, presetDials, type Dials } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { withInput } from './helpers';

const BOSSES: [string, BossDef][] = [
  ['Quill Warden', QUILL_WARDEN],
  ['Cinder Golem', CINDER_GOLEM],
  ['Veil Dancer', VEIL_DANCER],
  ['Gale Reaver', GALE_REAVER],
  ['Brass Sentinel', BRASS_SENTINEL],
];

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6];

/** A player who can see the next few updates: dashes just before a hit would land, and attacks when the boss is open. */
function seer(boss: BossDef, lookahead: number) {
  return (n: number, prev: GameState): InputFrame => {
    const away = prev.player.x > prev.boss.x ? 1 : -1;
    let probe = prev;
    for (let i = 0; i < lookahead; i++) {
      probe = step(probe, NO_INPUT, boss);
      if (probe.player.health < prev.player.health) return withInput({ dashPressed: true, moveX: away });
    }
    const dx = prev.boss.x - prev.player.x;
    return withInput({ moveX: Math.abs(dx) < 100 ? 0 : dx > 0 ? 1 : -1, attackPressed: n % 18 === 0 });
  };
}

function fight(bot: (n: number, s: GameState) => InputFrame, boss: BossDef, seed: number) {
  const start = createInitialState(boss, seed);
  let s = start;
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { won: s.phase === 'victory', damage: start.player.health - s.player.health };
}

/** The boss using only attack `id`, from any distance, never walking, so a test decides what the player does. */
function soloOf(base: BossDef, id: string): BossDef {
  return {
    ...base,
    reaction: undefined,
    temper: undefined,
    spacing: { min: 0, max: 1e9 },
    attacks: base.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: base.phases.map((p) => ({ ...p, opening: undefined, gap: 1, maxChain: 1, chainChance: 0, combos: [], attacks: [{ id, weight: 1 }] })),
  };
}

/** Health lost during the first use of an attack when the player does `input(n)` at update n, standing `distance` left of the boss. */
function lostTo(base: BossDef, id: string, distance: number, input: (n: number) => InputFrame): number {
  const boss = soloOf(base, id);
  const a = base.attacks.find((x) => x.id === id)!;
  const start = createInitialState(boss, 1);
  start.player.x = start.boss.x - distance;
  start.player.prevX = start.player.x;
  let s = start;
  const total = a.windup + a.active + a.recovery + 15;
  for (let n = 1; n <= total; n++) s = step(s, input(n), boss);
  return start.player.health - s.player.health;
}

const NEW_ATTACKS: [BossDef, string][] = [
  [CINDER_GOLEM, 'cinder-lob'],
  [CINDER_GOLEM, 'furnace-stomp'],
  [VEIL_DANCER, 'needle-fan'],
  [VEIL_DANCER, 'twin-cut'],
  [VEIL_DANCER, 'shadow-cut'],
  [GALE_REAVER, 'gale-cyclone'],
  [BRASS_SENTINEL, 'spin-cycle'],
  [TREMOR_BRUTE, 'floor-wave'],
];

describe('every new attack has an answer', () => {
  for (const [base, id] of NEW_ATTACKS) {
    const a = base.attacks.find((x) => x.id === id)!;
    const distance = Math.min(Math.max(a.range.min + 40, 150), a.range.max - 10);

    it(`${base.name}: ${id} hurts a player who stands still`, () => {
      expect(lostTo(base, id, distance, () => NO_INPUT)).toBeGreaterThan(0);
    });

    it(`${base.name}: ${id} can be avoided with one well-timed dash or jump`, () => {
      const span = a.windup + a.active + 10;
      let best = Infinity;
      for (let t = 1; t <= span; t++) {
        for (const moveX of [0, -1, 1] as const) {
          best = Math.min(best, lostTo(base, id, distance, (n) => withInput({ dashPressed: n === t, moveX })));
          best = Math.min(best, lostTo(base, id, distance, (n) => withInput({ jumpPressed: n === t, jumpHeld: n >= t && n < t + 30, moveX })));
        }
      }
      expect(best).toBe(0);
    });
  }
});

describe('the five varied bosses stay fair', () => {
  for (const [name, base] of BOSSES) {
    it(`${name}: a player who sees each hit coming and dashes takes few hits at Normal`, () => {
      const boss = applyDials(base, presetDials('normal'));
      const results = SEEDS.map((seed) => fight(seer(boss, 3), boss, seed));
      expect(results.some((r) => r.won)).toBe(true);
    });

    it(`${name}: still parses and plays at every dial extreme`, () => {
      for (const d of DIALS) {
        for (const value of [d.min, d.max]) {
          const dials: Dials = { ...NORMAL_DIALS, [d.id]: value };
          const boss = applyDials(base, dials);
          let s = createInitialState(boss, 3);
          for (let n = 1; n <= 900 && s.phase === 'fight'; n++) s = step(s, NO_INPUT, boss);
          expect(Number.isFinite(s.player.health)).toBe(true);
        }
      }
    });

    it(`${name}: the same seed and inputs replay identically`, () => {
      const boss = applyDials(base, presetDials('hard'));
      const a = fight(seer(boss, 3), boss, 5);
      const b = fight(seer(boss, 3), boss, 5);
      expect(a).toEqual(b);
    });
  }
});

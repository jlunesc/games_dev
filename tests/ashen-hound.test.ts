import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, bossById } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DIALS, NORMAL_DIALS, applyDials, presetDials, type Dials, type PresetId } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { updatesWith, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';

/** The real Hound using only attack `id`, from any distance, never walking, starting a new attack one update after the last. */
function solo(id: string): BossDef {
  return {
    ...ASHEN_HOUND,
    spacing: { min: 0, max: 1e9 },
    attacks: ASHEN_HOUND.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: ASHEN_HOUND.phases.map((p) => ({
      ...p,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id, weight: 1 }],
    })),
  };
}

/** A fresh fight with the player `distance` units to the left of the boss. */
function standAt(boss: BossDef, distance: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

describe('the Ashen Hound file', () => {
  it('is loaded and found by id', () => {
    expect(ASHEN_HOUND).toBeDefined();
    expect(ASHEN_HOUND.id).toBe('ashen-hound');
    expect(ASHEN_HOUND.attacks.map((a) => a.id)).toEqual(['bite', 'rush', 'slip', 'pounce']);
    expect(ASHEN_HOUND.phases).toHaveLength(1);
    expect(bossById('ashen-hound')).toBe(ASHEN_HOUND);
  });

  it('gives a valid Hound at every dial extreme, and the file itself at Normal', () => {
    expect(applyDials(ASHEN_HOUND, NORMAL_DIALS)).toEqual(ASHEN_HOUND);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        const dials: Dials = { ...NORMAL_DIALS, [dial.id]: value };
        expect(() => applyDials(ASHEN_HOUND, dials)).not.toThrow();
      }
    }
    const lowest = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highest = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(ASHEN_HOUND, lowest)).not.toThrow();
    expect(() => applyDials(ASHEN_HOUND, highest)).not.toThrow();
  });
});

describe('the Hound\'s two special attacks', () => {
  it('a slip never hurts on its own: it dashes through a standing player', () => {
    const boss = solo('slip');
    const states = run(standAt(boss, 150), 400, () => NO_INPUT, boss);
    const first = windupUpdates(states)[0]!;
    expect(windupUpdates(states).length).toBeGreaterThan(3);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    // It really moved: the boss crossed the player's spot at some point.
    expect(states.some((s) => s.boss.x < s.player.x)).toBe(true);
    expect(first).toBeGreaterThan(0);
  });

  it('a pounce at a standing player hits him at the landing spot, and not before', () => {
    const boss = solo('pounce');
    const states = run(standAt(boss, 300), 200, () => NO_INPUT, boss);
    const first = windupUpdates(states)[0]!;
    const hits = updatesWith(states, 'playerHit');
    expect(hits[0]).toBe(first + 52);
    for (let n = 1; n < first + 52; n++) expect(states[n - 1]!.events).not.toContain('playerHit');
    // On the update of the landing the boss stands on the player's spot.
    const landed = states[first + 52 - 1]!;
    expect(Math.abs(landed.boss.x - landed.player.x)).toBeLessThan(1);
    expect(landed.boss.lift).toBe(0);
  });
});

/** The player's health is enormous so the fight cannot end; the player walks toward the boss and dashes on each warning. */
function drive(boss: BossDef, updates: number): InputFrame[] {
  const frames: InputFrame[] = [];
  let s = createInitialState(boss, 5);
  s = { ...s, player: { ...s.player, health: 1_000_000 } };
  for (let n = 1; n <= updates; n++) {
    const f = withInput({
      moveX: n % 200 < 100 ? 1 : -1,
      dashPressed: s.events.includes('bossWindupRed') || s.events.includes('bossWindupGold'),
    });
    frames.push(f);
    s = step(s, f, boss);
  }
  return frames;
}

describe('the analysis of a scripted Hound fight', () => {
  it('sees pounces and slips, with the danger of a pounce at the landing', () => {
    const boss = applyDials(ASHEN_HOUND, NORMAL_DIALS);
    const frames = drive(boss, 3000);
    let initial = createInitialState(boss, 5);
    initial = { ...initial, player: { ...initial.player, health: 1_000_000 } };
    const analysis = analyzeRun(boss, initial, frames);
    const pounces = analysis.attacks.filter((a) => a.attackId === 'pounce');
    const slips = analysis.attacks.filter((a) => a.attackId === 'slip');
    expect(pounces.length).toBeGreaterThan(0);
    expect(slips.length).toBeGreaterThan(0);
    for (const p of pounces) expect(p.firstDangerTick).toBe(p.startTick + 52);
    // A slip has no hit box, so it can never hit; it is dodged when it runs its whole length.
    for (const s of slips) {
      expect(s.outcome).not.toBe('hit');
      expect(s.damageTaken).toBe(0);
    }
    expect(slips.some((s) => s.outcome === 'dodged')).toBe(true);
  });
});

// ---- The bot check: no degenerate fights ----

type Bot = (n: number, prev: GameState) => InputFrame;

/** Does nothing at all. */
const idle: Bot = () => NO_INPUT;

/** Runs toward the boss and swings every 30 updates. */
const attacker: Bot = (n, prev) => {
  const dx = prev.boss.x - prev.player.x;
  return withInput({ moveX: Math.abs(dx) < 90 ? 0 : dx > 0 ? 1 : -1, attackPressed: n % 30 === 0 });
};

/** Stands still and dashes as a warning starts while the boss is within 250 units. */
const dodger: Bot = (_n, prev) => {
  const warned = prev.events.includes('bossWindupGold') || prev.events.includes('bossWindupRed');
  return withInput({ dashPressed: warned && Math.abs(prev.boss.x - prev.player.x) <= 250 });
};

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

interface Outcome {
  ended: boolean;
  won: boolean;
  updates: number;
  damage: number;
}

function fight(bot: Bot, presetId: PresetId, seed: number): Outcome {
  const boss = applyDials(ASHEN_HOUND, presetDials(presetId));
  const start = createInitialState(boss, seed);
  let s = start;
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return {
    ended: s.phase !== 'fight',
    won: s.phase === 'victory',
    updates: s.tick,
    damage: start.player.health - s.player.health,
  };
}

const BOTS: Array<[string, Bot]> = [
  ['idle', idle],
  ['attacker', attacker],
  ['dodger', dodger],
];

describe('the Hound never makes a degenerate fight (bots)', () => {
  const rows: string[] = [];
  for (const presetId of ['easy', 'normal', 'hard'] as const) {
    for (const [name, bot] of BOTS) {
      const results = SEEDS.map((seed) => fight(bot, presetId, seed));

      it(`${name} at ${presetId}: every fight ends within ${MAX_UPDATES} updates`, () => {
        for (const r of results) expect(r.ended).toBe(true);
        rows.push(
          `${presetId.padEnd(6)} ${name.padEnd(9)} wins ${results.filter((r) => r.won).length}/8, ` +
            `ticks ${Math.min(...results.map((r) => r.updates))}..${Math.max(...results.map((r) => r.updates))}, ` +
            `damage ${results.map((r) => r.damage).join(',')}`,
        );
      });

      if (name === 'idle') {
        it(`idle at ${presetId} always loses`, () => {
          for (const r of results) expect(r.won).toBe(false);
        });
      }
    }
  }

  it('no bot wins all its Normal fights without taking damage', () => {
    for (const [, bot] of BOTS) {
      const results = SEEDS.map((seed) => fight(bot, 'normal', seed));
      const flawless = results.every((r) => r.won && r.damage === 0);
      expect(flawless).toBe(false);
    }
    if (process.env.BOT_TABLE) console.log(rows.join('\n'));
  });
});

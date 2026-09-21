import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    // The warnings really are slips, several of them.
    const warnings = windupUpdates(states);
    expect(warnings.length).toBeGreaterThan(3);
    for (const n of warnings) expect(states[n - 1]!.boss.attackId).toBe('slip');
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    // It really moved: the boss crossed the player's spot at some point.
    expect(states.some((s) => s.boss.x < s.player.x)).toBe(true);
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
const PRESET_IDS = ['easy', 'normal', 'hard'] as const;

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
  // Every fight runs once, before the first test, and the tests only read the results (so no test depends on another).
  const results = new Map<string, Outcome[]>();
  const key = (presetId: string, name: string): string => `${presetId}/${name}`;
  beforeAll(() => {
    for (const presetId of PRESET_IDS) {
      for (const [name, bot] of BOTS) {
        results.set(key(presetId, name), SEEDS.map((seed) => fight(bot, presetId, seed)));
      }
    }
  });
  afterAll(() => {
    if (!process.env.BOT_TABLE) return;
    const rows = [...results].map(
      ([k, list]) =>
        `${k.padEnd(16)} wins ${list.filter((r) => r.won).length}/${list.length}, ` +
        `ticks ${Math.min(...list.map((r) => r.updates))}..${Math.max(...list.map((r) => r.updates))}, ` +
        `damage ${list.map((r) => r.damage).join(',')}`,
    );
    console.log(rows.join('\n'));
  });

  for (const presetId of PRESET_IDS) {
    for (const [name] of BOTS) {
      it(`${name} at ${presetId}: every fight ends within ${MAX_UPDATES} updates`, () => {
        for (const r of results.get(key(presetId, name))!) expect(r.ended).toBe(true);
      });

      if (name === 'idle') {
        it(`idle at ${presetId} always loses`, () => {
          for (const r of results.get(key(presetId, name))!) expect(r.won).toBe(false);
        });
      }
    }
  }

  it('no bot wins all its Normal fights without taking damage', () => {
    for (const [name] of BOTS) {
      const list = results.get(key('normal', name))!;
      expect(list.every((r) => r.won && r.damage === 0), name).toBe(false);
    }
  });
});

/**
 * A player who knows the Hound: for each attack it has a hard-coded correct answer, given at a fixed attack time.
 * A dash's untouchable updates (11) cover the danger of a bite or a rush; a jump clears the low shockwave of a
 * pounce. The Hound's slip never hurts, so it gets no answer. (The rush answer is a dash at attack time 28 and not
 * a jump: the rush is on top of the player long before a jump at 30 would be high enough.)
 */
const ANSWERS: Record<string, { kind: 'dash' | 'jump'; at: number }> = {
  bite: { kind: 'dash', at: 20 },
  rush: { kind: 'dash', at: 28 },
  pounce: { kind: 'jump', at: 40 },
};

/** The input for the next update: the answer to the running attack, when its attack time comes. */
const knower =
  (answers: Record<string, { kind: 'dash' | 'jump'; at: number }>): Bot =>
  (_n, prev) => {
    const b = prev.boss;
    if (b.mode !== 'attack' || b.attackId === null) return NO_INPUT;
    const answer = answers[b.attackId];
    if (answer === undefined) return NO_INPUT;
    const t = b.attackTick + 1; // the attack time the coming update will have
    if (answer.kind === 'dash') return withInput({ dashPressed: t === answer.at });
    return withInput({ jumpPressed: t === answer.at, jumpHeld: t >= answer.at && t < answer.at + 20 });
  };

describe('a player who knows the Hound can take no damage from it', () => {
  /** A 3000-update fight against the real Hound with a player who cannot die; returns the hits taken and the attacks seen. */
  function immortalFight(bot: Bot, seed: number): { hits: number; seen: Record<string, number> } {
    const boss = ASHEN_HOUND;
    let s = createInitialState(boss, seed);
    s = { ...s, player: { ...s.player, health: 1_000_000 } };
    let hits = 0;
    const seen: Record<string, number> = {};
    for (let n = 1; n <= 3000; n++) {
      s = step(s, bot(n, s), boss);
      if (s.events.includes('playerHit')) hits += 1;
      if (s.boss.mode === 'attack' && s.boss.attackTick === 0 && s.boss.attackId !== null) {
        seen[s.boss.attackId] = (seen[s.boss.attackId] ?? 0) + 1;
      }
    }
    return { hits, seen };
  }

  const SKILLED_SEEDS = [1, 2, 3, 4, 5];
  const skilled = new Map<number, { hits: number; seen: Record<string, number> }>();
  beforeAll(() => {
    for (const seed of SKILLED_SEEDS) skilled.set(seed, immortalFight(knower(ANSWERS), seed));
  });

  it.each(SKILLED_SEEDS)('takes zero hits from bites, rushes and pounces (seed %i)', (seed) => {
    const { hits, seen } = skilled.get(seed)!;
    expect(hits).toBe(0);
    // The check has teeth only if the Hound really attacked.
    expect(seen.bite).toBeGreaterThan(0);
    expect(seen.pounce).toBeGreaterThan(0);
  });

  it('sees every kind of attack across the seeds', () => {
    const total: Record<string, number> = {};
    for (const { seen } of skilled.values()) {
      for (const [id, n] of Object.entries(seen)) total[id] = (total[id] ?? 0) + n;
    }
    for (const id of ['bite', 'rush', 'slip', 'pounce']) expect(total[id]).toBeGreaterThan(0);
  });

  it('the same fights do hurt a player who answers wrongly or not at all', () => {
    for (const bot of [idle, knower({ ...ANSWERS, bite: { kind: 'dash', at: 2 }, rush: { kind: 'dash', at: 2 }, pounce: { kind: 'jump', at: 2 } })]) {
      const hits = [1, 2, 3, 4, 5].reduce((sum, seed) => sum + immortalFight(bot, seed).hits, 0);
      expect(hits).toBeGreaterThan(0);
    }
  });
});

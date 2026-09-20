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

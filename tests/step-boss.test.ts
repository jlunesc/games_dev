import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { GAME, PLAYER, WORLD } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import {
  anywhere,
  attackIds,
  runCrowding,
  solo,
  standAt,
  updatesWith,
  WALKER,
  windupUpdates,
} from './boss-helpers';
import { DUELIST, run, withInput } from './helpers';

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

/** The middle of an attack's range, where the boss starts it without walking first. */
const middleOfRange = (id: string): number => {
  const { range } = DUELIST.attacks.find((a) => a.id === id)!;
  return Math.round((range.min + range.max) / 2);
};

const CASES = ['slam', 'sweep', 'lunge', 'burst'].map((id) => ({ id, distance: middleOfRange(id) }));

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
    // Start the dash so it covers the sweep's active updates with the same margin before and after.
    const dashAt = hitStart - Math.floor((PLAYER.dash.duration - sweep.active) / 2);
    expect(dashAt).toBeLessThanOrEqual(hitStart);
    expect(dashAt + PLAYER.dash.duration).toBeGreaterThanOrEqual(hitStart + sweep.active);
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

describe('approach and facing', () => {
  it('walks into an attack range before it attacks', () => {
    const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
    const boss = solo('slam');
    // 250 units away is beyond the slam's reach, so the boss has to close in first.
    expect(250).toBeGreaterThan(slam.range.max);
    const states = run(standAt(boss, 250), 120, () => NO_INPUT, boss);
    const first = windupUpdates(states)[0]!;
    // With the player already in range the warning comes on update 2 (choose on 1, start on 2).
    expect(first).toBeGreaterThan(2);
    const at = states[first - 1]!;
    const distance = Math.abs(at.player.x - at.boss.x);
    expect(distance).toBeGreaterThanOrEqual(slam.range.min);
    expect(distance).toBeLessThanOrEqual(slam.range.max);
  });

  it('starts the attack anyway once the approach times out', () => {
    const boss: BossDef = { ...solo('slam'), approachTimeout: 20 };
    // The player keeps running away, so the boss never gets into range.
    const states = run(standAt(boss, 250), 60, () => withInput({ moveX: -1 }), boss);
    const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
    const first = windupUpdates(states)[0]!;
    // Update 1 chooses the attack (gap 1) and enters the approach; it force-starts when modeTick reaches the timeout.
    expect(first).toBe(1 + 20);
    const at = states[first - 1]!;
    expect(Math.abs(at.player.x - at.boss.x)).toBeGreaterThan(slam.range.max);
  });

  it('never changes facing during an attack, and turns again afterwards', () => {
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const boss = solo('sweep');
    const first = windupUpdates(run(standAt(boss, 150), 60, () => NO_INPUT, boss))[0]!;
    let s = run(standAt(boss, 150), first, () => NO_INPUT, boss)[first - 1]!;
    expect(s.boss.mode).toBe('attack');
    expect(s.boss.facing).toBe(-1);
    // The player jumps to the other side of the boss (a copy of the state: the original is not touched).
    s = structuredClone(s);
    s.player.x = s.boss.x + 200;
    s.player.prevX = s.player.x;
    // The warning update left attackTick at 0; the attack lasts through attackTick 1 to length - 1, and the update after that ends it.
    for (let i = 1; i < attackLength(sweep); i++) {
      s = step(s, NO_INPUT, boss);
      expect(s.boss.mode).toBe('attack');
      expect(s.boss.facing).toBe(-1);
    }
    s = step(s, NO_INPUT, boss);
    expect(s.boss.mode).toBe('gap');
    s = step(s, NO_INPUT, boss);
    expect(s.boss.facing).toBe(1);
  });
});

describe('crowding the boss', () => {
  it.each(['slam', 'sweep', 'burst'])(
    'a player standing on the boss is hurt by the %s inside its active updates',
    (id) => {
      const boss = solo(id);
      const attack = DUELIST.attacks.find((a) => a.id === id)!;
      // The player runs into the boss (it backs off to the wall) and stays on its centre.
      const states = runCrowding(standAt(boss, 100), 500, boss);
      const first = windupUpdates(states)[0]!;
      const at = states[first - 1]!;
      expect(Math.abs(at.player.x - at.boss.x)).toBeLessThan(1);
      const hit = updatesWith(states, 'playerHit')[0] ?? -1; // -1: never hurt
      expect(hit).toBeGreaterThanOrEqual(first + attack.windup);
      expect(hit).toBeLessThan(first + attack.windup + attack.active);
    },
  );

  it.each(DUELIST.attacks.map((a) => a.id))(
    'a boss pinned against the wall with the player too close starts the %s promptly',
    (id) => {
      const boss = solo(id);
      const s = createInitialState(boss);
      s.boss.x = WORLD.width - boss.width / 2;
      s.player.x = s.boss.x - 40;
      s.player.prevX = s.player.x;
      const attack = boss.attacks.find((a) => a.id === id)!;
      expect(40).toBeLessThan(attack.range.min);
      const states = run(s, 60, () => NO_INPUT, boss);
      // Update 1 is the gap (one update) and enters the approach; the attack starts on update 2. Far below approachTimeout.
      expect(windupUpdates(states)[0] ?? Infinity).toBeLessThanOrEqual(3);
      expect(boss.approachTimeout).toBeGreaterThan(3);
    },
  );

  it('a player who keeps crowding the real boss is hurt and the boss keeps attacking', () => {
    const states = runCrowding(createInitialState(DUELIST, 3), 600, DUELIST);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThanOrEqual(1);
    // One attack cycle is about an attack (66 to 76 updates) plus the gap (70) plus at most approachTimeout of walking, so
    // 600 updates hold three attacks (the brief's "five" cannot fit: five cycles are over 700 updates).
    expect(windupUpdates(states).length).toBeGreaterThanOrEqual(3);
  });
});

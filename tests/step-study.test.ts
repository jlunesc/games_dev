import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { attackById, attackLength } from '../src/game/boss';
import { PLAYER, WORLD } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import { attackIds, solo, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, withInput } from './helpers';

const FIRST_PHASE = ['slam', 'sweep', 'lunge'];

/** A fresh study fight with the player `distance` units to the left of the boss. */
function studyAt(boss: BossDef, distance: number, seed = 1, rounds = 1): GameState {
  const s = createInitialState(boss, seed, rounds);
  s.player.x = s.boss.x - distance;
  s.player.prevX = s.player.x;
  return s;
}

/** Runs updates 1..count and returns every resulting state (index 0 is update 1). */
function runFor(
  state: GameState,
  count: number,
  boss: BossDef,
  inputFor: (update: number, s: GameState) => InputFrame = () => NO_INPUT,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= count; n++) {
    s = step(s, inputFor(n, s), boss);
    states.push(s);
  }
  return states;
}

/** Runs until the study has ended (1..limit updates) and returns the states, the last one being the studyEnd update. */
function runStudy(
  state: GameState,
  boss: BossDef,
  inputFor: (update: number, s: GameState) => InputFrame = () => NO_INPUT,
  limit = 6000,
): GameState[] {
  const states: GameState[] = [];
  let s = state;
  for (let n = 1; n <= limit; n++) {
    s = step(s, inputFor(n, s), boss);
    states.push(s);
    if (s.events.includes('studyEnd')) return states;
  }
  throw new Error('the study did not end');
}

const isPermutation = (list: string[], of: string[]): boolean =>
  list.length === of.length && [...list].sort().join() === [...of].sort().join();

describe('creating a fight without a study', () => {
  it('is the old state plus an idle study, and draws no random number', () => {
    const s = createInitialState(DUELIST, 5);
    expect(s.rng).toBe(5);
    expect(s.seed).toBe(5);
    expect(s.study).toEqual({ active: false, queue: [], endTick: 0 });
    const { study: _study, ...rest } = s;
    expect(rest).toEqual({
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
        dashTick: -1,
        dashDir: 1,
        dashCooldown: 0,
        buffer: { jump: 0, attack: 0, dash: 0 },
      },
      boss: {
        x: DUELIST.startX,
        lift: 0,
        leapFromX: null,
        leapToX: null,
        facing: -1,
        hp: DUELIST.maxHp,
        phase: 0,
        mode: 'gap',
        modeTick: 0,
        attackId: null,
        attackTick: 0,
        pendingAttackId: null,
        chainLeft: 0,
        lastAttacks: [],
        cycleIndex: 0,
      },
      events: [],
      rng: 5,
      seed: 5,
    });
  });
});

describe('the study queue', () => {
  it('with one round is a shuffle of the first-phase attacks, and the seed decides the order', () => {
    const s = createInitialState(DUELIST, 5, 1);
    expect(isPermutation(s.study.queue, FIRST_PHASE)).toBe(true);
    expect(s.study.active).toBe(true);
    expect(s.study.endTick).toBe(0);
    expect(s.rng).not.toBe(5);
    expect(s.seed).toBe(5);

    const orders = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const queue = createInitialState(DUELIST, seed, 1).study.queue;
      expect(isPermutation(queue, FIRST_PHASE)).toBe(true);
      expect(createInitialState(DUELIST, seed, 1).study.queue).toEqual(queue);
      orders.add(queue.join());
    }
    expect(orders.size).toBeGreaterThanOrEqual(2);
  });

  it('never includes a later-phase attack', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(createInitialState(DUELIST, seed, 3).study.queue).not.toContain('burst');
    }
  });

  it('with two rounds has each attack twice and each half shuffled on its own', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const queue = createInitialState(DUELIST, seed, 2).study.queue;
      expect(queue).toHaveLength(6);
      expect(isPermutation(queue.slice(0, 3), FIRST_PHASE)).toBe(true);
      expect(isPermutation(queue.slice(3), FIRST_PHASE)).toBe(true);
    }
  });

  it('works for the other real boss too', () => {
    const ids = ASHEN_HOUND.phases[0]!.attacks.map((a) => a.id);
    const s = createInitialState(ASHEN_HOUND, 3, 1);
    expect(isPermutation(s.study.queue, ids)).toBe(true);
    expect(s.study.active).toBe(true);
  });
});

describe('a whole study against a standing player', () => {
  const start = createInitialState(DUELIST, 7, 2);
  const queue = [...start.study.queue];
  const states = runStudy(start, DUELIST);
  const end = states[states.length - 1]!;

  it('demonstrates exactly the queued attacks, in order, and nothing else', () => {
    expect(attackIds(states)).toEqual(queue);
    expect(attackIds(states)).not.toContain('burst');
  });

  it('ends once, on the update the last attack finishes', () => {
    expect(updatesWith(states, 'studyEnd')).toEqual([states.length]);
    const lastWindup = windupUpdates(states).at(-1)!;
    const lastAttack = attackById(DUELIST, queue.at(-1)!);
    expect(states.length).toBe(lastWindup + attackLength(lastAttack));
    expect(end.study.active).toBe(false);
    expect(end.study.queue).toEqual([]);
    expect(end.study.endTick).toBe(end.tick);
    expect(end.tick).toBe(states.length);
  });

  it('never has a chain, a phase change or a counter', () => {
    expect(states.every((s) => s.boss.chainLeft === 0)).toBe(true);
    expect(states.every((s) => s.boss.phase === 0)).toBe(true);
    expect(states.every((s) => s.boss.mode !== 'stagger' && s.boss.mode !== 'transition')).toBe(true);
  });

  it('hurts nobody: the player stays at full health, though demonstrations reach him', () => {
    expect(states.every((s) => s.player.health === PLAYER.maxHealth)).toBe(true);
    expect(states.every((s) => s.phase === 'fight')).toBe(true);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(updatesWith(states, 'playerDefeated')).toEqual([]);
    expect(updatesWith(states, 'studyHit').length).toBeGreaterThanOrEqual(1);
  });

  it('gives exactly one studyHit for each demonstration that reaches the player', () => {
    const starts = windupUpdates(states);
    const perAttack = starts.map((from, i) => {
      const to = starts[i + 1] ?? states.length + 1;
      return updatesWith(states.slice(from - 1, to - 1), 'studyHit').length;
    });
    expect(perAttack.every((count) => count <= 1)).toBe(true);
    // A sweep that starts in its range reaches the standing player, exactly once (one that starts out of range,
    // after the approach timed out, can miss).
    const inRange = starts.flatMap((from, i) => {
      const s = states[from - 1]!;
      const range = attackById(DUELIST, queue[i]!).range;
      const distance = Math.abs(s.boss.x - s.player.x);
      return queue[i] === 'sweep' && distance >= range.min && distance <= range.max ? [i] : [];
    });
    expect(inRange.length).toBeGreaterThan(0);
    for (const i of inRange) expect(perAttack[i]).toBe(1);
    expect(perAttack.reduce((a, b) => a + b, 0)).toBe(updatesWith(states, 'studyHit').length);
  });

  it('gives the boss back its normal behaviour afterwards: random attacks that really hurt', () => {
    let s = end;
    s.player.health = 1000;
    const after: GameState[] = [];
    for (let n = 0; n < 600; n++) {
      s = step(s, NO_INPUT, DUELIST);
      after.push(s);
    }
    expect(windupUpdates(after).length).toBeGreaterThanOrEqual(2);
    expect(updatesWith(after, 'studyHit')).toEqual([]);
    expect(updatesWith(after, 'playerHit').length).toBeGreaterThanOrEqual(1);
    expect(s.player.health).toBeLessThan(1000);
    expect(s.study.active).toBe(false);
    expect(s.study.endTick).toBe(end.tick);
  });
});

describe('a study with the standing player and a single sweep', () => {
  it('reaches him once without hurting him', () => {
    const boss = solo('sweep');
    const states = runStudy(studyAt(boss, 150), boss);
    expect(updatesWith(states, 'studyHit')).toHaveLength(1);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states.every((s) => s.player.health === PLAYER.maxHealth)).toBe(true);
  });
});

describe('the player fighting back during the study', () => {
  const slam = attackById(DUELIST, 'slam');
  const boss = solo('slam');
  const first = windupUpdates(runFor(studyAt(boss, 120), 60, boss))[0]!;
  const windowStart = first + slam.windup - DUELIST.counter.window;

  it('cannot hurt the boss, whatever he does', () => {
    const start = studyAt(boss, 120);
    // Crowds the boss and swings again and again for the whole study.
    const crowd = (n: number, s: GameState): InputFrame => {
      const perUpdate = PLAYER.runSpeed * (1 / 60);
      return withInput({
        moveX: Math.max(-1, Math.min(1, (s.boss.x - s.player.x) / perUpdate)),
        attackPressed: n % 15 === 0,
      });
    };
    const states = runStudy(start, boss, crowd);
    expect(states.some((s) => s.player.attackTick >= 0)).toBe(true);
    expect(updatesWith(states, 'bossHit')).toEqual([]);
    expect(states.every((s) => s.boss.hp === boss.maxHp)).toBe(true);
    expect(states.every((s) => s.boss.phase === 0)).toBe(true);
    expect(states.every((s) => !s.player.attackConnected)).toBe(true);
  });

  it('cannot counter the slam inside its counter window: no stagger, the slam completes', () => {
    for (const at of [windowStart, first + slam.windup - 5]) {
      const states = runFor(studyAt(boss, 120), 200, boss, (n) => withInput({ attackPressed: n === at }));
      expect(updatesWith(states, 'counter')).toEqual([]);
      expect(states.every((s) => s.boss.mode !== 'stagger')).toBe(true);
      expect(updatesWith(states, 'bossHit')).toEqual([]);
      expect(updatesWith(states, 'studyHit')).toEqual([first + slam.windup]);
      expect(updatesWith(states, 'studyEnd')).toEqual([first + attackLength(slam)]);
    }
  });
});

describe('a boss that always chains', () => {
  it('still does no chains during the study', () => {
    const chainy: BossDef = {
      ...DUELIST,
      phases: DUELIST.phases.map((p) => ({ ...p, maxChain: 3, chainChance: 1 })),
    };
    const start = createInitialState(chainy, 4, 2);
    const queue = [...start.study.queue];
    const states = runStudy(start, chainy);
    expect(states.every((s) => s.boss.chainLeft === 0)).toBe(true);
    expect(attackIds(states)).toEqual(queue);
  });
});

describe('after the study', () => {
  const slam = attackById(DUELIST, 'slam');
  const boss = solo('slam');
  const study = runStudy(studyAt(boss, 120), boss);
  const end = study[study.length - 1]!;
  const secondWindup = (states: GameState[]): number => windupUpdates(states)[0]!;

  it('a counter works again', () => {
    const probe = runFor(end, 60, boss);
    const w = secondWindup(probe);
    const at = w + slam.windup - DUELIST.counter.window;
    const states = runFor(end, 120, boss, (n) => withInput({ attackPressed: n === at }));
    expect(updatesWith(states, 'counter')).toEqual([at]);
    expect(states[at - 1]!.boss.mode).toBe('stagger');
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - DUELIST.counter.damageMultiplier);
  });

  it('a swing hurts the boss again', () => {
    const w = secondWindup(runFor(end, 60, boss));
    const at = w + 2;
    const states = runFor(end, 60, boss, (n) => withInput({ attackPressed: n === at }));
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(hit).toBe(at + PLAYER.attack.startup);
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - 1);
  });
});

describe('determinism', () => {
  const inputFor = (n: number): InputFrame =>
    withInput({ moveX: Math.sin(n / 40) > 0 ? 1 : -1, attackPressed: n % 23 === 0, jumpPressed: n % 71 === 0 });

  it('gives identical state sequences for the same seed and inputs', () => {
    const a = runFor(createInitialState(DUELIST, 9, 2), 700, DUELIST, inputFor);
    const b = runFor(createInitialState(DUELIST, 9, 2), 700, DUELIST, inputFor);
    expect(b).toEqual(a);
  });

  it('survives a JSON round trip and a structuredClone in the middle of the study', () => {
    const before = runFor(createInitialState(DUELIST, 9, 2), 150, DUELIST, inputFor);
    const mid = before[before.length - 1]!;
    expect(mid.study.active).toBe(true);
    const continueFrom = (from: GameState): GameState[] =>
      runFor(from, 400, DUELIST, (n) => inputFor(n + 150));
    const direct = continueFrom(mid);
    expect(continueFrom(JSON.parse(JSON.stringify(mid)) as GameState)).toEqual(direct);
    expect(continueFrom(structuredClone(mid))).toEqual(direct);
  });
});

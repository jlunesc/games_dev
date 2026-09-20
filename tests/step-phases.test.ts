import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { GAME, PLAYER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { anywhere, attackIds, solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, run, withInput } from './helpers';

const threshold = DUELIST.maxHp * DUELIST.phases[1]!.startsAtHpFraction;

/** A fight with the player in reach of the boss and the boss at `hp` health. */
function inReach(boss: BossDef, hp: number): GameState {
  const s = standAt(boss, 120);
  s.boss.hp = hp;
  return s;
}

/** The player swings on update 1 and again on update 20. */
const swings = (n: number) => withInput({ attackPressed: n === 1 || n === 20 });

const HIT = PLAYER.attack.startup + 1;

describe('the phase change', () => {
  const states = run(inReach(DUELIST, 20), 130, swings, DUELIST);

  it('starts once when a hit brings health down to the next phase threshold', () => {
    // The setup: 20 health is above the threshold, one hit takes it to or below it.
    expect(20).toBeGreaterThan(threshold);
    expect(20 - 1).toBeLessThanOrEqual(threshold);
    expect(updatesWith(states, 'phaseChange')).toEqual([HIT]);
    expect(states[HIT - 1]!.boss.phase).toBe(1);
    expect(states[HIT - 1]!.boss.mode).toBe('transition');
  });

  it('does not start while health stays above the threshold', () => {
    const above = run(inReach(DUELIST, Math.ceil(threshold) + 2), 40, swings, DUELIST);
    expect(updatesWith(above, 'phaseChange')).toEqual([]);
    expect(above[39]!.boss.phase).toBe(0);
  });

  it('cannot be hurt while the boss powers up', () => {
    const second = 20 + PLAYER.attack.startup;
    expect(states[second - 1]!.boss.mode).toBe('transition');
    expect(states[second - 1]!.events).not.toContain('bossHit');
    expect(states[second - 1]!.boss.hp).toBe(states[HIT - 1]!.boss.hp);
  });

  it('opens with the phase opening attack once the pause is over', () => {
    const over = HIT + DUELIST.transitionTicks;
    expect(states[over - 1]!.boss.mode).toBe('approach');
    expect(states[over - 1]!.boss.pendingAttackId).toBe(DUELIST.phases[1]!.opening);
    expect(attackIds(states)[0]).toBe(DUELIST.phases[1]!.opening);
  });
});

describe('chaining in the second phase', () => {
  it('follows an attack straight with another, without the gap, then waits', () => {
    const base = anywhere();
    const boss: BossDef = {
      ...base,
      predictability: 0,
      phases: base.phases.map((p) => ({
        ...p,
        gap: 1,
        maxChain: 2,
        chainChance: 1,
        opening: undefined,
        attacks: [
          { id: 'slam', weight: 1 },
          { id: 'sweep', weight: 1 },
        ],
      })),
    };
    const s = standAt(boss, 120);
    s.player.health = 1000;
    s.boss.phase = 1;
    const states = run(s, 500, () => NO_INPUT, boss);
    const winds = windupUpdates(states);
    const length = (w: number): number =>
      attackLength(boss.attacks.find((a) => a.id === states[w - 1]!.boss.attackId)!);
    // Chained: the next attack starts one update after the previous one ends (no gap).
    expect(winds[1]).toBe(winds[0]! + length(winds[0]!) + 1);
    // The chain is used up after two attacks, so the third waits for the gap (one update here).
    expect(winds[2]).toBe(winds[1]! + length(winds[1]!) + 2);
    expect(winds[3]).toBe(winds[2]! + length(winds[2]!) + 1);
  });
});

describe('victory', () => {
  const states = run(inReach(QUIET_BOSS, 1), 100, swings, QUIET_BOSS);

  it('ends the fight when the last hit lands', () => {
    expect(updatesWith(states, 'bossDefeated')).toEqual([HIT]);
    expect(states[HIT - 1]!.phase).toBe('victory');
    expect(states[HIT - 1]!.boss.hp).toBe(0);
  });

  it('starts a new fight with a new seed after the pause', () => {
    expect(states[HIT + GAME.defeatRestartTicks - 2]!.phase).toBe('victory');
    const fresh = states[HIT + GAME.defeatRestartTicks - 1]!;
    expect(fresh.phase).toBe('fight');
    expect(fresh.tick).toBe(0);
    expect(fresh.boss.hp).toBe(QUIET_BOSS.maxHp);
    expect(fresh.seed).not.toBe(createInitialState(QUIET_BOSS).seed);
  });

  it('does not let the boss hurt the player on the update it is defeated', () => {
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const sweepBoss = solo('sweep');
    const start = (): GameState => {
      const s = standAt(sweepBoss, 150);
      s.boss.hp = 1;
      return s;
    };
    const first = windupUpdates(run(start(), 60, () => NO_INPUT, sweepBoss))[0]!;
    const hitStart = first + sweep.windup;
    // The swing connects on the very update the sweep's hit box becomes active.
    const swingAt = hitStart - PLAYER.attack.startup;
    const result = run(start(), hitStart + 2, (n) => withInput({ attackPressed: n === swingAt }), sweepBoss);
    expect(updatesWith(result, 'bossDefeated')).toEqual([hitStart]);
    expect(updatesWith(result, 'playerHit')).toEqual([]);
    expect(result[hitStart - 1]!.player.health).toBe(PLAYER.maxHealth);
  });
});

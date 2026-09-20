import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER } from '../src/game/params';
import { solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, run, withInput } from './helpers';

const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
const boss = solo('slam');
const first = windupUpdates(run(standAt(boss, 120), 60, () => NO_INPUT, boss))[0]!;
const windowStart = first + slam.windup - DUELIST.counter.window;
const windowEnd = first + slam.windup - 1;
const hitStart = first + slam.windup;
const stagger = DUELIST.counter.staggerTicks;

/** The player at `distance` from the boss starts one swing on update `at`. */
const swingAt = (at: number, b: BossDef = boss, distance = 120) =>
  run(standAt(b, distance), hitStart + stagger + 40, (n) => withInput({ attackPressed: n === at }), b);

describe('a counter', () => {
  it.each([
    { name: 'the first update of the window', at: windowStart },
    { name: 'the last update of the window', at: windowEnd },
  ])('works on $name', ({ at }) => {
    const states = swingAt(at);
    expect(updatesWith(states, 'counter')).toEqual([at]);
    expect(states[at - 1]!.boss.mode).toBe('stagger');
    expect(states[at - 1]!.boss.attackId).toBeNull();
    // Nothing hurts the player while the slam is cancelled and the boss is staggered.
    expect(updatesWith(states.slice(0, hitStart + slam.active + 5), 'playerHit')).toEqual([]);
  });

  it('does not work one update before the window', () => {
    const states = swingAt(windowStart - 1);
    expect(updatesWith(states, 'counter')).toEqual([]);
    expect(updatesWith(states, 'playerHit')[0]).toBe(hitStart);
  });

  it('does not work once the attack has become active', () => {
    const states = swingAt(hitStart);
    expect(updatesWith(states, 'counter')).toEqual([]);
    expect(updatesWith(states, 'playerHit')[0]).toBe(hitStart);
  });

  it('needs the player to be close enough', () => {
    const shortRange: BossDef = { ...boss, counter: { ...boss.counter, range: 100 } };
    expect(updatesWith(swingAt(windowStart, shortRange), 'counter')).toEqual([]);
  });

  it('does not work on an attack that must be dodged', () => {
    const sweepBoss = solo('sweep');
    const sweep = DUELIST.attacks.find((a) => a.id === 'sweep')!;
    const sweepFirst = windupUpdates(run(standAt(sweepBoss, 150), 60, () => NO_INPUT, sweepBoss))[0]!;
    const at = sweepFirst + sweep.windup - 5;
    const states = run(
      standAt(sweepBoss, 150),
      at + 40,
      (n) => withInput({ attackPressed: n === at }),
      sweepBoss,
    );
    expect(updatesWith(states, 'counter')).toEqual([]);
  });
});

describe('the stagger', () => {
  const at = windowStart + 3;
  const states = swingAt(at);

  it('lasts the planned time, then the boss goes back to waiting', () => {
    expect(states.slice(at - 1, at - 1 + stagger).every((s) => s.boss.mode === 'stagger')).toBe(true);
    expect(states[at - 1 + stagger]!.boss.mode).toBe('gap');
  });

  it('is followed by a new attack a moment later', () => {
    expect(windupUpdates(states).some((u) => u > at + stagger)).toBe(true);
  });

  it('makes the player hits do the bonus damage', () => {
    // The counter swing itself connects once its start-up is over, while the boss is staggered.
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(hit).toBe(at + PLAYER.attack.startup);
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - DUELIST.counter.damageMultiplier);
  });
});

describe('a normal hit', () => {
  it('does one damage to a boss that is not staggered', () => {
    const at = first + 2;
    const states = swingAt(at);
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(hit).toBe(at + PLAYER.attack.startup);
    expect(states[hit - 1]!.boss.hp).toBe(DUELIST.maxHp - 1);
  });
});

import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type AttackAim, type GameState } from '../src/game/state';
import { solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, QUIET_BOSS, advance, run, withInput } from './helpers';

/** A player on the floor at x = 600 with the quiet boss straight above or below the swing (same x). */
function scene(over: { airborne?: boolean; bossLift?: number } = {}): GameState {
  const s = createInitialState(QUIET_BOSS, 1);
  s.player.x = 600;
  s.player.prevX = 600;
  s.boss.x = 600;
  s.boss.lift = over.bossLift ?? 0;
  if (over.airborne === true) {
    s.player.y = 430;
    s.player.prevY = 430;
    s.player.onGround = false;
  }
  return s;
}

const aimAfterPress = (s: GameState, moveY: number): AttackAim => advance(s, 1, withInput({ attackPressed: true, moveY })).player.attackAim;

describe('the aim of a swing', () => {
  it('is forward with no vertical input', () => {
    expect(aimAfterPress(scene(), 0)).toBe('forward');
    expect(aimAfterPress(scene({ airborne: true }), 0)).toBe('forward');
  });

  it('is up when up is held, on the ground or in the air', () => {
    expect(aimAfterPress(scene(), -1)).toBe('up');
    expect(aimAfterPress(scene({ airborne: true }), -1)).toBe('up');
  });

  it('is down only in the air; on the ground down still swings forward', () => {
    expect(aimAfterPress(scene({ airborne: true }), 1)).toBe('down');
    expect(aimAfterPress(scene(), 1)).toBe('forward');
  });

  it('is fixed when the swing starts and stays until the next one', () => {
    let s = advance(scene(), 1, withInput({ attackPressed: true, moveY: -1 }));
    s = advance(s, 5, withInput({ moveY: 1 }));
    expect(s.player.attackTick).toBeGreaterThanOrEqual(0);
    expect(s.player.attackAim).toBe('up');
  });
});

describe('an upward or downward swing hitting the boss', () => {
  const hitsFor = (s: GameState, moveY: number) => updatesWith(run(s, 20, (n) => withInput({ attackPressed: n === 1, moveY })), 'bossHit');

  it('an upward swing hits a boss hanging above the player, and a forward swing does not', () => {
    expect(hitsFor(scene({ bossLift: 150 }), -1)).toHaveLength(1);
    expect(hitsFor(scene({ bossLift: 150 }), 0)).toHaveLength(0);
  });

  it('an upward swing misses a boss standing on the floor beside the player', () => {
    const s = scene();
    s.boss.x = 600 + 100;
    expect(hitsFor(s, -1)).toHaveLength(0);
  });

  it('a downward swing in the air hits a boss below the player', () => {
    expect(hitsFor(scene({ airborne: true }), 1)).toHaveLength(1);
  });

  it('a swing still hits only once', () => {
    const states = run(scene({ bossLift: 150 }), 20, (n) => withInput({ attackPressed: n === 1, moveY: -1 }));
    expect(updatesWith(states, 'bossHit')).toHaveLength(1);
  });
});

describe('the pogo bounce', () => {
  it('a downward hit throws the player up, once per swing, and a forward or upward hit does not', () => {
    const states = run(scene({ airborne: true }), 12, (n) => withInput({ attackPressed: n === 1, moveY: 1 }));
    const hit = updatesWith(states, 'bossHit')[0]!;
    expect(states[hit - 1]!.player.vy).toBe(-PLAYER.attack.pogoSpeed);
    expect(states[hit]!.player.y).toBeLessThan(states[hit - 1]!.player.y);
    expect(states[hit]!.player.vy).toBeGreaterThan(-PLAYER.attack.pogoSpeed);
    const up = run(scene({ bossLift: 150 }), 12, (n) => withInput({ attackPressed: n === 1, moveY: -1 }));
    expect(up.every((s) => s.player.vy >= 0)).toBe(true);
  });

  it('a downward swing that misses does not bounce', () => {
    const s = scene({ airborne: true });
    s.boss.x = 900;
    const states = run(s, 12, (n) => withInput({ attackPressed: n === 1, moveY: 1 }));
    expect(states.every((st) => st.player.vy >= 0)).toBe(true);
  });
});

describe('the counter', () => {
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const boss: BossDef = solo('slam');
  const first = windupUpdates(run(standAt(boss, 120), 60, () => NO_INPUT, boss))[0]!;
  const at = first + slam.windup - 1;
  const swing = (moveY: number) =>
    run(standAt(boss, 120), at + 5, (n) => withInput({ attackPressed: n === at, moveY }), boss);

  it('works with a forward swing and not with an upward one', () => {
    expect(updatesWith(swing(0), 'counter')).toEqual([at]);
    expect(updatesWith(swing(-1), 'counter')).toEqual([]);
  });
});

describe('the floor below a downward swing', () => {
  it('does not change where the player lands', () => {
    let s = scene({ airborne: true });
    s.boss.x = 900;
    s = advance(s, 60, withInput({ attackPressed: true, moveY: 1 }));
    expect(s.player.y).toBe(WORLD.floorY);
    expect(s.player.onGround).toBe(true);
  });
});

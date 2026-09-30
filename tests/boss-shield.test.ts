import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { shieldUp } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';
import { advance, run, withInput } from './helpers';

const SWING = melee('swing', {
  class: 'counterable',
  windup: 30,
  active: 4,
  recovery: 4,
  hits: [{ from: 30, to: 34, x0: 0, x1: 60, bottom: 0, top: 60 }],
});

/** A shielded boss that waits (a very long gap) and, when it does attack, only uses "swing". */
const shielded = (over: Partial<BossDef> = {}, gap = 100000): BossDef =>
  customBoss([SWING], { attacks: [{ id: 'swing', weight: 1 }], gap }, { shield: { turnTicks: 40 }, ...over });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The boss at 700 facing left. The player is in front of it (left, x 640) or behind it (right, x 760), about to land a swing. */
function aboutToHit(boss: BossDef, side: 'front' | 'behind'): GameState {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.boss.facing = -1;
  s.player.x = side === 'front' ? 640 : 760;
  s.player.prevX = s.player.x;
  s.player.facing = side === 'front' ? 1 : -1;
  s.player.health = 1e9;
  s.player.attackTick = PLAYER.attack.startup - 1;
  s.player.attackConnected = false;
  s.player.attackAim = 'forward';
  return s;
}

describe('shield: parsing', () => {
  it('accepts a shield and rejects a bad turn time', () => {
    expect(parseBoss(clone(shielded())).shield).toEqual({ turnTicks: 40 });
    for (const bad of [5, 500, 20.5]) {
      const data = clone(shielded());
      data.shield.turnTicks = bad;
      expect(() => parseBoss(data)).toThrow(/shield/);
    }
  });
});

describe('shield: when it is up', () => {
  it('is up while waiting and winding up, down once the swing is out, and down in a stagger', () => {
    const boss = shielded();
    const s = createInitialState(boss, 1);
    expect(shieldUp(s.boss, boss)).toBe(true);
    s.boss.mode = 'attack';
    s.boss.attackId = 'swing';
    s.boss.attackTick = 29;
    expect(shieldUp(s.boss, boss)).toBe(true);
    s.boss.attackTick = 30;
    expect(shieldUp(s.boss, boss)).toBe(false);
    s.boss.mode = 'stagger';
    expect(shieldUp(s.boss, boss)).toBe(false);
  });

  it('is never up on a boss without a shield', () => {
    const boss = shielded();
    delete boss.shield;
    expect(shieldUp(createInitialState(boss, 1).boss, boss)).toBe(false);
  });
});

describe('shield: blocking', () => {
  it('blocks a hit from the front: no damage, a bossBlocked event, and the swing is used up', () => {
    const boss = shielded();
    const s = step(aboutToHit(boss, 'front'), NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp);
    expect(s.events).toContain('bossBlocked');
    expect(s.events).not.toContain('bossHit');
    expect(s.player.attackConnected).toBe(true);
  });

  it('lets a hit from behind through', () => {
    const boss = shielded();
    const s = step(aboutToHit(boss, 'behind'), NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp - 1);
    expect(s.events).toContain('bossHit');
    expect(s.events).not.toContain('bossBlocked');
  });

  it('lets a downward pogo hit through even from the front', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.player.attackAim = 'down';
    start.player.x = 650;
    start.player.prevX = 650;
    start.player.y = WORLD.floorY - 200;
    const s = step(start, NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
    expect(s.events).not.toContain('bossBlocked');
  });

  it('lets a hit from the front through once the swing is out', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.boss.mode = 'attack';
    start.boss.attackId = 'swing';
    start.boss.attackTick = 33;
    const s = step(start, NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
  });

  it('a counter breaks the shield: the boss is staggered and the next hit does full counter damage', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'front');
    start.player.attackTick = -1;
    start.boss.mode = 'attack';
    start.boss.attackId = 'swing';
    start.boss.attackTick = 27;
    let s = step(start, withInput({ attackPressed: true }), boss);
    expect(s.events).toContain('counter');
    s = advance(s, 4, NO_INPUT, boss);
    expect(s.boss.hp).toBe(boss.maxHp - boss.counter.damageMultiplier);
  });

  it('does nothing to a boss without a shield', () => {
    const plain = shielded();
    delete plain.shield;
    const s = step(aboutToHit(plain, 'front'), NO_INPUT, plain);
    expect(s.boss.hp).toBe(plain.maxHp - 1);
  });
});

describe('shield: turning', () => {
  it('turns round only after turnTicks updates of the player being behind it', () => {
    const boss = shielded();
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    const states = run(start, 45, () => NO_INPUT, boss);
    expect(states[38]!.boss.facing).toBe(-1);
    expect(states[38]!.boss.turnTicks).toBe(39);
    expect(states[39]!.boss.facing).toBe(1);
    expect(states[39]!.boss.turnTicks).toBe(0);
  });

  it('does not walk while it is turning, and walks afterwards', () => {
    const boss = shielded({ spacing: { min: 0, max: 100 } });
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    start.player.x = 1000;
    start.player.prevX = 1000;
    const states = run(start, 60, () => NO_INPUT, boss);
    expect(states[30]!.boss.x).toBe(700);
    expect(states[59]!.boss.x).toBeGreaterThan(700);
  });

  it('turns to face the player at once when it commits to an attack', () => {
    const boss = shielded({}, 1);
    const start = aboutToHit(boss, 'behind');
    start.player.attackTick = -1;
    const states = run(start, 30, () => NO_INPUT, boss);
    const swing = states.find((x) => x.boss.mode === 'attack')!;
    expect(swing.boss.facing).toBe(1);
    expect(swing.boss.turnTicks).toBe(0);
  });
});

describe('shield: dials', () => {
  it('survives the difficulty dials', () => {
    const hard = applyDials(shielded(), { ...NORMAL_DIALS, speed: 1.5, readability: 0.6 });
    expect(hard.shield).toEqual({ turnTicks: 40 });
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BRASS_SENTINEL, GALE_REAVER, QUILL_WARDEN } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { DIALS, NORMAL_DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { PLAYER, TEMPER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { attackIds, isWindup, only, pickShare, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { run } from './helpers';

const FULL = TEMPER.start + TEMPER.ramp;

/** Every real boss that has been given an identity. Later tasks add to this list. */
const ROSTER: [string, BossDef][] = [
  ['Ashen Hound', ASHEN_HOUND],
  ['Gale Reaver', GALE_REAVER],
  ['Quill Warden', QUILL_WARDEN],
  ['Brass Sentinel', BRASS_SENTINEL],
];

/** The boss at 700 facing left. The player is in front of it (left, x 640) or behind it (right, x 760), about to land a swing. */
function aboutToHit(boss: BossDef, side: 'front' | 'behind' = 'front'): GameState {
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

const attack = (boss: BossDef, id: string) => boss.attacks.find((a) => a.id === id)!;

describe('the roster still parses with its new abilities', () => {
  it.each(ROSTER)('%s: valid at every dial extreme, and the file itself at Normal', (_name, boss) => {
    expect(applyDials(boss, NORMAL_DIALS)).toEqual(boss);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        const dials: Dials = { ...NORMAL_DIALS, [dial.id]: value };
        expect(() => applyDials(boss, dials)).not.toThrow();
      }
    }
  });
});

describe('Ashen Hound: runs past you, skitters when hit, turns to pounces when ignored', () => {
  it('a slip is always followed by a bite, and the bite comes from the far side of the player', () => {
    const boss = only(ASHEN_HOUND, 'slip');
    // The player stands at the very edge of the slip's range, on the boss's left.
    const states = run(standAt(boss, 240), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['slip', 'bite', 'slip', 'bite']);
    const firstBite = states.find((s) => s.events.some(isWindup) && s.boss.attackId === 'bite')!;
    expect(firstBite.boss.x).toBeLessThan(firstBite.player.x);
  });

  it('a hit on the waiting Hound starts a skitter: it hurts nobody and carries the Hound away from the player', () => {
    const start = aboutToHit(ASHEN_HOUND);
    const states = run(start, 60, () => NO_INPUT, ASHEN_HOUND);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.attackId).toBe('skitter');
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[59]!.boss.x - start.boss.x).toBeGreaterThan(100);
  });

  it('turns to pounces when it has been left alone for a while', () => {
    const calm = pickShare(ASHEN_HOUND, ['pounce'], 0);
    const furious = pickShare(ASHEN_HOUND, ['pounce'], FULL);
    expect(furious).toBeGreaterThanOrEqual(calm + 0.08);
  });
});

describe('Gale Reaver: fixed combos ending in a carry, backs off when hit', () => {
  it('a wind-slash starts the first combo: wind-slash, gale-jab, gale-carry, with no long pause between steps', () => {
    const boss = only(GALE_REAVER, 'wind-slash');
    const states = run(standAt(boss, 100), 500, () => NO_INPUT, boss);
    const ids = attackIds(states);
    expect(ids.slice(0, 6)).toEqual(['wind-slash', 'gale-jab', 'gale-carry', 'wind-slash', 'gale-jab', 'gale-carry']);
    const starts = windupUpdates(states);
    for (const i of [0, 1]) {
      expect(starts[i + 1]! - starts[i]!).toBeLessThanOrEqual(attackLength(attack(boss, ids[i]!)) + 2);
    }
  });

  it('a gale-jab starts the second combo: gale-jab, gale-jab, gale-cyclone', () => {
    const boss = only(GALE_REAVER, 'gale-jab');
    const states = run(standAt(boss, 100), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 3)).toEqual(['gale-jab', 'gale-jab', 'gale-cyclone']);
  });

  it('the carry drags the Reaver across the arena and hurts a player who stands still', () => {
    const boss = only(GALE_REAVER, 'gale-carry');
    const start = standAt(boss, 150);
    start.player.health = 1e9;
    const states = run(start, 120, () => NO_INPUT, boss);
    const begin = states.find((s) => s.boss.mode === 'attack' && s.boss.attackTick === 0)!;
    const end = states.find((s) => s.boss.mode === 'attack' && s.boss.attackTick >= 46)!;
    expect(Math.abs(end.boss.x - begin.boss.x)).toBeGreaterThan(450);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThan(0);
  });

  it('a hit on the waiting Reaver makes it back off without hurting anyone', () => {
    const start = aboutToHit(GALE_REAVER);
    const states = run(start, 40, () => NO_INPUT, GALE_REAVER);
    expect(states[0]!.boss.attackId).toBe('gale-recoil');
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[39]!.boss.x - start.boss.x).toBeGreaterThan(100);
  });
});

describe('Quill Warden: a quick low poke then a rising swipe, vaults away when hit', () => {
  it('a snap-piercer is always followed by the rising swipe', () => {
    const boss = only(QUILL_WARDEN, 'snap-piercer');
    const states = run(standAt(boss, 300), 400, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['snap-piercer', 'rising-swipe', 'snap-piercer', 'rising-swipe']);
  });

  it('the quick poke becomes more common when the Warden has been left alone', () => {
    const calm = pickShare(QUILL_WARDEN, ['snap-piercer'], 0);
    const furious = pickShare(QUILL_WARDEN, ['snap-piercer'], FULL);
    expect(furious).toBeGreaterThanOrEqual(calm * 1.5);
  });

  it('a hit on the waiting Warden starts the backwards vault', () => {
    const states = run(aboutToHit(QUILL_WARDEN), 2, () => NO_INPUT, QUILL_WARDEN);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.mode).toBe('attack');
    expect(states[0]!.boss.attackId).toBe('backwards-vault');
  });
});

describe('Brass Sentinel: a shield in front, longer and redder attacks when ignored', () => {
  it('a hit from the front on the waiting Sentinel is blocked', () => {
    const s = step(aboutToHit(BRASS_SENTINEL, 'front'), NO_INPUT, BRASS_SENTINEL);
    expect(s.events).toContain('bossBlocked');
    expect(s.events).not.toContain('bossHit');
    expect(s.boss.hp).toBe(BRASS_SENTINEL.maxHp);
  });

  it('a hit from behind lands', () => {
    const s = step(aboutToHit(BRASS_SENTINEL, 'behind'), NO_INPUT, BRASS_SENTINEL);
    expect(s.events).toContain('bossHit');
    expect(s.boss.hp).toBeLessThan(BRASS_SENTINEL.maxHp);
  });

  it('the long late-herald and the red brass-snap become more common when the Sentinel has been left alone', () => {
    const heavy = ['late-herald', 'brass-snap'];
    const calm = pickShare(BRASS_SENTINEL, heavy, 0);
    const furious = pickShare(BRASS_SENTINEL, heavy, FULL);
    expect(furious).toBeGreaterThanOrEqual(calm * 1.4);
  });
});

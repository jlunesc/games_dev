import { describe, expect, it } from 'vitest';
import {
  ASHEN_HOUND,
  BRASS_SENTINEL,
  CINDER_GOLEM,
  GALE_REAVER,
  QUILL_WARDEN,
  STORM_KITE,
  TREMOR_BRUTE,
  VEIL_DANCER,
  VESPER_SAGE,
} from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { attackLength } from '../src/game/boss';
import { DIALS, NORMAL_DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { bossHidden } from '../src/game/geometry';
import { PLAYER, TEMPER, WORLD } from '../src/game/params';
import { createInitialState, type BoltState, type EruptionState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { attackIds, isWindup, only, pickShare, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';

const FULL = TEMPER.start + TEMPER.ramp;

/** Every real boss that has been given an identity. Later tasks add to this list. */
const ROSTER: [string, BossDef][] = [
  ['Ashen Hound', ASHEN_HOUND],
  ['Gale Reaver', GALE_REAVER],
  ['Quill Warden', QUILL_WARDEN],
  ['Brass Sentinel', BRASS_SENTINEL],
  ['Cinder Golem', CINDER_GOLEM],
  ['Tremor Brute', TREMOR_BRUTE],
  ['Storm Kite', STORM_KITE],
  ['Veil Dancer', VEIL_DANCER],
  ['Vesper Sage', VESPER_SAGE],
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

type Bot = (n: number, prev: GameState) => InputFrame;

/** The inputs a bot would press over `count` updates from `start`, so `analyzeRun` can replay them. */
function framesFrom(boss: BossDef, start: GameState, bot: Bot, count: number): InputFrame[] {
  const frames: InputFrame[] = [];
  let s = start;
  for (let n = 1; n <= count; n++) {
    const frame = bot(n, s);
    frames.push(frame);
    s = step(s, frame, boss);
  }
  return frames;
}

/** For every use of attack `id`: the updates from the start of its wind-up to the update its strike begins. */
function strikeDelays(boss: BossDef, id: string, seed: number, count = 900): number[] {
  const windup = attack(boss, id).windup;
  const s = createInitialState(boss, seed);
  s.player.health = 1e9;
  const states = run(s, count, () => NO_INPUT, boss);
  const starts = windupUpdates(states);
  const strikes = states.flatMap((x, i) =>
    x.boss.mode === 'attack' && x.boss.attackTick === windup && (i === 0 || states[i - 1]!.boss.attackTick !== windup) ? [i + 1] : [],
  );
  return strikes.map((strike, i) => strike - starts[i]!);
}

/** The boss, using only `id`, waits a different extra time before each strike: never less than the wind-up, never more than the hold. */
function expectHeld(boss: BossDef, id: string, hold: number): void {
  expect(attack(boss, id).hold, `${id} has a hold`).toBe(hold);
  const windup = attack(boss, id).windup;
  const waits = [1, 2, 3, 4].flatMap((seed) => strikeDelays(only(boss, id), id, seed));
  expect(waits.length).toBeGreaterThan(8);
  expect(Math.min(...waits)).toBeGreaterThanOrEqual(windup);
  expect(Math.max(...waits)).toBeLessThanOrEqual(windup + hold);
  expect(new Set(waits).size).toBeGreaterThan(3);
}

/** Walks to the nearest spot outside every blast or ember (with a margin) as soon as one is on the floor, and stays out of them. */
const stepOut: Bot = (_n, prev) => {
  const p = prev.player;
  const areas = prev.shots.flatMap((s) => (s.kind === 'eruption' ? [{ left: s.x - s.width / 2 - 40, right: s.x + s.width / 2 + 40 }] : []));
  if (areas.length === 0) return NO_INPUT;
  const inside = (x: number) => areas.some((a) => x > a.left && x < a.right);
  if (!inside(p.x)) return NO_INPUT;
  const spots = areas.flatMap((a) => [a.left, a.right]).filter((x) => x > 30 && x < WORLD.width - 30 && !inside(x));
  if (spots.length === 0) return NO_INPUT;
  const goal = spots.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best));
  return withInput({ moveX: goal > p.x ? 1 : -1 });
};

describe('Cinder Golem: burning patches, a slam that waits, cooled by a hit', () => {
  const kiln = only(CINDER_GOLEM, 'kiln-crack');
  const idle = (count: number) => Array.from({ length: count }, () => NO_INPUT);

  it('a kiln-crack leaves patches that are still on the floor long after the blast', () => {
    const start = createInitialState(kiln, 1);
    start.player.health = 1e9;
    const states = run(start, 190, () => NO_INPUT, kiln);
    const late = states.flatMap((s) => s.shots).find((sh): sh is EruptionState => sh.kind === 'eruption' && sh.age > sh.delay + sh.burst + 100);
    expect(late).toBeDefined();
  });

  it('a player who stands on a patch is hurt again by the embers after the blast', () => {
    const start = standAt(kiln, 640);
    start.player.health = 1e9;
    const states = run(start, 190, () => NO_INPUT, kiln);
    expect(updatesWith(states, 'playerHit').length).toBeGreaterThanOrEqual(2);
  });

  it('walking out of the marks avoids the blast and the embers; standing still does not', () => {
    expect(analyzeRun(kiln, standAt(kiln, 640), idle(300)).attacks[0]!.outcome).toBe('hit');
    const frames = framesFrom(kiln, standAt(kiln, 640), stepOut, 300);
    expect(analyzeRun(kiln, standAt(kiln, 640), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('the crag-slam waits a random extra moment before it drops', () => {
    expectHeld(CINDER_GOLEM, 'crag-slam', 12);
  });

  it('a hit on the waiting Golem cools it down by the relief', () => {
    const s = aboutToHit(CINDER_GOLEM);
    s.boss.temper = FULL;
    const after = step(s, NO_INPUT, CINDER_GOLEM);
    expect(after.events).toContain('bossHit');
    expect(after.boss.temper).toBeLessThanOrEqual(FULL - TEMPER.relief);
  });

  it('turns to its slow, big attacks when it has been left alone', () => {
    const big = ['kiln-crack', 'furnace-stomp'];
    expect(pickShare(CINDER_GOLEM, big, FULL)).toBeGreaterThanOrEqual(pickShare(CINDER_GOLEM, big, 0) * 1.3);
  });
});

describe('Tremor Brute: rows across the arena with two ways out, a fist that waits', () => {
  const row = only(TREMOR_BRUTE, 'row-quake');

  it('marks eight blocks, and wherever the player stands there is a spot to reach in time that no block covers', () => {
    for (let px = 30; px <= WORLD.width - 30; px += 20) {
      const start = createInitialState(row, 1);
      start.player.x = px;
      start.player.prevX = px;
      start.player.health = 1e9;
      const states = run(start, 60, () => NO_INPUT, row);
      const born = states.find((s) => s.shots.some((sh) => sh.kind === 'eruption'))!;
      const blocks = born.shots.filter((sh): sh is EruptionState => sh.kind === 'eruption');
      expect(blocks, `player at ${px}`).toHaveLength(8);
      const free = (x: number) => blocks.every((e) => Math.abs(x - e.x) >= e.width / 2 + PLAYER.width / 2);
      let reachable = false;
      for (let x = PLAYER.width / 2; x <= WORLD.width - PLAYER.width / 2 && !reachable; x += 4) {
        reachable = free(x) && Math.abs(x - px) <= 290;
      }
      expect(reachable, `a way out for a player at ${px}`).toBe(true);
    }
  });

  it('the hammer-fist waits a random extra moment before it strikes', () => {
    expectHeld(TREMOR_BRUTE, 'hammer-fist', 10);
  });

  it('turns to the row when it has been left alone', () => {
    expect(pickShare(TREMOR_BRUTE, ['row-quake'], FULL)).toBeGreaterThanOrEqual(pickShare(TREMOR_BRUTE, ['row-quake'], 0) * 1.3);
  });
});

describe('Storm Kite: bolts from the sides, and a swoop that brings some', () => {
  const REST = STORM_KITE.flight!.height;

  /** For every update in which bolts appeared at an arena edge: the update and which way they fly (1 from the left, -1 from the right). */
  const volleys = (states: GameState[]) =>
    states.flatMap((st) => {
      const born = st.shots.filter((sh): sh is BoltState => sh.kind === 'bolt' && sh.x === sh.originX);
      return born.length === 0 ? [] : [{ tick: st.tick, dirs: born.map((b) => b.dir).sort() }];
    });

  it('the crossfire fires a low bolt from each edge, twice, a few updates apart', () => {
    const boss = only(STORM_KITE, 'crossfire');
    const start = createInitialState(boss, 1);
    start.player.health = 1e9;
    const found = volleys(run(start, 100, () => NO_INPUT, boss));
    expect(found).toHaveLength(2);
    for (const v of found) expect(v.dirs).toEqual([-1, 1]);
    expect(found[1]!.tick - found[0]!.tick).toBeGreaterThan(0);
    expect(found[1]!.tick - found[0]!.tick).toBeLessThan(30);
  });

  it('the crossfire hurts a player who stands still and is cleared by jumping as each bolt closes in', () => {
    const boss = only(STORM_KITE, 'crossfire');
    const hopper: Bot = (_n, prev) => {
      const p = prev.player;
      const coming = prev.shots.some((sh) => sh.kind === 'bolt' && sh.lift < 40 && Math.abs(sh.x - p.x) < 150 && (sh.dir === 1 ? sh.x < p.x : sh.x > p.x));
      if (coming && p.onGround) return withInput({ jumpPressed: true, jumpHeld: true });
      return withInput({ jumpHeld: !p.onGround });
    };
    const idle = analyzeRun(boss, standAt(boss, 300), Array.from({ length: 220 }, () => NO_INPUT));
    expect(idle.attacks[0]!.outcome).toBe('hit');
    const frames = framesFrom(boss, standAt(boss, 300), hopper, 220);
    expect(analyzeRun(boss, standAt(boss, 300), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('the tempest-pass dips to the floor like a swoop and fires one bolt from each edge while it does', () => {
    const boss = only(STORM_KITE, 'tempest-pass');
    const start = createInitialState(boss, 1);
    start.player.health = 1e9;
    const states = run(start, 120, () => NO_INPUT, boss);
    expect(states.some((s) => s.boss.lift < REST)).toBe(true);
    expect(volleys(states).map((v) => v.dirs.join())).toEqual(['-1', '1']);
  });

  it('turns to the crossfire when it has been left alone', () => {
    expect(pickShare(STORM_KITE, ['crossfire'], FULL)).toBeGreaterThanOrEqual(pickShare(STORM_KITE, ['crossfire'], 0) * 1.3);
  });
});

describe('Veil Dancer: vanishes, comes back behind you, vanishes somewhere else', () => {
  const cut = only(VEIL_DANCER, 'shadow-cut');
  const away = only(VEIL_DANCER, 'blink-away');
  const still = (count: number): InputFrame[] => Array.from({ length: count }, () => NO_INPUT);

  it('a shadow-cut hides the boss, then it stands just behind the player, facing them', () => {
    const start = standAt(cut, 150);
    start.player.health = 1e9;
    const states = run(start, 80, () => NO_INPUT, cut);
    expect(states.filter((s) => bossHidden(s.boss, cut)).length).toBeGreaterThan(8);
    const back = states.find((s, i) => i > 0 && !bossHidden(s.boss, cut) && bossHidden(states[i - 1]!.boss, cut))!;
    expect(back).toBeDefined();
    expect(back.boss.x).toBeLessThan(back.player.x);
    expect(back.player.x - back.boss.x).toBeLessThan(120);
    expect(back.boss.facing).toBe(1);
  });

  it('a player who stands still is cut, and a dash timed to the strike avoids it', () => {
    expect(analyzeRun(cut, standAt(cut, 150), still(200)).attacks[0]!.outcome).toBe('hit');
    const dasher: Bot = (_n, prev) =>
      prev.boss.mode === 'attack' && prev.boss.attackId === 'shadow-cut' && prev.boss.attackTick === 32 ? withInput({ dashPressed: true }) : NO_INPUT;
    const frames = framesFrom(cut, standAt(cut, 150), dasher, 200);
    expect(analyzeRun(cut, standAt(cut, 150), frames).attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('a blink-away reappears far from the player and hurts nobody', () => {
    const start = standAt(away, 150);
    start.player.health = 1e9;
    const states = run(start, 60, () => NO_INPUT, away);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    const back = states.find((s, i) => i > 0 && !bossHidden(s.boss, away) && bossHidden(states[i - 1]!.boss, away))!;
    expect(back).toBeDefined();
    expect(Math.abs(back.boss.x - back.player.x)).toBeGreaterThan(350);
  });

  it('a blink-away is followed at once by a shadow-cut, every time', () => {
    const start = standAt(away, 150);
    start.player.health = 1e9;
    const states = run(start, 600, () => NO_INPUT, away);
    expect(attackIds(states).slice(0, 4)).toEqual(['blink-away', 'shadow-cut', 'blink-away', 'shadow-cut']);
    const starts = windupUpdates(states);
    expect(starts[1]! - starts[0]!).toBeLessThanOrEqual(attackLength(attack(away, 'blink-away')) + 2);
  });

  it('turns to the shadow cut when it has been left alone', () => {
    expect(pickShare(VEIL_DANCER, ['shadow-cut'], FULL)).toBeGreaterThanOrEqual(pickShare(VEIL_DANCER, ['shadow-cut'], 0) * 1.3);
  });
});

describe('Vesper Sage: fixed patterns of shots, floats away when hit', () => {
  it('a single-bolt is always followed by a lob', () => {
    const boss = only(VESPER_SAGE, 'single-bolt');
    const start = standAt(boss, 500);
    start.player.health = 1e9;
    const states = run(start, 600, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['single-bolt', 'lob', 'single-bolt', 'lob']);
  });

  it('a triple-volley is always followed by a single-bolt', () => {
    const boss = only(VESPER_SAGE, 'triple-volley');
    const start = standAt(boss, 500);
    start.player.health = 1e9;
    const states = run(start, 700, () => NO_INPUT, boss);
    expect(attackIds(states).slice(0, 4)).toEqual(['triple-volley', 'single-bolt', 'triple-volley', 'single-bolt']);
  });

  it('phase 2 has its own patterns and keeps farther away', () => {
    expect(VESPER_SAGE.phases[1]!.combos).toHaveLength(2);
    expect(VESPER_SAGE.phases[1]!.spacing!.min).toBeGreaterThan(VESPER_SAGE.spacing.min);
  });

  it('a hit on the waiting Sage makes it blink away, and it does not hurt anyone', () => {
    const states = run(aboutToHit(VESPER_SAGE), 60, () => NO_INPUT, VESPER_SAGE);
    expect(states[0]!.events).toContain('bossHit');
    expect(states[0]!.boss.attackId).toBe('float-away');
    expect(states.some((s) => bossHidden(s.boss, VESPER_SAGE))).toBe(true);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    const last = states[59]!;
    expect(Math.abs(last.boss.x - last.player.x)).toBeGreaterThan(350);
  });

  it('turns to its long patterns when it has been left alone', () => {
    const long = ['triple-volley', 'lob-and-low'];
    expect(pickShare(VESPER_SAGE, long, FULL)).toBeGreaterThanOrEqual(pickShare(VESPER_SAGE, long, 0) * 1.3);
  });
});

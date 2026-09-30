import { describe, expect, it } from 'vitest';
import { STORM_KITE, bossById } from '../src/bosses';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DT } from '../src/engine/time';
import { DIALS, NORMAL_DIALS, applyDials, presetDials, type Dials } from '../src/game/difficulty';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { analyzeRun } from '../src/stats/analyze';
import { withInput } from './helpers';

type Bot = (n: number, prev: GameState) => InputFrame;

const MAX_UPDATES = 5400;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const REST = STORM_KITE.flight!.height;
const RISE = STORM_KITE.flight!.rise;

function fight(bot: Bot, boss: BossDef, seed: number, startX?: number) {
  const start = createInitialState(boss, seed);
  if (startX !== undefined) {
    start.player.x = startX;
    start.player.prevX = startX;
  }
  let s = start;
  for (let n = 1; n <= MAX_UPDATES && s.phase === 'fight'; n++) s = step(s, bot(n, s), boss);
  return { ended: s.phase !== 'fight', won: s.phase === 'victory', updates: s.tick, damage: start.player.health - s.player.health };
}

/** The Kite using only attack `id` from any distance, never walking, starting a new attack one update after the last. */
function solo(id: string, gap = 1): BossDef {
  return {
    ...STORM_KITE,
    spacing: { min: 0, max: 1e9 },
    attacks: STORM_KITE.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
    phases: STORM_KITE.phases.map((p) => ({ ...p, gap, maxChain: 1, chainChance: 0, attacks: [{ id, weight: 1 }] })),
  };
}

/** The Kite hanging there and never attacking or walking: a target for tests about the player and the rise. */
const IDLE_KITE: BossDef = {
  ...STORM_KITE,
  spacing: { min: 0, max: 1e9 },
  phases: STORM_KITE.phases.map((p) => ({ ...p, attacks: [] })),
};

function standAt(boss: BossDef, x: number): GameState {
  const s = createInitialState(boss, 1);
  s.player.x = x;
  s.player.prevX = x;
  return s;
}

function trace(boss: BossDef, s0: GameState, count: number, bot: Bot = () => NO_INPUT): GameState[] {
  const out: GameState[] = [];
  let s = s0;
  for (let n = 1; n <= count; n++) {
    s = step(s, bot(n, s), boss);
    out.push(s);
  }
  return out;
}

/** The first state in which the attack is at update `n` of itself. */
const at = (states: GameState[], n: number) => states.find((s) => s.boss.mode === 'attack' && s.boss.attackTick === n)!;
const indexAt = (states: GameState[], n: number) => states.indexOf(at(states, n));

const attack = (id: string) => STORM_KITE.attacks.find((a) => a.id === id)!;

describe('the Storm Kite file', () => {
  it('is loaded and found by id, with six attacks, flight, no arena and two phases', () => {
    expect(STORM_KITE.id).toBe('storm-kite');
    expect(bossById('storm-kite')).toBe(STORM_KITE);
    expect(STORM_KITE.attacks.map((a) => a.id)).toEqual(['plunge', 'swoop', 'bolt-volley', 'long-strafe', 'crossfire', 'tempest-pass']);
    expect(STORM_KITE.flight).toBeDefined();
    expect(STORM_KITE.arena).toBeUndefined();
    expect(STORM_KITE.phases).toHaveLength(2);
  });

  it('hangs above the highest swing, warns for at least 21 updates and is all must-dodge', () => {
    const highestSwing = PLAYER.jumpSpeed ** 2 / (2 * PLAYER.gravity) + PLAYER.height / 2 + PLAYER.attack.height / 2;
    expect(REST).toBeGreaterThan(highestSwing);
    for (const a of STORM_KITE.attacks) {
      expect(a.windup).toBeGreaterThanOrEqual(21);
      expect(a.class).toBe('mustDodge');
    }
  });

  it('survives every dial extreme and is unchanged at Normal', () => {
    expect(applyDials(STORM_KITE, NORMAL_DIALS)).toEqual(STORM_KITE);
    for (const dial of DIALS) {
      for (const value of [dial.min, dial.max]) {
        expect(() => applyDials(STORM_KITE, { ...NORMAL_DIALS, [dial.id]: value })).not.toThrow();
      }
    }
    const lowest = Object.fromEntries(DIALS.map((d) => [d.id, d.min])) as Dials;
    const highest = Object.fromEntries(DIALS.map((d) => [d.id, d.max])) as Dials;
    expect(() => applyDials(STORM_KITE, lowest)).not.toThrow();
    expect(() => applyDials(STORM_KITE, highest)).not.toThrow();
  });
});

describe('the format of flight and dives', () => {
  const copy = (): BossDef => structuredClone(STORM_KITE);
  const rejects = (boss: unknown, path: string) => {
    let error: unknown;
    try {
      parseBoss(boss);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BossFormatError);
    expect((error as Error).message).toContain(path);
  };

  it('accepts the real file as written', () => {
    expect(() => parseBoss(copy())).not.toThrow();
  });

  it('rejects a flight that is too low to be out of reach, too fast, missing fields or too tall for the arena', () => {
    const low = copy();
    low.flight!.height = 200;
    rejects(low, 'boss.flight.height');
    const tall = copy();
    tall.flight!.height = 600;
    rejects(tall, 'boss.flight.height');
    const slow = copy();
    slow.flight!.rise = 5;
    rejects(slow, 'boss.flight.rise');
    const bare = copy() as unknown as { flight: Record<string, unknown> };
    delete bare.flight.rise;
    rejects(bare, 'boss.flight.rise');
  });

  it('rejects a dive on a boss that does not fly, and a leap on one that does', () => {
    const walker = copy() as BossDef;
    delete walker.flight;
    rejects(walker, 'boss.attacks[0].dive');
    const leaper = copy();
    leaper.attacks[2]!.leap = { from: 26, to: 40, height: 100, target: 'player' };
    rejects(leaper, 'boss.attacks[2].leap');
  });

  it('rejects a dive with a bad shape, target, range or timing', () => {
    const shape = copy();
    (shape.attacks[0]!.dive as unknown as { shape: string }).shape = 'spiral';
    rejects(shape, 'boss.attacks[0].dive.shape');
    const target = copy();
    (target.attacks[0]!.dive as unknown as { target: string }).target = 'sky';
    rejects(target, 'boss.attacks[0].dive.target');
    const early = copy();
    early.attacks[0]!.dive!.from = 10;
    rejects(early, 'boss.attacks[0].dive');
    const late = copy();
    late.attacks[0]!.dive!.to = 200;
    rejects(late, 'boss.attacks[0].dive');
    const backwards = copy();
    backwards.attacks[0]!.dive!.to = backwards.attacks[0]!.dive!.from;
    rejects(backwards, 'boss.attacks[0].dive');
  });

  it('needs a distance for a forward or back dive, and a "low" for a swoop only', () => {
    const noDistance = copy();
    delete noDistance.attacks[1]!.dive!.distance;
    rejects(noDistance, 'boss.attacks[1].dive.distance');
    const noLow = copy();
    delete noLow.attacks[1]!.dive!.low;
    rejects(noLow, 'boss.attacks[1].dive.low');
    const tooLow = copy();
    tooLow.attacks[1]!.dive!.low = 45;
    rejects(tooLow, 'boss.attacks[1].dive.low');
    const plungeLow = copy();
    plungeLow.attacks[0]!.dive!.low = 5;
    rejects(plungeLow, 'boss.attacks[0].dive.low');
  });

  it('rejects an attack with both a dive and a move that overlap', () => {
    const both = copy();
    both.attacks[0]!.move = { from: 30, to: 40, speed: 100 };
    rejects(both, 'boss.attacks[0].dive');
  });
});

describe('a boss that flies', () => {
  it('starts at its resting height and cannot be hurt by a jumping swing under it', () => {
    const s0 = standAt(IDLE_KITE, IDLE_KITE.startX);
    expect(s0.boss.lift).toBe(REST);
    const states = trace(IDLE_KITE, s0, 120, (n) =>
      withInput({ jumpPressed: n % 30 === 1, jumpHeld: n % 30 < 14, attackPressed: n % 30 >= 12 && n % 30 <= 16 }),
    );
    expect(states.at(-1)!.boss.hp).toBe(IDLE_KITE.maxHp);
    expect(Math.max(...states.map((s) => s.boss.lift))).toBe(REST);
  });

  it('a plunge falls to the floor at the spot the player stood at when it began, and stays low until it ends', () => {
    const boss = solo('plunge');
    const a = attack('plunge');
    const dive = a.dive!;
    const states = trace(boss, standAt(boss, 300), 120);
    const i0 = indexAt(states, 1);
    expect(states[i0 + dive.from - 2]!.boss.lift).toBe(REST);
    const during = states.slice(i0 + dive.from - 1, i0 + dive.to);
    for (let i = 1; i < during.length; i++) {
      expect(during[i]!.boss.lift).toBeLessThan(during[i - 1]!.boss.lift);
      expect(during[i]!.boss.x).toBeLessThan(during[i - 1]!.boss.x);
    }
    const landed = at(states, dive.to);
    expect(landed.boss.lift).toBe(0);
    expect(landed.boss.x).toBe(300);
    for (let t = dive.to; t < a.windup + a.active + a.recovery; t++) expect(at(states, t).boss.lift).toBe(0);
  });

  it('the plunge lands where the player stood at take-off, not where the player runs to afterwards', () => {
    const boss = solo('plunge');
    const dive = attack('plunge').dive!;
    let t0 = -1;
    const bot: Bot = (_n, prev) => {
      if (prev.boss.mode === 'attack' && t0 < 0) t0 = prev.tick;
      return t0 >= 0 && prev.tick - t0 >= dive.from + 1 ? withInput({ moveX: 1 }) : NO_INPUT;
    };
    const states = trace(boss, standAt(boss, 300), 100, bot);
    expect(at(states, dive.to).boss.x).toBe(300);
    expect(at(states, dive.to).player.health).toBe(PLAYER.maxHealth);
  });

  it('after the attack it climbs back at its own speed and ends at its resting height', () => {
    const boss = solo('plunge');
    const a = attack('plunge');
    const over = a.windup + a.active + a.recovery;
    const states = trace(boss, standAt(boss, 300), 260);
    const i = indexAt(states, over - 1);
    const rising = states.slice(i, i + 120);
    for (let k = 1; k < rising.length; k++) {
      const gain = rising[k]!.boss.lift - rising[k - 1]!.boss.lift;
      if (rising[k]!.boss.mode === 'attack' && rising[k - 1]!.boss.mode !== 'attack') break;
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThanOrEqual(RISE * DT + 1e-9);
    }
    expect(Math.max(...rising.map((s) => s.boss.lift))).toBeGreaterThan(0);
  });

  it('a player who walks up and swings while it is low hurts it; the same swing while it hangs does nothing', () => {
    const boss = solo('plunge');
    const a = attack('plunge');
    const bot: Bot = (_n, prev) => withInput({ attackPressed: prev.boss.lift === 0 && prev.tick % 6 === 0 });
    const s0 = standAt(boss, 500);
    const states = trace(boss, s0, a.windup + a.active + a.recovery + 40, bot);
    const firstLow = states.findIndex((s) => s.boss.lift === 0);
    for (const s of states.slice(0, firstLow)) expect(s.boss.hp).toBe(boss.maxHp);
    expect(states.at(-1)!.boss.hp).toBeLessThan(boss.maxHp);
  });

  it('a swoop dips to the floor for its `low` updates, then is back at the height it started from with its x at the far end', () => {
    const boss = solo('swoop');
    const dive = attack('swoop').dive!;
    const states = trace(boss, standAt(boss, 640), 160);
    const i0 = indexAt(states, 1);
    const startX = states[i0]!.boss.x;
    const inFlight = states.slice(i0 + dive.from - 1, i0 + dive.to - 1);
    expect(inFlight.filter((s) => s.boss.lift === 0)).toHaveLength(dive.low!);
    for (const s of inFlight) expect(s.boss.lift).toBeLessThan(REST);
    const done = at(states, dive.to);
    expect(done.boss.lift).toBe(REST);
    expect(done.boss.leapToX).toBeNull();
    expect(done.boss.diveFromLift).toBeNull();
    expect(Math.abs(done.boss.x - startX)).toBeCloseTo(dive.distance!, 3);
  });

  it('the swoop hurts only while it skims: standing in its path is hit, dashing through is not', () => {
    const boss = solo('swoop');
    const idle = analyzeRun(boss, standAt(boss, 640), Array.from({ length: 140 }, () => NO_INPUT));
    expect(idle.attacks[0]!.outcome).toBe('hit');
    const dashAt = attack('swoop').hits[0]!.from - 4;
    const frames = Array.from({ length: 140 }, (_, i) => withInput({ dashPressed: i + 1 === dashAt, moveX: 1 }));
    const dodged = analyzeRun(boss, standAt(boss, 640), frames);
    expect(dodged.attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('a plunge is dodged by moving away after take-off and hit by standing still', () => {
    const boss = solo('plunge');
    const idle = analyzeRun(boss, standAt(boss, 500), Array.from({ length: 120 }, () => NO_INPUT));
    expect(idle.attacks[0]!.outcome).toBe('hit');
    const from = attack('plunge').dive!.from;
    const frames = Array.from({ length: 120 }, (_, i) => withInput({ moveX: i + 1 > from ? -1 : 0 }));
    const away = analyzeRun(boss, standAt(boss, 500), frames);
    expect(away.attacks[0]).toMatchObject({ outcome: 'dodged', damageTaken: 0 });
  });

  it('aimed bolts from the hanging boss fly down at the player and can be sidestepped', () => {
    const boss = solo('bolt-volley');
    const states = trace(boss, standAt(boss, 500), 60);
    const shot = states.flatMap((s) => s.shots).find((sh) => sh.kind === 'bolt');
    expect(shot).toBeDefined();
    const fired = states.find((s) => s.shots.length > 0)!;
    expect(fired.boss.lift).toBe(REST);
    expect(fired.shots[0]!.lift).toBeGreaterThan(200);
    const idle = analyzeRun(boss, standAt(boss, 500), Array.from({ length: 140 }, () => NO_INPUT));
    expect(idle.attacks[0]!.outcome).toBe('hit');
  });

  it('a phase change while it is low sends it back up at its own speed, without teleporting it', () => {
    const boss = solo('plunge');
    const dive = attack('plunge').dive!;
    let s = standAt(boss, 300);
    for (let n = 0; n < 200 && !(s.boss.mode === 'attack' && s.boss.attackTick === dive.to + 2); n++) s = step(s, NO_INPUT, boss);
    expect(s.boss.lift).toBe(0);
    s.boss.hp = Math.floor(boss.maxHp * 0.4);
    let prev = s.boss.lift;
    let rose = false;
    for (let n = 0; n < 200; n++) {
      s = step(s, NO_INPUT, boss);
      const gain = s.boss.lift - prev;
      if (gain > 0) rose = true;
      if (s.boss.mode === 'attack' && s.boss.attackTick <= dive.to) break;
      expect(gain).toBeLessThanOrEqual(RISE * DT + 1e-9);
      prev = s.boss.lift;
    }
    expect(rose).toBe(true);
  });
});

describe('dials and dives', () => {
  it('readability shifts a dive with its warning and range stretches its distance; the shape and length stay', () => {
    const swoop = attack('swoop').dive!;
    const lax = applyDials(STORM_KITE, { ...NORMAL_DIALS, readability: 1.5, range: 1.25 }).attacks.find((a) => a.id === 'swoop')!;
    expect(lax.dive!.from).toBeGreaterThan(swoop.from);
    expect(lax.dive!.to - lax.dive!.from).toBe(swoop.to - swoop.from);
    expect(lax.dive!.low).toBe(swoop.low);
    expect(lax.dive!.shape).toBe('swoop');
    expect(lax.dive!.distance).toBeCloseTo(swoop.distance! * 1.25, 6);
  });
});

describe('the Kite never makes a degenerate fight', () => {
  it('an idle player always loses, at every preset', () => {
    for (const id of ['easy', 'normal', 'hard'] as const) {
      const boss = applyDials(STORM_KITE, presetDials(id));
      for (const seed of SEEDS) {
        const r = fight(() => NO_INPUT, boss, seed);
        expect(r.ended).toBe(true);
        expect(r.won).toBe(false);
      }
    }
  });

  it('a player who stands still in either corner is hurt and the fight ends', () => {
    const boss = applyDials(STORM_KITE, presetDials('normal'));
    for (const x of [30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const r = fight(() => NO_INPUT, boss, seed, x);
        expect(r.damage).toBeGreaterThan(0);
        expect(r.ended).toBe(true);
      }
    }
  });
});

describe('the Kite can be beaten', () => {
  const NORMAL_KITE = applyDials(STORM_KITE, presetDials('normal'));
  // Would the first input, then holding jump while in the air, get through the next 30 updates without losing health?
  const safeFor = (prev: GameState) => (first: InputFrame): boolean => {
    let s = prev;
    for (let k = 0; k < 30; k++) {
      s = step(s, k === 0 ? first : withInput({ jumpHeld: !s.player.onGround }), NORMAL_KITE);
      if (s.player.health < prev.player.health) return false;
    }
    return true;
  };
  let looking = true;
  const base: Bot = (n, prev) => {
    const p = prev.player;
    const b = prev.boss;
    // A bolt that comes in along the floor from an edge cannot be dashed away from (another comes from the other edge, and the wall is behind), and a jump
    // that clears one can land in the next. A player who knows it reads them: a short look ahead for an answer (jump, or dash through) that takes no damage.
    const fromEdge = (sh: GameState['shots'][number]) => sh.kind === 'bolt' && sh.attackId !== 'bolt-volley' && sh.lift < 40 && (sh.dir === 1 ? sh.x < p.x + 40 : sh.x > p.x - 40);
    const edge = prev.shots.filter((sh) => fromEdge(sh) && Math.abs(sh.x - p.x) < 200);
    if (edge.length > 0 && looking) {
      const safe = safeFor(prev);
      const toward = edge[0]!.x < p.x ? -1 : 1;
      const answers = [NO_INPUT, withInput({ jumpPressed: true, jumpHeld: true }), withInput({ dashPressed: true, moveX: toward })];
      const answer = answers.find(safe);
      if (answer !== undefined && answer !== NO_INPUT) return answer;
      if (answer === undefined && !p.onGround) return withInput({ jumpHeld: true });
    }
    const near = prev.shots.find((sh) => sh.kind === 'bolt' && !fromEdge(sh) && Math.abs(sh.x - p.x) < 170 && sh.lift < 220);
    if (near !== undefined) {
      const away = near.x > p.x ? -1 : 1;
      // Dashing away from a bolt with a wall behind only puts the player in a corner; a player who sees that dashes through it instead.
      const tries = [withInput({ dashPressed: true, moveX: away }), withInput({ dashPressed: true, moveX: -away }), withInput({ jumpPressed: true, jumpHeld: true })];
      return (looking ? tries.find(safeFor(prev)) : undefined) ?? tries[0]!;
    }
    if (b.mode === 'attack' && b.attackId !== null) {
      const dive = attack(b.attackId).dive;
      if (dive !== undefined && dive.shape === 'plunge') {
        const t = b.attackTick + 1;
        const landing = b.leapToX ?? p.x;
        const away = landing < WORLD.width / 2 ? 1 : -1;
        const clear = Math.abs(p.x - landing) > 190;
        const hits = attack(b.attackId).hits;
        const slamOver = Math.max(...hits.map((h) => h.to));
        if (t >= dive.from && t < slamOver && !(t >= dive.to && clear)) return withInput({ moveX: clear ? 0 : away, dashPressed: !clear && dive.to - dive.from < 20 && t === dive.to - 7 });
        if (t < dive.from) return NO_INPUT;
        if (t >= slamOver) {
          const dx = b.x - p.x;
          return withInput({ moveX: Math.abs(dx) < 70 ? 0 : dx > 0 ? 1 : -1, attackPressed: n % 8 === 0 });
        }
        return NO_INPUT;
      }
      if (dive !== undefined && dive.shape === 'swoop') {
        // The landing is fixed at take-off and can be short of `distance` (the wall stops the swoop), so wait for it and read the real speed.
        if (b.leapFromX === null || b.leapToX === null) return NO_INPUT;
        const speed = Math.abs(b.leapToX - b.leapFromX) / (dive.to - dive.from + 1);
        if (b.attackTick + 1 >= dive.from && Math.abs(b.x - p.x) - 114 < 11 * speed && b.attackTick + 1 < dive.to) {
          return withInput({ jumpPressed: p.onGround, jumpHeld: true });
        }
        return NO_INPUT;
      }
    }
    if (b.mode === 'attack') return NO_INPUT;
    const dx = b.x - p.x;
    const low = b.lift < 40;
    if (!low) return withInput({ moveX: Math.abs(dx) < 60 ? 0 : dx > 0 ? 1 : -1 });
    return withInput({ moveX: Math.abs(dx) < 70 ? 0 : dx > 0 ? 1 : -1, attackPressed: n % 8 === 0 });
  };

  // On top of that, in a swoop a player who sees the plan is going to be hit (a bolt still on its way, a dash on cooldown) changes it: jump now, or dash.
  const knower: Bot = (n, prev) => {
    const first = base(n, prev);
    const b = prev.boss;
    const dive = b.mode === 'attack' && b.attackId !== null ? attack(b.attackId).dive : undefined;
    if (dive === undefined || dive.shape !== 'swoop' || b.attackTick + 1 < dive.from - 4 || b.attackTick + 1 > Math.max(...attack(b.attackId!).hits.map((h) => h.to))) return first;
    const ok = (f: InputFrame): boolean => {
      let s = prev;
      looking = false;
      try {
        for (let k = 0; k < 26; k++) {
          s = step(s, k === 0 ? f : base(n + k, s), NORMAL_KITE);
          if (s.player.health < prev.player.health) return false;
        }
      } finally {
        looking = true;
      }
      return true;
    };
    if (ok(first)) return first;
    const away = b.x > prev.player.x ? -1 : 1;
    return [withInput({ jumpPressed: prev.player.onGround, jumpHeld: true }), withInput({ dashPressed: true, moveX: away }), withInput({ dashPressed: true, moveX: -away })].find(ok) ?? first;
  };

  it('a player who knows its dives wins some fights at Normal, barely touched', () => {
    const boss = applyDials(STORM_KITE, presetDials('normal'));
    const results = SEEDS.map((seed) => fight(knower, boss, seed));
    expect(results.some((r) => r.won)).toBe(true);
    expect(Math.max(...results.map((r) => r.damage))).toBeLessThanOrEqual(2);
  }, 60_000);
});

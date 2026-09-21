import { describe, expect, it } from 'vitest';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { DT } from '../src/engine/time';
import { GAME, PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, run, withInput } from './helpers';

/** The real Duelist using only `attack`, from any distance, never walking, starting a new attack one update after the last. */
const withAttack = (attack: AttackDef): BossDef => ({
  ...DUELIST,
  spacing: { min: 0, max: 1e9 },
  attacks: [attack],
  phases: DUELIST.phases.map((p) => ({
    ...p,
    gap: 1,
    maxChain: 1,
    chainChance: 0,
    attacks: [{ id: attack.id, weight: 1 }],
  })),
});

const pounce: AttackDef = {
  id: 'pounce',
  name: 'Pounce',
  pose: 'crouch',
  class: 'mustDodge',
  damage: 1,
  windup: 30,
  active: 30,
  recovery: 30,
  range: { min: 0, max: 1e9 },
  leap: { from: 30, to: 52, height: 200, target: 'player' },
  hits: [{ from: 52, to: 58, x0: 0, x1: 200, bottom: 0, top: 60 }],
};
const forwardPounce: AttackDef = {
  ...pounce,
  id: 'forwardPounce',
  leap: { from: 30, to: 52, height: 200, target: 'forward', distance: 300 },
};
const backPounce: AttackDef = {
  ...pounce,
  id: 'backPounce',
  leap: { from: 30, to: 52, height: 200, target: 'back', distance: 300 },
};
const slip: AttackDef = {
  id: 'slip',
  name: 'Slip',
  pose: 'crouch',
  class: 'mustDodge',
  damage: 1,
  windup: 18,
  active: 10,
  recovery: 14,
  range: { min: 0, max: 1e9 },
  move: { from: 18, to: 28, speed: 1400 },
  hits: [],
};
const slipBack: AttackDef = { ...slip, id: 'slipBack', move: { from: 18, to: 28, speed: 1400, dir: 'back' } };

/** The first update of the first windup: attack time 0. Attack time t is then update `first + t`. */
const firstOf = (boss: BossDef, s: GameState = standAt(boss, 120)): number =>
  windupUpdates(run(s, 60, () => NO_INPUT, boss))[0]!;

/** The state at attack time `t`, given every state of a run and the update the attack began on. */
const at = (states: GameState[], first: number, t: number): GameState => states[first + t - 1]!;

const HALF = DUELIST.width / 2;

describe('the leap arc', () => {
  const boss = withAttack(pounce);
  const first = firstOf(boss);
  const states = run(standAt(boss, 120), first + 100, () => NO_INPUT, boss);

  it('is on the floor before take-off and after landing, and above it in between', () => {
    for (let t = 0; t < 30; t++) expect(at(states, first, t).boss.lift).toBe(0);
    for (let t = 30; t < 52; t++) {
      const lift = at(states, first, t).boss.lift;
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThanOrEqual(200);
    }
    for (let t = 52; t < 90; t++) expect(at(states, first, t).boss.lift).toBe(0);
  });

  it('peaks at the height of the leap', () => {
    const peak = Math.max(...Array.from({ length: 22 }, (_, i) => at(states, first, 30 + i).boss.lift));
    expect(peak).toBeGreaterThanOrEqual(195);
    expect(peak).toBeLessThanOrEqual(200);
  });

  it('advances x by a constant step per flight update and has the exact lift on the first one', () => {
    const n = 52 - 30;
    const takeOff = at(states, first, 30).boss;
    const step1 = (takeOff.leapToX! - takeOff.leapFromX!) / (n + 1);
    expect(Math.abs(step1)).toBeGreaterThan(1);
    // The boss stands still before take-off, so update 30 already moves it by one step.
    for (let t = 30; t < 52; t++) {
      const x = at(states, first, t).boss.x;
      expect(x).toBeCloseTo(takeOff.leapFromX! + step1 * (t - 30 + 1), 6);
      const before = at(states, first, t - 1).boss.x;
      expect(x - before).toBeCloseTo(step1, 6);
    }
    expect(takeOff.lift).toBeCloseTo(4 * 200 * (1 / (n + 1)) * (n / (n + 1)), 9);
  });

  it('keeps the take-off and landing points only during the flight', () => {
    for (let t = 0; t < 90; t++) {
      const b = at(states, first, t).boss;
      const flying = t >= 30 && t < 52;
      expect(b.leapFromX !== null).toBe(flying);
      expect(b.leapToX !== null).toBe(flying);
    }
  });

  it('leaves the boss on the floor in the gap after the attack', () => {
    const b = at(states, first, 90).boss;
    expect(b.mode).toBe('gap');
    expect(b.lift).toBe(0);
    expect(b.leapToX).toBeNull();
  });

  it('does not turn the boss during the flight', () => {
    const facing = at(states, first, 29).boss.facing;
    for (let t = 30; t < 52; t++) expect(at(states, first, t).boss.facing).toBe(facing);
  });
});

describe('where a leap lands', () => {
  const boss = withAttack(pounce);
  const first = firstOf(boss);

  it('is on a player who stands still', () => {
    const states = run(standAt(boss, 120), first + 60, () => NO_INPUT, boss);
    const target = at(states, first, 30).player.x;
    expect(at(states, first, 52).boss.x).toBeCloseTo(target, 6);
    expect(at(states, first, 51).boss.x).not.toBeCloseTo(target, 3);
  });

  it.each([-1, 1])('is fixed at take-off when the player runs (moveX %i) during the flight', (moveX) => {
    const states = run(
      standAt(boss, 120),
      first + 60,
      (n) => withInput({ moveX: n >= first + 30 ? moveX : 0 }),
      boss,
    );
    const target = at(states, first, 30).player.x;
    expect(at(states, first, 52).boss.x).toBeCloseTo(target, 6);
    expect(Math.abs(at(states, first, 52).player.x - target)).toBeGreaterThan(100);
  });

  it('is clamped to the arena', () => {
    const s = standAt(boss, 120);
    s.boss.x = 1100;
    s.player.x = 1275;
    s.player.prevX = 1275;
    const states = run(s, first + 60, () => NO_INPUT, boss);
    expect(at(states, first, 52).boss.x).toBe(WORLD.width - HALF);
  });

  it('is `distance` ahead of the boss for forward', () => {
    const b = withAttack(forwardPounce);
    const f = firstOf(b);
    const states = run(standAt(b, 120), f + 60, () => NO_INPUT, b);
    const start = at(states, f, 29).boss;
    expect(at(states, f, 52).boss.x).toBeCloseTo(start.x + start.facing * 300, 6);
  });

  it('is `distance` behind the boss for back', () => {
    const b = withAttack(backPounce);
    const f = firstOf(b);
    const s = standAt(b, 120);
    s.boss.x = 800;
    s.player.x = 680;
    s.player.prevX = 680;
    const states = run(s, f + 60, () => NO_INPUT, b);
    const start = at(states, f, 29).boss;
    expect(start.facing).toBe(-1);
    expect(at(states, f, 52).boss.x).toBeCloseTo(start.x - start.facing * 300, 6);
  });

  it('is clamped for forward and back too', () => {
    const fwd = withAttack(forwardPounce);
    const s1 = standAt(fwd, 120);
    s1.boss.x = 200;
    s1.player.x = 80;
    s1.player.prevX = 80;
    const f1 = firstOf(fwd, s1);
    expect(at(run(s1, f1 + 60, () => NO_INPUT, fwd), f1, 52).boss.x).toBe(HALF);

    const back = withAttack(backPounce);
    const s2 = standAt(back, 120);
    s2.boss.x = 1100;
    s2.player.x = 980;
    s2.player.prevX = 980;
    const f2 = firstOf(back, s2);
    expect(at(run(s2, f2 + 60, () => NO_INPUT, back), f2, 52).boss.x).toBe(WORLD.width - HALF);
  });
});

describe('the shockwave on landing', () => {
  const boss = withAttack(pounce);
  const first = firstOf(boss);
  const total = first + 85;

  it('hurts a grounded player at the landing spot exactly once, on the first update of the hit window', () => {
    const states = run(standAt(boss, 120), total, () => NO_INPUT, boss);
    expect(updatesWith(states, 'playerHit')).toEqual([first + 52]);
  });

  it('does not hurt a player who is high enough above the floor', () => {
    const states = run(
      standAt(boss, 120),
      total,
      (n) => withInput({ jumpPressed: n === first + 40, jumpHeld: n >= first + 40 && n < first + 60 }),
      boss,
    );
    for (let t = 52; t < 58; t++) {
      expect(WORLD.floorY - at(states, first, t).player.y).toBeGreaterThan(60);
    }
    expect(updatesWith(states.slice(0, total), 'playerHit')).toEqual([]);
  });

  it('does not hurt a player who is far from the landing spot', () => {
    const b = withAttack(forwardPounce);
    const f = firstOf(b);
    // The boss lands at x 660 with its wave reaching 200 to the left; the player is 400 units from the landing.
    const states = run(standAt(b, 700), f + 85, () => NO_INPUT, b);
    expect(at(states, f, 52).boss.x).toBeCloseTo(660, 6);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
  });

  it('is one-sided: a forward pounce of 600 hits a player at the landing x, first at attack time 52, and never one left at take-off', () => {
    const b = withAttack({ ...pounce, id: 'far', leap: { from: 30, to: 52, height: 200, target: 'forward', distance: 600 } });
    const f = firstOf(b);
    const start = createInitialState(b);
    const landing = start.boss.x + start.boss.facing * 600;
    expect(landing).toBeGreaterThan(HALF);

    const there = standAt(b, 120);
    there.player.x = landing;
    there.player.prevX = landing;
    const hit = run(there, f + 85, () => NO_INPUT, b);
    expect(at(hit, f, 52).boss.x).toBeCloseTo(landing, 6);
    expect(updatesWith(hit, 'playerHit')).toEqual([f + 52]);

    // A player who stays where the boss took off (just to its facing side) is never touched.
    const stay = standAt(b, 10);
    const missed = run(stay, f + 85, () => NO_INPUT, b);
    expect(at(missed, f, 52).boss.x).toBeCloseTo(landing, 6);
    expect(updatesWith(missed, 'playerHit')).toEqual([]);
  });

  it('is not caused by the boss body: a grounded player under the flight path is not hurt before landing', () => {
    // Forward leap: the boss flies over the player (120 away) and lands 180 units past him.
    const b = withAttack(forwardPounce);
    const f = firstOf(b);
    const states = run(standAt(b, 120), f + 85, () => NO_INPUT, b);
    const under = states.slice(0, f + 51).some((s) => Math.abs(s.boss.x - s.player.x) < 60 && s.boss.lift > 0);
    expect(under).toBe(true);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    // And the same for the grounded player at the landing spot of the player-targeted leap, before the landing.
    const own = run(standAt(boss, 120), first + 51, () => NO_INPUT, boss);
    expect(updatesWith(own, 'playerHit')).toEqual([]);
  });
});

describe('the player swing against a lifted boss', () => {
  const boss = withAttack(pounce);
  const first = firstOf(boss);
  const swingActiveAt = (t: number) => (n: number) =>
    withInput({ attackPressed: n === first + t - PLAYER.attack.startup });

  it('misses the boss while it is high in the air', () => {
    const states = run(standAt(boss, 120), first + 50, swingActiveAt(40), boss);
    expect(at(states, first, 40).player.attackTick).toBe(PLAYER.attack.startup);
    expect(at(states, first, 40).boss.lift).toBeGreaterThan(150);
    expect(updatesWith(states, 'bossHit')).toEqual([]);
    expect(states[states.length - 1]!.boss.hp).toBe(DUELIST.maxHp);
  });

  it('hits the boss once it has landed', () => {
    const states = run(standAt(boss, 120), first + 60, swingActiveAt(52), boss);
    expect(updatesWith(states, 'bossHit')).toEqual([first + 52]);
    expect(states[states.length - 1]!.boss.hp).toBe(DUELIST.maxHp - 1);
  });
});

describe('cancelling a leap', () => {
  it('a counter before take-off leaves the boss on the floor', () => {
    const boss = withAttack({ ...pounce, id: 'pounceC', class: 'counterable' });
    const first = firstOf(boss);
    const when = first + 30 - 3;
    const states = run(standAt(boss, 120), when + 5, (n) => withInput({ attackPressed: n === when }), boss);
    expect(updatesWith(states, 'counter')).toEqual([when]);
    for (const s of states.slice(when - 1)) {
      expect(s.boss.lift).toBe(0);
      expect(s.boss.leapFromX).toBeNull();
      expect(s.boss.leapToX).toBeNull();
    }
  });

  it('a counter during the flight drops the boss to the floor where it is', () => {
    // A counterable pounce whose take-off (update 25) comes inside the counter window (18 to 29).
    const boss = withAttack({
      ...pounce,
      id: 'earlyPounce',
      class: 'counterable',
      leap: { from: 25, to: 47, height: 200, target: 'player' },
    });
    const first = firstOf(boss);
    const when = first + 27;
    const states = run(standAt(boss, 120), when + 5, (n) => withInput({ attackPressed: n === when }), boss);
    expect(at(states, first, 26).boss.lift).toBeGreaterThan(0);
    expect(updatesWith(states, 'counter')).toEqual([when]);
    const b = states[when - 1]!.boss;
    expect(b.mode).toBe('stagger');
    expect(b.lift).toBe(0);
    expect(b.leapFromX).toBeNull();
    expect(b.leapToX).toBeNull();
  });

  it('a phase change during the flight drops the boss to the floor', () => {
    const boss = withAttack(pounce);
    const first = firstOf(boss);
    const fraction = boss.phases[1]!.startsAtHpFraction;
    const swingAt = first + 31 - PLAYER.attack.startup;
    let s = standAt(boss, 120);
    const states: GameState[] = [];
    for (let n = 1; n <= first + 40; n++) {
      // Just above the threshold before the swing lands, so one hit starts the next phase.
      if (n === swingAt) s.boss.hp = Math.floor(boss.maxHp * fraction) + 1;
      s = step(s, withInput({ attackPressed: n === swingAt }), boss);
      states.push(s);
    }
    expect(at(states, first, 30).boss.lift).toBeGreaterThan(0);
    expect(updatesWith(states, 'phaseChange')).toEqual([first + 31]);
    const b = at(states, first, 31).boss;
    expect(b.mode).toBe('transition');
    expect(b.lift).toBe(0);
    expect(b.leapFromX).toBeNull();
    expect(b.leapToX).toBeNull();
  });
});

describe('a fight that ends in mid-air', () => {
  /** After the ending update the boss must be on the floor with no leap points, and stay so all through the countdown. */
  const expectLanded = (states: GameState[], endUpdate: number, phase: GameState['phase']) => {
    for (const s of states.slice(endUpdate - 1, endUpdate - 1 + GAME.defeatRestartTicks - 1)) {
      expect(s.phase).toBe(phase);
      expect(s.boss.lift).toBe(0);
      expect(s.boss.leapFromX).toBeNull();
      expect(s.boss.leapToX).toBeNull();
    }
  };

  it('lands the boss when the player defeats it during the flight', () => {
    const boss = withAttack(pounce);
    const first = firstOf(boss);
    const swingAt = first + 51 - PLAYER.attack.startup;
    let s = standAt(boss, 120);
    const states: GameState[] = [];
    for (let n = 1; n <= first + 80; n++) {
      if (n === swingAt) s.boss.hp = 1;
      s = step(s, withInput({ attackPressed: n === swingAt }), boss);
      states.push(s);
    }
    // The swing connects while the boss is still in the air (attack time 51 is the last update of the flight).
    expect(updatesWith(states, 'bossDefeated')).toEqual([first + 51]);
    expect(at(states, first, 50).boss.lift).toBeGreaterThan(0);
    expectLanded(states, first + 51, 'victory');
  });

  it('lands the boss when it defeats the player during the flight', () => {
    // A leap whose shockwave window opens before landing, so it can hurt while the boss is in the air.
    const boss = withAttack({ ...pounce, id: 'airHit', hits: [{ from: 40, to: 45, x0: 0, x1: 200, bottom: 0, top: 60 }] });
    const first = firstOf(boss);
    const s0 = standAt(boss, 120);
    s0.player.health = 1;
    const states = run(s0, first + 80, () => NO_INPUT, boss);
    expect(updatesWith(states, 'playerDefeated')).toEqual([first + 40]);
    expect(at(states, first, 39).boss.lift).toBeGreaterThan(0);
    expectLanded(states, first + 40, 'defeated');
  });
});

describe('a dash', () => {
  const dash = (attack: AttackDef, sign: 1 | -1) => {
    const boss = withAttack(attack);
    const first = firstOf(boss);
    const states = run(standAt(boss, 120), first + 60, () => NO_INPUT, boss);
    const start = at(states, first, 17).boss;
    const end = at(states, first, 27).boss;
    // The boss faces left (-1), so forward is towards smaller x.
    expect(end.x - start.x).toBeCloseTo(sign * start.facing * 1400 * (10 * DT), 0);
    expect(at(states, first, 18).boss.x).not.toBe(start.x);
    expect(at(states, first, 28).boss.x).toBe(end.x);
    expect(updatesWith(states.slice(0, first + 45), 'playerHit')).toEqual([]);
    for (const s of states.slice(first + 17, first + 50)) {
      expect(s.boss.lift).toBe(0);
    }
    // The attack is 42 updates long; on the last one the boss is back to waiting.
    expect(at(states, first, 42).boss.mode).toBe('gap');
  };

  it('moves the boss forward for speed x 10 updates and never hurts', () => dash(slip, 1));
  it('moves the boss back when dir is back', () => dash(slipBack, -1));
});

describe('bosses without leaps', () => {
  it('start with the boss on the floor and no leap points', () => {
    const s = createInitialState(DUELIST);
    expect(s.boss.lift).toBe(0);
    expect(s.boss.leapFromX).toBeNull();
    expect(s.boss.leapToX).toBeNull();
  });

  it('never lift the Duelist', () => {
    let s = standAt(DUELIST, 120);
    const input: InputFrame = NO_INPUT;
    for (let n = 0; n < 600; n++) {
      s = step(s, input, DUELIST);
      expect(s.boss.lift).toBe(0);
    }
  });
});

describe('leaps at the edges of an attack', () => {
  it('works when it starts on the very first update of the attack', () => {
    const boss = withAttack({
      ...pounce,
      id: 'instant',
      windup: 1,
      active: 10,
      recovery: 5,
      leap: { from: 1, to: 9, height: 100, target: 'player' },
      hits: [],
    });
    const first = firstOf(boss);
    const states = run(standAt(boss, 120), first + 20, () => NO_INPUT, boss);
    expect(at(states, first, 1).boss.lift).toBeGreaterThan(0);
    expect(at(states, first, 1).boss.leapToX).toBe(at(states, first, 1).player.x);
    expect(at(states, first, 9).boss.lift).toBe(0);
    expect(at(states, first, 9).boss.x).toBe(at(states, first, 1).player.x);
  });

  it('never leaves the boss floating if the attack ends before the leap does', () => {
    const boss = withAttack({ ...pounce, id: 'short', windup: 10, active: 5, recovery: 5, leap: { from: 12, to: 40, height: 100, target: 'player' }, hits: [] });
    const first = firstOf(boss);
    const states = run(standAt(boss, 120), first + 40, () => NO_INPUT, boss);
    expect(at(states, first, 19).boss.lift).toBeGreaterThan(0);
    const after = at(states, first, 20).boss;
    expect(after.lift).toBe(0);
    expect(after.leapFromX).toBeNull();
    expect(after.leapToX).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type BossMode, type GameState } from '../src/game/state';
import { bossDrawBox } from '../src/ui/render';
import { bossFigure, drawPrimitives, playerFigure, type Primitive } from '../src/ui/look/figures';
import { LOOK } from '../src/ui/look/tuning';
import { DUELIST } from './helpers';

/** How far past its drawn box a boss figure may reach with its head, ears or a bit of slack, world units. */
const FIGURE_MARGIN = 24;
const PLAYER_COLORS = { body: '#e8e8f0', accent: '#7fd6ff' };
const BOSS_COLORS = { body: '#c8642a', accent: '#e8965a', glow: null as string | null };

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Every x/y point a primitive covers (a circle by its four extreme points). */
function extremes(p: Primitive): { xs: number[]; ys: number[] } {
  if (p.kind === 'rect') return { xs: [p.x, p.x + p.w], ys: [p.y, p.y + p.h] };
  if (p.kind === 'circle') return { xs: [p.x - p.r, p.x + p.r], ys: [p.y - p.r, p.y + p.r] };
  return { xs: p.points.map((q) => q[0]), ys: p.points.map((q) => q[1]) };
}

function spread(list: Primitive[]): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of list) {
    const e = extremes(p);
    xs.push(...e.xs);
    ys.push(...e.ys);
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function expectInside(list: Primitive[], box: Bounds): void {
  expect(list.length).toBeGreaterThan(0);
  const s = spread(list);
  const eps = 1e-6;
  expect(s.left).toBeGreaterThanOrEqual(box.left - eps);
  expect(s.right).toBeLessThanOrEqual(box.right + eps);
  expect(s.top).toBeGreaterThanOrEqual(box.top - eps);
  expect(s.bottom).toBeLessThanOrEqual(box.bottom + eps);
}

function mirrored(list: Primitive[], cx: number): Primitive[] {
  return list.map((p): Primitive => {
    if (p.kind === 'rect') return { ...p, x: 2 * cx - (p.x + p.w) };
    if (p.kind === 'circle') return { ...p, x: 2 * cx - p.x };
    return { ...p, points: p.points.map(([px, py]): [number, number] => [2 * cx - px, py]) };
  });
}

function expectSame(a: Primitive[], b: Primitive[]): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    expect(p.kind).toBe(q.kind);
    expect(p.color).toBe(q.color);
    const ep = extremes(p);
    const eq = extremes(q);
    ep.xs.forEach((v, k) => expect(v).toBeCloseTo(eq.xs[k]!, 6));
    ep.ys.forEach((v, k) => expect(v).toBeCloseTo(eq.ys[k]!, 6));
  }
}

const base = (boss: BossDef): GameState => createInitialState(boss, 1);

function withPlayer(s: GameState, over: Partial<GameState['player']>): GameState {
  return { ...s, player: { ...s.player, ...over } };
}

function withBoss(s: GameState, over: Partial<GameState['boss']>): GameState {
  return { ...s, boss: { ...s.boss, ...over } };
}

const at = (s: GameState, tick: number): GameState => ({ ...s, tick });

describe('playerFigure', () => {
  const X = 400;
  const Y = WORLD.floorY;

  const situations: [string, Partial<GameState['player']>][] = [
    ['standing', {}],
    ['running', { vx: PLAYER.runSpeed }],
    ['slow', { vx: 40 }],
    ['airborne', { onGround: false, vy: -300 }],
    ['airborne and moving', { onGround: false, vx: PLAYER.runSpeed }],
    ['dashing', { dashTick: 3, vx: 900 }],
    ['swinging', { attackTick: 5 }],
    ['invulnerable', { invulnerableTicks: 20 }],
  ];

  it('stays inside the player box widened by the cape and the head', () => {
    for (const facing of [1, -1] as const) {
      for (const [, over] of situations) {
        for (let tick = 0; tick < 100; tick += 3) {
          const s = at(withPlayer(base(DUELIST), { ...over, facing, dashDir: facing }), tick);
          expectInside(playerFigure(s, X, Y, PLAYER_COLORS), {
            left: X - PLAYER.width / 2 - LOOK.capeLength,
            right: X + PLAYER.width / 2 + LOOK.capeLength,
            top: Y - PLAYER.height - LOOK.headRadius,
            bottom: Y,
          });
        }
      }
    }
  });

  it('keeps the cape on the trailing side, the leading side only widened by the lean', () => {
    for (const facing of [1, -1] as const) {
      for (let tick = 0; tick < 60; tick += 5) {
        const s = at(withPlayer(base(DUELIST), { facing, vx: PLAYER.runSpeed, dashDir: facing }), tick);
        const box = spread(playerFigure(s, X, Y, PLAYER_COLORS));
        const leadReach = facing === 1 ? box.right - X : X - box.left;
        const trailReach = facing === 1 ? X - box.left : box.right - X;
        expect(leadReach).toBeLessThanOrEqual(PLAYER.width / 2 + Math.max(LOOK.leanDash, LOOK.legSwing));
        expect(trailReach).toBeGreaterThan(leadReach);
      }
    }
  });

  it('puts the feet on the floor line when grounded', () => {
    const s = base(DUELIST);
    expect(spread(playerFigure(s, X, Y, PLAYER_COLORS)).bottom).toBeCloseTo(Y, 6);
    expect(spread(playerFigure(withPlayer(s, { vx: 300 }), X, Y, PLAYER_COLORS)).bottom).toBeCloseTo(Y, 6);
  });

  it('mirrors around the centre when the facing flips', () => {
    for (const [, over] of situations) {
      for (const tick of [0, 7, 31]) {
        const right = playerFigure(at(withPlayer(base(DUELIST), { ...over, facing: 1, dashDir: 1 }), tick), X, Y, PLAYER_COLORS);
        const left = playerFigure(at(withPlayer(base(DUELIST), { ...over, facing: -1, dashDir: -1 }), tick), X, Y, PLAYER_COLORS);
        expectSame(left, mirrored(right, X));
      }
    }
  });

  it('breathes when idle and moves from one tick to the next', () => {
    const s = base(DUELIST);
    const a = playerFigure(at(s, 10), X, Y, PLAYER_COLORS);
    const b = playerFigure(at(s, 11), X, Y, PLAYER_COLORS);
    expect(a).not.toEqual(b);
  });

  it('alternates the legs while running', () => {
    const s = withPlayer(base(DUELIST), { vx: PLAYER.runSpeed });
    const a = playerFigure(at(s, 0), X, Y, PLAYER_COLORS);
    const b = playerFigure(at(s, LOOK.legCycleTicks / 4), X, Y, PLAYER_COLORS);
    expect(a).not.toEqual(b);
    // The same point of the step cycle looks the same one full cycle later apart from the cape and body sway.
    const legsOf = (list: Primitive[]): Primitive[] => list.filter((p) => p.kind === 'poly' && spread([p]).bottom > Y - 6);
    expect(legsOf(playerFigure(at(s, 3), X, Y, PLAYER_COLORS))).toEqual(
      legsOf(playerFigure(at(s, 3 + LOOK.legCycleTicks), X, Y, PLAYER_COLORS)),
    );
    expect(legsOf(a)).not.toEqual(legsOf(b));
  });

  it('tucks the legs when airborne', () => {
    const grounded = playerFigure(base(DUELIST), X, Y, PLAYER_COLORS);
    const air = playerFigure(withPlayer(base(DUELIST), { onGround: false }), X, Y, PLAYER_COLORS);
    expect(air).not.toEqual(grounded);
    expect(spread(air).bottom).toBeLessThanOrEqual(Y - LOOK.legTuck + 1e-6);
  });

  it('leans forward while dashing and swinging', () => {
    const idle = spread(playerFigure(base(DUELIST), X, Y, PLAYER_COLORS));
    const dash = spread(playerFigure(withPlayer(base(DUELIST), { dashTick: 2, dashDir: 1 }), X, Y, PLAYER_COLORS));
    const swing = spread(playerFigure(withPlayer(base(DUELIST), { attackTick: 2 }), X, Y, PLAYER_COLORS));
    expect(dash.right).toBeGreaterThan(idle.right);
    expect(swing.right).toBeGreaterThan(idle.right);
  });

  it('lengthens the cape with speed', () => {
    const still = spread(playerFigure(base(DUELIST), X, Y, PLAYER_COLORS));
    const fast = spread(playerFigure(withPlayer(base(DUELIST), { vx: PLAYER.runSpeed }), X, Y, PLAYER_COLORS));
    expect(X - fast.left).toBeGreaterThan(X - still.left);
  });

  it('ignores the fields it does not use', () => {
    const s = withPlayer(base(DUELIST), { vx: 200 });
    const other: GameState = {
      ...s,
      seed: 99,
      rng: 12345,
      endTicks: 7,
      events: ['bossHit'],
      player: { ...s.player, health: 1, vy: 50, jumpCut: true, dashCooldown: 9, prevX: 1, prevY: 2, attackConnected: true },
      boss: { ...s.boss, hp: 1, x: 100 },
    };
    expect(playerFigure(other, X, Y, PLAYER_COLORS)).toEqual(playerFigure(s, X, Y, PLAYER_COLORS));
  });

  it('uses the given colours', () => {
    const colors = new Set(playerFigure(base(DUELIST), X, Y, PLAYER_COLORS).map((p) => p.color));
    expect(colors.has(PLAYER_COLORS.body)).toBe(true);
    expect(colors.has(PLAYER_COLORS.accent)).toBe(true);
  });
});

const MODES: BossMode[] = ['gap', 'approach', 'attack', 'stagger', 'transition'];

/** Every (mode, attack id, attack tick, lift) worth drawing for `boss`. */
function bossStates(boss: BossDef): GameState[] {
  const out: GameState[] = [];
  const start = base(boss);
  for (const facing of [1, -1] as const) {
    for (const lift of [0, 140, 220]) {
      for (const tick of [0, 1, 9, 22, 47, 88]) {
        for (const mode of MODES) {
          if (mode !== 'attack') {
            out.push(at(withBoss(start, { mode, facing, lift, x: 700, attackId: null }), tick));
            continue;
          }
          for (const attack of boss.attacks) {
            const ticks = [0, attack.windup - 1, attack.windup, attack.windup + attack.active, attack.windup + attack.active + 3];
            for (const attackTick of ticks) {
              out.push(at(withBoss(start, { mode, facing, lift, x: 700, attackId: attack.id, attackTick }), tick));
            }
          }
        }
      }
    }
  }
  return out;
}

const ARM_REACH = 90;

/** The box the figure may fill: what bossDrawBox reports plus room for the weapon, with the floor as the lower limit. */
function weaponBounds(s: GameState, boss: BossDef): Bounds {
  const box = bossDrawBox(s.boss, boss);
  const reach = ARM_REACH + LOOK.bossBladeLength + FIGURE_MARGIN;
  return {
    left: s.boss.x - boss.width / 2 - reach,
    right: s.boss.x + boss.width / 2 + reach,
    top: box.top - reach,
    bottom: WORLD.floorY,
  };
}

/** The tighter box for a beast: the drawn box plus room for the tail and the snout only. */
function beastBounds(s: GameState, boss: BossDef): Bounds {
  const box = bossDrawBox(s.boss, boss);
  const side = Math.max(LOOK.bossTailLength, LOOK.bossSnoutLength) + FIGURE_MARGIN;
  return {
    left: s.boss.x - boss.width / 2 - side,
    right: s.boss.x + boss.width / 2 + side,
    top: box.top - FIGURE_MARGIN,
    bottom: box.top + box.height,
  };
}

const generic = (width: number, height: number): BossDef => ({ ...DUELIST, id: 'made-up-boss', width, height });

describe('bossFigure: the Ember Duelist', () => {
  it('fits its drawn box widened for the weapon, in every state', () => {
    for (const s of bossStates(DUELIST)) {
      expectInside(bossFigure(s, DUELIST, BOSS_COLORS), weaponBounds(s, DUELIST));
    }
  });

  it('keeps head, torso and legs inside the drawn box (plus a margin) when the weapon is ignored', () => {
    for (const s of bossStates(DUELIST)) {
      const box = bossDrawBox(s.boss, DUELIST);
      const body = bossFigure(s, DUELIST, BOSS_COLORS).filter((p) => p.kind === 'circle');
      const sp = spread(body);
      expect(sp.top).toBeGreaterThanOrEqual(box.top - FIGURE_MARGIN);
      expect(sp.bottom).toBeLessThanOrEqual(box.top + box.height + 1e-6);
    }
  });

  it('mirrors when the facing flips', () => {
    for (const s of bossStates(DUELIST)) {
      if (s.boss.facing !== 1) continue;
      const left = withBoss(s, { facing: -1 });
      expectSame(bossFigure(left, DUELIST, BOSS_COLORS), mirrored(bossFigure(s, DUELIST, BOSS_COLORS), s.boss.x));
    }
  });

  it('follows the pose of the running attack with the arm and blade', () => {
    const start = base(DUELIST);
    const shapes = new Set<string>();
    for (const attack of DUELIST.attacks) {
      const s = withBoss(start, { mode: 'attack', attackId: attack.id, attackTick: 0, facing: 1, x: 700 });
      shapes.add(JSON.stringify(bossFigure(s, DUELIST, BOSS_COLORS)));
    }
    shapes.add(JSON.stringify(bossFigure(withBoss(start, { mode: 'gap', facing: 1, x: 700 }), DUELIST, BOSS_COLORS)));
    // Four different poses plus the arm hanging at the side: five different figures.
    expect(shapes.size).toBe(new Set(DUELIST.attacks.map((a) => a.pose)).size + 1);
  });

  it('has a blade that extends past the arm', () => {
    const s = withBoss(base(DUELIST), { mode: 'attack', attackId: DUELIST.attacks.find((a) => a.pose === 'sideways')!.id, attackTick: 0, facing: 1, x: 700 });
    const list = bossFigure(s, DUELIST, BOSS_COLORS);
    const polys = list.filter((p) => p.kind === 'poly');
    const bladeReach = Math.max(...polys.map((p) => spread([p]).right));
    // Arm reaches 90 from the shoulder; the blade goes on for the blade length.
    expect(bladeReach).toBeGreaterThan(700 + ARM_REACH + LOOK.bossBladeLength / 2);
  });

  it('animates: idle breathing and walking bob change from tick to tick', () => {
    const idle = withBoss(base(DUELIST), { mode: 'stagger', x: 700 });
    const walk = withBoss(base(DUELIST), { mode: 'gap', x: 700 });
    for (const s of [idle, walk]) {
      expect(bossFigure(at(s, 10), DUELIST, BOSS_COLORS)).not.toEqual(bossFigure(at(s, 11), DUELIST, BOSS_COLORS));
    }
  });

  it('alternates the legs while walking and tucks them in a leap', () => {
    const walk = withBoss(base(DUELIST), { mode: 'gap', x: 700 });
    const a = bossFigure(at(walk, 0), DUELIST, BOSS_COLORS);
    const b = bossFigure(at(walk, LOOK.legCycleTicks / 4), DUELIST, BOSS_COLORS);
    expect(a).not.toEqual(b);
    const grounded = bossFigure(at(withBoss(base(DUELIST), { mode: 'stagger', x: 700 }), 5), DUELIST, BOSS_COLORS);
    const lifted = bossFigure(at(withBoss(base(DUELIST), { mode: 'stagger', x: 700, lift: 100 }), 5), DUELIST, BOSS_COLORS);
    expect(spread(lifted).bottom).toBeLessThan(spread(grounded).bottom);
  });

  it('leans into an attack during its windup', () => {
    const attack = DUELIST.attacks.find((a) => a.pose === 'raised')!;
    const early = withBoss(base(DUELIST), { mode: 'attack', attackId: attack.id, attackTick: 0, facing: 1, x: 700 });
    const late = withBoss(early, { attackTick: attack.windup - 1 });
    const headX = (s: GameState): number => bossFigure(s, DUELIST, BOSS_COLORS).find((p) => p.kind === 'circle')!.x;
    expect(headX(late)).toBeGreaterThan(headX(early));
  });

  it('ignores the fields it does not use', () => {
    const s = withBoss(base(DUELIST), { mode: 'attack', attackId: DUELIST.attacks[0]!.id, attackTick: 4, x: 700 });
    const other: GameState = {
      ...s,
      seed: 5,
      rng: 77,
      events: ['counter'],
      endTicks: 3,
      player: { ...s.player, x: 10, vx: 300, health: 1 },
      boss: { ...s.boss, hp: 3, modeTick: 50, chainLeft: 2, cycleIndex: 3, phase: 1, lastAttacks: ['x'], pendingAttackId: 'y' },
    };
    expect(bossFigure(other, DUELIST, BOSS_COLORS)).toEqual(bossFigure(s, DUELIST, BOSS_COLORS));
  });

  it('shows the glow colour only when given', () => {
    const s = withBoss(base(DUELIST), { x: 700 });
    const plain = new Set(bossFigure(s, DUELIST, BOSS_COLORS).map((p) => p.color));
    const glowing = new Set(bossFigure(s, DUELIST, { ...BOSS_COLORS, glow: '#f5c542' }).map((p) => p.color));
    expect(plain.has('#f5c542')).toBe(false);
    expect(glowing.has('#f5c542')).toBe(true);
  });
});

describe('bossFigure: the Ashen Hound', () => {
  it('fits its drawn box widened for the tail and snout, in every state', () => {
    for (const s of bossStates(ASHEN_HOUND)) {
      expectInside(bossFigure(s, ASHEN_HOUND, BOSS_COLORS), beastBounds(s, ASHEN_HOUND));
    }
  });

  it('mirrors when the facing flips', () => {
    for (const s of bossStates(ASHEN_HOUND)) {
      if (s.boss.facing !== 1) continue;
      const left = withBoss(s, { facing: -1 });
      expectSame(bossFigure(left, ASHEN_HOUND, BOSS_COLORS), mirrored(bossFigure(s, ASHEN_HOUND, BOSS_COLORS), s.boss.x));
    }
  });

  it('puts the head and snout on the side it faces and the tail on the other', () => {
    const s = withBoss(base(ASHEN_HOUND), { mode: 'stagger', facing: 1, x: 700 });
    const list = bossFigure(s, ASHEN_HOUND, BOSS_COLORS);
    const head = list.find((p) => p.kind === 'circle')!;
    expect(head.x).toBeGreaterThan(700);
    const sp = spread(list);
    expect(700 - sp.left).toBeGreaterThan(ASHEN_HOUND.width / 2);
  });

  it('is a low, long beast: wider than it is tall', () => {
    const s = withBoss(base(ASHEN_HOUND), { mode: 'stagger', x: 700 });
    const sp = spread(bossFigure(s, ASHEN_HOUND, BOSS_COLORS));
    expect(sp.right - sp.left).toBeGreaterThan(sp.bottom - sp.top);
  });

  it('is lower while crouching for the pounce than standing', () => {
    const pounce = ASHEN_HOUND.attacks.find((a) => a.pose === 'crouch')!;
    const crouching = withBoss(base(ASHEN_HOUND), { mode: 'attack', attackId: pounce.id, attackTick: 0, x: 700, lift: 0 });
    const standing = withBoss(base(ASHEN_HOUND), { mode: 'stagger', x: 700 });
    expect(bossDrawBox(crouching.boss, ASHEN_HOUND).crouching).toBe(true);
    expect(spread(bossFigure(crouching, ASHEN_HOUND, BOSS_COLORS)).top).toBeGreaterThan(
      spread(bossFigure(standing, ASHEN_HOUND, BOSS_COLORS)).top,
    );
  });

  it('is lifted by the leap', () => {
    const grounded = withBoss(base(ASHEN_HOUND), { mode: 'stagger', x: 700, lift: 0 });
    const lifted = withBoss(grounded, { lift: 120 });
    const a = spread(bossFigure(grounded, ASHEN_HOUND, BOSS_COLORS));
    const b = spread(bossFigure(lifted, ASHEN_HOUND, BOSS_COLORS));
    expect(b.top).toBeLessThan(a.top - 100);
    expect(b.bottom).toBeLessThan(a.bottom - 100);
  });

  it('walks on four alternating legs and breathes when idle', () => {
    const walk = withBoss(base(ASHEN_HOUND), { mode: 'gap', x: 700 });
    const a = bossFigure(at(walk, 0), ASHEN_HOUND, BOSS_COLORS);
    const b = bossFigure(at(walk, LOOK.legCycleTicks / 4), ASHEN_HOUND, BOSS_COLORS);
    expect(a).not.toEqual(b);
    const legs = a.filter((p) => p.kind === 'poly' && spread([p]).bottom > WORLD.floorY - 6);
    expect(legs.length).toBe(4);
    const idle = withBoss(base(ASHEN_HOUND), { mode: 'stagger', x: 700 });
    expect(bossFigure(at(idle, 10), ASHEN_HOUND, BOSS_COLORS)).not.toEqual(bossFigure(at(idle, 11), ASHEN_HOUND, BOSS_COLORS));
  });

  it('ignores the fields it does not use', () => {
    const s = withBoss(base(ASHEN_HOUND), { mode: 'gap', x: 700 });
    const other: GameState = { ...s, seed: 8, rng: 2, endTicks: 1, boss: { ...s.boss, hp: 2, modeTick: 30, phase: 1 }, player: { ...s.player, health: 2, x: 5 } };
    expect(bossFigure(other, ASHEN_HOUND, BOSS_COLORS)).toEqual(bossFigure(s, ASHEN_HOUND, BOSS_COLORS));
  });
});

describe('bossFigure: the Ashen Hound shows the attack pose through its body', () => {
  const attack = (id: string) => ASHEN_HOUND.attacks.find((a) => a.id === id)!;
  const idle = (facing: 1 | -1 = 1): GameState =>
    at(withBoss(base(ASHEN_HOUND), { mode: 'attack', attackId: null, attackTick: 0, facing, x: 700, lift: 0 }), 12);
  const during = (id: string, attackTick: number, facing: 1 | -1 = 1, lift = 0): GameState =>
    at(withBoss(base(ASHEN_HOUND), { mode: 'attack', attackId: id, attackTick, facing, x: 700, lift }), 12);
  const list = (s: GameState): Primitive[] => bossFigure(s, ASHEN_HOUND, BOSS_COLORS);
  const json = (s: GameState): string => JSON.stringify(list(s));

  // Mid-windup and active for each attack whose pose the running attack shows.
  const moments = (id: string): GameState[] => {
    const a = attack(id);
    const active = a.windup + 1;
    return [during(id, Math.floor(a.windup / 2)), during(id, a.windup - 1), during(id, active, 1, id === 'pounce' ? 100 : 0)];
  };

  it('uses the poses the design promises: bite sideways, rush and slip back, pounce crouch', () => {
    expect(attack('bite').pose).toBe('sideways');
    expect(attack('rush').pose).toBe('back');
    expect(attack('slip').pose).toBe('back');
    expect(attack('pounce').pose).toBe('crouch');
  });

  it('draws a different figure for the bite, the rush and the pounce, and for each of them against idle', () => {
    const windup = (id: string): string => json(during(id, attack(id).windup - 1));
    const shapes = [json(idle()), windup('bite'), windup('rush'), windup('pounce')];
    expect(new Set(shapes).size).toBe(4);
    const active = [json(idle()), json(during('bite', 23)), json(during('rush', 27)), json(during('pounce', 31, 1, 100))];
    expect(new Set(active).size).toBe(4);
    // Whichever moment of windup or active, no attack pose looks like idle or like another attack's pose.
    for (const a of ['bite', 'rush', 'pounce']) {
      for (const s of moments(a)) {
        expect(json(s), a).not.toBe(json(idle()));
        for (const other of ['bite', 'rush', 'pounce']) {
          if (other === a) continue;
          for (const t of moments(other)) expect(json(s), `${a} vs ${other}`).not.toBe(json(t));
        }
      }
    }
  });

  it('shows the same pose for the rush and the slip (both are the back pose)', () => {
    // Compared while both are fully active (their windups differ in length, so the ramp-up differs).
    expect(json(during('rush', 30))).toBe(json(during('slip', 20)));
  });

  it('the bite thrusts the head forward with an open jaw', () => {
    const still = spread(list(idle()));
    const biting = list(during('bite', 22));
    expect(spread(biting).right).toBeGreaterThan(still.right + 12);
    // Two wedges form the jaw and there is a gap between them: the upper one ends above the lower one.
    const wedges = biting.filter((p) => p.kind === 'poly' && p.points.length === 3 && spread([p]).left > 700 + 30);
    expect(wedges.length).toBeGreaterThanOrEqual(2);
    const [upper, lower] = wedges.map((w) => spread([w])).sort((p, q) => p.top - q.top);
    expect(upper!.bottom).toBeLessThan(lower!.bottom);
    expect(lower!.top).toBeGreaterThan(upper!.top);
  });

  it('the rush rears the front up, pulls the tail back and lifts the front paws', () => {
    const still = spread(list(idle()));
    const reared = spread(list(during('rush', 20)));
    expect(reared.top).toBeLessThan(still.top - 12);
    const head = (s: GameState): number => list(s).find((p) => p.kind === 'circle')!.y;
    expect(head(during('rush', 20))).toBeLessThan(head(idle()) - 12);
    // The front feet (the two legs nearest the head) are off the floor while the hind feet stand on it.
    const feet = (s: GameState): number[] =>
      list(s)
        .filter((p) => p.kind === 'poly' && p.points.length === 4 && spread([p]).bottom > WORLD.floorY - 60 && spread([p]).top > WORLD.floorY - 90 && spread([p]).right - spread([p]).left < 40)
        .map((p) => spread([p]).bottom);
    expect(Math.max(...feet(during('rush', 20)))).toBeCloseTo(WORLD.floorY, 6);
    expect(Math.min(...feet(during('rush', 20)))).toBeLessThan(WORLD.floorY - 12);
  });

  it('the pounce lowers the body close to the floor and folds the legs', () => {
    const still = spread(list(idle()));
    const crouched = spread(list(during('pounce', 10)));
    expect(bossDrawBox(during('pounce', 10).boss, ASHEN_HOUND).crouching).toBe(true);
    expect(crouched.top).toBeGreaterThan(still.top + 30);
    // The body (the largest rectangle) sits low: its underside is within a few units of the floor.
    const body = list(during('pounce', 10)).filter((p) => p.kind === 'rect').sort((p, q) => q.w * q.h - p.w * p.h)[0]!;
    expect(body.kind === 'rect' && body.y + body.h).toBeGreaterThan(WORLD.floorY - 12);
    // Legs are short stubs.
    const legs = list(during('pounce', 10)).filter((p) => p.kind === 'poly' && p.points.length === 4 && spread([p]).bottom > WORLD.floorY - 1e-6);
    expect(legs.length).toBe(4);
    for (const leg of legs) {
      const b = spread([leg]);
      expect(b.bottom - b.top).toBeLessThan(16);
    }
  });

  it('gives any other pose a sensible figure: the head goes up for raised and down for down', () => {
    const boss: BossDef = {
      ...ASHEN_HOUND,
      attacks: [
        { ...attack('bite'), id: 'up', pose: 'raised' },
        { ...attack('bite'), id: 'dn', pose: 'down' },
      ],
    };
    const st = (id: string | null): GameState =>
      at(withBoss(base(boss), { mode: 'attack', attackId: id, attackTick: 11, x: 700, lift: 0 }), 12);
    const head = (id: string | null): number => bossFigure(st(id), boss, BOSS_COLORS).find((p) => p.kind === 'circle')!.y;
    expect(head('up')).toBeLessThan(head(null) - 8);
    expect(head('dn')).toBeGreaterThan(head(null) + 8);
    for (const id of ['up', 'dn']) {
      expectInside(bossFigure(st(id), boss, BOSS_COLORS), beastBounds(st(id), boss));
    }
  });

  it('keeps every pose inside the allowed box, in both facings, at every moment of the attack', () => {
    for (const a of ASHEN_HOUND.attacks) {
      for (const facing of [1, -1] as const) {
        for (let tick = 0; tick <= a.windup + a.active + 4; tick += 1) {
          for (const lift of [0, 100]) {
            const s = during(a.id, tick, facing, lift);
            expectInside(list(s), beastBounds(s, ASHEN_HOUND));
          }
        }
      }
    }
  });

  it('mirrors every pose with the facing', () => {
    for (const a of ASHEN_HOUND.attacks) {
      for (const tick of [0, Math.floor(a.windup / 2), a.windup - 1, a.windup, a.windup + a.active - 1]) {
        const right = during(a.id, tick, 1);
        expectSame(list(during(a.id, tick, -1)), mirrored(list(right), 700));
      }
    }
  });

  it('is pure: the pose reads only the boss, the tick and the given colours', () => {
    const s = during('rush', 20);
    const other: GameState = {
      ...s,
      seed: 9,
      rng: 3,
      boss: { ...s.boss, hp: 3, phase: 1 },
      player: { ...s.player, x: 5, health: 1 },
    };
    expect(list(other)).toEqual(list(s));
    const before = JSON.stringify(s);
    list(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('goes back to the idle figure after the active part (recovery)', () => {
    const a = attack('rush');
    const recovering = during('rush', a.windup + a.active + 2);
    expect(spread(list(recovering)).top).toBeGreaterThan(spread(list(during('rush', 20))).top + 12);
  });

  it('idle and walking figures are unchanged by the pose code (no attack, no pose shapes)', () => {
    // Idle keeps the original layout: a plain rectangle body and one snout rectangle, no jaw wedges or neck.
    const shapes = list(idle());
    expect(shapes.filter((p) => p.kind === 'poly' && p.points.length === 3).length).toBe(1);
  });
});

describe('bossFigure: any other boss', () => {
  it('yields a non-empty figure inside its box for a tiny and for a huge boss', () => {
    for (const boss of [generic(40, 40), generic(200, 300), generic(80, 150)]) {
      for (const s of bossStates(boss)) {
        expectInside(bossFigure(s, boss, BOSS_COLORS), weaponBounds(s, boss));
      }
    }
  });

  it('scales with the boss size', () => {
    const s = (boss: BossDef): Bounds => {
      const st = withBoss(base(boss), { mode: 'stagger', x: 700 });
      return spread(bossFigure(st, boss, BOSS_COLORS).filter((p) => p.kind !== 'poly' && !(p.kind === 'rect' && p.w < 30 && p.h > 40)));
    };
    const small = s(generic(40, 40));
    const large = s(generic(200, 300));
    expect(large.bottom - large.top).toBeGreaterThan(small.bottom - small.top);
    expect(large.right - large.left).toBeGreaterThan(small.right - small.left);
  });

  it('uses the generic figure for any id that is not a known one, whatever the id says', () => {
    const state = withBoss(base(DUELIST), { mode: 'attack', attackId: DUELIST.attacks[0]!.id, attackTick: 3, x: 700 });
    const a = bossFigure(state, { ...DUELIST, id: 'generated-abc' }, BOSS_COLORS);
    const b = bossFigure(state, { ...DUELIST, id: 'toString' }, BOSS_COLORS);
    expect(a).toEqual(b);
    expect(a).not.toEqual(bossFigure(state, DUELIST, BOSS_COLORS));
    expect(a).not.toEqual(bossFigure(state, { ...DUELIST, id: 'ashen-hound' }, BOSS_COLORS));
  });

  it('mirrors when the facing flips', () => {
    const boss = generic(120, 200);
    for (const s of bossStates(boss)) {
      if (s.boss.facing !== 1) continue;
      expectSame(bossFigure(withBoss(s, { facing: -1 }), boss, BOSS_COLORS), mirrored(bossFigure(s, boss, BOSS_COLORS), s.boss.x));
    }
  });

  it('is shorter while crouching and higher when lifted, like the box', () => {
    const boss: BossDef = { ...generic(100, 200), attacks: ASHEN_HOUND.attacks };
    const pounce = ASHEN_HOUND.attacks.find((a) => a.pose === 'crouch')!;
    const crouching = withBoss(base(boss), { mode: 'attack', attackId: pounce.id, attackTick: 0, x: 700 });
    const standing = withBoss(base(boss), { mode: 'stagger', x: 700 });
    expect(spread(bossFigure(crouching, boss, BOSS_COLORS)).top).toBeGreaterThan(
      spread(bossFigure(standing, boss, BOSS_COLORS)).top,
    );
  });
});

/** A recording stand-in for the canvas: keeps every call and every fill colour in order. */
function fakeContext(): { ctx: CanvasRenderingContext2D; calls: string[]; fills: string[]; alphas: number[] } {
  const calls: string[] = [];
  const fills: string[] = [];
  const alphas: number[] = [];
  const target: Record<string, unknown> = { fillStyle: '#000', globalAlpha: 1 };
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(`${name}(${args.join(',')})`);
      if (name === 'fill' || name === 'fillRect') {
        fills.push(String(target.fillStyle));
        alphas.push(Number(target.globalAlpha));
      }
    };
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'fill', 'fillRect']) {
    target[name] = record(name);
  }
  return { ctx: target as unknown as CanvasRenderingContext2D, calls, fills, alphas };
}

describe('drawPrimitives', () => {
  const list: Primitive[] = [
    { kind: 'rect', x: 1, y: 2, w: 3, h: 4, color: '#111111' },
    { kind: 'circle', x: 10, y: 20, r: 5, color: '#222222' },
    {
      kind: 'poly',
      points: [
        [0, 0],
        [10, 0],
        [5, 8],
      ],
      color: '#333333',
    },
  ];

  it('fills each primitive in order with its own colour', () => {
    const { ctx, calls, fills } = fakeContext();
    drawPrimitives(ctx, list);
    expect(fills).toEqual(['#111111', '#222222', '#333333']);
    expect(calls).toContain('fillRect(1,2,3,4)');
    expect(calls).toContain(`arc(10,20,5,0,${Math.PI * 2})`);
    expect(calls).toContain('lineTo(10,0)');
    expect(calls).toContain('lineTo(5,8)');
    expect(calls).toContain('closePath()');
    expect(calls.indexOf('fillRect(1,2,3,4)')).toBeLessThan(calls.indexOf(`arc(10,20,5,0,${Math.PI * 2})`));
    expect(calls.indexOf(`arc(10,20,5,0,${Math.PI * 2})`)).toBeLessThan(calls.indexOf('closePath()'));
  });

  it('keeps save and restore balanced, also for an empty list', () => {
    for (const items of [list, []]) {
      const { ctx, calls } = fakeContext();
      drawPrimitives(ctx, items, 0.5);
      expect(calls.filter((c) => c === 'save()').length).toBe(calls.filter((c) => c === 'restore()').length);
      expect(calls[0]).toBe('save()');
      expect(calls[calls.length - 1]).toBe('restore()');
    }
  });

  it('applies the alpha to every fill', () => {
    const { ctx, alphas } = fakeContext();
    drawPrimitives(ctx, list, 0.4);
    expect(alphas).toEqual([0.4, 0.4, 0.4]);
  });

  it('defaults to full opacity', () => {
    const { ctx, alphas } = fakeContext();
    drawPrimitives(ctx, list);
    expect(alphas).toEqual([1, 1, 1]);
  });
});

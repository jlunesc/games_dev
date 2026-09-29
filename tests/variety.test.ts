import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { BossFormatError, parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { DIALS, applyDials, type Dials } from '../src/game/difficulty';
import { activeHitBoxes } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type BoltState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { standAt } from './boss-helpers';
import { DUELIST } from './helpers';
import { bolt, shooter } from './shot-helpers';

const copy = (): BossDef => structuredClone(EMBER_DUELIST);
const rejects = (boss: unknown, where: string): void => {
  expect(() => parseBoss(boss)).toThrow(BossFormatError);
  expect(() => parseBoss(boss)).toThrow(`Boss data error at ${where}:`);
};

describe('a hit window on both sides', () => {
  it('is kept by the parser, and only when it is a true or false', () => {
    const b = copy();
    b.attacks[0]!.hits[0]!.both = true;
    expect(parseBoss(b).attacks[0]!.hits[0]!.both).toBe(true);
    (b.attacks[0]!.hits[0] as unknown as { both: string }).both = 'yes';
    rejects(b, 'boss.attacks[0].hits[0].both');
  });

  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const hit = slam.hits[0]!;
  const bothBoss: BossDef = {
    ...DUELIST,
    attacks: DUELIST.attacks.map((a) =>
      a.id === 'slam' ? { ...a, hits: a.hits.map((h) => ({ ...h, both: true })) } : a,
    ),
  };
  const bossAt = (facing: 1 | -1) => {
    const b = createInitialState(bothBoss).boss;
    b.mode = 'attack';
    b.attackId = 'slam';
    b.attackTick = hit.from;
    b.facing = facing;
    return b;
  };

  it('puts a box on each side, mirrored round the boss', () => {
    const boxes = activeHitBoxes(bossAt(-1), bothBoss);
    expect(boxes).toHaveLength(2);
    const xs = boxes.map((b) => b.x).sort((a, b) => a - b);
    expect(xs).toEqual([DUELIST.startX - hit.x1, DUELIST.startX + hit.x0]);
    expect(boxes[0]!.w).toBe(hit.x1 - hit.x0);
    expect(boxes[1]!.w).toBe(hit.x1 - hit.x0);
  });

  it('gives the same two boxes whichever way the boss faces', () => {
    const key = (facing: 1 | -1) =>
      activeHitBoxes(bossAt(facing), bothBoss)
        .map((b) => b.x)
        .sort((a, b) => a - b);
    expect(key(1)).toEqual(key(-1));
  });

  it('cuts each side by its own cover', () => {
    const covered: BossDef = {
      ...bothBoss,
      arena: { platforms: [], covers: [{ x: DUELIST.startX + hit.x0 + 40, width: 60, height: 500 }] },
    };
    const boxes = activeHitBoxes(bossAt(-1), covered);
    expect(boxes).toHaveLength(2);
    const right = boxes.find((b) => b.x >= DUELIST.startX)!;
    const left = boxes.find((b) => b.x < DUELIST.startX)!;
    expect(right.w).toBeLessThan(hit.x1 - hit.x0);
    expect(left.w).toBe(hit.x1 - hit.x0);
  });
});

describe('a hovering leap', () => {
  const at = (hang: unknown): unknown => {
    const b = copy();
    const s = b.attacks[0]!;
    (s as unknown as { leap: unknown }).leap = {
      from: s.windup,
      to: s.windup + 20,
      height: 120,
      target: 'player',
      hang,
    };
    s.active = Math.max(s.active, 20);
    return b;
  };

  it('is kept by the parser and rejects a hang that leaves no time to rise and fall', () => {
    expect(parseBoss(at(10)).attacks[0]!.leap!.hang).toBe(10);
    expect(parseBoss(at(18)).attacks[0]!.leap!.hang).toBe(18);
    rejects(at(19), 'boss.attacks[0].leap.hang');
    rejects(at(0), 'boss.attacks[0].leap.hang');
    rejects(at(3.5), 'boss.attacks[0].leap.hang');
  });

  const hover: AttackDef = {
    id: 'hover',
    name: 'Hover',
    pose: 'crouch',
    class: 'mustDodge',
    damage: 1,
    windup: 30,
    active: 40,
    recovery: 30,
    range: { min: 0, max: 1e9 },
    leap: { from: 30, to: 60, height: 200, target: 'player', hang: 14 },
    hits: [{ from: 60, to: 66, x0: 0, x1: 200, bottom: 0, top: 60 }],
  };
  const boss: BossDef = {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    attacks: [hover],
    phases: DUELIST.phases.map((p) => ({
      ...p,
      gap: 1,
      maxChain: 1,
      chainChance: 0,
      attacks: [{ id: 'hover', weight: 1 }],
    })),
  };

  function lifts(): number[] {
    let s: GameState = standAt(boss, 120);
    const out: number[] = [];
    let first = -1;
    for (let n = 0; n < 200 && out.length < 40 + 30; n++) {
      s = step(s, NO_INPUT, boss);
      if (first < 0 && s.boss.mode === 'attack') first = n;
      if (first >= 0 && s.boss.attackId === 'hover') out.push(s.boss.lift);
    }
    return out.slice(30);
  }

  it('is off the floor on the first flight update, holds its height, and is still up on the last', () => {
    const flight = lifts().slice(0, 30);
    expect(flight[0]!).toBeGreaterThan(0);
    expect(flight[29]!).toBeGreaterThan(0);
    expect(Math.max(...flight)).toBeCloseTo(200, 6);
    expect(flight.filter((l) => Math.abs(l - 200) < 1e-9)).toHaveLength(14);
    for (const l of flight) expect(l).toBeLessThanOrEqual(200 + 1e-9);
  });

  it('never goes down while rising and never up while falling', () => {
    const flight = lifts().slice(0, 30);
    const top = flight.findIndex((l) => Math.abs(l - 200) < 1e-9);
    const last = flight.length - 1 - [...flight].reverse().findIndex((l) => Math.abs(l - 200) < 1e-9);
    for (let i = 1; i <= top; i++) expect(flight[i]!).toBeGreaterThanOrEqual(flight[i - 1]!);
    for (let i = last + 1; i < flight.length; i++) expect(flight[i]!).toBeLessThan(flight[i - 1]!);
  });
});

describe('a bolt that flies backwards', () => {
  it('goes out of the back of the boss', () => {
    const boss = shooter([bolt({ height: 40, dir: 'back' })]);
    let s: GameState = createInitialState(boss, 1);
    let shot: BoltState | undefined;
    for (let n = 0; n < 60 && shot === undefined; n++) {
      s = step(s, NO_INPUT, boss);
      shot = s.shots[0] as BoltState | undefined;
    }
    expect(shot).toBeDefined();
    expect(s.boss.facing).toBe(-1);
    expect(shot!.dir).toBe(1);
    expect(shot!.x).toBeCloseTo(s.boss.x + boss.width / 2);
  });

  it('is kept by the parser, and cannot be aimed as well', () => {
    const b = (shot: object) => ({
      ...copy(),
      attacks: [
        {
          id: 'zap',
          name: 'Zap',
          pose: 'sideways',
          class: 'mustDodge',
          windup: 20,
          active: 8,
          recovery: 20,
          range: { min: 0, max: 600 },
          hits: [],
          shots: [{ kind: 'bolt', at: 20, height: 10, size: 30, speed: 600, ...shot }],
        },
      ],
      phases: [{ ...copy().phases[0]!, attacks: [{ id: 'zap', weight: 1 }], opening: undefined }],
    });
    expect(parseBoss(b({ dir: 'back' })).attacks[0]!.shots![0]).toMatchObject({ dir: 'back' });
    expect(parseBoss(b({ aim: true })).attacks[0]!.shots![0]).toMatchObject({ aim: true });
    rejects(b({ dir: 'up' }), 'boss.attacks[0].shots[0].dir');
    rejects(b({ aim: 'yes' }), 'boss.attacks[0].shots[0].aim');
    rejects(b({ aim: true, dir: 'back' }), 'boss.attacks[0].shots[0].dir');
  });
});

describe('an aimed bolt', () => {
  const boss = shooter([bolt({ height: 300, aim: true, speed: 600 })]);

  it('flies at the player instead of over them, and hurts a player who stands still', () => {
    let s: GameState = createInitialState(boss, 1);
    let hurt = false;
    for (let n = 0; n < 200 && !hurt; n++) {
      s = step(s, NO_INPUT, boss);
      hurt = s.events.includes('playerHit');
    }
    expect(hurt).toBe(true);
    expect(s.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('fixes its course when it is fired and comes down towards the floor', () => {
    let s: GameState = createInitialState(boss, 1);
    const seen: BoltState[] = [];
    for (let n = 0; n < 120; n++) {
      s = step(s, NO_INPUT, boss);
      const shot = s.shots[0] as BoltState | undefined;
      if (shot !== undefined) seen.push({ ...shot });
    }
    expect(seen.length).toBeGreaterThan(3);
    expect(seen[0]!.climb).toBeLessThan(0);
    expect(new Set(seen.map((x) => x.climb)).size).toBe(1);
    expect(new Set(seen.map((x) => x.speed)).size).toBe(1);
    expect(seen[1]!.lift).toBeLessThan(seen[0]!.lift);
  });

  it('is removed when it reaches the floor', () => {
    const dodger = shooter([bolt({ height: 300, aim: true, speed: 300 })]);
    let s: GameState = createInitialState(dodger, 1);
    s.player.x = 40;
    s.player.prevX = 40;
    for (let n = 0; n < 400; n++) {
      s = step(s, NO_INPUT, dodger);
      for (const shot of s.shots) if (shot.kind === 'bolt') expect(shot.lift).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('a boss in the air firing a bolt', () => {
  it('fires from its height above the floor', () => {
    const boss = shooter([bolt({ height: 10 })]);
    let s: GameState = createInitialState(boss, 1);
    s.boss.lift = 150;
    let shot: BoltState | undefined;
    for (let n = 0; n < 60 && shot === undefined; n++) {
      s = step(s, NO_INPUT, boss);
      shot = s.shots[0] as BoltState | undefined;
    }
    expect(shot).toBeDefined();
    expect(shot!.lift).toBeGreaterThanOrEqual(160);
    expect(shot!.lift).toBeLessThan(WORLD.height);
  });
});

describe('the new fields with every dial at its extreme', () => {
  const boss: BossDef = {
    ...DUELIST,
    attacks: [
      {
        ...DUELIST.attacks[0]!,
        id: 'hover',
        leap: { from: DUELIST.attacks[0]!.windup, to: DUELIST.attacks[0]!.windup + 20, height: 120, target: 'player', hang: 10 },
        active: 24,
        hits: [{ from: DUELIST.attacks[0]!.windup + 20, to: DUELIST.attacks[0]!.windup + 24, x0: 0, x1: 100, bottom: 0, top: 60, both: true }],
        shots: [
          { kind: 'bolt', at: DUELIST.attacks[0]!.windup + 2, height: 30, size: 30, speed: 500, aim: true },
          { kind: 'bolt', at: DUELIST.attacks[0]!.windup + 3, height: 30, size: 30, speed: 500, dir: 'back' },
        ],
        class: 'mustDodge',
      },
    ],
    phases: DUELIST.phases.map((p) => ({ ...p, attacks: [{ id: 'hover', weight: 1 }], opening: undefined })),
  };

  it('survive re-checking with all dials at the low and high ends', () => {
    for (const end of ['min', 'max'] as const) {
      const dials = Object.fromEntries(DIALS.map((d) => [d.id, d[end]])) as Dials;
      const out = applyDials(boss, dials);
      const a = out.attacks[0]!;
      expect(a.hits[0]!.both).toBe(true);
      expect(a.leap!.hang).toBe(10);
      expect(a.shots!.some((x) => x.kind === 'bolt' && x.aim === true)).toBe(true);
      expect(a.shots!.some((x) => x.kind === 'bolt' && x.dir === 'back')).toBe(true);
    }
  });
});

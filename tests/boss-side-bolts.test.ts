import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { WORLD } from '../src/game/params';
import { createInitialState, type BoltState } from '../src/game/state';
import { step } from '../src/game/step';
import { bolt, shooter } from './shot-helpers';

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

function fire(boss: BossDef, updates = 80) {
  let s = createInitialState(boss, 1);
  const states = [];
  for (let i = 0; i < updates; i++) {
    s = step(s, NO_INPUT, boss);
    states.push(s);
  }
  return states;
}

describe('side bolts: parsing', () => {
  it('accepts an edge and rejects one that is combined with dir or aim, or is not left or right', () => {
    expect(parseBoss(clone(shooter([bolt({ edge: 'left' })]))).attacks[0]!.shots![0]).toMatchObject({ edge: 'left' });
    expect(() => parseBoss(clone(shooter([bolt({ edge: 'left', aim: true })])))).toThrow(/edge/);
    expect(() => parseBoss(clone(shooter([bolt({ edge: 'right', dir: 'back' })])))).toThrow(/edge/);
    const bad = clone(shooter([bolt()]));
    bad.attacks[0].shots[0].edge = 'top';
    expect(() => parseBoss(bad)).toThrow(/edge/);
  });
});

describe('side bolts: playing', () => {
  it('appears at the left edge flying right, whatever the boss is doing', () => {
    const boss = shooter([bolt({ at: 22, height: 40, size: 30, speed: 600, edge: 'left' })]);
    const states = fire(boss);
    const first = states.findIndex((x) => x.shots.length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    const born = states[first]!;
    const shot = born.shots[0] as BoltState;
    expect(born.boss.attackTick).toBe(22);
    expect(shot.x).toBeCloseTo(15);
    expect(shot.originX).toBeCloseTo(15);
    expect(shot.dir).toBe(1);
    expect(shot.lift).toBe(40);
    expect((states[first + 1]!.shots[0] as BoltState).x).toBeCloseTo(25);
  });

  it('appears at the right edge flying left', () => {
    const boss = shooter([bolt({ at: 22, size: 30, edge: 'right' })]);
    const states = fire(boss);
    const shot = states.find((x) => x.shots.length > 0)!.shots[0] as BoltState;
    expect(shot.x).toBeCloseTo(WORLD.width - 15);
    expect(shot.dir).toBe(-1);
  });

  it('a crossfire fires both bolts on the same update', () => {
    const boss = shooter([bolt({ at: 22, edge: 'left' }), bolt({ at: 22, edge: 'right' })]);
    const born = fire(boss).find((x) => x.shots.length > 0)!;
    expect(born.shots.map((x) => (x as BoltState).dir).sort()).toEqual([-1, 1]);
  });

  it('crosses the arena and hurts a standing player in the middle', () => {
    const boss = shooter([bolt({ at: 22, height: 0, size: 30, speed: 600, edge: 'left' })]);
    let s = createInitialState(boss, 1);
    s.player.x = 500;
    s.player.prevX = 500;
    s.player.health = 3;
    let hurt = false;
    for (let i = 0; i < 100 && !hurt; i++) {
      s = step(s, NO_INPUT, boss);
      hurt = s.player.health < 3;
    }
    expect(hurt).toBe(true);
  });
});

describe('side bolts: difficulty dials', () => {
  it('keeps the edge through the dials', () => {
    const changed = applyDials(shooter([bolt({ edge: 'right' })]), { ...NORMAL_DIALS, readability: 1.3 });
    expect(changed.attacks[0]!.shots![0]).toMatchObject({ kind: 'bolt', edge: 'right' });
  });
});

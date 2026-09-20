import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER, WORLD } from '../src/game/params';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import { advance, run, withInput } from './helpers';

const maxHeight = (states: GameState[]): number =>
  WORLD.floorY - Math.min(...states.map((s) => s.player.y));

describe('running', () => {
  it('stays put on the floor with no input', () => {
    const s = advance(createInitialState(), 10);
    expect(s.player.x).toBe(PLAYER.startX);
    expect(s.player.y).toBe(WORLD.floorY);
    expect(s.player.onGround).toBe(true);
  });

  it('runs right at the run speed and faces right', () => {
    const s = advance(createInitialState(), 60, withInput({ moveX: 1 }));
    expect(s.player.x).toBeCloseTo(PLAYER.startX + PLAYER.runSpeed, 5);
    expect(s.player.facing).toBe(1);
  });

  it('runs left and faces left', () => {
    const s = advance(createInitialState(), 30, withInput({ moveX: -1 }));
    expect(s.player.x).toBeCloseTo(PLAYER.startX - PLAYER.runSpeed / 2, 5);
    expect(s.player.facing).toBe(-1);
  });

  it('stops at the walls', () => {
    const left = advance(createInitialState(), 300, withInput({ moveX: -1 }));
    expect(left.player.x).toBe(PLAYER.width / 2);
    const right = advance(createInitialState(), 300, withInput({ moveX: 1 }));
    expect(right.player.x).toBe(WORLD.width - PLAYER.width / 2);
  });
});

describe('jumping', () => {
  it('a held jump reaches roughly the planned height and lands again', () => {
    const states = run(createInitialState(), 60, (n) =>
      withInput({ jumpPressed: n === 1, jumpHeld: true }),
    );
    const height = maxHeight(states);
    expect(height).toBeGreaterThan(150);
    expect(height).toBeLessThan(175);
    expect(states[19]!.player.onGround).toBe(false);
    expect(states[59]!.player.onGround).toBe(true);
  });

  it('releasing early makes a much smaller jump', () => {
    const full = maxHeight(
      run(createInitialState(), 60, (n) => withInput({ jumpPressed: n === 1, jumpHeld: true })),
    );
    const short = maxHeight(
      run(createInitialState(), 60, (n) => withInput({ jumpPressed: n === 1, jumpHeld: n === 1 })),
    );
    expect(short).toBeGreaterThan(20);
    expect(short).toBeLessThan(full * 0.6);
  });

  it('cannot jump again in the air', () => {
    const states = run(createInitialState(), 30, (n) =>
      withInput({ jumpPressed: n === 1 || n === 10, jumpHeld: true }),
    );
    const single = run(createInitialState(), 30, (n) =>
      withInput({ jumpPressed: n === 1, jumpHeld: true }),
    );
    expect(states.map((s) => s.player.y)).toEqual(single.map((s) => s.player.y));
  });
});

describe('the jump input buffer', () => {
  const fall = (pressAt: number): GameState[] => {
    const start = createInitialState();
    start.player.y = WORLD.floorY - 60;
    start.player.onGround = false;
    return run(start, 30, (n) => withInput({ jumpPressed: n === pressAt, jumpHeld: n === pressAt }));
  };
  const landing = fall(-1).findIndex((s) => s.player.onGround) + 1;

  it('lands after a few updates (sanity check of the scenario)', () => {
    expect(landing).toBeGreaterThan(3);
  });

  it('a press one update before landing still jumps', () => {
    const states = fall(landing - 1);
    expect(states[landing]!.player.vy).toBeLessThan(0);
  });

  it('a press two updates before landing has expired and does not jump', () => {
    const states = fall(landing - 2);
    expect(states[landing]!.player.onGround).toBe(true);
    expect(states[landing]!.player.vy).toBe(0);
  });
});

describe('step purity', () => {
  it('does not change the state it was given', () => {
    const before = createInitialState();
    const snapshot = JSON.stringify(before);
    step(before, withInput({ moveX: 1, jumpPressed: true, jumpHeld: true }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('gives identical results for identical inputs', () => {
    const script = (n: number) =>
      withInput({ moveX: n % 7 < 3 ? 1 : -1, jumpPressed: n % 20 === 1, jumpHeld: n % 20 < 12 });
    expect(run(createInitialState(), 200, script)).toEqual(run(createInitialState(), 200, script));
  });

  it('counts updates', () => {
    expect(advance(createInitialState(), 5, NO_INPUT).tick).toBe(5);
  });
});

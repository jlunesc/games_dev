import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { beginTransition } from '../src/game/boss';
import { shotBox, playerBox, overlaps } from '../src/game/geometry';
import { ERUPTION, PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type EruptionState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { withInput } from './helpers';
import { eruption, shooter } from './shot-helpers';

/** The boss fires one eruption on attack update 20 (mark) that blasts 30 updates later for 6 updates. */
const boss = (over: Parameters<typeof eruption>[0] = {}): BossDef => shooter([eruption(over)]);

function run(s: GameState, b: BossDef, count: number, frame: (n: number) => InputFrame = () => NO_INPUT): GameState[] {
  const out: GameState[] = [];
  let cur = s;
  for (let n = 0; n < count; n++) {
    cur = step(cur, frame(n), b);
    out.push(cur);
  }
  return out;
}

const marks = (s: GameState): EruptionState[] => s.shots.filter((x): x is EruptionState => x.kind === 'eruption');

describe('a floor eruption', () => {
  it('puts its mark under the player plus the offset when it is due, and never moves it', () => {
    const b = boss({ offset: -260 });
    const start = createInitialState(b, 1);
    const states = run(start, b, 90, () => withInput({ moveX: 1 }));
    const born = states.findIndex((s) => marks(s).length > 0);
    expect(born).toBeGreaterThanOrEqual(0);
    const first = states[born]!;
    expect(first.boss.attackTick).toBe(20);
    const m = marks(first)[0]!;
    expect(m.x).toBeCloseTo(first.player.x - 260);
    expect(m.age).toBe(0);
    const later = marks(states[born + 10]!)[0]!;
    expect(later.x).toBe(m.x);
    expect(later.age).toBe(10);
  });

  it('keeps the mark inside the arena', () => {
    const b = boss({ offset: -800 });
    const states = run(createInitialState(b, 1), b, 40);
    const m = marks(states.find((s) => marks(s).length > 0)!)[0]!;
    expect(m.x).toBe(70);
    const c = boss({ offset: 800 });
    const right = createInitialState(c, 1);
    right.player.x = 1000;
    right.player.prevX = 1000;
    const late = run(right, c, 40);
    expect(marks(late.find((s) => marks(s).length > 0)!)[0]!.x).toBe(WORLD.width - 70);
  });

  it('is harmless until the blast, live for exactly its burst, then gone', () => {
    const b = boss({ offset: 400 });
    const states = run(createInitialState(b, 1), b, 90);
    const born = states.findIndex((s) => marks(s).length > 0);
    const at = (age: number) => marks(states[born + age]!)[0]!;
    expect(shotBox(at(29))).toBeNull();
    expect(shotBox(at(30))).not.toBeNull();
    expect(shotBox(at(35))).not.toBeNull();
    expect(marks(states[born + 36]!)).toHaveLength(0);
  });

  it('fills its width from the floor up, too tall for a jump to clear', () => {
    const b = boss();
    const s = createInitialState(b, 1);
    const m: EruptionState = { kind: 'eruption', attackId: 'shoot', originTick: 1, x: 500, lift: 0, age: 30, width: 140, delay: 30, burst: 6 };
    const box = shotBox(m)!;
    expect(box).toEqual({ x: 430, y: WORLD.floorY - ERUPTION.height, w: 140, h: ERUPTION.height });
    // The top of a full jump (feet about 163 up) still overlaps it.
    const apex = { ...s.player, x: 500, y: WORLD.floorY - 163 };
    expect(overlaps(box, playerBox(apex))).toBe(true);
  });

  it('hurts a player who stays under it, once', () => {
    const b = boss();
    const start = createInitialState(b, 1);
    const states = run(start, b, 80);
    const hitAt = states.findIndex((s) => s.events.includes('playerHit'));
    const born = states.find((s) => marks(s).length > 0)!;
    expect(hitAt).toBeGreaterThanOrEqual(0);
    expect(states[hitAt]!.player.health).toBe(PLAYER.maxHealth - 1);
    expect(states[hitAt]!.shotHits).toEqual([{ attackId: 'shoot', originTick: born.tick - 20 }]);
    expect(states.filter((s) => s.events.includes('playerHit'))).toHaveLength(1);
  });

  it('misses a player who steps out of the mark in time', () => {
    const b = boss();
    const states = run(createInitialState(b, 1), b, 80, () => withInput({ moveX: 1 }));
    expect(states.some((s) => s.events.includes('playerHit'))).toBe(false);
  });

  it('lets a dash through the blast pass, and the blast keeps going', () => {
    const b = boss();
    const idle = run(createInitialState(b, 1), b, 80);
    const hitTick = idle.find((s) => s.events.includes('playerHit'))!.tick;
    // Dash on the update before the blast is live, standing still in the mark.
    const dashed = run(createInitialState(b, 1), b, 80, (n) => withInput({ dashPressed: n + 1 === hitTick - 2, moveX: 0 }));
    expect(dashed.some((s) => s.events.includes('playerHit'))).toBe(false);
    expect(dashed.some((s) => marks(s).some((m) => shotBox(m) !== null))).toBe(true);
  });

  it('is cleared by a phase change', () => {
    const b = boss();
    const s = createInitialState(b, 1);
    s.shots = [{ kind: 'eruption', attackId: 'shoot', originTick: 1, x: 500, lift: 0, age: 10, width: 140, delay: 30, burst: 6 }];
    beginTransition(s, b);
    expect(s.shots).toEqual([]);
  });

  it('shows in the study without hurting anyone, and the study waits for the blast', () => {
    const b = boss();
    let s = createInitialState(b, 1, 1);
    let studyHit = false;
    for (let n = 0; n < 600 && s.study.active; n++) {
      s = step(s, NO_INPUT, b);
      if (s.events.includes('studyHit')) studyHit = true;
    }
    expect(studyHit).toBe(true);
    expect(s.player.health).toBe(PLAYER.maxHealth);
    expect(s.study.active).toBe(false);
    expect(s.shots).toEqual([]);
  });

  it('replays identically from the same seed and input', () => {
    const b = shooter([eruption({ offset: -100 }), eruption({ at: 24, offset: 100 })]);
    const input = (n: number): InputFrame => ({ ...NO_INPUT, moveX: n % 40 < 20 ? 1 : -1, dashPressed: n % 55 === 0 });
    const a = run(createInitialState(b, 7), b, 400, input);
    const c = run(createInitialState(b, 7), b, 400, input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
});

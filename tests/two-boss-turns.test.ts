import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import { createInitialState, type GameState, type ShotState } from '../src/game/state';
import { step } from '../src/game/step';
import { pickCommitter } from '../src/game/turns';
import { pair, unit } from './duo-helpers';

const fakeShot = (owner?: number): ShotState => ({
  kind: 'bolt',
  attackId: 'shoot',
  originTick: 0,
  x: 500,
  lift: 400,
  dir: -1,
  originX: 500,
  size: 30,
  speed: 600,
  climb: 0,
  ...(owner === undefined ? {} : { owner }),
});

describe('pickCommitter', () => {
  const fight = pair(unit(5, 960), unit(5, 1100));

  it('picks nobody while no boss is ready', () => {
    expect(pickCommitter(createInitialState(fight), fight)).toBeNull();
  });

  it('picks the only ready boss', () => {
    const s = createInitialState(fight);
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('picks the boss that has waited longer', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.partners[0]!.modeTick = 20;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('picks the first-listed boss when both have waited the same', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(0);
  });

  it('picks nobody while the other boss walks into range or attacks', () => {
    for (const mode of ['approach', 'attack'] as const) {
      const s = createInitialState(fight);
      s.boss.mode = mode;
      s.partners[0]!.modeTick = 10;
      expect(pickCommitter(s, fight)).toBeNull();
    }
  });

  it('picks nobody while the other boss has shots on the field', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.shots.push(fakeShot(1));
    expect(pickCommitter(s, fight)).toBeNull();
  });

  it('lets a boss commit while only its own shots are on the field', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 10;
    s.shots.push(fakeShot());
    expect(pickCommitter(s, fight)).toBe(0);
  });

  it('does not let a boss with a short wait leapfrog one that waited longer and is blocked', () => {
    const s = createInitialState(fight);
    s.boss.modeTick = 6;
    s.partners[0]!.modeTick = 30;
    s.shots.push(fakeShot());
    expect(pickCommitter(s, fight)).toBeNull();
  });

  it('a staggered boss holds no turn', () => {
    const s = createInitialState(fight);
    s.boss.mode = 'stagger';
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, fight)).toBe(1);
  });

  it('does not count a boss without attacks as ready', () => {
    const quiet = { ...unit(5, 960), phases: unit(5, 960).phases.map((phase) => ({ ...phase, attacks: [] })) };
    const f = pair(quiet, unit(5, 1100));
    const s = createInitialState(f);
    s.boss.modeTick = 50;
    s.partners[0]!.modeTick = 10;
    expect(pickCommitter(s, f)).toBe(1);
  });
});

describe('two bosses in a running fight', () => {
  const fight = pair(unit(5, 960), unit(5, 1100));

  function run(count: number): GameState[] {
    const states: GameState[] = [];
    let s = createInitialState(fight);
    for (let i = 0; i < count; i++) {
      s = step(s, NO_INPUT, fight);
      states.push(s);
    }
    return states;
  }

  it('never lets two bosses take their turn at once, and never lets one start while the other has shots up', () => {
    for (const s of run(900)) {
      const busy = [s.boss, ...s.partners]
        .map((b, i) => ({ i, on: b.mode === 'approach' || b.mode === 'attack' }))
        .filter((entry) => entry.on);
      expect(busy.length).toBeLessThanOrEqual(1);
      for (const { i } of busy) {
        expect(s.shots.every((shot) => (shot.owner ?? 0) === i)).toBe(true);
      }
    }
  });

  it('gives the bosses their turns alternately, the one that waited longer first', () => {
    const starts: number[] = [];
    let previous = createInitialState(fight);
    for (const s of run(900)) {
      [s.boss, ...s.partners].forEach((b, i) => {
        const before = [previous.boss, ...previous.partners][i]!;
        if (b.mode === 'attack' && before.mode !== 'attack') starts.push(i);
      });
      previous = s;
    }
    expect(starts.slice(0, 4)).toEqual([0, 1, 0, 1]);
  });

  it('draws random numbers only when a boss commits, so a blocked boss draws none', () => {
    let previous = createInitialState(fight);
    let compared = 0;
    for (const s of run(900)) {
      const before = [previous.boss, ...previous.partners];
      const sameModes = [s.boss, ...s.partners].every((b, i) => b.mode === before[i]!.mode);
      if (sameModes) {
        expect(s.rng).toBe(previous.rng);
        compared += 1;
      }
      previous = s;
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('marks the shots of the partner and not those of the primary boss', () => {
    let primary = false;
    let partner = false;
    for (const s of run(900)) {
      for (const shot of s.shots) {
        if ('owner' in shot) {
          expect(shot.owner).toBe(1);
          partner = true;
        } else {
          primary = true;
        }
      }
    }
    expect(primary && partner).toBe(true);
  });

  it('is deterministic: the same seed and inputs give the same fight', () => {
    expect(run(400)).toEqual(run(400));
  });
});

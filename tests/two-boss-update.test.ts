import { describe, expect, it } from 'vitest';
import { beginTransition, updateBoss } from '../src/game/boss';
import { createInitialState } from '../src/game/state';
import { dummy, pair, unit } from './duo-helpers';

describe('updateBoss with an index', () => {
  it('moves only the boss it is asked about', () => {
    const b = unit(5, 1100);
    const s = createInitialState(pair(unit(5, 960), b));
    for (let i = 0; i < 5; i++) {
      s.tick += 1;
      updateBoss(s, b, 1);
    }
    expect(s.partners[0]!.mode).toBe('approach');
    expect(s.boss.mode).toBe('gap');
    expect(s.boss.modeTick).toBe(0);
  });

  it('waits and draws no random numbers while it may not commit, then commits when it may', () => {
    const b = unit(5, 1100);
    const s = createInitialState(pair(unit(5, 960), b));
    const before = s.rng;
    for (let i = 0; i < 9; i++) {
      s.tick += 1;
      updateBoss(s, b, 1, false);
    }
    expect(s.partners[0]!.mode).toBe('gap');
    expect(s.rng).toBe(before);
    s.tick += 1;
    updateBoss(s, b, 1, true);
    expect(s.partners[0]!.mode).toBe('approach');
    expect(s.rng).not.toBe(before);
  });

  it('marks the shots of a partner with its index and leaves the primary shots unmarked', () => {
    const a = unit(5, 960);
    const b = unit(5, 1100);
    const s = createInitialState(pair(a, b));
    for (let i = 0; i < 100 && s.shots.length === 0; i++) {
      s.tick += 1;
      updateBoss(s, b, 1);
    }
    expect(s.shots[0]!.owner).toBe(1);

    const t = createInitialState(pair(a, b));
    for (let i = 0; i < 100 && t.shots.length === 0; i++) {
      t.tick += 1;
      updateBoss(t, a, 0);
    }
    expect(t.shots.length).toBeGreaterThan(0);
    expect('owner' in t.shots[0]!).toBe(false);
  });

  it('a phase change of one boss clears only its own shots', () => {
    const a = unit(5, 960);
    const b = unit(5, 1100);
    const s = createInitialState(pair(a, b));
    s.shots.push(
      { kind: 'bolt', attackId: 'shoot', originTick: 0, x: 500, lift: 400, dir: -1, originX: 500, size: 30, speed: 600, climb: 0 },
      { kind: 'bolt', attackId: 'shoot', originTick: 0, x: 600, lift: 400, dir: -1, originX: 600, size: 30, speed: 600, climb: 0, owner: 1 },
    );
    beginTransition(s, b, 1);
    expect(s.shots.map((shot) => shot.owner)).toEqual([undefined]);
  });
});

describe('a blocked opening', () => {
  it('becomes a plain wait: no attack is chosen, no random number is drawn, the gap starts over', () => {
    const base = unit(5, 1100);
    const b = { ...base, phases: [{ ...base.phases[0]!, opening: 'shoot' }] };
    const s = createInitialState(pair(unit(5, 960), b));
    const partner = s.partners[0]!;
    partner.mode = 'transition';
    partner.modeTick = b.transitionTicks - 1;
    const before = s.rng;
    s.tick += 1;
    updateBoss(s, b, 1, false);
    expect(partner.mode).toBe('gap');
    expect(partner.modeTick).toBe(0);
    expect(partner.pendingAttackId).toBeNull();
    expect(s.rng).toBe(before);
  });
});

describe('a dummy partner', () => {
  it('never leaves its wait', () => {
    const d = dummy(1100);
    const s = createInitialState(pair(unit(5, 960), d));
    for (let i = 0; i < 50; i++) {
      s.tick += 1;
      updateBoss(s, d, 1);
    }
    expect(s.partners[0]!.mode).toBe('gap');
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/state';
import { fellBosses, phasedBoss, struckBoss } from '../src/ui/look/who';
import { dummy, pair, unit } from './duo-helpers';

const fight = pair(unit(30, 400), dummy(800));
const start = () => createInitialState(fight, 1);
const after = (change: (s: ReturnType<typeof start>) => void) => {
  const s = structuredClone(start());
  change(s);
  return s;
};

describe('struckBoss', () => {
  it('is the boss whose health dropped', () => {
    expect(struckBoss(start(), after((s) => { s.partners[0]!.hp -= 3; }))).toBe(1);
    expect(struckBoss(start(), after((s) => { s.boss.hp -= 3; }))).toBe(0);
  });

  it('is the boss that was just staggered by a counter', () => {
    expect(struckBoss(start(), after((s) => { s.partners[0]!.mode = 'stagger'; }))).toBe(1);
  });

  it('falls back to the primary when nothing changed', () => {
    expect(struckBoss(start(), start())).toBe(0);
  });
});

describe('fellBosses', () => {
  it('lists the bosses that reached zero health in this update only', () => {
    expect(fellBosses(start(), after((s) => { s.partners[0]!.hp = 0; }))).toEqual([1]);
    const down = after((s) => { s.partners[0]!.hp = 0; });
    expect(fellBosses(down, structuredClone(down))).toEqual([]);
  });
});

describe('phasedBoss', () => {
  it('is the boss that moved to a later phase', () => {
    expect(phasedBoss(start(), after((s) => { s.partners[0]!.phase += 1; }))).toBe(1);
    expect(phasedBoss(start(), start())).toBe(0);
  });
});

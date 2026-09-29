import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, VESPER_SAGE } from '../src/bosses';
import { makeFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { bossFigure, type Primitive } from '../src/ui/look/figures';

const COLORS = { body: '#c8642a', accent: '#e8965a', glow: null as string | null };
const xsOf = (list: Primitive[]): number[] =>
  list.flatMap((p) => (p.kind === 'rect' ? [p.x, p.x + p.w] : p.kind === 'circle' ? [p.x - p.r, p.x + p.r] : p.points.map((q) => q[0])));

describe('bossFigure for a boss of a pair', () => {
  const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);

  it('draws the boss it is asked for, where that boss stands', () => {
    const state = createInitialState(fight, 1);
    state.boss.x = 300;
    state.partners[0]!.x = 950;
    const hound = xsOf(bossFigure(state, ASHEN_HOUND, COLORS, 0));
    const sage = xsOf(bossFigure(state, VESPER_SAGE, COLORS, 1));
    expect(Math.max(...hound)).toBeLessThan(600);
    expect(Math.min(...sage)).toBeGreaterThan(700);
  });

  it('draws the primary exactly as it draws a boss fighting alone', () => {
    const paired = createInitialState(fight, 1);
    const alone = createInitialState(ASHEN_HOUND, 1);
    paired.boss.x = alone.boss.x = 300;
    expect(bossFigure(paired, ASHEN_HOUND, COLORS)).toEqual(bossFigure(alone, ASHEN_HOUND, COLORS));
    expect(bossFigure(paired, ASHEN_HOUND, COLORS, 0)).toEqual(bossFigure(alone, ASHEN_HOUND, COLORS));
  });
});

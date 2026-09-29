import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { asFight, makeFight } from '../src/game/fight';
import { WORLD } from '../src/game/params';
import { createInitialState, type ShotState } from '../src/game/state';
import { fallenFigure, healthBars, turnHolder, turnMarker } from '../src/ui/look/duo';
import type { Primitive } from '../src/ui/look/figures';
import { moodFor } from '../src/ui/look/moods';
import { bossDrawBox } from '../src/ui/look/pose';
import { LOOK } from '../src/ui/look/tuning';
import { dummy, pair, unit } from './duo-helpers';

const M = LOOK.turnMarker;

describe('healthBars', () => {
  it('draws one bar for a lone boss exactly where the single bar always was', () => {
    const state = createInitialState(EMBER_DUELIST);
    const bars = healthBars(state, asFight(EMBER_DUELIST));
    expect(bars).toHaveLength(1);
    const bar = bars[0]!;
    const left = WORLD.width - 24 - 260;
    expect(bar.back).toEqual({ x: left, y: 24, w: 260, h: 14 });
    expect(bar.fill).toEqual({ x: left, y: 24, w: 260, h: 14 });
    expect(bar.nameX).toBe(WORLD.width - 24);
    expect(bar.nameY).toBe(46);
    expect(bar.name).toBe(EMBER_DUELIST.name);
    expect(bar.color).toBeNull();
    expect(bar.dim).toBe(false);
    expect(bar.ticks).toEqual(
      EMBER_DUELIST.phases.slice(1).map((p) => ({ x: left + 260 * p.startsAtHpFraction - 1, y: 20, w: 3, h: 22 })),
    );
  });

  it('shrinks the fill with the health and never below zero', () => {
    const state = createInitialState(EMBER_DUELIST);
    const fight = asFight(EMBER_DUELIST);
    state.boss.hp = EMBER_DUELIST.maxHp / 2;
    expect(healthBars(state, fight)[0]!.fill.w).toBeCloseTo(130);
    state.boss.hp = -5;
    expect(healthBars(state, fight)[0]!.fill.w).toBe(0);
  });

  it('puts STUDY in front of the name while the study runs', () => {
    const state = createInitialState(EMBER_DUELIST);
    state.study = { active: true, queue: [], endTick: 0 };
    expect(healthBars(state, asFight(EMBER_DUELIST))[0]!.name).toBe(`STUDY  ${EMBER_DUELIST.name}`);
  });

  it('stacks a bar for each boss of a pair, primary on top, each in its boss colour', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = VESPER_SAGE.maxHp / 4;
    const [first, second] = healthBars(state, fight);
    expect(first!.name).toBe(ASHEN_HOUND.name);
    expect(second!.name).toBe(VESPER_SAGE.name);
    expect(second!.back.y).toBe(first!.back.y + LOOK.hud.barStep);
    expect(second!.nameY).toBe(second!.back.y + LOOK.hud.nameDrop);
    expect(second!.back.x).toBe(first!.back.x);
    expect(first!.fill.w).toBe(260);
    expect(second!.fill.w).toBeCloseTo(65);
    expect(first!.color).toBe(moodFor(ASHEN_HOUND.id).accent);
    expect(second!.color).toBe(moodFor(VESPER_SAGE.id).accent);
    expect(second!.ticks).toEqual(
      VESPER_SAGE.phases.slice(1).map((p) => ({
        x: second!.back.x + 260 * p.startsAtHpFraction - 1,
        y: second!.back.y - LOOK.hud.tickRise,
        w: LOOK.hud.tickWidth,
        h: LOOK.hud.tickHeight,
      })),
    );
  });

  it('dims the bar of a fallen boss only', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);
    const state = createInitialState(fight, 1);
    expect(healthBars(state, fight).map((b) => b.dim)).toEqual([false, false]);
    state.partners[0]!.hp = 0;
    expect(healthBars(state, fight).map((b) => b.dim)).toEqual([false, true]);
    expect(healthBars(state, fight)[1]!.fill.w).toBe(0);
  });
});

describe('the turn marker', () => {
  const fight = pair(unit(30, 400), dummy(800));
  const bolt = (owner: number): ShotState => ({
    kind: 'bolt',
    attackId: 'shoot',
    originTick: 1,
    x: 500,
    lift: 0,
    dir: 1,
    originX: 500,
    size: 30,
    speed: 600,
    climb: 0,
    owner,
  });

  it('is on nobody while both bosses only wait', () => {
    const state = createInitialState(fight, 1);
    expect(turnHolder(state, fight)).toBeNull();
    expect(turnMarker(state, fight)).toBeNull();
  });

  it('is on the boss that attacks or approaches', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    expect(turnHolder(state, fight)).toBe(0);
    state.boss.mode = 'gap';
    state.partners[0]!.mode = 'approach';
    expect(turnHolder(state, fight)).toBe(1);
  });

  it('stays on the boss that owns shots still in the air', () => {
    const state = createInitialState(fight, 1);
    state.shots = [bolt(1)];
    expect(turnHolder(state, fight)).toBe(1);
  });

  it('is never shown in a fight of one boss', () => {
    const solo = asFight(unit(30, 400));
    const state = createInitialState(solo, 1);
    state.boss.mode = 'attack';
    expect(turnHolder(state, solo)).toBeNull();
  });

  it('is hidden once only one boss stands', () => {
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = 0;
    state.boss.mode = 'attack';
    expect(turnHolder(state, fight)).toBeNull();
  });

  it('is a triangle over the boss, its tip pointing down at the gap above the drawn box', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    const marker = turnMarker(state, fight)!;
    const tip = bossDrawBox(state.boss, fight.bosses[0]!).top - M.gap;
    expect(marker.boss).toBe(0);
    expect(marker.points).toEqual([
      [400 - M.halfWidth, tip - M.height],
      [400 + M.halfWidth, tip - M.height],
      [400, tip],
    ]);
  });

  it('pulses: wider and taller at the peak of the pulse', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    state.tick = M.pulseTicks / 4;
    const [left, right] = turnMarker(state, fight)!.points;
    expect(right![0] - left![0]).toBeCloseTo(2 * M.halfWidth * (1 + M.pulse));
  });

  it('never goes above the top of the world, even for a boss hanging high', () => {
    const state = createInitialState(fight, 1);
    state.boss.mode = 'attack';
    state.boss.lift = 600;
    const marker = turnMarker(state, fight)!;
    const ys = marker.points.map((p) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(M.minTop);
  });
});

describe('fallenFigure', () => {
  const colors = { body: '#123456', accent: '#654321' };
  const extremes = (p: Primitive): { xs: number[]; ys: number[] } =>
    p.kind === 'rect'
      ? { xs: [p.x, p.x + p.w], ys: [p.y, p.y + p.h] }
      : p.kind === 'circle'
        ? { xs: [p.x - p.r, p.x + p.r], ys: [p.y - p.r, p.y + p.r] }
        : { xs: p.points.map((q) => q[0]), ys: p.points.map((q) => q[1]) };

  it('is a low heap on the floor inside the boss width, lower than the boss stood', () => {
    for (const facing of [1, -1] as const) {
      const list = fallenFigure(700, facing, 80, 150, colors);
      expect(list.length).toBeGreaterThan(0);
      const half = (80 * LOOK.fallen.widthScale) / 2;
      for (const p of list) {
        const { xs, ys } = extremes(p);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(700 - half - 0.001);
        expect(Math.max(...xs)).toBeLessThanOrEqual(700 + half + 0.001);
        expect(Math.max(...ys)).toBeLessThanOrEqual(WORLD.floorY + 0.001);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(WORLD.floorY - 150 * LOOK.fallen.heightFraction - 0.001);
      }
    }
  });

  it('uses the colours it is given', () => {
    const list = fallenFigure(700, 1, 80, 150, colors);
    expect(list.map((p) => p.color)).toContain(colors.body);
    expect(list.map((p) => p.color)).toContain(colors.accent);
  });
});

describe('the duo look files', () => {
  it('never import render.ts (no import cycle)', () => {
    const importsRender = (file: string): boolean =>
      /from\s+['"](\.\.?\/)+render['"]/.test(readFileSync(new URL(file, import.meta.url), 'utf8'));
    expect(importsRender('../src/ui/look/duo.ts')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import type { FairnessResult } from '../src/bosses/generate/fairness';
import { HOUND_AND_SAGE } from '../src/bosses/pairs';
import { resolveBoss, resolveFight } from '../src/bosses/resolve';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { enrageBoss, makeFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { withInput } from './helpers';

const alwaysFair = (): FairnessResult => ({ fair: true, reasons: [] });
const neverFair = (): FairnessResult => ({ fair: false, reasons: ['forced'] });

/** A deterministic player: runs at the boss, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

describe('resolveFight: a boss id', () => {
  it('is a fight of the same boss as resolveBoss gives', () => {
    for (const id of ['ember-duelist', 'ashen-hound']) {
      const { fight, unfair } = resolveFight(id, 1);
      expect(unfair).toBe(false);
      expect(fight).toEqual(makeFight([resolveBoss(id, 1).boss]));
      expect(fight.bosses).toHaveLength(1);
      expect(fight.enrage).toBeNull();
    }
    expect(resolveFight('ember-duelist', 1).fight.bosses[0]).toBe(EMBER_DUELIST);
  });

  it('falls back to the Duelist for an unknown id, like resolveBoss', () => {
    const { fight, unfair } = resolveFight('a-pair-that-was-removed', 1);
    expect(unfair).toBe(false);
    expect(fight.bosses).toEqual([EMBER_DUELIST]);
  });

  it('gives the same generated boss as resolveBoss, and passes the unfair flag on', () => {
    const fair = resolveFight('generated', 12345, alwaysFair);
    expect(fair.unfair).toBe(false);
    expect(fair.fight.bosses).toEqual([resolveBoss('generated', 12345, alwaysFair).boss]);
    const unfair = resolveFight('generated', 12345, neverFair);
    expect(unfair.unfair).toBe(true);
    expect(unfair.fight.bosses).toEqual([resolveBoss('generated', 12345, neverFair).boss]);
    expect(unfair.fight.bosses).toHaveLength(1);
  });
});

describe('resolveFight: a pair id', () => {
  it('is the two bosses, primary first, with the enrage of the pair file', () => {
    const { fight, unfair } = resolveFight('hound-and-sage', 1);
    expect(unfair).toBe(false);
    expect(fight.bosses.map((b) => b.id)).toEqual(['ashen-hound', 'vesper-sage']);
    expect(fight.enrage).toEqual(HOUND_AND_SAGE.enrage);
    expect(fight.enraged[0]).toEqual(enrageBoss(fight.bosses[0]!, HOUND_AND_SAGE.enrage!));
    expect(fight.enraged[1]).toEqual(enrageBoss(fight.bosses[1]!, HOUND_AND_SAGE.enrage!));
  });

  it('scales each maxHp by its healthScale (rounded, at least 1) and touches nothing else', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const [hound, sage] = fight.bosses;
    expect(hound!.maxHp).toBe(Math.max(1, Math.round(ASHEN_HOUND.maxHp * HOUND_AND_SAGE.bosses[0].healthScale)));
    expect(sage!.maxHp).toBe(Math.max(1, Math.round(VESPER_SAGE.maxHp * HOUND_AND_SAGE.bosses[1].healthScale)));
    expect(hound!.maxHp).toBeLessThan(ASHEN_HOUND.maxHp);
    expect(sage!.maxHp).toBeLessThan(VESPER_SAGE.maxHp);
    expect({ ...hound!, maxHp: 0 }).toEqual({ ...ASHEN_HOUND, maxHp: 0 });
    expect({ ...sage!, maxHp: 0 }).toEqual({ ...VESPER_SAGE, maxHp: 0 });
  });

  it('does not change the boss files, and gives the same fight every time', () => {
    const before = JSON.stringify([ASHEN_HOUND, VESPER_SAGE]);
    const a = resolveFight('hound-and-sage', 1);
    const b = resolveFight('hound-and-sage', 999);
    expect(JSON.stringify([ASHEN_HOUND, VESPER_SAGE])).toBe(before);
    expect(b).toEqual(a);
  });

  it('applies the health dial on top of the scaled health', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const dialed = applyDialsToFight(fight, { ...NORMAL_DIALS, health: 2 });
    expect(dialed.bosses[0]!.maxHp).toBe(fight.bosses[0]!.maxHp * 2);
    expect(dialed.bosses[1]!.maxHp).toBe(fight.bosses[1]!.maxHp * 2);
  });

  it('starts a fight with the partner in place, and the study skipped', () => {
    const { fight } = resolveFight('hound-and-sage', 1);
    const state = createInitialState(fight, 1, 2);
    expect(state.partners).toHaveLength(1);
    expect(state.boss.hp).toBe(fight.bosses[0]!.maxHp);
    expect(state.partners[0]!.hp).toBe(fight.bosses[1]!.maxHp);
    expect(state).toEqual(createInitialState(fight, 1, 0));
  });
});

describe('a solo fight through resolveFight replays bit-identically to resolveBoss', () => {
  const cases: { id: string; dials: Dials; seed: number }[] = [
    { id: 'ember-duelist', dials: NORMAL_DIALS, seed: 7 },
    { id: 'ember-duelist', dials: presetDials('hard'), seed: 123456 },
    { id: 'ashen-hound', dials: presetDials('hard'), seed: 5 },
    { id: 'vesper-sage', dials: presetDials('easy'), seed: 99 },
  ];

  it.each(cases)('$id at seed $seed', ({ id, dials, seed }) => {
    const boss = applyDials(resolveBoss(id, seed).boss, dials);
    const fight = applyDialsToFight(resolveFight(id, seed).fight, dials);
    let a = createInitialState(boss, seed, 0);
    let b = createInitialState(fight, seed, 0);
    expect(b).toEqual(a);
    for (let n = 1; n <= 900; n++) {
      a = step(a, scripted(n), boss);
      b = step(b, scripted(n), fight);
      expect(b).toEqual(a);
    }
  });

  it('a generated boss too (fairness check injected, so it is quick)', () => {
    const seed = 42;
    const boss = applyDials(resolveBoss('generated', seed, alwaysFair).boss, NORMAL_DIALS);
    const fight = applyDialsToFight(resolveFight('generated', seed, alwaysFair).fight, NORMAL_DIALS);
    let a = createInitialState(boss, seed, 1);
    let b = createInitialState(fight, seed, 1);
    for (let n = 1; n <= 900; n++) {
      const frame = n <= 400 ? NO_INPUT : scripted(n);
      a = step(a, frame, boss);
      b = step(b, frame, fight);
    }
    expect(b).toEqual(a);
  });
});

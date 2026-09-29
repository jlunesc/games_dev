import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { applyDials, applyDialsToFight, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { enrageBoss, makeFight } from '../src/game/fight';

const ENRAGE = { gapScale: 0.6, walkScale: 1.3 };
const HARD: Dials = presetDials('hard');

describe('applyDialsToFight', () => {
  it('applies the dials to every boss, as applyDials does to one', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    const dialed = applyDialsToFight(fight, HARD);
    expect(dialed.bosses).toHaveLength(2);
    expect(dialed.bosses[0]).toEqual(applyDials(ASHEN_HOUND, HARD));
    expect(dialed.bosses[1]).toEqual(applyDials(VESPER_SAGE, HARD));
  });

  it('keeps the enrage and rebuilds the enraged copies from the dialed bosses', () => {
    const dialed = applyDialsToFight(makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE), HARD);
    expect(dialed.enrage).toEqual(ENRAGE);
    expect(dialed.enraged[0]).toEqual(enrageBoss(dialed.bosses[0]!, ENRAGE));
    expect(dialed.enraged[1]).toEqual(enrageBoss(dialed.bosses[1]!, ENRAGE));
    expect(dialed.enraged[0]).not.toEqual(enrageBoss(ASHEN_HOUND, ENRAGE));
  });

  it('applies the health dial on top of a scaled health', () => {
    const scaled = { ...ASHEN_HOUND, maxHp: 14 };
    const dialed = applyDialsToFight(makeFight([scaled]), { ...NORMAL_DIALS, health: 2 });
    expect(dialed.bosses[0]!.maxHp).toBe(28);
  });

  it('leaves a fight of one boss with no enrage as the same boss applyDials gives', () => {
    const dialed = applyDialsToFight(makeFight([EMBER_DUELIST]), HARD);
    expect(dialed.bosses).toHaveLength(1);
    expect(dialed.bosses[0]).toEqual(applyDials(EMBER_DUELIST, HARD));
    expect(dialed.enrage).toBeNull();
    expect(dialed.enraged).toEqual(dialed.bosses);
  });

  it('with Normal dials gives back equal bosses', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    expect(applyDialsToFight(fight, NORMAL_DIALS)).toEqual(fight);
  });

  it('does not change the fight it is given', () => {
    const fight = makeFight([ASHEN_HOUND, VESPER_SAGE], ENRAGE);
    const before = JSON.stringify(fight);
    applyDialsToFight(fight, HARD);
    expect(JSON.stringify(fight)).toBe(before);
  });
});

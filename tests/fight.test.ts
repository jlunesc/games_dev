import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import { asFight, enrageBoss, makeFight } from '../src/game/fight';
import { allBosses, bossAt, bossCount, createInitialState, isDowned } from '../src/game/state';
import { DUELIST } from './helpers';

describe('enrageBoss', () => {
  it('shortens every wait and speeds up walking, and leaves the original alone', () => {
    const before = JSON.stringify(DUELIST);
    const angry = enrageBoss(DUELIST, { gapScale: 0.5, walkScale: 2 });
    DUELIST.phases.forEach((phase, i) => {
      const boosted = angry.phases[i]!;
      expect(boosted.gap).toBe(Math.max(1, Math.round(phase.gap * 0.5)));
      expect(boosted.walkSpeed).toBe(phase.walkSpeed * 2);
      expect(boosted.retreatSpeed).toBe(phase.retreatSpeed * 2);
      expect(boosted.attacks).toEqual(phase.attacks);
    });
    expect(JSON.stringify(DUELIST)).toBe(before);
  });

  it('never makes a wait shorter than one update', () => {
    const angry = enrageBoss(DUELIST, { gapScale: 0.0001, walkScale: 1 });
    for (const phase of angry.phases) expect(phase.gap).toBe(1);
  });
});

describe('makeFight and asFight', () => {
  it('needs at least one boss', () => {
    expect(() => makeFight([])).toThrow();
  });

  it('keeps the enraged copies equal to the originals when there is no enrage', () => {
    const fight = makeFight([DUELIST, ASHEN_HOUND]);
    expect(fight.enrage).toBeNull();
    expect(fight.enraged[0]).toBe(DUELIST);
    expect(fight.enraged[1]).toBe(ASHEN_HOUND);
  });

  it('builds a boosted copy per boss when there is an enrage', () => {
    const fight = makeFight([DUELIST, ASHEN_HOUND], { gapScale: 0.5, walkScale: 1.5 });
    expect(fight.enraged[1]!.phases[0]!.walkSpeed).toBe(ASHEN_HOUND.phases[0]!.walkSpeed * 1.5);
  });

  it('wraps a plain boss as a fight of one and passes a fight through', () => {
    const solo = asFight(DUELIST);
    expect(solo.bosses).toEqual([DUELIST]);
    expect(solo.enrage).toBeNull();
    const fight = makeFight([DUELIST, ASHEN_HOUND]);
    expect(asFight(fight)).toBe(fight);
  });
});

describe('the state of a fight', () => {
  it('has no partners in a one-boss fight', () => {
    const s = createInitialState(DUELIST, 3);
    expect(s.partners).toEqual([]);
    expect(bossCount(s)).toBe(1);
    expect(allBosses(s)).toEqual([s.boss]);
    expect(isDowned(s, 0)).toBe(false);
  });

  it('starts the partner where its own file says, at full health', () => {
    const s = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3);
    expect(bossCount(s)).toBe(2);
    expect(s.boss.x).toBe(DUELIST.startX);
    expect(s.boss.hp).toBe(DUELIST.maxHp);
    const partner = bossAt(s, 1);
    expect(partner).toBe(s.partners[0]);
    expect(partner.x).toBe(ASHEN_HOUND.startX);
    expect(partner.hp).toBe(ASHEN_HOUND.maxHp);
    expect(partner.mode).toBe('gap');
    expect(() => bossAt(s, 2)).toThrow();
  });

  it('skips the study in a fight with partners', () => {
    const s = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3, 2);
    expect(s.study.active).toBe(false);
    expect(s.study.queue).toEqual([]);
  });

  it('still plans the study in a one-boss fight', () => {
    const s = createInitialState(DUELIST, 3, 1);
    expect(s.study.active).toBe(true);
  });

  it('only calls a boss downed when it has partners', () => {
    const solo = createInitialState(DUELIST, 3);
    solo.boss.hp = 0;
    expect(isDowned(solo, 0)).toBe(false);
    const duo = createInitialState(makeFight([DUELIST, ASHEN_HOUND]), 3);
    duo.partners[0]!.hp = 0;
    expect(isDowned(duo, 1)).toBe(true);
    expect(isDowned(duo, 0)).toBe(false);
  });
});

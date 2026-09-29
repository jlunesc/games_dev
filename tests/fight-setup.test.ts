import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import { resolveBoss } from '../src/bosses/resolve';
import { applyDials, NORMAL_DIALS, presetDials } from '../src/game/difficulty';
import { createInitialState } from '../src/game/state';
import { createMenu, menuRows } from '../src/ui/menu-model';
import { setUpFight } from '../src/ui/fight-setup';
import { DEFAULT_PREFS, studyLabelFor } from '../src/ui/prefs';

describe('setUpFight: one boss', () => {
  it('gives the same boss as resolving and applying the dials by hand, with the study as chosen', () => {
    const dials = presetDials('hard');
    const setup = setUpFight(EMBER_DUELIST.id, 7, dials, 2);
    expect(setup.fight.bosses).toHaveLength(1);
    expect(setup.fight.enrage).toBeNull();
    expect(setup.fight.bosses[0]).toEqual(applyDials(resolveBoss(EMBER_DUELIST.id, 7).boss, dials));
    expect(setup.study).toBe(2);
    expect(setup.unfair).toBe(false);
    expect(setup.recordBossId).toBe(EMBER_DUELIST.id);
  });

  it('records a generated boss under its own id, as before', () => {
    const setup = setUpFight('generated', 5, { ...NORMAL_DIALS }, 1);
    expect(setup.fight.bosses).toHaveLength(1);
    expect(setup.recordBossId).toBe(setup.fight.bosses[0]!.id);
    expect(setup.study).toBe(1);
  });

  it('starts a state with no partners and the study the player asked for', () => {
    const setup = setUpFight(EMBER_DUELIST.id, 3, { ...NORMAL_DIALS }, 1);
    const state = createInitialState(setup.fight, 3, setup.study);
    expect(state.partners).toEqual([]);
    expect(state.study.active).toBe(true);
  });
});

describe('setUpFight: a pair', () => {
  it('gives both bosses in order, the pair id for the record, and no study', () => {
    const setup = setUpFight('hound-and-sage', 7, { ...NORMAL_DIALS }, 2);
    expect(setup.fight.bosses.map((b) => b.id)).toEqual([ASHEN_HOUND.id, VESPER_SAGE.id]);
    expect(setup.recordBossId).toBe('hound-and-sage');
    expect(setup.study).toBe(0);
    expect(setup.unfair).toBe(false);
    const state = createInitialState(setup.fight, 7, setup.study);
    expect(state.partners).toHaveLength(1);
    expect(state.study.active).toBe(false);
    expect(state.study.queue).toEqual([]);
  });

  it('applies the dials to both bosses', () => {
    const easy = setUpFight('hound-and-sage', 7, presetDials('easy'), 0).fight;
    const hard = setUpFight('hound-and-sage', 7, presetDials('hard'), 0).fight;
    expect(easy.bosses[0]!.maxHp).toBeLessThan(hard.bosses[0]!.maxHp);
    expect(easy.bosses[1]!.maxHp).toBeLessThan(hard.bosses[1]!.maxHp);
  });

  it('is the same fight for the same seed and dials', () => {
    const a = setUpFight('hound-and-sage', 11, { ...NORMAL_DIALS }, 1);
    const b = setUpFight('hound-and-sage', 11, { ...NORMAL_DIALS }, 1);
    expect(a).toEqual(b);
  });
});

describe('the Study row', () => {
  it('shows the stored setting for a boss and "Off (pairs)" for a pair', () => {
    expect(studyLabelFor(EMBER_DUELIST.id, 0)).toBe('Off');
    expect(studyLabelFor(EMBER_DUELIST.id, 1)).toBe('Once');
    expect(studyLabelFor(EMBER_DUELIST.id, 2)).toBe('Twice');
    expect(studyLabelFor('generated', 2)).toBe('Twice');
    expect(studyLabelFor('hound-and-sage', 2)).toBe('Off (pairs)');
  });

  it('is what the menu shows, without touching the stored setting', () => {
    const prefs = { ...DEFAULT_PREFS, bossId: 'hound-and-sage', study: 2 as const };
    const menu = createMenu(prefs);
    expect(menuRows(menu).find((r) => r.id === 'study')!.value).toBe('Off (pairs)');
    expect(menu.prefs.study).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSS_CHOICES, EMBER_DUELIST, bossChoiceDescription } from '../src/bosses';
import { PRESETS } from '../src/game/difficulty';
import {
  MENU_ITEMS,
  createMenu,
  difficultyLabel,
  menuRows,
  menuStep,
  type MenuAction,
  type MenuModel,
} from '../src/ui/menu-model';
import { DEFAULT_PREFS, nudgeDial, selectPreset } from '../src/ui/prefs';

const at = (item: (typeof MENU_ITEMS)[number], model = createMenu(DEFAULT_PREFS)): MenuModel => ({
  ...model,
  focus: MENU_ITEMS.indexOf(item),
});
const press = (model: MenuModel, ...actions: MenuAction[]): MenuModel =>
  actions.reduce((m, a) => menuStep(m, a).model, model);

describe('the menu rows', () => {
  it('are in order and show the boss and the difficulty', () => {
    const rows = menuRows(createMenu(DEFAULT_PREFS));
    expect(rows.map((r) => r.id)).toEqual(['fight', 'boss', 'difficulty', 'study', 'tweak', 'stats', 'settings', 'test']);
    expect(rows.find((r) => r.id === 'boss')!.value).toBe(EMBER_DUELIST.name);
    expect(rows.find((r) => r.id === 'difficulty')!.value).toBe('Normal');
    const study = rows.find((r) => r.id === 'study')!;
    expect(study.label).toBe('Study');
    expect(study.value).toBe('Once');
  });

  it('starts with Fight focused', () => {
    expect(MENU_ITEMS[createMenu(DEFAULT_PREFS).focus]).toBe('fight');
  });

  it('shows Custom, with the preset it started from, once the dials differ', () => {
    const custom = nudgeDial(selectPreset(DEFAULT_PREFS, 'hard'), 'speed', -1);
    expect(difficultyLabel(custom)).toBe('Custom (from Hard)');
    expect(difficultyLabel(selectPreset(DEFAULT_PREFS, 'easy'))).toBe('Easy');
  });
});

describe('moving in the menu', () => {
  it('up and down move the focus and wrap around', () => {
    const start = createMenu(DEFAULT_PREFS);
    expect(press(start, 'down').focus).toBe(1);
    expect(press(start, 'up').focus).toBe(MENU_ITEMS.length - 1);
    expect(press(start, ...Array<MenuAction>(MENU_ITEMS.length).fill('down')).focus).toBe(0);
  });

  it.each(['fight', 'tweak', 'stats', 'settings', 'test'] as const)(
    'left and right do nothing on %s, which has no choice, and back does nothing in the menu',
    (item) => {
      const start = at(item);
      expect(menuStep(start, 'left')).toEqual({ model: start, outcome: { kind: 'stay' } });
      expect(menuStep(start, 'right')).toEqual({ model: start, outcome: { kind: 'stay' } });
      expect(menuStep(start, 'back')).toEqual({ model: start, outcome: { kind: 'stay' } });
    },
  );
});

describe('choosing in the menu', () => {
  it('confirm on Fight starts a fight', () => {
    expect(menuStep(createMenu(DEFAULT_PREFS), 'confirm').outcome).toEqual({ kind: 'fight' });
  });

  it.each(['tweak', 'stats', 'settings', 'test'] as const)('confirm on %s opens that screen', (item) => {
    expect(menuStep(at(item), 'confirm').outcome).toEqual({ kind: 'open', screen: item });
  });

  it('left and right cycle the difficulty presets and wrap', () => {
    const ids = PRESETS.map((p) => p.id);
    let m = at('difficulty');
    expect(m.prefs.presetId).toBe('normal');
    m = press(m, 'right');
    expect(m.prefs.presetId).toBe(ids[2]);
    m = press(m, 'right');
    expect(m.prefs.presetId).toBe(ids[0]);
    m = press(m, 'left');
    expect(m.prefs.presetId).toBe(ids[2]);
  });

  it('confirm on Difficulty also moves to the next preset', () => {
    expect(press(at('difficulty'), 'confirm').prefs.presetId).toBe('hard');
  });

  it('choosing a preset drops any tweaks and loads the preset dials', () => {
    const custom = nudgeDial(DEFAULT_PREFS, 'health', 1);
    const m = press({ ...createMenu(custom), focus: MENU_ITEMS.indexOf('difficulty') }, 'right');
    expect(difficultyLabel(m.prefs)).toBe('Hard');
    expect(m.prefs.dials).toEqual(selectPreset(DEFAULT_PREFS, 'hard').dials);
  });

  it('left and right cycle every boss choice in order (Duelist, Hound, ..., Generated) and wrap', () => {
    let m = at('boss');
    expect(m.prefs.bossId).toBe(EMBER_DUELIST.id);
    for (let i = 1; i < BOSS_CHOICES.length; i++) {
      m = press(m, 'right');
      expect(m.prefs.bossId).toBe(BOSS_CHOICES[i]!.id);
    }
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe(EMBER_DUELIST.id);
    m = press(m, 'left');
    expect(m.prefs.bossId).toBe(BOSS_CHOICES[BOSS_CHOICES.length - 1]!.id);
    m = press(m, 'left');
    expect(m.prefs.bossId).toBe(BOSS_CHOICES[BOSS_CHOICES.length - 2]!.id);
  });

  it('the Boss row shows the name of each boss as it is chosen, Generated included', () => {
    const valueOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'boss')!.value;
    let m = at('boss');
    for (const choice of BOSS_CHOICES) {
      expect(valueOf(m)).toBe(choice.name);
      m = press(m, 'right');
    }
    expect(valueOf(m)).toBe(EMBER_DUELIST.name);
  });

  it('confirm on the Boss row opens the dropdown on the current boss, and changes nothing else', () => {
    const start = at('boss', createMenu({ ...DEFAULT_PREFS, bossId: BOSS_CHOICES[2]!.id }));
    const result = menuStep(start, 'confirm');
    expect(result.outcome).toEqual({ kind: 'stay' });
    expect(result.model.bossDropdown).toBe(2);
    expect(result.model.prefs).toEqual(start.prefs);
  });

  it('in the dropdown, up and down move the highlight and wrap without changing the boss', () => {
    const open = press(at('boss'), 'confirm');
    expect(open.bossDropdown).toBe(0);
    expect(press(open, 'down').bossDropdown).toBe(1);
    expect(press(open, 'up').bossDropdown).toBe(BOSS_CHOICES.length - 1);
    expect(press(open, 'down').prefs.bossId).toBe(EMBER_DUELIST.id);
    expect(press(open, 'left', 'right').bossDropdown).toBe(0);
  });

  it('confirm in the dropdown picks the highlighted boss and closes it', () => {
    const m = press(at('boss'), 'confirm', 'down', 'down', 'confirm');
    expect(m.prefs.bossId).toBe(BOSS_CHOICES[2]!.id);
    expect(m.bossDropdown).toBeNull();
    expect(m.focus).toBe(MENU_ITEMS.indexOf('boss'));
  });

  it('back closes the dropdown without changing the boss', () => {
    const m = press(at('boss'), 'confirm', 'down', 'back');
    expect(m.bossDropdown).toBeNull();
    expect(m.prefs.bossId).toBe(EMBER_DUELIST.id);
  });

  it('the dropdown can reach every boss choice, Generated included', () => {
    let m = press(at('boss'), 'confirm');
    for (const choice of BOSS_CHOICES) {
      expect(BOSS_CHOICES[m.bossDropdown!]!.id).toBe(choice.id);
      m = press(m, 'down');
    }
  });

  it('left, right and confirm cycle the Study setting and wrap, staying on the menu', () => {
    const valueOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'study')!.value;
    const m = at('study');
    expect(m.prefs.study).toBe(1);
    expect(valueOf(m)).toBe('Once');
    expect(valueOf(press(m, 'right'))).toBe('Twice');
    expect(valueOf(press(m, 'right', 'right'))).toBe('Off');
    expect(valueOf(press(m, 'right', 'right', 'right'))).toBe('Once');
    expect(valueOf(press(m, 'left'))).toBe('Off');
    expect(valueOf(press(m, 'left', 'left'))).toBe('Twice');
    expect(press(m, 'confirm').prefs.study).toBe(2);
    for (const action of ['left', 'right', 'confirm'] as const) {
      expect(menuStep(m, action).outcome).toEqual({ kind: 'stay' });
    }
  });

  it('changing Study touches nothing else', () => {
    const custom = nudgeDial(selectPreset({ ...DEFAULT_PREFS, bossId: ASHEN_HOUND.id }, 'hard'), 'speed', 1);
    const start = at('study', createMenu(custom));
    const after = press(start, 'right');
    expect(after.focus).toBe(start.focus);
    expect(after.prefs).toEqual({ ...custom, study: 2 });
    expect(after.prefs.dials).toEqual(custom.dials);
  });

  it('does not change the model it is given', () => {
    const start = at('difficulty');
    const before = JSON.stringify(start);
    menuStep(start, 'right');
    expect(JSON.stringify(start)).toBe(before);
  });
});

describe('the Boss row with a pair', () => {
  const valueOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'boss')!.value;
  const withBoss = (bossId: string): MenuModel => at('boss', createMenu({ ...DEFAULT_PREFS, bossId }));

  it('right from the last named boss walks through each pair in order, then Generated', () => {
    const lastNamed = BOSS_CHOICES[BOSS_CHOICES.findIndex((c) => c.id === 'hound-and-sage') - 1]!;
    let m = withBoss(lastNamed.id);
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('hound-and-sage');
    expect(valueOf(m)).toBe('Hound and Sage');
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('golem-and-kite');
    expect(valueOf(m)).toBe('Golem and Kite');
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('brute-and-dancer');
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('warden-and-brute');
    expect(valueOf(m)).toBe('Warden and Brute');
    m = press(m, 'right');
    expect(m.prefs.bossId).toBe('generated');
    m = press(m, 'left', 'left', 'left', 'left', 'left');
    expect(m.prefs.bossId).toBe(lastNamed.id);
  });

  it('shows an old or unknown boss id as the Duelist, and the next step goes to the second choice', () => {
    const m = withBoss('a-pair-that-was-removed');
    expect(valueOf(m)).toBe(EMBER_DUELIST.name);
    expect(press(m, 'right').prefs.bossId).toBe(BOSS_CHOICES[1]!.id);
  });

  it('keeps the choice of a pair when other rows change', () => {
    const m = press(withBoss('hound-and-sage'), 'down', 'right');
    expect(m.prefs.bossId).toBe('hound-and-sage');
  });
});

describe('the Study row with a pair', () => {
  const studyOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'study')!.value;

  it('left and right change nothing while a pair is chosen, and the stored setting comes back with a normal boss', () => {
    const pair = at('study', createMenu({ ...DEFAULT_PREFS, bossId: 'hound-and-sage', study: 2 }));
    expect(studyOf(pair)).toBe('Off (pairs)');
    const after = press(pair, 'right', 'right', 'left');
    expect(after.prefs.study).toBe(2);
    expect(studyOf(after)).toBe('Off (pairs)');
    const solo = press({ ...after, prefs: { ...after.prefs, bossId: 'ashen-hound' } });
    expect(studyOf(solo)).toBe('Twice');
  });

  it('still cycles with a normal boss', () => {
    const solo = at('study', createMenu({ ...DEFAULT_PREFS, study: 1 }));
    expect(press(solo, 'right').prefs.study).toBe(2);
    expect(press(solo, 'left').prefs.study).toBe(0);
  });
});

describe('the description note on the Boss row', () => {
  const noteOf = (m: MenuModel) => menuRows(m).find((r) => r.id === 'boss')!.note;
  const withBoss = (bossId: string): MenuModel => at('boss', createMenu({ ...DEFAULT_PREFS, bossId }));

  it('is the description of the chosen single boss, and only the Boss row has one', () => {
    const m = withBoss('ashen-hound');
    expect(noteOf(m)).toBe(ASHEN_HOUND.description);
    expect(menuRows(m).filter((r) => r.note !== undefined).map((r) => r.id)).toEqual(['boss']);
  });

  it('is empty for a pair and for Generated', () => {
    expect(noteOf(withBoss('hound-and-sage'))).toBeUndefined();
    expect(noteOf(withBoss('generated'))).toBeUndefined();
  });

  it('follows the highlighted option while the dropdown is open, not the saved choice', () => {
    const open = press(withBoss('ashen-hound'), 'confirm');
    expect(open.bossDropdown).not.toBeNull();
    const next = press(open, 'down');
    expect(noteOf(next)).toBe(BOSS_CHOICES.map((c) => bossChoiceDescription(c.id))[next.bossDropdown!]);
    expect(next.prefs.bossId).toBe('ashen-hound');
  });
});

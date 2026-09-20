import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
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
    expect(rows.map((r) => r.id)).toEqual(['fight', 'boss', 'difficulty', 'tweak', 'stats', 'settings', 'test']);
    expect(rows.find((r) => r.id === 'boss')!.value).toBe(EMBER_DUELIST.name);
    expect(rows.find((r) => r.id === 'difficulty')!.value).toBe('Normal');
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
    const m = press({ focus: MENU_ITEMS.indexOf('difficulty'), prefs: custom }, 'right');
    expect(difficultyLabel(m.prefs)).toBe('Hard');
    expect(m.prefs.dials).toEqual(selectPreset(DEFAULT_PREFS, 'hard').dials);
  });

  it('with one boss the Boss row keeps that boss', () => {
    expect(press(at('boss'), 'right').prefs.bossId).toBe(EMBER_DUELIST.id);
    expect(menuStep(at('boss'), 'confirm').outcome).toEqual({ kind: 'stay' });
  });

  it('does not change the model it is given', () => {
    const start = at('difficulty');
    const before = JSON.stringify(start);
    menuStep(start, 'right');
    expect(JSON.stringify(start)).toBe(before);
  });
});

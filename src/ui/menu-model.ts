import { BOSS_CHOICES, bossChoiceName } from '../bosses';
import { pairById } from '../bosses/pairs';
import { PRESETS } from '../game/difficulty';
import { wrap, type NavAction } from './nav';
import { isCustom, nextStudy, selectPreset, studyLabelFor, type Prefs } from './prefs';

export type MenuItemId = 'fight' | 'boss' | 'difficulty' | 'study' | 'tweak' | 'stats' | 'settings' | 'test';

export const MENU_ITEMS: readonly MenuItemId[] = [
  'fight',
  'boss',
  'difficulty',
  'study',
  'tweak',
  'stats',
  'settings',
  'test',
];

export type MenuAction = NavAction | 'confirm' | 'back';

export interface MenuModel {
  focus: number;
  prefs: Prefs;
  /** While the Boss dropdown is open, the highlighted index in `BOSS_CHOICES`; null when it is closed. */
  bossDropdown: number | null;
}

export type MenuOutcome =
  | { kind: 'stay' }
  | { kind: 'fight' }
  | { kind: 'open'; screen: 'tweak' | 'stats' | 'settings' | 'test' };

export interface MenuRow {
  id: MenuItemId;
  label: string;
  value?: string;
}

/** The menu opens with Fight focused, so one press of the bottom button starts the same fight again. */
export const createMenu = (prefs: Prefs): MenuModel => ({ focus: 0, prefs, bossDropdown: null });

/** The preset name, or `Custom (from <preset>)` once the dials differ from it. */
export function difficultyLabel(prefs: Prefs): string {
  const name = PRESETS.find((p) => p.id === prefs.presetId)?.label ?? 'Normal';
  return isCustom(prefs) ? `Custom (from ${name})` : name;
}

export function menuRows(model: MenuModel): MenuRow[] {
  return [
    { id: 'fight', label: 'Fight' },
    { id: 'boss', label: 'Boss', value: bossChoiceName(model.prefs.bossId) },
    { id: 'difficulty', label: 'Difficulty', value: difficultyLabel(model.prefs) },
    { id: 'study', label: 'Study', value: studyLabelFor(model.prefs.bossId, model.prefs.study) },
    { id: 'tweak', label: 'Tweak difficulty' },
    { id: 'stats', label: 'Stats' },
    { id: 'settings', label: 'Settings' },
    { id: 'test', label: 'Controller test' },
  ];
}

/** What a press does in the menu. Pure: returns the new model and what the app should do next. */
export function menuStep(
  model: MenuModel,
  action: MenuAction,
): { model: MenuModel; outcome: MenuOutcome } {
  const stay = (next: MenuModel): { model: MenuModel; outcome: MenuOutcome } => ({
    model: next,
    outcome: { kind: 'stay' },
  });
  const item = MENU_ITEMS[model.focus] ?? 'fight';

  if (model.bossDropdown !== null) {
    const open = model.bossDropdown;
    if (action === 'up' || action === 'down') {
      return stay({ ...model, bossDropdown: wrap(open, action === 'up' ? -1 : 1, BOSS_CHOICES.length) });
    }
    if (action === 'back') return stay({ ...model, bossDropdown: null });
    if (action === 'confirm') {
      const picked = BOSS_CHOICES[open];
      if (picked === undefined) return stay({ ...model, bossDropdown: null });
      return stay({ ...model, bossDropdown: null, prefs: { ...model.prefs, bossId: picked.id } });
    }
    return stay(model);
  }

  if (action === 'up' || action === 'down') {
    return stay({ ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, MENU_ITEMS.length) });
  }
  if (action === 'back') return stay(model);

  if (action === 'confirm') {
    if (item === 'boss') {
      const current = BOSS_CHOICES.findIndex((c) => c.id === model.prefs.bossId);
      return stay({ ...model, bossDropdown: Math.max(0, current) });
    }
    if (item === 'fight') return { model, outcome: { kind: 'fight' } };
    if (item === 'tweak' || item === 'stats' || item === 'settings' || item === 'test') {
      return { model, outcome: { kind: 'open', screen: item } };
    }
  }

  const direction: 1 | -1 = action === 'left' ? -1 : 1;
  if (item === 'study') {
    if (pairById(model.prefs.bossId) !== undefined) return stay(model);
    return stay({ ...model, prefs: { ...model.prefs, study: nextStudy(model.prefs.study, direction) } });
  }
  if (item === 'difficulty') {
    const current = PRESETS.findIndex((p) => p.id === model.prefs.presetId);
    const next = PRESETS[wrap(Math.max(0, current), direction, PRESETS.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: selectPreset(model.prefs, next.id) });
  }
  if (item === 'boss') {
    const current = BOSS_CHOICES.findIndex((c) => c.id === model.prefs.bossId);
    const next = BOSS_CHOICES[wrap(Math.max(0, current), direction, BOSS_CHOICES.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: { ...model.prefs, bossId: next.id } });
  }
  return stay(model);
}

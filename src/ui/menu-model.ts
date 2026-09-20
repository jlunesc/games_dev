import { BOSSES, bossById } from '../bosses';
import { PRESETS } from '../game/difficulty';
import type { NavAction } from './nav';
import { isCustom, selectPreset, type Prefs } from './prefs';

export type MenuItemId = 'fight' | 'boss' | 'difficulty' | 'tweak' | 'settings' | 'test';

export const MENU_ITEMS: readonly MenuItemId[] = [
  'fight',
  'boss',
  'difficulty',
  'tweak',
  'settings',
  'test',
];

export type MenuAction = NavAction | 'confirm' | 'back';

export interface MenuModel {
  focus: number;
  prefs: Prefs;
}

export type MenuOutcome =
  | { kind: 'stay' }
  | { kind: 'fight' }
  | { kind: 'open'; screen: 'tweak' | 'settings' | 'test' };

export interface MenuRow {
  id: MenuItemId;
  label: string;
  value?: string;
}

/** The menu opens with Fight focused, so two presses of the bottom button start the same fight again. */
export const createMenu = (prefs: Prefs): MenuModel => ({ focus: 0, prefs });

/** The preset name, or `Custom (from <preset>)` once the dials differ from it. */
export function difficultyLabel(prefs: Prefs): string {
  const name = PRESETS.find((p) => p.id === prefs.presetId)?.label ?? 'Normal';
  return isCustom(prefs) ? `Custom (from ${name})` : name;
}

export function menuRows(model: MenuModel): MenuRow[] {
  return [
    { id: 'fight', label: 'Fight' },
    { id: 'boss', label: 'Boss', value: bossById(model.prefs.bossId).name },
    { id: 'difficulty', label: 'Difficulty', value: difficultyLabel(model.prefs) },
    { id: 'tweak', label: 'Tweak difficulty' },
    { id: 'settings', label: 'Settings' },
    { id: 'test', label: 'Controller test' },
  ];
}

const wrap = (index: number, direction: 1 | -1, length: number): number =>
  (index + direction + length) % length;

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

  if (action === 'up' || action === 'down') {
    return stay({ ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, MENU_ITEMS.length) });
  }
  if (action === 'back') return stay(model);

  if (action === 'confirm') {
    if (item === 'fight') return { model, outcome: { kind: 'fight' } };
    if (item === 'tweak' || item === 'settings' || item === 'test') {
      return { model, outcome: { kind: 'open', screen: item } };
    }
  }

  const direction: 1 | -1 = action === 'left' ? -1 : 1;
  if (item === 'difficulty') {
    const current = PRESETS.findIndex((p) => p.id === model.prefs.presetId);
    const next = PRESETS[wrap(Math.max(0, current), direction, PRESETS.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: selectPreset(model.prefs, next.id) });
  }
  if (item === 'boss') {
    const current = BOSSES.findIndex((b) => b.id === model.prefs.bossId);
    const next = BOSSES[wrap(Math.max(0, current), direction, BOSSES.length)];
    if (next === undefined) return stay(model);
    return stay({ ...model, prefs: { ...model.prefs, bossId: next.id } });
  }
  return stay(model);
}

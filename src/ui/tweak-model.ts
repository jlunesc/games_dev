import { DIALS, PRESETS, type DialId } from '../game/difficulty';
import type { MenuAction } from './menu-model';
import { wrap } from './nav';
import { nudgeDial, resetDials, type Prefs } from './prefs';

export interface TweakModel {
  focus: number;
  prefs: Prefs;
}

export interface TweakRow {
  id: DialId | 'reset';
  label: string;
  value: string;
  help: string;
}

export const createTweak = (prefs: Prefs): TweakModel => ({ focus: 0, prefs });

/** Dial values as people read them: percentages, and damage as a number of hits. */
export function formatDial(id: DialId, value: number): string {
  if (id === 'damage') return `${value} hit${value === 1 ? '' : 's'}`;
  return `${Math.round(value * 100)}%`;
}

export function tweakRows(model: TweakModel): TweakRow[] {
  const rows: TweakRow[] = DIALS.map((dial) => ({
    id: dial.id,
    label: dial.label,
    value: formatDial(dial.id, model.prefs.dials[dial.id]),
    help: dial.help,
  }));
  const preset = PRESETS.find((p) => p.id === model.prefs.presetId)?.label ?? 'Normal';
  rows.push({
    id: 'reset',
    label: 'Reset to preset',
    value: preset,
    help: 'Go back to the values of the preset you started from.',
  });
  return rows;
}

/** What a press does on the Tweak screen. */
export function tweakStep(
  model: TweakModel,
  action: MenuAction,
): { model: TweakModel; outcome: 'stay' | 'back' } {
  if (action === 'back') return { model, outcome: 'back' };
  const count = DIALS.length + 1;
  if (action === 'up' || action === 'down') {
    return { model: { ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, count) }, outcome: 'stay' };
  }
  const dial = DIALS[model.focus];
  if (dial === undefined) {
    // The reset row.
    if (action === 'confirm') return { model: { ...model, prefs: resetDials(model.prefs) }, outcome: 'stay' };
    return { model, outcome: 'stay' };
  }
  if (action === 'left') return { model: { ...model, prefs: nudgeDial(model.prefs, dial.id, -1) }, outcome: 'stay' };
  if (action === 'right') return { model: { ...model, prefs: nudgeDial(model.prefs, dial.id, 1) }, outcome: 'stay' };
  // Confirm (used by touch): one step up, wrapping from the top back to the bottom.
  const atMax = model.prefs.dials[dial.id] >= dial.max;
  const prefs = atMax
    ? { ...model.prefs, dials: { ...model.prefs.dials, [dial.id]: dial.min } }
    : nudgeDial(model.prefs, dial.id, 1);
  return { model: { ...model, prefs }, outcome: 'stay' };
}

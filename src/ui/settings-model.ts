import type { MenuAction } from './menu-model';
import { wrap } from './nav';
import type { Settings } from './settings';

export interface SettingsModel {
  focus: number;
  settings: Settings;
}

export interface SettingsRow {
  id: keyof Settings | 'back';
  label: string;
  value?: 'On' | 'Off';
  help: string;
}

const ROWS: ReadonlyArray<{ id: keyof Settings; label: string; help: string }> = [
  { id: 'freeze', label: 'Hit freeze', help: 'A tiny pause when a hit lands, so hits feel heavy.' },
  { id: 'shake', label: 'Screen shake', help: 'The screen shakes a little when something is hit.' },
  { id: 'flash', label: 'Flashes', help: 'White and red flashes when something is hit.' },
  { id: 'effects', label: 'Effects', help: 'Particles, drifting embers and moving background layers.' },
  { id: 'sound', label: 'Sound', help: 'The beeps for hits, dashes and warnings.' },
];

export const createSettingsModel = (settings: Settings): SettingsModel => ({ focus: 0, settings });

export function settingsRows(model: SettingsModel): SettingsRow[] {
  const rows: SettingsRow[] = ROWS.map((row) => ({ ...row, value: model.settings[row.id] ? 'On' : 'Off' }));
  rows.push({ id: 'back', label: 'Back', help: 'Return to the menu.' });
  return rows;
}

/** What a press does on the Settings screen. Switching a setting never changes how a fight plays. */
export function settingsStep(
  model: SettingsModel,
  action: MenuAction,
): { model: SettingsModel; outcome: 'stay' | 'back' } {
  if (action === 'back') return { model, outcome: 'back' };
  const count = ROWS.length + 1;
  if (action === 'up' || action === 'down') {
    return { model: { ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, count) }, outcome: 'stay' };
  }
  const row = ROWS[model.focus];
  if (row === undefined) {
    // The back row.
    return { model, outcome: action === 'confirm' ? 'back' : 'stay' };
  }
  const settings = { ...model.settings, [row.id]: !model.settings[row.id] };
  return { model: { ...model, settings }, outcome: 'stay' };
}

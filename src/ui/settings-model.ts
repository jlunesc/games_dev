import type { MenuAction } from './menu-model';
import { wrap } from './nav';
import { VOLUMES, type Settings } from './settings';

export interface SettingsModel {
  focus: number;
  settings: Settings;
}

export interface SettingsRow {
  id: keyof Settings | 'back';
  label: string;
  value?: string;
  help: string;
}

type Switch = 'freeze' | 'shake' | 'flash' | 'effects';

const SWITCHES: ReadonlyArray<{ id: Switch; label: string; help: string }> = [
  { id: 'freeze', label: 'Hit freeze', help: 'A tiny pause when a hit lands, so hits feel heavy.' },
  { id: 'shake', label: 'Screen shake', help: 'The screen shakes a little when something is hit.' },
  { id: 'flash', label: 'Flashes', help: 'White and red flashes when something is hit.' },
  { id: 'effects', label: 'Effects', help: 'Particles, drifting embers and moving background layers.' },
];

/** The Volume row sits right after the switches; Back is the last row. */
const VOLUME_ROW = SWITCHES.length;

const VOLUME_LABEL: Record<(typeof VOLUMES)[number], string> = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' };

export const createSettingsModel = (settings: Settings): SettingsModel => ({ focus: 0, settings });

export function settingsRows(model: SettingsModel): SettingsRow[] {
  const rows: SettingsRow[] = SWITCHES.map((row) => ({ ...row, value: model.settings[row.id] ? 'On' : 'Off' }));
  rows.push({
    id: 'volume',
    label: 'Volume',
    value: VOLUME_LABEL[model.settings.volume],
    help: 'How loud the sounds and music are.',
  });
  rows.push({ id: 'back', label: 'Back', help: 'Return to the menu.' });
  return rows;
}

/** What a press does on the Settings screen. Switching a setting never changes how a fight plays. */
export function settingsStep(
  model: SettingsModel,
  action: MenuAction,
): { model: SettingsModel; outcome: 'stay' | 'back' } {
  if (action === 'back') return { model, outcome: 'back' };
  const count = SWITCHES.length + 2;
  if (action === 'up' || action === 'down') {
    return { model: { ...model, focus: wrap(model.focus, action === 'up' ? -1 : 1, count) }, outcome: 'stay' };
  }
  if (model.focus === VOLUME_ROW) {
    const now = VOLUMES.indexOf(model.settings.volume);
    const next = VOLUMES[wrap(now, action === 'left' ? -1 : 1, VOLUMES.length)]!;
    return { model: { ...model, settings: { ...model.settings, volume: next } }, outcome: 'stay' };
  }
  const row = SWITCHES[model.focus];
  if (row === undefined) {
    // The back row.
    return { model, outcome: action === 'confirm' ? 'back' : 'stay' };
  }
  const settings = { ...model.settings, [row.id]: !model.settings[row.id] };
  return { model: { ...model, settings }, outcome: 'stay' };
}

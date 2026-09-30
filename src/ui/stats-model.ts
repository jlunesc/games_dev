import type { MenuAction } from './menu-model';
import { wrap } from './nav';

/** How many of the newest fights an export holds: a number, or every saved fight. */
export type ExportAmount = number | 'all';

export const EXPORT_AMOUNTS: readonly ExportAmount[] = [1, 2, 3, 5, 10, 20, 50, 'all'];
export const DEFAULT_EXPORT_AMOUNT: ExportAmount = 5;

export interface StatsModel {
  focus: number;
  /** The newest fights the Export row sends. */
  amount: ExportAmount;
  /** Saved fights; null while unknown or when this device cannot store stats. */
  count: number | null;
  /** When stats were last exported, as an ISO date-time; null if never. */
  lastExportAt: string | null;
  /** True after the first press on Delete: the next press deletes. */
  confirmingDelete: boolean;
  notice: string | null;
}

export type StatsOutcome = 'stay' | 'export' | 'delete' | 'back';

export interface StatsRow {
  id: 'export' | 'amount' | 'delete' | 'back';
  label: string;
  value?: string;
  help: string;
}

const ROW_IDS: ReadonlyArray<StatsRow['id']> = ['export', 'amount', 'delete', 'back'];

export const createStats = (
  count: number | null,
  lastExportAt: string | null,
  amount: ExportAmount = DEFAULT_EXPORT_AMOUNT,
): StatsModel => ({
  focus: 0,
  amount,
  count,
  lastExportAt,
  confirmingDelete: false,
  notice: null,
});

/** How many fights an export sends, given how many are saved. */
export const fightsToExport = (count: number, amount: ExportAmount): number =>
  amount === 'all' ? count : Math.min(count, amount);

function describeExport(model: StatsModel): string {
  if (model.count === null) return 'unavailable';
  const sent = fightsToExport(model.count, model.amount);
  const noun = (n: number): string => (n === 1 ? '1 fight' : `${n} fights`);
  return sent === model.count ? noun(sent) : `${sent} of ${noun(model.count)}`;
}

export function statsRows(model: StatsModel): StatsRow[] {
  return [
    {
      id: 'export',
      label: 'Export',
      value: describeExport(model),
      help: 'Send your newest saved fights as a file: the share sheet on the phone, a download on the PC.',
    },
    {
      id: 'amount',
      label: 'Fights to export',
      value: model.amount === 'all' ? 'All' : `Last ${model.amount}`,
      help: 'How many of your newest fights an export holds. Left and right change it. Fewer fights make a smaller file.',
    },
    {
      id: 'delete',
      label: model.confirmingDelete ? 'Really delete all fights? Press again.' : 'Delete all fights',
      help: 'Removes every saved fight from this device. Export first.',
    },
    { id: 'back', label: 'Back', help: 'Return to the menu.' },
  ];
}

/** The notice for an export or delete that has nothing to work on, or null when there are fights. */
function nothingToDo(count: number | null): string | null {
  if (count === null) return 'This device cannot store stats.';
  if (count === 0) return 'No fights saved yet.';
  return null;
}

function withAmountMoved(model: StatsModel, by: 1 | -1): StatsModel {
  const at = EXPORT_AMOUNTS.indexOf(model.amount);
  const amount = EXPORT_AMOUNTS[wrap(at < 0 ? 0 : at, by, EXPORT_AMOUNTS.length)]!;
  return { ...model, amount, confirmingDelete: false, notice: null };
}

/** What a press does on the Stats screen. Delete needs two presses in a row; moving away cancels it. */
export function statsStep(
  model: StatsModel,
  action: MenuAction,
): { model: StatsModel; outcome: StatsOutcome } {
  if (action === 'back') return { model, outcome: 'back' };
  if (action === 'left' || action === 'right') {
    return ROW_IDS[model.focus] === 'amount' ? { model: withAmountMoved(model, action === 'left' ? -1 : 1), outcome: 'stay' } : { model, outcome: 'stay' };
  }
  if (action === 'up' || action === 'down') {
    const focus = wrap(model.focus, action === 'up' ? -1 : 1, ROW_IDS.length);
    return { model: { ...model, focus, confirmingDelete: false, notice: null }, outcome: 'stay' };
  }

  const id = ROW_IDS[model.focus];
  if (id === 'back') return { model, outcome: 'back' };
  if (id === 'amount') return { model: withAmountMoved(model, 1), outcome: 'stay' };
  if (id === 'export') {
    const notice = nothingToDo(model.count);
    if (notice !== null) return { model: { ...model, notice }, outcome: 'stay' };
    return { model, outcome: 'export' };
  }
  if (id === 'delete') {
    const notice = nothingToDo(model.count);
    if (notice !== null) return { model: { ...model, notice, confirmingDelete: false }, outcome: 'stay' };
    if (!model.confirmingDelete) return { model: { ...model, confirmingDelete: true, notice: null }, outcome: 'stay' };
    return { model: { ...model, confirmingDelete: false }, outcome: 'delete' };
  }
  return { model, outcome: 'stay' };
}

export const withCount = (model: StatsModel, count: number | null): StatsModel => ({
  ...model,
  count,
  confirmingDelete: false,
});

export const withNotice = (model: StatsModel, notice: string | null): StatsModel => ({
  ...model,
  notice,
  confirmingDelete: false,
});

export const withExported = (model: StatsModel, iso: string): StatsModel => ({
  ...model,
  lastExportAt: iso,
  confirmingDelete: false,
});

export const describeLastExport = (iso: string | null): string =>
  iso === null ? 'Last export: never.' : `Last export: ${iso.slice(0, 10)}.`;

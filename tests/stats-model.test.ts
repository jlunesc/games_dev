import { describe, expect, it } from 'vitest';
import type { MenuAction } from '../src/ui/menu-model';
import {
  createStats,
  describeLastExport,
  fightsToExport,
  statsRows,
  statsStep,
  withCount,
  withExported,
  withNotice,
  type ExportAmount,
  type StatsModel,
} from '../src/ui/stats-model';

const at = (focus: number, model: StatsModel): StatsModel => ({ ...model, focus });
const press = (model: StatsModel, ...actions: MenuAction[]): StatsModel =>
  actions.reduce((m, a) => statsStep(m, a).model, model);

describe('the stats rows', () => {
  it('are Export, Fights to export, Delete and Back', () => {
    expect(statsRows(createStats(3, null)).map((r) => r.id)).toEqual(['export', 'amount', 'delete', 'back']);
  });

  it.each([
    [0, 5, '0 fights'],
    [1, 5, '1 fight'],
    [3, 5, '3 fights'],
    [12, 5, '5 of 12 fights'],
    [12, 1, '1 of 12 fights'],
    [12, 'all', '12 fights'],
    [null, 5, 'unavailable'],
  ] as const)('show %s saved with amount %s as "%s" on the Export row', (count, amount, value) => {
    const row = statsRows(createStats(count, null, amount))[0]!;
    expect(row.label).toBe('Export');
    expect(row.value).toBe(value);
  });

  it('shows the amount on its own row', () => {
    expect(statsRows(createStats(9, null, 10))[1]!.value).toBe('Last 10');
    expect(statsRows(createStats(9, null, 'all'))[1]!.value).toBe('All');
    expect(statsRows(createStats(9, null))[1]!.label).toBe('Fights to export');
  });

  it('label Delete, and ask again while confirming', () => {
    const model = createStats(2, null);
    const plain = statsRows(model)[2]!;
    expect(plain.label).toBe('Delete all fights');
    expect(plain.help).toBe('Removes every saved fight from this device. Export first.');
    expect(statsRows({ ...model, confirmingDelete: true })[2]!.label).toBe(
      'Really delete all fights? Press again.',
    );
  });

  it('give Back its help', () => {
    const row = statsRows(createStats(2, null))[3]!;
    expect(row.label).toBe('Back');
    expect(row.help).toBe('Return to the menu.');
  });
});

describe('a new stats model', () => {
  it('starts on the first row with no notice and no pending delete', () => {
    expect(createStats(4, '2026-09-21T10:00:00.000Z')).toEqual({
      focus: 0,
      amount: 5,
      count: 4,
      lastExportAt: '2026-09-21T10:00:00.000Z',
      confirmingDelete: false,
      notice: null,
    });
  });
});

describe('moving on the stats screen', () => {
  it('wraps over the four rows', () => {
    const start = createStats(1, null);
    expect(press(start, 'down').focus).toBe(1);
    expect(press(start, 'up').focus).toBe(3);
    expect(press(start, 'down', 'down', 'down', 'down').focus).toBe(0);
    expect(press(start, 'up', 'up', 'up', 'up').focus).toBe(0);
  });

  it('clears the confirm state and the notice', () => {
    const model = { ...createStats(1, null), confirmingDelete: true, notice: 'hello' };
    for (const action of ['up', 'down'] as const) {
      const next = statsStep(model, action);
      expect(next.model.confirmingDelete).toBe(false);
      expect(next.model.notice).toBeNull();
      expect(next.outcome).toBe('stay');
    }
  });

  it('does nothing on left and right outside the amount row', () => {
    const model = { ...createStats(1, null), confirmingDelete: true, notice: 'hello' };
    expect(statsStep(model, 'left')).toEqual({ model, outcome: 'stay' });
    expect(statsStep(model, 'right')).toEqual({ model, outcome: 'stay' });
  });
});

describe('export', () => {
  it('starts an export when there are fights', () => {
    expect(statsStep(createStats(3, null), 'confirm').outcome).toBe('export');
  });

  it('says so and stays when there are no fights', () => {
    const result = statsStep(createStats(0, null), 'confirm');
    expect(result.outcome).toBe('stay');
    expect(result.model.notice).toBe('No fights saved yet.');
  });

  it('says so and stays when the device cannot store stats', () => {
    const result = statsStep(createStats(null, null), 'confirm');
    expect(result.outcome).toBe('stay');
    expect(result.model.notice).toBe('This device cannot store stats.');
  });
});

describe('the amount row', () => {
  const onAmount = (amount: ExportAmount): StatsModel => at(1, createStats(30, null, amount));

  it('steps through the choices with right and left, and wraps', () => {
    expect(press(onAmount(5), 'right').amount).toBe(10);
    expect(press(onAmount(5), 'left').amount).toBe(3);
    expect(press(onAmount('all'), 'right').amount).toBe(1);
    expect(press(onAmount(1), 'left').amount).toBe('all');
  });

  it('cycles forward on confirm, so a finger tap changes it', () => {
    const result = statsStep(onAmount(50), 'confirm');
    expect(result.model.amount).toBe('all');
    expect(result.outcome).toBe('stay');
  });

  it('clears a pending delete and the notice', () => {
    const model = { ...onAmount(5), confirmingDelete: true, notice: 'hello' };
    const next = statsStep(model, 'right').model;
    expect(next.confirmingDelete).toBe(false);
    expect(next.notice).toBeNull();
  });

  it('works even when nothing is saved', () => {
    expect(statsStep(at(1, createStats(0, null, 5)), 'right').model.amount).toBe(10);
  });
});

describe('fightsToExport', () => {
  it('is the amount, capped at the fights saved, or all of them', () => {
    expect(fightsToExport(12, 5)).toBe(5);
    expect(fightsToExport(3, 5)).toBe(3);
    expect(fightsToExport(12, 'all')).toBe(12);
    expect(fightsToExport(0, 5)).toBe(0);
  });
});

describe('delete', () => {
  const onDelete = (count: number | null): StatsModel => at(2, createStats(count, null));

  it('needs two presses', () => {
    const first = statsStep(onDelete(5), 'confirm');
    expect(first.outcome).toBe('stay');
    expect(first.model.confirmingDelete).toBe(true);
    const second = statsStep(first.model, 'confirm');
    expect(second.outcome).toBe('delete');
    expect(second.model.confirmingDelete).toBe(false);
  });

  it('is cancelled by moving away', () => {
    const asked = statsStep(onDelete(5), 'confirm').model;
    const moved = press(asked, 'down', 'up');
    expect(moved.confirmingDelete).toBe(false);
    expect(statsStep(moved, 'confirm').outcome).toBe('stay');
  });

  it('says so when there are no fights or no storage', () => {
    for (const [count, text] of [
      [0, 'No fights saved yet.'],
      [null, 'This device cannot store stats.'],
    ] as const) {
      const result = statsStep(onDelete(count), 'confirm');
      expect(result.outcome).toBe('stay');
      expect(result.model.confirmingDelete).toBe(false);
      expect(result.model.notice).toBe(text);
    }
  });
});

describe('going back', () => {
  it('back gives back, even while confirming a delete', () => {
    expect(statsStep({ ...createStats(2, null), confirmingDelete: true }, 'back').outcome).toBe('back');
  });

  it('confirm on the Back row gives back', () => {
    expect(statsStep(at(3, createStats(2, null)), 'confirm').outcome).toBe('back');
  });
});

describe('the setters', () => {
  const busy: StatsModel = { focus: 1, amount: 5, count: 2, lastExportAt: null, confirmingDelete: true, notice: 'x' };

  it('withCount replaces the count, keeps the focus and clears the confirm state', () => {
    const next = withCount(busy, 9);
    expect(next).not.toBe(busy);
    expect(next.count).toBe(9);
    expect(next.focus).toBe(1);
    expect(next.confirmingDelete).toBe(false);
  });

  it('withNotice sets the notice and clears the confirm state', () => {
    const next = withNotice(busy, 'Exported.');
    expect(next).not.toBe(busy);
    expect(next.notice).toBe('Exported.');
    expect(next.confirmingDelete).toBe(false);
    expect(withNotice(busy, null).notice).toBeNull();
  });

  it('withExported sets the export date and clears the confirm state', () => {
    const next = withExported(busy, '2026-09-21T10:00:00.000Z');
    expect(next).not.toBe(busy);
    expect(next.lastExportAt).toBe('2026-09-21T10:00:00.000Z');
    expect(next.confirmingDelete).toBe(false);
  });

  it('never change the model they are given', () => {
    const before = JSON.stringify(busy);
    withCount(busy, 3);
    withNotice(busy, 'y');
    withExported(busy, '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(busy)).toBe(before);
  });
});

describe('describeLastExport', () => {
  it('says never when nothing was exported', () => {
    expect(describeLastExport(null)).toBe('Last export: never.');
  });

  it('shows the date part of the ISO time', () => {
    expect(describeLastExport('2026-09-21T10:00:00.000Z')).toBe('Last export: 2026-09-21.');
  });
});

describe('statsStep purity', () => {
  it('does not change the model it is given', () => {
    const model = at(1, createStats(4, null));
    const before = JSON.stringify(model);
    for (const action of ['up', 'down', 'left', 'right', 'confirm', 'back'] as const) statsStep(model, action);
    expect(JSON.stringify(model)).toBe(before);
  });
});

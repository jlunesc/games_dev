import { describe, expect, it } from 'vitest';
import type { MenuAction } from '../src/ui/menu-model';
import {
  createStats,
  describeLastExport,
  statsRows,
  statsStep,
  withCount,
  withExported,
  withNotice,
  type StatsModel,
} from '../src/ui/stats-model';

const at = (focus: number, model: StatsModel): StatsModel => ({ ...model, focus });
const press = (model: StatsModel, ...actions: MenuAction[]): StatsModel =>
  actions.reduce((m, a) => statsStep(m, a).model, model);

describe('the stats rows', () => {
  it('are Export, Delete and Back', () => {
    expect(statsRows(createStats(3, null)).map((r) => r.id)).toEqual(['export', 'delete', 'back']);
  });

  it.each([
    [0, '0 fights'],
    [1, '1 fight'],
    [7, '7 fights'],
    [null, 'unavailable'],
  ] as const)('show the count %s as "%s" on the Export row', (count, value) => {
    const row = statsRows(createStats(count, null))[0]!;
    expect(row.label).toBe('Export');
    expect(row.value).toBe(value);
    expect(row.help).toBe(
      'Send your saved fights as a file: the share sheet on the phone, a download on the PC.',
    );
  });

  it('label Delete, and ask again while confirming', () => {
    const model = createStats(2, null);
    const plain = statsRows(model)[1]!;
    expect(plain.label).toBe('Delete all fights');
    expect(plain.help).toBe('Removes every saved fight from this device. Export first.');
    expect(statsRows({ ...model, confirmingDelete: true })[1]!.label).toBe(
      'Really delete all fights? Press again.',
    );
  });

  it('give Back its help', () => {
    const row = statsRows(createStats(2, null))[2]!;
    expect(row.label).toBe('Back');
    expect(row.help).toBe('Return to the menu.');
  });
});

describe('a new stats model', () => {
  it('starts on the first row with no notice and no pending delete', () => {
    expect(createStats(4, '2026-09-21T10:00:00.000Z')).toEqual({
      focus: 0,
      count: 4,
      lastExportAt: '2026-09-21T10:00:00.000Z',
      confirmingDelete: false,
      notice: null,
    });
  });
});

describe('moving on the stats screen', () => {
  it('wraps over the three rows', () => {
    const start = createStats(1, null);
    expect(press(start, 'down').focus).toBe(1);
    expect(press(start, 'up').focus).toBe(2);
    expect(press(start, 'down', 'down', 'down').focus).toBe(0);
    expect(press(start, 'up', 'up', 'up').focus).toBe(0);
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

  it('does nothing on left and right', () => {
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

describe('delete', () => {
  const onDelete = (count: number | null): StatsModel => at(1, createStats(count, null));

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
    expect(statsStep(at(2, createStats(2, null)), 'confirm').outcome).toBe('back');
  });
});

describe('the setters', () => {
  const busy: StatsModel = { focus: 1, count: 2, lastExportAt: null, confirmingDelete: true, notice: 'x' };

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

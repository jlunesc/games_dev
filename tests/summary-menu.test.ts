import { describe, expect, it } from 'vitest';
import type { RedoChange } from '../src/game/difficulty';
import { createSummaryMenu, summaryRows, summaryStep } from '../src/ui/summary-menu';

const harder: RedoChange = { dial: 'readability', from: 1, to: 0.95, harder: true };
const easier: RedoChange = { dial: 'health', from: 1.4, to: 1.3, harder: false };

describe('the after-fight menu', () => {
  it('offers Redo, Fight again and Back to the menu after a win or a loss', () => {
    for (const result of ['victory', 'defeat'] as const) {
      const menu = createSummaryMenu(result, harder, false);
      expect(menu.items).toEqual(['redo', 'again', 'menu']);
      expect(menu.focus).toBe(0);
    }
  });

  it('puts Fight details and Download fight details after Redo when the fight has details, and offers them without a Redo', () => {
    expect(createSummaryMenu('victory', harder, true).items).toEqual(['redo', 'details', 'download', 'again', 'menu']);
    expect(createSummaryMenu('left', null, true).items).toEqual(['details', 'download', 'again', 'menu']);
    const rows = summaryRows(createSummaryMenu('left', null, true), null);
    expect(rows[0]?.label).toBe('Fight details');
    expect(rows[1]?.label).toBe('Download fight details');
  });

  it('offers no Redo after leaving a fight, since there is no result to base it on', () => {
    expect(createSummaryMenu('left', harder, false).items).toEqual(['again', 'menu']);
  });

  it('offers no Redo when no dial could change', () => {
    expect(createSummaryMenu('victory', null, false).items).toEqual(['again', 'menu']);
  });

  it('says what a Redo will change and which way', () => {
    const [win] = summaryRows(createSummaryMenu('victory', harder, false), harder);
    expect(win?.label).toBe('Redo, a bit harder');
    expect(win?.value).toBe('Warning length 100% → 95%');
    expect(win?.help).toContain('1 hit');
    const [loss] = summaryRows(createSummaryMenu('defeat', easier, false), easier);
    expect(loss?.label).toBe('Redo, a bit easier');
    expect(loss?.value).toBe('Boss health 140% → 130%');
  });

  it('moves the focus with up and down, wrapping', () => {
    let menu = createSummaryMenu('victory', harder, false);
    menu = summaryStep(menu, 'down').menu;
    expect(menu.focus).toBe(1);
    menu = summaryStep(summaryStep(menu, 'down').menu, 'down').menu;
    expect(menu.focus).toBe(0);
    expect(summaryStep(menu, 'up').menu.focus).toBe(2);
  });

  it('picks the focused row on confirm', () => {
    let menu = createSummaryMenu('victory', harder, false);
    expect(summaryStep(menu, 'confirm').pick).toBe('redo');
    menu = summaryStep(menu, 'down').menu;
    expect(summaryStep(menu, 'confirm').pick).toBe('again');
    menu = summaryStep(menu, 'down').menu;
    expect(summaryStep(menu, 'confirm').pick).toBe('menu');
  });

  it('goes back to the menu on back, and ignores left and right', () => {
    const menu = createSummaryMenu('defeat', easier, false);
    expect(summaryStep(menu, 'back').pick).toBe('menu');
    expect(summaryStep(menu, 'left')).toEqual({ menu, pick: null });
    expect(summaryStep(menu, 'right')).toEqual({ menu, pick: null });
  });
});

import { DIALS, type RedoChange } from '../game/difficulty';
import type { FightResult } from '../game/summary';
import type { MenuAction } from './menu-model';
import { wrap } from './nav';
import { formatDial } from './tweak-model';

export type SummaryItem = 'redo' | 'again' | 'menu';

export interface SummaryMenu {
  focus: number;
  items: readonly SummaryItem[];
}

export interface SummaryRow {
  id: SummaryItem;
  label: string;
  value?: string;
  help: string;
}

/** Redo needs a win or a loss to base the change on, and a dial that can still move. */
export function createSummaryMenu(result: FightResult, redo: RedoChange | null): SummaryMenu {
  const canRedo = result !== 'left' && redo !== null;
  return { focus: 0, items: canRedo ? ['redo', 'again', 'menu'] : ['again', 'menu'] };
}

export function summaryRows(menu: SummaryMenu, redo: RedoChange | null): SummaryRow[] {
  return menu.items.map((id): SummaryRow => {
    if (id === 'redo' && redo !== null) {
      const name = DIALS.find((d) => d.id === redo.dial)?.label ?? redo.dial;
      return {
        id,
        label: redo.harder ? 'Redo, a bit harder' : 'Redo, a bit easier',
        value: `${name} ${formatDial(redo.dial, redo.from)} → ${formatDial(redo.dial, redo.to)}`,
        help: 'Fight this boss again with one random change. Damage is always 1 hit.',
      };
    }
    if (id === 'again') return { id, label: 'Fight again', help: 'Fight again with exactly the same settings.' };
    return { id, label: 'Back to the menu', help: 'Return to the menu.' };
  });
}

/** What a press does: moves the focus, or picks a row (`back` always picks Back to the menu). */
export function summaryStep(
  menu: SummaryMenu,
  action: MenuAction,
): { menu: SummaryMenu; pick: SummaryItem | null } {
  if (action === 'up' || action === 'down') {
    return { menu: { ...menu, focus: wrap(menu.focus, action === 'up' ? -1 : 1, menu.items.length) }, pick: null };
  }
  if (action === 'confirm') return { menu, pick: menu.items[menu.focus] ?? null };
  if (action === 'back') return { menu, pick: 'menu' };
  return { menu, pick: null };
}

import { el } from './dom';

export interface ListRow {
  label: string;
  value?: string;
  help?: string;
}

/**
 * Draws a titled list of rows with the focused one highlighted and its help line below. Text only (set with
 * `textContent`); tapping a row calls `onPick(index)`. `footer` elements are added at the end.
 */
export function renderList(
  panel: HTMLElement,
  title: string,
  hint: string,
  rows: readonly ListRow[],
  focus: number,
  onPick: (index: number) => void,
  footer: readonly HTMLElement[] = [],
): void {
  const list = el('div', 'rows');
  rows.forEach((row, index) => {
    const button = el('button', index === focus ? 'row focused' : 'row');
    button.type = 'button';
    button.append(el('span', 'row-label', row.label));
    if (row.value !== undefined) button.append(el('span', 'row-value', row.value));
    button.addEventListener('click', () => onPick(index));
    list.append(button);
  });
  const help = rows[focus]?.help;
  panel.replaceChildren(
    el('h1', undefined, title),
    el('p', 'hint', hint),
    list,
    ...(help === undefined || help === '' ? [] : [el('p', 'help', help)]),
    ...footer,
  );
  // With a controller only the focus moves: keep the focused row on screen.
  list.children[focus]?.scrollIntoView({ block: 'nearest' });
}

/** Draws the summary screen: a title, one line per fact, and a button back to the menu. */
export function renderSummary(
  panel: HTMLElement,
  title: string,
  lines: readonly string[],
  onDone: () => void,
): void {
  const done = el('button', 'action', 'Back to the menu');
  done.type = 'button';
  done.addEventListener('click', onDone);
  panel.replaceChildren(
    el('h1', undefined, title),
    ...lines.map((line) => el('p', 'summary-line', line)),
    done,
    el('p', 'hint', 'Press the bottom button to go back to the menu.'),
  );
}

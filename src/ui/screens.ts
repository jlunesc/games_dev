import { el } from './dom';
import { tickerSeconds } from './ticker';

export interface ListRow {
  label: string;
  value?: string;
  help?: string;
  /** A line that scrolls from right to left under the row (the boss description). */
  note?: string;
  /** When set, the row is open: these options are listed right under it and `onPick` gets the tapped one. */
  dropdown?: { options: readonly string[]; focus: number; onPick: (index: number) => void };
}

/** A line of text that slides from right to left, looping; the speed is set through a custom property (the CSP forbids style attributes). */
function ticker(text: string): HTMLElement {
  const strip = el('div', 'ticker');
  const run = el('span', 'ticker-text', text);
  run.style.setProperty('--ticker-seconds', `${tickerSeconds(text)}s`);
  strip.append(run);
  return strip;
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
  let focusedNode: Element | undefined;
  rows.forEach((row, index) => {
    const button = el('button', index === focus ? 'row focused' : 'row');
    button.type = 'button';
    button.append(el('span', 'row-label', row.label));
    if (row.value !== undefined) button.append(el('span', 'row-value', row.value));
    button.addEventListener('click', () => onPick(index));
    if (row.dropdown !== undefined) {
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('open');
    }
    list.append(button);
    if (index === focus) focusedNode = button;
    if (row.dropdown !== undefined) {
      const { options, focus: optionFocus, onPick: pickOption } = row.dropdown;
      const menu = el('div', 'dropdown');
      menu.setAttribute('role', 'listbox');
      options.forEach((option, optionIndex) => {
        const item = el('button', optionIndex === optionFocus ? 'option focused' : 'option', option);
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.addEventListener('click', () => pickOption(optionIndex));
        menu.append(item);
        if (optionIndex === optionFocus) focusedNode = item;
      });
      list.append(menu);
    }
    if (row.note !== undefined) list.append(ticker(row.note));
  });
  const help = rows[focus]?.help;
  panel.replaceChildren(
    el('h1', undefined, title),
    el('p', 'hint', hint),
    list,
    ...(help === undefined || help === '' ? [] : [el('p', 'help', help)]),
    ...footer,
  );
  // With a controller only the focus moves: keep the focused row (or open option) on screen.
  focusedNode?.scrollIntoView({ block: 'nearest' });
}

/** Draws the summary screen: a title, one line per fact (`compact` marks a run of lines drawn smaller), then the choices for what to do next with the focused one highlighted. */
export function renderSummary(
  panel: HTMLElement,
  title: string,
  lines: readonly string[],
  rows: readonly ListRow[],
  focus: number,
  onPick: (index: number) => void,
  compact?: { from: number; count: number },
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
    ...lines.map((line, index) =>
      el(
        'p',
        compact !== undefined && index >= compact.from && index < compact.from + compact.count
          ? 'summary-line compact'
          : 'summary-line',
        line,
      ),
    ),
    list,
    ...(help === undefined || help === '' ? [] : [el('p', 'help', help)]),
  );
  list.children[focus]?.scrollIntoView({ block: 'nearest' });
}

import {
  formatReport,
  mappingLabel,
  snapshotGamepad,
  updateHistory,
  type PadHistory,
  type PadReading,
} from '../engine/gamepad-report';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderButton(index: number, pressed: boolean, value: number): HTMLElement {
  const cell = el('div', pressed ? 'button pressed' : 'button');
  const fill = el('div', 'fill');
  fill.style.setProperty('--value', String(value));
  cell.append(fill, el('span', 'label', String(index)));
  return cell;
}

function renderAxis(index: number, value: number): HTMLElement {
  const row = el('div', 'axis');
  const track = el('div', 'track');
  const marker = el('div', 'marker');
  marker.style.setProperty('--value', String(value));
  track.append(marker);
  row.append(el('span', 'label', `axis ${index}`), track, el('span', 'value', value.toFixed(2)));
  return row;
}

function renderPad({ snapshot, history }: PadReading): HTMLElement {
  const section = el('section', 'pad');
  const buttons = el('div', 'buttons');
  snapshot.buttons.forEach((b, i) => buttons.append(renderButton(i, b.pressed, b.value)));
  const axes = el('div', 'axes');
  snapshot.axes.forEach((a, i) => axes.append(renderAxis(i, a)));
  const ever = history.pressedEver.length > 0 ? history.pressedEver.join(', ') : '(none)';
  section.append(
    el('h2', undefined, `Gamepad ${snapshot.index}`),
    el('p', 'pad-id', snapshot.id),
    el('p', undefined, `mapping: ${mappingLabel(snapshot.mapping)}`),
    buttons,
    axes,
    el('p', 'ever', `ever pressed: ${ever}`),
  );
  return section;
}

export function mountControllerScreen(root: HTMLElement): void {
  const title = el('h1', undefined, 'Controller test');
  const hint = el(
    'p',
    'hint',
    'Press any button on the controller to wake it. Press every button and move every stick, then copy the report.',
  );
  const pads = el('div', 'pads');
  const copyButton = el('button', 'copy', 'Copy report');
  copyButton.type = 'button';
  const status = el('p', 'status');
  const fallback = el('textarea');
  fallback.readOnly = true;
  fallback.hidden = true;
  root.replaceChildren(title, hint, pads, copyButton, status, fallback);

  if (typeof navigator.getGamepads !== 'function') {
    pads.append(el('p', 'hint', 'The Gamepad API is not available here. It needs HTTPS or localhost.'));
    copyButton.disabled = true;
    return;
  }

  const noPad = el('p', 'hint', 'No gamepad detected.');
  const histories = new Map<string, PadHistory>();
  let latest: PadReading[] = [];

  function read(): PadReading[] {
    const readings: PadReading[] = [];
    for (const gp of navigator.getGamepads()) {
      if (gp === null) continue;
      const snapshot = snapshotGamepad(gp);
      const key = `${snapshot.index}:${snapshot.id}`;
      const history = updateHistory(histories.get(key), snapshot);
      histories.set(key, history);
      readings.push({ snapshot, history });
    }
    return readings;
  }

  function frame(): void {
    latest = read();
    pads.replaceChildren(...(latest.length > 0 ? latest.map(renderPad) : [noPad]));
    requestAnimationFrame(frame);
  }

  copyButton.addEventListener('click', () => {
    const report = formatReport(
      { date: new Date().toISOString(), userAgent: navigator.userAgent },
      latest,
    );
    // Promise.resolve().then(...) turns a synchronous throw (no navigator.clipboard) into a rejection too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(report))
      .then(
        () => {
          fallback.hidden = true;
          status.textContent = 'Report copied to the clipboard.';
        },
        () => {
          fallback.value = report;
          fallback.hidden = false;
          fallback.select();
          status.textContent = 'Clipboard unavailable. Select and copy the text below.';
        },
      );
  });

  requestAnimationFrame(frame);
}

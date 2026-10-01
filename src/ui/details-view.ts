import type { FightDetails } from '../stats/details';
import { el } from './dom';
import { columns, stackedRow, timelineMarks, type Rect } from './details-plots';
import { dodgeBinLabels, percent, recommendationText, replyBinLabels, seconds } from './details-text';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The plots are drawn in this many units wide and scaled to the panel. */
const W = 300;

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (cls) node.setAttribute('class', cls);
  return node;
}

function chart(height: number): SVGSVGElement {
  const svg = svgNode('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img' }, 'plot');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return svg;
}

function addRects(svg: SVGSVGElement, rects: Rect[], dx = 0, dy = 0): void {
  for (const r of rects) svg.append(svgNode('rect', { x: r.x + dx, y: r.y + dy, width: r.w, height: r.h }, r.cls));
}

function addText(svg: SVGSVGElement, x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle'): void {
  const node = svgNode('text', { x, y, 'text-anchor': anchor }, 'plot-label');
  node.textContent = text;
  svg.append(node);
}

function section(title: string, note: string): HTMLElement {
  const box = el('section', 'detail-section');
  box.append(el('h2', undefined, title), el('p', 'detail-note', note));
  return box;
}

function legend(items: readonly { cls: string; label: string }[]): HTMLElement {
  const box = el('div', 'legend');
  for (const item of items) {
    const entry = el('span', 'legend-item');
    entry.append(el('span', `swatch ${item.cls}`), item.label);
    box.append(entry);
  }
  return box;
}

function tile(value: string, label: string, sub: string): HTMLElement {
  const box = el('div', 'tile');
  box.append(el('span', 'tile-value', value), el('span', 'tile-label', label), el('span', 'tile-sub', sub));
  return box;
}

/** A column chart with a label under each column and its count above it; `series[i]` stacks the parts of column i. */
function columnChart(series: number[][], classes: readonly string[], labels: readonly string[]): SVGSVGElement {
  const height = 96;
  const svg = chart(height);
  const plotTop = 12;
  const plotHeight = 64;
  const gap = 4;
  addRects(svg, columns(series, classes, W, plotHeight, gap), 0, plotTop);
  const colWidth = (W - gap * (series.length - 1)) / series.length;
  series.forEach((parts, i) => {
    const x = i * (colWidth + gap) + colWidth / 2;
    const total = parts.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const top = Math.max(...series.map((p) => p.reduce((a, b) => a + b, 0)));
      addText(svg, x, plotTop + plotHeight - (total / top) * plotHeight - 3, String(total));
    }
    addText(svg, x, height - 4, labels[i] ?? '');
  });
  svg.append(svgNode('line', { x1: 0, x2: W, y1: plotTop + plotHeight, y2: plotTop + plotHeight }, 'plot-axis'));
  return svg;
}

function timelineChart(details: FightDetails['timeline']): SVGSVGElement {
  const height = 64;
  const svg = chart(height + 14);
  svg.append(svgNode('line', { x1: 0, x2: W, y1: height / 2, y2: height / 2 }, 'plot-axis'));
  for (const m of timelineMarks(details, W, height)) {
    svg.append(svgNode('line', { x1: m.x, x2: m.x, y1: m.y1, y2: m.y2, 'stroke-width': 2 }, m.cls));
  }
  addText(svg, 0, height + 11, '0:00', 'start');
  const total = Math.round(details.length / 60);
  addText(svg, W, height + 11, `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, 'end');
  return svg;
}

function stackedBar(values: number[], classes: readonly string[]): SVGSVGElement {
  const svg = chart(20);
  addRects(svg, stackedRow(values, classes, W, 20));
  return svg;
}

const METHODS = [
  { key: 'dash', cls: 'plot-dash', label: 'Dash' },
  { key: 'jump', cls: 'plot-jump', label: 'Jump' },
  { key: 'platform', cls: 'plot-platform', label: 'Platform' },
  { key: 'cover', cls: 'plot-cover', label: 'Cover' },
  { key: 'distance', cls: 'plot-distance', label: 'Out of reach' },
  { key: 'countered', cls: 'plot-countered', label: 'Countered' },
] as const;

/**
 * Draws the fight details screen into `panel`: the recommendation, four key numbers and the plots. Text goes in
 * with `textContent` and the plots are SVG elements made one by one, so nothing is parsed as HTML. Tapping Back calls `onBack`.
 */
export function renderDetails(
  panel: HTMLElement,
  details: FightDetails,
  nameOf: (attackId: string) => string,
  onBack: () => void,
): void {
  const { avoided, hitRate, reply, perMinute, distance, timeline, dodgeTiming } = details;

  const tiles = el('div', 'tiles');
  tiles.append(
    tile(percent(avoided.share), 'Attacks avoided', `${avoided.avoided} of ${avoided.total}`),
    tile(percent(hitRate.share), 'Swings that hit', `${hitRate.hits} of ${hitRate.swings}`),
    tile(percent(reply.share), 'Attacks replied to', `${reply.replied} of ${reply.answerable}`),
    tile(reply.medianTicks === null ? '–' : seconds(reply.medianTicks), 'Median reply time', 'after the attack ended'),
  );

  const timelineBox = section('The fight', 'Hits you landed are above the line, hits you took below it, swings on it.');
  timelineBox.append(
    timelineChart(timeline),
    legend([
      { cls: 'plot-landed', label: `Landed ${timeline.landed.length}` },
      { cls: 'plot-taken', label: `Taken ${timeline.taken.length}` },
      { cls: 'plot-swing', label: `Swings ${timeline.swings.length}` },
    ]),
  );

  const avoidBox = section('How you avoided attacks', 'Attacks you did not take a hit from, by what saved you.');
  avoidBox.append(
    stackedBar(METHODS.map((m) => avoided.methods[m.key]), METHODS.map((m) => m.cls)),
    legend(METHODS.filter((m) => avoided.methods[m.key] > 0).map((m) => ({ cls: m.cls, label: `${m.label} ${avoided.methods[m.key]}` }))),
  );

  const replyBox = section('Reply time', 'Time from a boss attack ending to you starting a swing, for attacks you replied to.');
  replyBox.append(
    columnChart(reply.bins.map((b) => [b.hit, b.missed]), ['plot-landed', 'plot-missed'], replyBinLabels()),
    legend([
      { cls: 'plot-landed', label: 'Swing hit' },
      { cls: 'plot-missed', label: 'Swing missed' },
    ]),
  );

  const perAttackBox = section('Reply by attack', 'How often you replied to each attack, and how fast.');
  const slowest = Math.max(1, ...reply.perAttack.map((a) => a.medianTicks ?? 0));
  for (const a of reply.perAttack) {
    const row = el('div', 'attack-row');
    const bar = el('span', 'attack-bar');
    const fill = el('span', 'attack-fill');
    fill.style.setProperty('--w', `${a.medianTicks === null ? 0 : Math.max(2, (a.medianTicks / slowest) * 100)}%`);
    bar.append(fill);
    row.append(
      el('span', 'attack-name', nameOf(a.attackId)),
      bar,
      el('span', 'attack-text', `${a.replied} of ${a.answerable}${a.medianTicks === null ? '' : `, ${seconds(a.medianTicks)}`}`),
    );
    perAttackBox.append(row);
  }
  if (reply.perAttack.length === 0) perAttackBox.append(el('p', 'detail-note', 'No attack opened a long enough gap to reply in.'));

  const dodgeBox = section('Dodge timing', 'How long before the attack could hurt you a dash or jump began, when you dodged.');
  dodgeBox.append(
    columnChart(dodgeTiming.map((b) => [b.dodged, b.hit]), ['plot-landed', 'plot-taken'], dodgeBinLabels()),
    legend([
      { cls: 'plot-landed', label: 'Avoided' },
      { cls: 'plot-taken', label: 'Still hit' },
    ]),
  );

  const standBox = section('Where you stood and what you did', 'Share of the fight close to, a middling way from, and far from the boss.');
  standBox.append(
    stackedBar([distance.close, distance.mid, distance.far], ['plot-close', 'plot-mid', 'plot-far']),
    legend([
      { cls: 'plot-close', label: 'Close' },
      { cls: 'plot-mid', label: 'Middle' },
      { cls: 'plot-far', label: 'Far' },
    ]),
    el(
      'p',
      'detail-note',
      `Per minute: ${Math.round(perMinute.swings)} swings, ${Math.round(perMinute.dashes)} dashes, ${Math.round(perMinute.jumps)} jumps.`,
    ),
  );

  const back = el('button', 'row focused');
  back.type = 'button';
  back.append(el('span', 'row-label', 'Back to results'));
  back.addEventListener('click', onBack);

  const rows = el('div', 'rows');
  rows.append(back);

  panel.replaceChildren(
    el('h1', undefined, 'Fight details'),
    el('p', 'recommendation', recommendationText(details.recommendation)),
    tiles,
    timelineBox,
    avoidBox,
    replyBox,
    perAttackBox,
    dodgeBox,
    standBox,
    rows,
  );
  panel.scrollTop = 0;
}

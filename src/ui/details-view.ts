import type { FightDetails } from '../stats/details';
import { el } from './dom';
import { attackBandRects, columns, marksAt, pathPoints, spanRects, stackedRow, timelineMarks, type Rect } from './details-plots';
import { WORLD } from '../game/params';
import { PATH_STEP } from '../stats/meter';
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

function positionChart(clock: { ticks: number; path: number[]; attackSpans: [number, number][] }): SVGSVGElement {
  const height = 72;
  const svg = chart(height + 14);
  addRects(svg, spanRects(clock.attackSpans, clock.ticks, W, height, 'plot-attack'));
  svg.append(svgNode('line', { x1: 0, x2: W, y1: 0, y2: 0 }, 'plot-axis'), svgNode('line', { x1: 0, x2: W, y1: height, y2: height }, 'plot-axis'));
  const points = pathPoints(clock.path, clock.ticks, PATH_STEP, WORLD.width, W, height);
  if (points.length > 1) svg.append(svgNode('polyline', { points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') }, 'plot-path'));
  addText(svg, 0, height + 11, '0:00', 'start');
  const total = Math.round(clock.ticks / 60);
  addText(svg, W, height + 11, `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, 'end');
  return svg;
}

type Clock = NonNullable<FightDetails['numbers']['clock']>;

const OUTCOME_CLASS: Record<string, string> = {
  hit: 'plot-taken',
  dodged: 'plot-landed',
  countered: 'plot-countered',
  interrupted: 'plot-missed',
};

function addMarks(svg: SVGSVGElement, marks: ReturnType<typeof marksAt>, width: number, opacity = 1): void {
  for (const m of marks) {
    svg.append(svgNode('line', { x1: m.x, x2: m.x, y1: m.y1, y2: m.y2, 'stroke-width': width, 'stroke-opacity': opacity }, m.cls));
  }
}

function addTimeLabels(svg: SVGSVGElement, ticks: number, y: number): void {
  addText(svg, 0, y, '0:00', 'start');
  const total = Math.round(ticks / 60);
  addText(svg, W, y, `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, 'end');
}

/** Three rows on the fight's own time axis: the boss's attacks (coloured by how each ended), the way you held, and your dashes and jumps. */
function attacksAndMovesChart(details: FightDetails, clock: Clock): SVGSVGElement {
  const length = details.timeline.length;
  const svg = chart(112);
  addText(svg, 0, 8, 'Boss attacks', 'start');
  addRects(svg, attackBandRects(details.attackBands, length, W, 11, 18, (o) => OUTCOME_CLASS[o] ?? 'plot-missed'));
  addText(svg, 0, 40, 'Holding left (above) or right (below)', 'start');
  svg.append(svgNode('line', { x1: 0, x2: W, y1: 56, y2: 56 }, 'plot-axis'));
  addRects(svg, spanRects(clock.leftRuns, length, W, 12, 'plot-left'), 0, 43);
  addRects(svg, spanRects(clock.rightRuns, length, W, 12, 'plot-right'), 0, 57);
  addText(svg, 0, 84, 'Dashes and jumps', 'start');
  addMarks(svg, marksAt(details.moves.jumps, length, W, 87, 99, 'plot-jump'), 1.5);
  addMarks(svg, marksAt(details.moves.dashes, length, W, 87, 99, 'plot-dash'), 2);
  addTimeLabels(svg, length, 110);
  return svg;
}

/** The gap to the nearest boss over the fight, with a mark for each hit you landed (green) and each hit you took (red). */
function distanceChart(details: FightDetails, clock: Clock): SVGSVGElement {
  const height = 72;
  const length = details.timeline.length;
  const svg = chart(height + 14);
  addRects(svg, spanRects(clock.attackSpans, length, W, height, 'plot-attack'));
  svg.append(svgNode('line', { x1: 0, x2: W, y1: height, y2: height }, 'plot-axis'));
  const far = Math.max(300, ...clock.distance);
  addMarks(svg, marksAt(details.timeline.landed, length, W, 0, height, 'plot-landed'), 1.5, 0.8);
  addMarks(svg, marksAt(details.timeline.taken, length, W, 0, height, 'plot-taken'), 1.5, 0.8);
  const points = pathPoints(clock.distance, length, PATH_STEP, far, W, height);
  if (points.length > 1) svg.append(svgNode('polyline', { points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') }, 'plot-path'));
  addText(svg, W, 9, `${Math.round(far)} apart`, 'end');
  addTimeLabels(svg, length, height + 11);
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

  const attacksBox = section('Boss attacks', 'How many times each attack came, and how each one ended.');
  const most = Math.max(1, ...details.numbers.boss.perAttack.map((a) => a.started));
  for (const a of details.numbers.boss.perAttack) {
    const stack = el('span', 'attack-stack');
    stack.style.setProperty('--w', `${(a.started / most) * 100}%`);
    for (const [count, cls] of [[a.hit, 'plot-taken'], [a.dodged, 'plot-landed'], [a.countered, 'plot-countered'], [a.interrupted, 'plot-missed']] as const) {
      if (count === 0) continue;
      const part = el('span', `attack-part ${cls}`);
      part.style.setProperty('--n', String(count));
      stack.append(part);
    }
    const bar = el('span', 'attack-bar');
    bar.append(stack);
    const row = el('div', 'attack-row');
    row.append(el('span', 'attack-name', nameOf(a.attackId)), bar, el('span', 'attack-text', String(a.started)));
    attacksBox.append(row);
  }
  if (details.numbers.boss.perAttack.length === 0) attacksBox.append(el('p', 'detail-note', 'The boss did not attack.'));
  else {
    attacksBox.append(
      legend([
        { cls: 'plot-taken', label: 'Hit you' },
        { cls: 'plot-landed', label: 'Dodged' },
        { cls: 'plot-countered', label: 'Countered' },
        { cls: 'plot-missed', label: 'Cut short' },
      ]),
    );
  }

  const { movement, clock } = details.numbers;
  const strips: HTMLElement[] = [];
  if (movement !== null && clock !== null) {
    const outcomes = legend([
      { cls: 'plot-taken', label: 'Hit you' },
      { cls: 'plot-landed', label: 'Dodged' },
      { cls: 'plot-countered', label: 'Countered' },
      { cls: 'plot-missed', label: 'Cut short' },
    ]);
    const movesBox = section('Boss attacks and your moves', 'Each attack from its warning (pale) to the end of its danger. A dash or jump just before a strike is a dodge.');
    movesBox.append(attacksAndMovesChart(details, clock), outcomes);

    const gapBox = section('Distance to the boss', 'The gap through the fight. Green lines: you hit the boss. Red lines: it hit you. Shaded: a boss was attacking.');
    gapBox.append(distanceChart(details, clock));

    const held = movement.leftTicks + movement.rightTicks + movement.stillTicks;
    const arenaBox = section('Your place in the arena', 'The right wall at the top, the left wall at the bottom. Shaded: a boss was attacking.');
    arenaBox.append(
      positionChart(clock),
      stackedBar([movement.leftTicks, movement.rightTicks, movement.stillTicks], ['plot-left', 'plot-right', 'plot-still']),
      legend([
        { cls: 'plot-left', label: `Holding left ${seconds(movement.leftTicks)}` },
        { cls: 'plot-right', label: `Holding right ${seconds(movement.rightTicks)}` },
        { cls: 'plot-still', label: `Holding neither ${seconds(movement.stillTicks)}` },
      ]),
      el(
        'p',
        'detail-note',
        held === 0
          ? 'No movement was measured.'
          : `Changed direction ${movement.turns} times. Next to a wall ${seconds(movement.wallTicks)}. In the air ${seconds(movement.airTicks)}.`,
      ),
    );
    strips.push(movesBox, gapBox, arenaBox);
  }

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
    el('p', 'recommendation', recommendationText(details.recommendation, nameOf)),
    tiles,
    timelineBox,
    ...strips,
    attacksBox,
    avoidBox,
    replyBox,
    perAttackBox,
    dodgeBox,
    standBox,
    rows,
  );
  panel.scrollTop = 0;
}

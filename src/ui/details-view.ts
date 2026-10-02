import type { FightDetails } from '../stats/details';
import { el } from './dom';
import { attackBandRects, columns, marksAt, pathPoints, spanRects, stackedRow, timelineMarks, type Rect } from './details-plots';
import { PATH_STEP } from '../stats/meter';
import { slackBinLabels, percent, recommendationText, replyBinLabels, seconds } from './details-text';

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

const bandClass = (outcome: string): string => `${OUTCOME_CLASS[outcome] ?? 'plot-missed'} plot-band`;

/**
 * Which way you moved in each boss attack, on the fight's own time axis: every attack is a tinted band (pale warning, stronger
 * danger, coloured by how it ended) the full height, and under it one lane where the stretches you held towards the boss and
 * the stretches you held away from it sit at the same level, since you cannot do both at once.
 */
function directionChart(details: FightDetails, clock: Clock): SVGSVGElement {
  const length = details.timeline.length;
  const height = 56;
  const lane = 20;
  const svg = chart(height + 14);
  addRects(svg, attackBandRects(details.attackBands, length, W, 0, height, bandClass));
  addRects(svg, spanRects(clock.towardRuns, length, W, lane, 'plot-toward'), 0, height - lane - 2);
  addRects(svg, spanRects(clock.awayRuns, length, W, lane, 'plot-away'), 0, height - lane - 2);
  addTimeLabels(svg, length, height + 11);
  return svg;
}

/** Your dashes (or jumps) as lines through the middle strip of the plot, with the hits you landed above it and the hits you took below it. */
function movesAndHitsChart(details: FightDetails, moves: number[], cls: string): SVGSVGElement {
  const length = details.timeline.length;
  const height = 64;
  const mid = height / 2;
  const svg = chart(height + 14);
  svg.append(svgNode('line', { x1: 0, x2: W, y1: mid, y2: mid }, 'plot-axis'));
  addMarks(svg, marksAt(details.timeline.landed, length, W, 0, mid - 8, 'plot-landed'), 1.5, 0.85);
  addMarks(svg, marksAt(details.timeline.taken, length, W, mid + 8, height, 'plot-taken'), 1.5, 0.85);
  addMarks(svg, marksAt(moves, length, W, mid - 6, mid + 6, cls), 2);
  addTimeLabels(svg, length, height + 11);
  return svg;
}

/** The boss attacks as tinted bands the full height, with a line down through them for each of your dashes (or jumps). */
function movesAndAttacksChart(details: FightDetails, moves: number[], cls: string): SVGSVGElement {
  const length = details.timeline.length;
  const height = 44;
  const svg = chart(height + 14);
  addRects(svg, attackBandRects(details.attackBands, length, W, 0, height, bandClass));
  addMarks(svg, marksAt(moves, length, W, 1, height - 1, cls), 1.5);
  addTimeLabels(svg, length, height + 11);
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
  { key: 'saved', cls: 'plot-saved', label: 'Dodge saved you' },
  { key: 'unneeded', cls: 'plot-unneeded', label: 'Dodge not needed' },
  { key: 'platform', cls: 'plot-platform', label: 'Platform' },
  { key: 'cover', cls: 'plot-cover', label: 'Cover' },
  { key: 'countered', cls: 'plot-countered', label: 'Countered' },
  { key: 'unrated', cls: 'plot-unrated', label: 'Dodged' },
  { key: 'outOfReach', cls: 'plot-never', label: 'Never threatened you' },
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
  onExport: (say: (message: string) => void) => void,
): (message: string) => void {
  const { avoided, hitRate, reply, perMinute, distance, timeline, dodges } = details;

  const tiles = el('div', 'tiles');
  tiles.append(
    tile(percent(avoided.share), 'Attacks avoided', `${avoided.avoided} of ${avoided.total}`),
    tile(percent(hitRate.share), 'Swings that hit', `${hitRate.hits} of ${hitRate.swings}`),
    tile(percent(reply.share), 'Attacks replied to', `${reply.replied} of ${reply.answerable}`),
    tile(reply.medianTicks === null ? '–' : seconds(reply.medianTicks), 'Median reply time', 'after the attack ended'),
  );

  const attacksBox = section('Boss attacks by outcome', 'How many times each attack came, and how each one ended.');
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
    const outcomes = (): HTMLElement =>
      legend([
        { cls: 'plot-taken', label: 'Hit you' },
        { cls: 'plot-landed', label: 'Dodged' },
        { cls: 'plot-countered', label: 'Countered' },
        { cls: 'plot-missed', label: 'Cut short' },
      ]);
    const directionBox = section(
      'Timeline: boss attacks and your direction of movement',
      'Each boss attack is a tinted band, from its warning (pale) to the end of its danger, coloured by how it ended. Under it, the stretches you walked towards the boss and away from it, on the same line.',
    );
    directionBox.append(
      directionChart(details, clock),
      outcomes(),
      legend([
        { cls: 'plot-toward', label: `Towards the boss ${seconds(movement.towardTicks)}` },
        { cls: 'plot-away', label: `Away from it ${seconds(movement.awayTicks)}` },
      ]),
    );

    const moveBoxes = ([
      { moves: details.moves.dashes, cls: 'plot-dash', one: 'Dash', many: 'Dashes', lower: 'dashes', rate: perMinute.dashes },
      { moves: details.moves.jumps, cls: 'plot-jump', one: 'Jump', many: 'Jumps', lower: 'jumps', rate: perMinute.jumps },
    ] as const).flatMap((m) => {
      const hitsBox = section(
        `Timeline: your ${m.lower}, hits landed and hits taken`,
        `Each ${m.one.toLowerCase()} is a line across the middle. Hits you landed are above it, hits you took below it. About ${Math.round(m.rate)} ${m.lower} a minute.`,
      );
      hitsBox.append(
        movesAndHitsChart(details, m.moves, m.cls),
        legend([
          { cls: m.cls, label: `${m.many} ${m.moves.length}` },
          { cls: 'plot-landed', label: `Landed ${timeline.landed.length}` },
          { cls: 'plot-taken', label: `Taken ${timeline.taken.length}` },
        ]),
      );
      const attacksBox2 = section(
        `Timeline: boss attacks and your ${m.lower}`,
        `The boss attacks as bands, with a line for each ${m.one.toLowerCase()}. A line inside a band is a ${m.one.toLowerCase()} made during that attack.`,
      );
      attacksBox2.append(movesAndAttacksChart(details, m.moves, m.cls), outcomes(), legend([{ cls: m.cls, label: m.one }]));
      return [hitsBox, attacksBox2];
    });

    const gapBox = section('Timeline: distance to the boss', 'The gap through the fight. Green lines: you hit the boss. Red lines: it hit you. Shaded: a boss was attacking. Under it, the share of the fight spent close to, a middling way from, and far from the boss.');
    gapBox.append(
      distanceChart(details, clock),
      stackedBar([distance.close, distance.mid, distance.far], ['plot-close', 'plot-mid', 'plot-far']),
      legend([
        { cls: 'plot-close', label: 'Close' },
        { cls: 'plot-mid', label: 'Middle' },
        { cls: 'plot-far', label: 'Far' },
      ]),
    );

    strips.push(directionBox, ...moveBoxes, gapBox);
  }

  const timelineBox = section('Timeline: your hits and swings', 'Hits you landed are above the line, hits you took below it, swings on it.');
  timelineBox.append(
    timelineChart(timeline),
    legend([
      { cls: 'plot-landed', label: `Landed ${timeline.landed.length}` },
      { cls: 'plot-taken', label: `Taken ${timeline.taken.length}` },
      { cls: 'plot-swing', label: `Swings ${timeline.swings.length}` },
    ]),
  );

  const avoidBox = section(
    'How you avoided boss attacks',
    'Attacks that did not hit you. A dash or jump during an attack is replayed without it: "saved you" if it would have hit, "not needed" if it would have missed anyway. "Never threatened you": it could not have reached you where you stood.',
  );
  avoidBox.append(
    stackedBar(METHODS.map((m) => avoided.methods[m.key]), METHODS.map((m) => m.cls)),
    legend(METHODS.filter((m) => avoided.methods[m.key] > 0).map((m) => ({ cls: m.cls, label: `${m.label} ${avoided.methods[m.key]}` }))),
  );

  const replyBox = section('Reply time after boss attacks', 'Time from a boss attack ending to you starting a swing, for attacks you replied to.');
  replyBox.append(
    columnChart(reply.bins.map((b) => [b.hit, b.missed]), ['plot-landed', 'plot-missed'], replyBinLabels()),
    legend([
      { cls: 'plot-landed', label: 'Swing hit' },
      { cls: 'plot-missed', label: 'Swing missed' },
    ]),
  );

  const perAttackBox = section('Reply rate by boss attack', 'How often you replied to each attack, and how fast.');
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

  const dodgeBox = section(
    'Dodge ratings',
    'For each attack you dashed or jumped during, the game replays it without the dodge. How much later could the dodge you saved yourself with have been, and still worked?',
  );
  if (dodges === null || dodges.saved + dodges.unneeded + dodges.hitAnyway === 0) {
    dodgeBox.append(el('p', 'detail-note', 'You did not dash or jump during any attack.'));
  } else {
    dodgeBox.append(
      el('p', 'detail-note', `${dodges.saved + dodges.unneeded + dodges.hitAnyway} attacks with a dash or jump: ${dodges.saved} saved you, ${dodges.unneeded} were not needed, ${dodges.hitAnyway} hit you anyway.`),
    );
    if (dodges.saved > 0) {
      dodgeBox.append(
        columnChart(dodges.slackBins.map((n) => [n]), ['plot-saved'], slackBinLabels()),
        el('p', 'detail-note', 'Left: it only just worked. Right: lots of room to spare.'),
      );
    }
  }

  const back = el('button', 'row focused');
  back.type = 'button';
  back.append(el('span', 'row-label', 'Back to results'));
  back.addEventListener('click', onBack);

  const note = el('p', 'hint');
  const say = (message: string): void => {
    note.textContent = message;
  };
  const save = el('button', 'row');
  save.type = 'button';
  save.append(el('span', 'row-label', 'Export these details'));
  save.addEventListener('click', () => onExport(say));

  const rows = el('div', 'rows');
  rows.append(save, back);

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
    rows,
    note,
    el('p', 'hint', "Export saves this fight's numbers as a file you can send. On the pad, right exports and either button goes back."),
  );
  panel.scrollTop = 0;
  return say;
}

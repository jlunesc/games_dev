import type { FightDetails, MoveMark, MoveVerdict } from '../stats/details';
import { el } from './dom';
import { attackBandRects, marksAt, pathPoints, spanRects, stackedRow, timelineMarks, type Rect } from './details-plots';
import { PATH_STEP } from '../stats/meter';
import { percent, recommendationText, seconds } from './details-text';

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
 * One way of moving against the boss attacks, on the fight's own time axis: every attack that can hurt is a tinted band the
 * full height (pale warning, stronger danger, coloured by how it ended), and under it one lane with the stretches in which
 * you held that direction.
 */
function directionChart(details: FightDetails, runs: [number, number][], cls: string): SVGSVGElement {
  const length = details.timeline.length;
  const height = 56;
  const lane = 20;
  const svg = chart(height + 14);
  addRects(svg, attackBandRects(details.attackBands, length, W, 0, height, bandClass));
  addRects(svg, spanRects(runs, length, W, lane, cls), 0, height - lane - 2);
  addTimeLabels(svg, length, height + 11);
  return svg;
}

/** Your dashes (or jumps) as lines through the middle strip of the plot, with the hits you landed above it and the hits you took below it. */
function movesAndHitsChart(details: FightDetails, moves: MoveMark[], cls: string): SVGSVGElement {
  const length = details.timeline.length;
  const height = 64;
  const mid = height / 2;
  const svg = chart(height + 14);
  svg.append(svgNode('line', { x1: 0, x2: W, y1: mid, y2: mid }, 'plot-axis'));
  addMarks(svg, marksAt(details.timeline.landed, length, W, 0, mid - 8, 'plot-landed'), 1.5, 0.85);
  addMarks(svg, marksAt(details.timeline.taken, length, W, mid + 8, height, 'plot-taken'), 1.5, 0.85);
  addMarks(svg, marksAt(moves.map((m) => m.tick), length, W, mid - 6, mid + 6, cls), 2);
  addTimeLabels(svg, length, height + 11);
  return svg;
}

const VERDICTS: readonly { verdict: MoveVerdict; cls: string; label: string }[] = [
  { verdict: 'saved', cls: 'plot-saved', label: 'Saved you' },
  { verdict: 'unneeded', cls: 'plot-unneeded', label: 'Not needed' },
  { verdict: 'hitAnyway', cls: 'plot-taken', label: 'Hit anyway' },
  { verdict: 'unrated', cls: 'plot-unrated', label: 'Not rated' },
  { verdict: 'outside', cls: 'plot-missed', label: 'Other' },
];

/** The boss attacks that can hurt as grey bands the full height, with a line down through them for each dash (or jump), coloured by what the replay without it found. */
function movesAndAttacksChart(details: FightDetails, moves: MoveMark[]): SVGSVGElement {
  const length = details.timeline.length;
  const height = 44;
  const svg = chart(height + 14);
  addRects(svg, attackBandRects(details.attackBands, length, W, 0, height, () => 'plot-neutral plot-band'));
  for (const v of VERDICTS) {
    const ticks = moves.filter((m) => m.verdict === v.verdict).map((m) => m.tick);
    addMarks(svg, marksAt(ticks, length, W, 1, height - 1, v.cls), 2, v.verdict === 'outside' ? 0.6 : 1);
  }
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
  const { avoided, hitRate, reply, perMinute, distance, timeline } = details;

  const tiles = el('div', 'tiles');
  tiles.append(
    tile(percent(avoided.share), 'Attacks avoided', `${avoided.avoided} of ${avoided.total}`),
    tile(percent(hitRate.share), 'Swings that hit', `${hitRate.hits} of ${hitRate.swings}`),
    tile(percent(reply.share), 'Attacks replied to', `${reply.replied} of ${reply.answerable}`),
    tile(reply.medianTicks === null ? '–' : seconds(reply.medianTicks), 'Median reply time', 'after the attack ended'),
  );

  const outcomes = (): HTMLElement =>
    legend([
      { cls: 'plot-taken', label: 'Hit you' },
      { cls: 'plot-landed', label: 'Dodged' },
      { cls: 'plot-countered', label: 'Countered' },
      { cls: 'plot-missed', label: 'Cut short' },
    ]);

  const attacksBox = section('Boss attacks by outcome', 'How many times each attack that can hurt came, and how each one ended. Moves that cannot hurt you, such as teleports, are left out.');
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
  else attacksBox.append(outcomes());

  const { movement, clock } = details.numbers;
  const strips: HTMLElement[] = [];
  if (movement !== null && clock !== null) {
    const directionBox = (title: string, runs: [number, number][], cls: string, label: string, ticks: number): HTMLElement => {
      const box = section(
        title,
        'Each boss attack that can hurt is a tinted band, from its warning (pale) to the end of its danger, coloured by how it ended. Under it, the stretches you held that direction.',
      );
      box.append(directionChart(details, runs, cls), outcomes(), legend([{ cls, label: `${label} ${seconds(ticks)}` }]));
      return box;
    };
    const approaching = directionBox('Timeline: boss attacks and you approaching the boss', clock.towardRuns, 'plot-toward', 'Towards the boss', movement.towardTicks);
    const retreating = directionBox('Timeline: boss attacks and you moving away', clock.awayRuns, 'plot-away', 'Away from the boss', movement.awayTicks);

    const moveBoxes = ([
      { moves: details.moves.dashes, cls: 'plot-dash', one: 'dash', many: 'Dashes', lower: 'dashes', rate: perMinute.dashes },
      { moves: details.moves.jumps, cls: 'plot-jump', one: 'jump', many: 'Jumps', lower: 'jumps', rate: perMinute.jumps },
    ] as const).flatMap((m) => {
      const hitsBox = section(
        `Timeline: your ${m.lower}, hits landed and hits taken`,
        `Each ${m.one} is a line across the middle. Hits you landed are above it, hits you took below it. About ${Math.round(m.rate)} ${m.lower} a minute.`,
      );
      hitsBox.append(
        movesAndHitsChart(details, m.moves, m.cls),
        legend([
          { cls: m.cls, label: `${m.many} ${m.moves.length}` },
          { cls: 'plot-landed', label: `Landed ${timeline.landed.length}` },
          { cls: 'plot-taken', label: `Taken ${timeline.taken.length}` },
        ]),
      );
      const escapeBox = section(
        `Timeline: did your ${m.lower} get you out of attacks?`,
        `Each boss attack that can hurt is a grey band. Each ${m.one} is a line, coloured by what happened when the game replayed that attack without it: "saved you" (it would have hit), "not needed" (it would have missed anyway) or "hit anyway". "Other": made when no attack could hurt you, or during one you countered.`,
      );
      escapeBox.append(
        movesAndAttacksChart(details, m.moves),
        legend(
          VERDICTS.map((v) => ({ ...v, count: m.moves.filter((x) => x.verdict === v.verdict).length }))
            .filter((v) => v.count > 0)
            .map((v) => ({ cls: v.cls, label: `${v.label} ${v.count}` })),
        ),
      );
      return [hitsBox, escapeBox];
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

    strips.push(approaching, retreating, ...moveBoxes, gapBox);
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
    rows,
  );
  panel.scrollTop = 0;
}

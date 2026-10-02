/** One filled rectangle of a plot, in the plot's own units; `cls` names its colour class. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: string;
}

/** One bar split in proportion to `values` (a zero draws nothing); empty when every value is zero. */
export function stackedRow(values: number[], classes: readonly string[], width: number, height: number): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  let x = 0;
  const rects: Rect[] = [];
  values.forEach((value, i) => {
    if (value <= 0) return;
    const w = (value / total) * width;
    rects.push({ x, y: 0, w, h: height, cls: classes[i] ?? '' });
    x += w;
  });
  return rects;
}

/** A thin vertical mark on the timeline: its x, the span it covers in y, and its colour class. */
export interface Mark {
  x: number;
  y1: number;
  y2: number;
  cls: string;
}

/**
 * The fight along a time axis `width` wide: swings as short grey ticks in the middle, hits landed as ticks going
 * up and hits taken as ticks going down. `height` is the whole strip; the middle line is at half of it.
 */
export function timelineMarks(
  timeline: { length: number; landed: number[]; taken: number[]; swings: number[] },
  width: number,
  height: number,
): Mark[] {
  if (timeline.length <= 0) return [];
  const at = (tick: number): number => Math.min(width, Math.max(0, (tick / timeline.length) * width));
  const mid = height / 2;
  const q = height / 6;
  return [
    ...timeline.swings.map((t): Mark => ({ x: at(t), y1: mid - q / 2, y2: mid + q / 2, cls: 'plot-swing' })),
    ...timeline.landed.map((t): Mark => ({ x: at(t), y1: 0, y2: mid - q / 2, cls: 'plot-landed' })),
    ...timeline.taken.map((t): Mark => ({ x: at(t), y1: mid + q / 2, y2: height, cls: 'plot-taken' })),
  ];
}

/**
 * The player's position as a line over time: `path[i]` is the x at update `i * step` of a fight `ticks` updates long, drawn
 * `width` wide and `height` tall. The left wall is at the bottom and the right wall at the top, so going right goes up.
 */
export function pathPoints(path: number[], ticks: number, step: number, worldWidth: number, width: number, height: number): [number, number][] {
  if (ticks <= 0) return [];
  return path.map((x, i): [number, number] => [
    Math.min(width, ((i * step) / ticks) * width),
    height - Math.min(1, Math.max(0, x / worldWidth)) * height,
  ]);
}

/** Full-height bands along the time axis for runs of updates (start, end exclusive) of a fight `ticks` updates long. */
export function spanRects(spans: [number, number][], ticks: number, width: number, height: number, cls: string): Rect[] {
  if (ticks <= 0) return [];
  return spans.map(([start, end]): Rect => {
    const x = (Math.min(start, ticks) / ticks) * width;
    return { x, y: 0, w: Math.max(1, (Math.min(end, ticks) / ticks) * width - x), h: height, cls };
  });
}

/** A thin vertical mark for each update in `ticks` of a fight `length` updates long, from `y1` to `y2`. */
export function marksAt(ticks: number[], length: number, width: number, y1: number, y2: number, cls: string): Mark[] {
  if (length <= 0) return [];
  return ticks.map((t): Mark => ({ x: Math.min(width, Math.max(0, (t / length) * width)), y1, y2, cls }));
}

/**
 * Each attack of the boss as a band along the time axis, in the row `y` to `y + height`: the warning (up to the danger)
 * in `warnCls` and the rest in `cls`, both picked by `classOf`, so an attack is coloured by how it ended.
 */
export function attackBandRects(
  bands: { start: number; dangerStart: number; end: number; outcome: string }[],
  length: number,
  width: number,
  y: number,
  height: number,
  classOf: (outcome: string) => string,
): Rect[] {
  if (length <= 0) return [];
  const at = (tick: number): number => Math.min(width, Math.max(0, (tick / length) * width));
  return bands.flatMap((b): Rect[] => {
    const cls = classOf(b.outcome);
    const x0 = at(b.start);
    const x1 = at(b.dangerStart);
    const x2 = Math.max(x1 + 1, at(b.end));
    return [
      { x: x0, y, w: Math.max(0, x1 - x0), h: height, cls: `${cls} plot-warn` },
      { x: x1, y, w: x2 - x1, h: height, cls },
    ];
  });
}

/** One filled rectangle of a plot, in the plot's own units; `cls` names its colour class. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: string;
}

/**
 * Stacked columns, one per bin, `series[i]` holding the heights of the stacked parts of bin `i` (bottom part first)
 * and `classes` their colour classes. Every column is scaled to the tallest bin, so bins can be compared. A bin
 * of zero draws nothing. Columns fill `width` and the tallest fills `height`, with `gap` between columns.
 */
export function columns(series: number[][], classes: readonly string[], width: number, height: number, gap: number): Rect[] {
  const n = series.length;
  if (n === 0) return [];
  const top = Math.max(0, ...series.map((parts) => parts.reduce((a, b) => a + b, 0)));
  if (top === 0) return [];
  const colWidth = (width - gap * (n - 1)) / n;
  const rects: Rect[] = [];
  series.forEach((parts, i) => {
    let base = height;
    parts.forEach((value, j) => {
      if (value <= 0) return;
      const h = (value / top) * height;
      base -= h;
      rects.push({ x: i * (colWidth + gap), y: base, w: colWidth, h, cls: classes[j] ?? '' });
    });
  });
  return rects;
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

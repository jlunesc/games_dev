import { describe, expect, it } from 'vitest';
import { attackBandRects, marksAt, pathPoints, spanRects, stackedRow, timelineMarks } from '../src/ui/details-plots';

describe('stackedRow', () => {
  it('splits the width in proportion and skips zeros', () => {
    expect(stackedRow([1, 0, 3], ['a', 'b', 'c'], 200, 10)).toEqual([
      { x: 0, y: 0, w: 50, h: 10, cls: 'a' },
      { x: 50, y: 0, w: 150, h: 10, cls: 'c' },
    ]);
  });

  it('is empty when every value is zero', () => {
    expect(stackedRow([0, 0], ['a', 'b'], 200, 10)).toEqual([]);
  });
});

describe('timelineMarks', () => {
  it('puts landed hits above the middle, taken hits below and swings on it, along the time axis', () => {
    const marks = timelineMarks({ length: 1000, landed: [500], taken: [250], swings: [1000] }, 200, 60);
    const swing = marks.find((m) => m.cls === 'plot-swing')!;
    const landed = marks.find((m) => m.cls === 'plot-landed')!;
    const taken = marks.find((m) => m.cls === 'plot-taken')!;
    expect(landed.x).toBe(100);
    expect(taken.x).toBe(50);
    expect(swing.x).toBe(200);
    expect(landed.y2).toBeLessThanOrEqual(swing.y1);
    expect(taken.y1).toBeGreaterThanOrEqual(swing.y2);
    expect(landed.y1).toBe(0);
    expect(taken.y2).toBe(60);
  });

  it('is empty for a fight with no length', () => {
    expect(timelineMarks({ length: 0, landed: [], taken: [], swings: [] }, 200, 60)).toEqual([]);
  });
});

describe('pathPoints', () => {
  it('puts the left wall at the bottom and the right wall at the top, with time going right', () => {
    const points = pathPoints([0, 640, 1280], 120, 60, 1280, 300, 100);
    expect(points).toEqual([[0, 100], [150, 50], [300, 0]]);
  });

  it('keeps a position outside the arena on the plot and gives nothing for a fight without length', () => {
    expect(pathPoints([-50, 2000], 60, 30, 1280, 100, 100)).toEqual([[0, 100], [50, 0]]);
    expect(pathPoints([10], 0, 6, 1280, 100, 100)).toEqual([]);
  });
});

describe('spanRects', () => {
  it('draws a band for each run along the time axis, at least a hair wide', () => {
    const rects = spanRects([[0, 30], [60, 60]], 120, 300, 50, 'a');
    expect(rects).toEqual([
      { x: 0, y: 0, w: 75, h: 50, cls: 'a' },
      { x: 150, y: 0, w: 1, h: 50, cls: 'a' },
    ]);
    expect(spanRects([[0, 5]], 0, 300, 50, 'a')).toEqual([]);
  });
});

describe('marksAt', () => {
  it('puts a mark at each update along the time axis', () => {
    expect(marksAt([0, 50, 100], 100, 200, 5, 15, 'm')).toEqual([
      { x: 0, y1: 5, y2: 15, cls: 'm' },
      { x: 100, y1: 5, y2: 15, cls: 'm' },
      { x: 200, y1: 5, y2: 15, cls: 'm' },
    ]);
    expect(marksAt([5], 0, 200, 0, 1, 'm')).toEqual([]);
  });
});

describe('attackBandRects', () => {
  it('draws the warning pale and the danger solid, coloured by how the attack ended', () => {
    const rects = attackBandRects([{ start: 0, dangerStart: 25, end: 50, outcome: 'hit' }], 100, 200, 10, 8, (o) => `c-${o}`);
    expect(rects).toEqual([
      { x: 0, y: 10, w: 50, h: 8, cls: 'c-hit plot-warn' },
      { x: 50, y: 10, w: 50, h: 8, cls: 'c-hit' },
    ]);
  });

  it('gives the danger part at least a hair of width', () => {
    const [, danger] = attackBandRects([{ start: 10, dangerStart: 20, end: 20, outcome: 'dodged' }], 1000, 100, 0, 8, () => 'c');
    expect(danger!.w).toBe(1);
  });
});

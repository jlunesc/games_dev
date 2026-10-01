import { describe, expect, it } from 'vitest';
import { columns, stackedRow, timelineMarks } from '../src/ui/details-plots';

describe('columns', () => {
  it('scales every column to the tallest one and stacks the parts, the first at the bottom', () => {
    const rects = columns([[1, 1], [0, 4], [0, 0]], ['a', 'b'], 100, 40, 10);
    // Three columns of width 80/3, the second the tallest (4 = the full 40).
    const w = 80 / 3;
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ x: 0, y: 30, w, h: 10, cls: 'a' });
    expect(rects[1]).toEqual({ x: 0, y: 20, w, h: 10, cls: 'b' });
    expect(rects[2]).toEqual({ x: w + 10, y: 0, w, h: 40, cls: 'b' });
  });

  it('draws nothing when every bin is empty or there are no bins', () => {
    expect(columns([[0, 0], [0, 0]], ['a', 'b'], 100, 40, 4)).toEqual([]);
    expect(columns([], ['a'], 100, 40, 4)).toEqual([]);
  });
});

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

import { describe, expect, it } from 'vitest';
import { computeViewport } from '../src/ui/render';

describe('computeViewport', () => {
  it('uses the whole screen when it is exactly 16:9', () => {
    expect(computeViewport(1280, 720)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('adds side bars on a wider screen such as the S21 in landscape', () => {
    const view = computeViewport(2400, 1080);
    expect(view.scale).toBeCloseTo(1.5, 6);
    expect(view.offsetX).toBeCloseTo(240, 6);
    expect(view.offsetY).toBeCloseTo(0, 6);
  });

  it('adds top and bottom bars on a taller screen', () => {
    const view = computeViewport(640, 720);
    expect(view.scale).toBeCloseTo(0.5, 6);
    expect(view.offsetX).toBeCloseTo(0, 6);
    expect(view.offsetY).toBeCloseTo(180, 6);
  });
});

import { describe, expect, it } from 'vitest';
import { tickerSeconds } from '../src/ui/ticker';

describe('tickerSeconds', () => {
  it('is longer for longer text, so the speed stays about the same', () => {
    expect(tickerSeconds('a'.repeat(120))).toBeGreaterThan(tickerSeconds('a'.repeat(40)));
  });

  it('never goes below a floor, so a very short line does not race past', () => {
    expect(tickerSeconds('Hi')).toBeGreaterThanOrEqual(8);
  });
});

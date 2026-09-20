import { describe, expect, it } from 'vitest';
import {
  NOTHING_HELD,
  SN30_PRO_ID,
  SN30_PRO_PROFILE,
  STANDARD_PROFILE,
  sampleInput,
  selectProfile,
  type PadLike,
} from '../src/engine/input-profile';

/** A pad with 16 buttons and 4 axes, with the listed buttons down and the given axis values. */
function pad(down: number[] = [], axes: number[] = [0, 0, 0, 0], mapping = 'standard'): PadLike {
  return {
    id: SN30_PRO_ID,
    mapping,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })),
    axes,
  };
}

const sample = (p: PadLike, profile = SN30_PRO_PROFILE, held = NOTHING_HELD) =>
  sampleInput(p, profile, held, 0.25);

describe('SN30 Pro profile (X-input on Android)', () => {
  it('maps bottom to jump and confirm', () => {
    const { input } = sample(pad([0]));
    expect(input.jumpPressed).toBe(true);
    expect(input.jumpHeld).toBe(true);
    expect(input.confirm).toBe(true);
  });

  it('maps left to attack, right shoulder to dash and top to alt', () => {
    expect(sample(pad([3])).input.attackPressed).toBe(true);
    expect(sample(pad([9])).input.dashPressed).toBe(true);
    expect(sample(pad([4])).input.alt).toBe(true);
  });

  it('ignores buttons 6 and 7 completely, which sit at half value at rest', () => {
    const { input } = sample(pad([6, 7]));
    expect(input).toEqual({
      moveX: 0,
      moveY: 0,
      jumpHeld: false,
      jumpPressed: false,
      attackPressed: false,
      dashPressed: false,
      confirm: false,
      alt: false,
    });
  });

  it('ignores buttons that have no action (2, 10 and 11)', () => {
    const { input } = sample(pad([2, 10, 11]));
    expect(input.moveX).toBe(0);
    expect(input.moveY).toBe(0);
    expect(input.jumpHeld).toBe(false);
  });

  it('moves with the d-pad', () => {
    expect(sample(pad([15])).input.moveX).toBe(1);
    expect(sample(pad([14])).input.moveX).toBe(-1);
    expect(sample(pad([14, 15])).input.moveX).toBe(0);
  });
});

describe('the left stick', () => {
  it('counts as full speed beyond the dead zone, like the d-pad', () => {
    expect(sample(pad([], [0.3, 0, 0, 0])).input.moveX).toBe(1);
    expect(sample(pad([], [-0.9, 0, 0, 0])).input.moveX).toBe(-1);
  });

  it('is ignored inside the dead zone', () => {
    expect(sample(pad([], [0.2, 0, 0, 0])).input.moveX).toBe(0);
    expect(sample(pad([], [-0.03, 0.03, 0, 0])).input.moveX).toBe(0);
  });

  it('gives way to the d-pad when both are used', () => {
    expect(sample(pad([14], [1, 0, 0, 0])).input.moveX).toBe(-1);
  });
});

describe('moving up and down (menus)', () => {
  it('reads the d-pad up and down on both profiles', () => {
    expect(sample(pad([12])).input.moveY).toBe(-1);
    expect(sample(pad([13])).input.moveY).toBe(1);
    expect(sample(pad([12, 13])).input.moveY).toBe(0);
    expect(sampleInput(pad([12]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.moveY).toBe(-1);
    expect(sampleInput(pad([13]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.moveY).toBe(1);
  });

  it('reads the left stick vertically beyond the dead zone, like the d-pad', () => {
    expect(sample(pad([], [0, 0.5, 0, 0])).input.moveY).toBe(1);
    expect(sample(pad([], [0, -0.9, 0, 0])).input.moveY).toBe(-1);
    expect(sample(pad([], [0, 0.2, 0, 0])).input.moveY).toBe(0);
  });

  it('lets the d-pad win over the stick', () => {
    expect(sample(pad([12], [0, 1, 0, 0])).input.moveY).toBe(-1);
  });
});

describe('press edges', () => {
  it('reports a press only on the update where the button went down', () => {
    const first = sample(pad([0]));
    expect(first.input.jumpPressed).toBe(true);
    const second = sampleInput(pad([0]), SN30_PRO_PROFILE, first.held, 0.25);
    expect(second.input.jumpPressed).toBe(false);
    expect(second.input.jumpHeld).toBe(true);
    expect(second.held.jump).toBe(true);
  });
});

describe('the standard profile', () => {
  it('uses bottom, left, top and the right shoulder at their standard numbers', () => {
    expect(sampleInput(pad([0]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.jumpPressed).toBe(true);
    expect(sampleInput(pad([2]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.attackPressed).toBe(true);
    expect(sampleInput(pad([5]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.dashPressed).toBe(true);
    expect(sampleInput(pad([3]), STANDARD_PROFILE, NOTHING_HELD, 0.25).input.alt).toBe(true);
  });
});

describe('selectProfile', () => {
  it('picks the SN30 Pro profile by its exact id', () => {
    expect(selectProfile(SN30_PRO_ID, 'standard')).toEqual({
      kind: 'profile',
      profile: SN30_PRO_PROFILE,
    });
  });

  it('falls back to the standard profile for an unknown pad that reports a standard layout', () => {
    expect(selectProfile('146b-0609-Generic X-Box pad', 'standard')).toEqual({
      kind: 'profile',
      profile: STANDARD_PROFILE,
    });
  });

  it('refuses an unknown pad with a non-standard layout instead of guessing', () => {
    expect(selectProfile('Some Pad', '')).toEqual({ kind: 'unsupported', id: 'Some Pad' });
  });
});

import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../src/game/params';
import {
  NO_FEEDBACK,
  advanceFeedback,
  applyEvents,
  freezeFor,
  shakeOffset,
} from '../src/ui/feedback';

describe('freezeFor', () => {
  it('freezes 4 updates when the dummy is hit and 8 when the player is hurt', () => {
    expect(freezeFor(['dummyHit'])).toBe(FEEDBACK.freezeOnDummyHit);
    expect(freezeFor(['playerHit'])).toBe(FEEDBACK.freezeOnPlayerHit);
    expect(FEEDBACK.freezeOnDummyHit).toBe(4);
    expect(FEEDBACK.freezeOnPlayerHit).toBe(8);
  });

  it('takes the longer freeze when both happen at once, and none for other events', () => {
    expect(freezeFor(['dummyHit', 'playerHit'])).toBe(8);
    expect(freezeFor(['dash', 'dummyWindup'])).toBe(0);
    expect(freezeFor([])).toBe(0);
  });
});

describe('applyEvents', () => {
  it('starts the shake and the dummy flash when the dummy is hit', () => {
    const fb = applyEvents(NO_FEEDBACK, ['dummyHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.dummyFlashTicks).toBe(FEEDBACK.dummyFlashTicks);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('starts the shake and the player flash when the player is hurt', () => {
    const fb = applyEvents(NO_FEEDBACK, ['playerHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.playerFlashTicks).toBe(FEEDBACK.playerFlashTicks);
    expect(fb.dummyFlashTicks).toBe(0);
  });

  it('does not change anything for other events and does not modify its input', () => {
    const before = { ...NO_FEEDBACK };
    expect(applyEvents(before, ['dash'])).toEqual(NO_FEEDBACK);
    expect(before).toEqual(NO_FEEDBACK);
  });
});

describe('advanceFeedback', () => {
  it('counts every effect down by one and stops at zero', () => {
    const fb = advanceFeedback({ shakeTicks: 2, dummyFlashTicks: 1, playerFlashTicks: 0 });
    expect(fb).toEqual({ shakeTicks: 1, dummyFlashTicks: 0, playerFlashTicks: 0 });
    expect(advanceFeedback(fb).shakeTicks).toBe(0);
    expect(advanceFeedback(advanceFeedback(fb)).shakeTicks).toBe(0);
  });
});

describe('shakeOffset', () => {
  it('is zero without a shake', () => {
    expect(shakeOffset(NO_FEEDBACK)).toBe(0);
  });

  it('starts at the full amplitude, alternates sides and fades out', () => {
    const start = shakeOffset({ ...NO_FEEDBACK, shakeTicks: FEEDBACK.shakeTicks });
    expect(Math.abs(start)).toBeCloseTo(FEEDBACK.shakeAmplitude, 6);
    const next = shakeOffset({ ...NO_FEEDBACK, shakeTicks: FEEDBACK.shakeTicks - 1 });
    expect(Math.sign(next)).toBe(-Math.sign(start));
    expect(Math.abs(next)).toBeLessThan(Math.abs(start));
    expect(Math.abs(shakeOffset({ ...NO_FEEDBACK, shakeTicks: 1 }))).toBeLessThan(1);
  });
});

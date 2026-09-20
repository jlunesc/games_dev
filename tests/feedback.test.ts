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
  it('freezes for the boss-hit length when the boss is hit and for the player-hit length when the player is hurt', () => {
    expect(freezeFor(['bossHit'])).toBe(FEEDBACK.freezeOnBossHit);
    expect(freezeFor(['playerHit'])).toBe(FEEDBACK.freezeOnPlayerHit);
  });

  it('takes the longer freeze when both happen at once, and none for other events', () => {
    expect(freezeFor(['bossHit', 'playerHit'])).toBe(
      Math.max(FEEDBACK.freezeOnBossHit, FEEDBACK.freezeOnPlayerHit),
    );
    expect(freezeFor(['dash', 'bossWindupGold'])).toBe(0);
    expect(freezeFor([])).toBe(0);
  });
});

describe('applyEvents', () => {
  it('starts the shake and the boss flash when the boss is hit', () => {
    const fb = applyEvents(NO_FEEDBACK, ['bossHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('starts the shake and the player flash when the player is hurt', () => {
    const fb = applyEvents(NO_FEEDBACK, ['playerHit']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.playerFlashTicks).toBe(FEEDBACK.playerFlashTicks);
    expect(fb.bossFlashTicks).toBe(0);
  });

  it('does not change anything for other events and does not modify its input', () => {
    const before = { ...NO_FEEDBACK };
    expect(applyEvents(before, ['dash'])).toEqual(NO_FEEDBACK);
    expect(before).toEqual(NO_FEEDBACK);
  });
});

describe('advanceFeedback', () => {
  it('counts every effect down by one and stops at zero', () => {
    const fb = advanceFeedback({ shakeTicks: 2, bossFlashTicks: 1, playerFlashTicks: 0 });
    expect(fb).toEqual({ shakeTicks: 1, bossFlashTicks: 0, playerFlashTicks: 0 });
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

describe('the new boss events', () => {
  it('freeze longer on a counter and on victory, and not at all on a phase change', () => {
    expect(freezeFor(['counter'])).toBe(FEEDBACK.freezeOnCounter);
    expect(freezeFor(['bossDefeated'])).toBe(FEEDBACK.freezeOnBossDefeated);
    expect(freezeFor(['phaseChange'])).toBe(0);
    expect(FEEDBACK.freezeOnCounter).toBeGreaterThan(FEEDBACK.freezeOnBossHit);
  });

  it('take the longest freeze when several events happen at once', () => {
    expect(freezeFor(['bossHit', 'counter'])).toBe(FEEDBACK.freezeOnCounter);
    expect(freezeFor(['counter', 'bossDefeated'])).toBe(FEEDBACK.freezeOnBossDefeated);
    expect(freezeFor(['playerHit', 'bossHit'])).toBe(FEEDBACK.freezeOnPlayerHit);
  });

  it('shake the screen and flash the boss on a counter and on victory', () => {
    for (const event of ['counter', 'bossDefeated'] as const) {
      const fb = applyEvents(NO_FEEDBACK, [event]);
      expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
      expect(fb.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    }
  });

  it('shake the screen on a phase change without flashing anyone', () => {
    const fb = applyEvents(NO_FEEDBACK, ['phaseChange']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.bossFlashTicks).toBe(0);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('ignore the warning events', () => {
    expect(applyEvents(NO_FEEDBACK, ['bossWindupGold', 'bossWindupRed'])).toEqual(NO_FEEDBACK);
    expect(freezeFor(['bossWindupGold', 'bossWindupRed'])).toBe(0);
  });
});

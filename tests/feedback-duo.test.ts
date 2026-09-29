import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../src/game/params';
import { createInitialState, type GameEvent } from '../src/game/state';
import { NO_FEEDBACK, applyEvents, flashBossFor, freezeFor } from '../src/ui/feedback';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { dummy, pair, unit } from './duo-helpers';

describe('a boss going down', () => {
  it('freezes the loop as long as a defeat does', () => {
    expect(freezeFor(['bossDown'])).toBe(FEEDBACK.freezeOnBossDefeated);
    expect(freezeFor(['bossDown'], { ...DEFAULT_SETTINGS, freeze: false })).toBe(0);
  });

  it('shakes the screen and flashes the boss like a defeat', () => {
    const fb = applyEvents(NO_FEEDBACK, ['bossDown']);
    expect(fb.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(fb.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    expect(fb.playerFlashTicks).toBe(0);
  });

  it('honours the Shake and Flashes settings', () => {
    const noShake = applyEvents(NO_FEEDBACK, ['bossDown'], { ...DEFAULT_SETTINGS, shake: false, flash: true });
    expect(noShake.shakeTicks).toBe(0);
    expect(noShake.bossFlashTicks).toBe(FEEDBACK.bossFlashTicks);
    const noFlash = applyEvents(NO_FEEDBACK, ['bossDown'], { ...DEFAULT_SETTINGS, shake: true, flash: false });
    expect(noFlash.shakeTicks).toBe(FEEDBACK.shakeTicks);
    expect(noFlash.bossFlashTicks).toBe(0);
  });
});

describe('flashBossFor', () => {
  const fight = pair(unit(30, 400), dummy(800));
  const before = createInitialState(fight, 1);
  const hurt = (index: number) => {
    const after = structuredClone(before);
    (index === 0 ? after.boss : after.partners[0]!).hp -= 3;
    return after;
  };

  it('names the boss that was struck when a hit, a counter or a fall happens', () => {
    for (const event of ['bossHit', 'counter', 'bossDefeated', 'bossDown'] as GameEvent[]) {
      expect(flashBossFor([event], before, hurt(1), 0)).toBe(1);
      expect(flashBossFor([event], before, hurt(0), 1)).toBe(0);
    }
  });

  it('keeps the current boss when nothing struck a boss', () => {
    expect(flashBossFor(['dash', 'playerHit'], before, before, 1)).toBe(1);
    expect(flashBossFor([], before, before, 0)).toBe(0);
  });
});

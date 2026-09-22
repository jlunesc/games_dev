import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, TRAINEE } from '../src/bosses';
import { generateBoss } from '../src/bosses/generate/boss';
import { checkFairness } from '../src/bosses/generate/fairness';
import type { FairnessResult } from '../src/bosses/generate/fairness';
import { resolveBoss } from '../src/bosses/resolve';
import type { BossDef } from '../src/bosses/schema';

describe('resolveBoss', () => {
  it('returns the named boss unchanged for a known id', () => {
    expect(resolveBoss('ember-duelist', 1)).toEqual({ boss: EMBER_DUELIST, unfair: false });
    expect(resolveBoss('ashen-hound', 1)).toEqual({ boss: ASHEN_HOUND, unfair: false });
  });

  it('falls back to bossById default (EMBER_DUELIST) for an unknown id', () => {
    expect(resolveBoss('some-unknown-id', 1)).toEqual({ boss: EMBER_DUELIST, unfair: false });
  });

  it('is deterministic for "generated": same seed gives a deep-equal boss', () => {
    const a = resolveBoss('generated', 12345);
    const b = resolveBoss('generated', 12345);
    expect(b).toEqual(a);
  });

  it(
    'over a 100-seed sweep, every "generated" result is fair, or is the first candidate marked unfair',
    () => {
      for (let seed = 1; seed <= 100; seed++) {
        const { boss, unfair } = resolveBoss('generated', seed);
        if (unfair) {
          continue;
        }
        expect(checkFairness(boss).fair).toBe(true);
      }
    },
    // M6a: generated bosses can now draw an arena, and checkFairness's camp-safety simulation
    // over an arena is noticeably slower per candidate than the bare-boss case; a 100-seed sweep
    // (up to 3 candidates each) no longer reliably finishes within the old 30s budget.
    60000,
  );

  it(
    'does not mutate BOSSES or TRAINEE',
    () => {
      const bossesSnapshot = JSON.stringify(EMBER_DUELIST);
      const traineeSnapshot = JSON.stringify(TRAINEE);
      for (let seed = 1; seed <= 20; seed++) {
        resolveBoss('generated', seed);
        resolveBoss('ember-duelist', seed);
        resolveBoss('ashen-hound', seed);
      }
      expect(JSON.stringify(EMBER_DUELIST)).toBe(bossesSnapshot);
      expect(JSON.stringify(TRAINEE)).toBe(traineeSnapshot);
    },
    // Same reason as the sweep above: resolving 20 generated seeds now runs checkFairness over
    // arenas, which is slower than the pre-arena baseline the old default 5s timeout assumed.
    20000,
  );

  it('uses the first candidate anyway after exactly 3 failed candidates, marked unfair (injected checker)', () => {
    const seed = 999;
    const alwaysFail = (): FairnessResult => ({ fair: false, reasons: ['forced fail for test'] });
    let calls = 0;
    const countingAlwaysFail = (_boss: BossDef): FairnessResult => {
      calls++;
      return alwaysFail();
    };
    const result = resolveBoss('generated', seed, countingAlwaysFail);
    expect(result.unfair).toBe(true);
    expect(result.boss).toEqual(generateBoss(seed));
    expect(calls).toBe(3);
  });

  it('returns the first candidate that passes an injected always-pass checker', () => {
    const alwaysPass = (): FairnessResult => ({ fair: true, reasons: [] });
    const result = resolveBoss('generated', 42, alwaysPass);
    expect(result.unfair).toBe(false);
    expect(result.boss.id).toBe('generated');
  });
});

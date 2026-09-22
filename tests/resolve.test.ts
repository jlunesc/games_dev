import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST, TRAINEE } from '../src/bosses';
import { checkFairness } from '../src/bosses/generate/fairness';
import type { FairnessResult } from '../src/bosses/generate/fairness';
import { resolveBoss } from '../src/bosses/resolve';
import type { BossDef } from '../src/bosses/schema';

describe('resolveBoss', () => {
  it('returns the named boss unchanged for a known id', () => {
    expect(resolveBoss('ember-duelist', 1)).toEqual(EMBER_DUELIST);
    expect(resolveBoss('ashen-hound', 1)).toEqual(ASHEN_HOUND);
  });

  it('falls back to bossById default (EMBER_DUELIST) for an unknown id', () => {
    expect(resolveBoss('some-unknown-id', 1)).toEqual(EMBER_DUELIST);
  });

  it('is deterministic for "generated": same seed gives a deep-equal boss', () => {
    const a = resolveBoss('generated', 12345);
    const b = resolveBoss('generated', 12345);
    expect(b).toEqual(a);
  });

  it(
    'over a 100-seed sweep, every "generated" result is fair or equals TRAINEE',
    () => {
      let fallbackSeenInSweep = false;
      for (let seed = 1; seed <= 100; seed++) {
        const boss = resolveBoss('generated', seed);
        if (boss === TRAINEE || boss.id === TRAINEE.id) {
          fallbackSeenInSweep = true;
          continue;
        }
        expect(checkFairness(boss).fair).toBe(true);
      }
      // Not asserted true or false: the brief only asks us to note whether the sweep hits the
      // fallback naturally. See the focused injection test below for a deterministic proof.
      void fallbackSeenInSweep;
    },
    30000,
  );

  it('does not mutate BOSSES or TRAINEE', () => {
    const bossesSnapshot = JSON.stringify(EMBER_DUELIST);
    const traineeSnapshot = JSON.stringify(TRAINEE);
    for (let seed = 1; seed <= 20; seed++) {
      resolveBoss('generated', seed);
      resolveBoss('ember-duelist', seed);
      resolveBoss('ashen-hound', seed);
    }
    expect(JSON.stringify(EMBER_DUELIST)).toBe(bossesSnapshot);
    expect(JSON.stringify(TRAINEE)).toBe(traineeSnapshot);
  });

  it('falls back to TRAINEE deterministically after exactly 3 failed candidates (injected checker)', () => {
    const seed = 999;
    const alwaysFail = (): FairnessResult => ({ fair: false, reasons: ['forced fail for test'] });
    let calls = 0;
    const countingAlwaysFail = (_boss: BossDef): FairnessResult => {
      calls++;
      return alwaysFail();
    };
    const result = resolveBoss('generated', seed, countingAlwaysFail);
    expect(result).toEqual(TRAINEE);
    expect(calls).toBe(3);
  });

  it('returns the first candidate that passes an injected always-pass checker', () => {
    const alwaysPass = (): FairnessResult => ({ fair: true, reasons: [] });
    const result = resolveBoss('generated', 42, alwaysPass);
    expect(result).not.toEqual(TRAINEE);
    expect(result.id).toBe('generated');
  });
});

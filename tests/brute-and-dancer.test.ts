import { describe, expect, it } from 'vitest';
import { TREMOR_BRUTE, VEIL_DANCER } from '../src/bosses';
import { GEN } from '../src/bosses/generate/tuning';
import { BRUTE_AND_DANCER } from '../src/bosses/pairs';
import { resolveFight } from '../src/bosses/resolve';
import { NORMAL_DIALS, applyDialsToFight, presetDials, type PresetId } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { PLAYER, WORLD } from '../src/game/params';
import { allBosses, createInitialState } from '../src/game/state';
import { holdsTurn } from '../src/game/turns';
import { NO_INPUT, chaser, play, stand } from './pair-helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const PRESETS: PresetId[] = ['easy', 'normal', 'hard'];
const LONG_RUN = 3600;
const CHASE_CAP = 10800;

const pairFight = (seed: number, preset: PresetId = 'normal'): FightDef =>
  applyDialsToFight(resolveFight(BRUTE_AND_DANCER.id, seed).fight, presetDials(preset));

describe('the Brute and Dancer pair file', () => {
  it('is found by id and fights the Brute first, then the Dancer, each with less health than alone', () => {
    const { fight } = resolveFight('brute-and-dancer', 1);
    expect(BRUTE_AND_DANCER.id).toBe('brute-and-dancer');
    expect(fight.bosses.map((b) => b.id)).toEqual([TREMOR_BRUTE.id, VEIL_DANCER.id]);
    expect(fight.bosses[0]!.maxHp).toBeGreaterThanOrEqual(1);
    expect(fight.bosses[0]!.maxHp).toBeLessThan(TREMOR_BRUTE.maxHp);
    expect(fight.bosses[1]!.maxHp).toBeGreaterThanOrEqual(1);
    expect(fight.bosses[1]!.maxHp).toBeLessThan(VEIL_DANCER.maxHp);
    expect(fight.enrage).not.toBeNull();
  });

  it('is the same fight at Normal difficulty as the file gives', () => {
    const { fight } = resolveFight('brute-and-dancer', 1);
    expect(applyDialsToFight(fight, NORMAL_DIALS)).toEqual(fight);
  });

  it('makes the survivor wait at least a quarter of a second and leaves its warnings unchanged', () => {
    const fight = resolveFight('brute-and-dancer', 1).fight;
    fight.enraged.forEach((boss, i) => {
      for (const phase of boss.phases) expect(phase.gap).toBeGreaterThanOrEqual(15);
      expect(boss.attacks.map((a) => a.windup)).toEqual(fight.bosses[i]!.attacks.map((a) => a.windup));
    });
  });
});

describe('an idle player always loses to the pair', () => {
  it('at every preset and seed, within the same cap the boss generator uses', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        const fight = pairFight(seed, preset);
        const end = play(fight, createInitialState(fight, seed), GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `${preset} seed ${seed}`).toBe('defeated');
      }
    }
  });

  it('standing still in either corner', () => {
    for (const x of [30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const fight = pairFight(seed);
        const end = play(fight, stand(fight, seed, x), GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `x ${x} seed ${seed}`).toBe('defeated');
      }
    }
  });

  it('after the Dancer has fallen and the Brute is enraged, and the other way round', () => {
    for (const fallen of [0, 1]) {
      for (const seed of [1, 2, 3, 4]) {
        const fight = pairFight(seed);
        const start = createInitialState(fight, seed);
        allBosses(start)[fallen]!.hp = 0;
        const end = play(fight, start, GEN.fairnessCapTicks, () => NO_INPUT);
        expect(end.phase, `fallen ${fallen} seed ${seed}`).toBe('defeated');
      }
    }
  });
});

describe('the turn rule over whole runs of the real pair', () => {
  /** A player who cannot be beaten and never moves, so the bosses keep attacking for a full minute. */
  function watch(seed: number, x: number) {
    const fight = pairFight(seed);
    let bothAttacking = 0;
    let bothHolding = 0;
    const attackStarts = [0, 0];
    let last = allBosses(createInitialState(fight, seed)).map((b) => b.mode);
    const end = play(fight, stand(fight, seed, x, 1_000_000), LONG_RUN, () => NO_INPUT, (s) => {
      const bosses = allBosses(s);
      if (bosses.filter((b) => b.mode === 'attack').length > 1) bothAttacking++;
      if (bosses.filter((_, i) => holdsTurn(s, i)).length > 1) bothHolding++;
      bosses.forEach((b, i) => {
        if (b.mode === 'attack' && last[i] !== 'attack') attackStarts[i]!++;
      });
      last = bosses.map((b) => b.mode);
    });
    return { end, bothAttacking, bothHolding, attackStarts };
  }

  it('never has two bosses attacking, or two holding the turn, on the same update', () => {
    for (const x of [PLAYER.startX, 30, WORLD.width - 30]) {
      for (const seed of [1, 2, 3, 4]) {
        const r = watch(seed, x);
        expect(r.bothAttacking, `attacking, x ${x} seed ${seed}`).toBe(0);
        expect(r.bothHolding, `holding, x ${x} seed ${seed}`).toBe(0);
      }
    }
  });

  it('gives each boss its turn: both attack again and again, neither starves', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = watch(seed, PLAYER.startX);
      expect(r.end.phase).toBe('fight');
      expect(r.attackStarts[0], `Brute, seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(r.attackStarts[1], `Dancer, seed ${seed}`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('the pair can be beaten', () => {
  it('a player who cannot die, chases the nearest boss and swings ends in victory with both bosses at zero', () => {
    for (const seed of [1, 2, 3, 4]) {
      const fight = pairFight(seed);
      const end = play(fight, stand(fight, seed, PLAYER.startX, 1_000_000), CHASE_CAP, chaser);
      expect(end.phase, `seed ${seed}`).toBe('victory');
      expect(allBosses(end).every((b) => b.hp <= 0)).toBe(true);
    }
  });
});

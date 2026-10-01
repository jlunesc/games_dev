import { describe, expect, it } from 'vitest';
import { GEN } from '../src/bosses/generate/tuning';
import { PAIRS } from '../src/bosses/pairs';
import { resolveFight } from '../src/bosses/resolve';
import { applyDialsToFight, presetDials, type PresetId } from '../src/game/difficulty';
import type { FightDef } from '../src/game/fight';
import { allBosses, createInitialState, type GameState } from '../src/game/state';
import { NO_INPUT, chaser, play } from './pair-helpers';

const SEEDS = [1, 2, 3, 4];
const PRESETS: PresetId[] = ['easy', 'normal', 'hard'];
const CHASE_CAP = 10800;

const pairFight = (id: string, seed: number, preset: PresetId): FightDef =>
  applyDialsToFight(resolveFight(id, seed).fight, presetDials(preset));

/** A fight whose bosses are all already in their second phase, at the health that phase starts from. */
function inSecondPhase(fight: FightDef, seed: number): GameState {
  const s = createInitialState(fight, seed);
  allBosses(s).forEach((b, i) => {
    b.phase = 1;
    b.hp = Math.max(1, Math.floor(fight.bosses[i]!.maxHp * fight.bosses[i]!.phases[1]!.startsAtHpFraction));
  });
  return s;
}

describe('every pair, with both bosses in their second phase', () => {
  for (const pair of PAIRS) {
    it(`${pair.id}: an idle player still loses, at every preset and seed`, () => {
      for (const preset of PRESETS) {
        for (const seed of SEEDS) {
          const fight = pairFight(pair.id, seed, preset);
          const end = play(fight, inSecondPhase(fight, seed), GEN.fairnessCapTicks, () => NO_INPUT);
          expect(end.phase, `${preset} seed ${seed}`).toBe('defeated');
        }
      }
    });

    it(`${pair.id}: a player who only chases and swings ends the fight, never stalls it`, () => {
      for (const seed of SEEDS) {
        const fight = pairFight(pair.id, seed, 'normal');
        const end = play(fight, inSecondPhase(fight, seed), CHASE_CAP, chaser);
        expect(end.phase, `seed ${seed}`).not.toBe('fight');
      }
    });
  }
});

import { resolveFight } from '../bosses/resolve';
import { applyDialsToFight, type Dials } from '../game/difficulty';
import type { FightDef } from '../game/fight';
import type { StudySetting } from './prefs';

/** Everything the app needs to start a fight from the Boss row choice. */
export interface FightSetup {
  fight: FightDef;
  /** True for a generated boss that could not be checked as fair (the app shows a banner). */
  unfair: boolean;
  /** The study the fight really runs with: a pair has none. */
  study: StudySetting;
  /** The id the record stores: the pair id for a pair, the boss's own id otherwise (`'generated'` for a generated boss). */
  recordBossId: string;
}

export function setUpFight(bossId: string, seed: number, dials: Dials, study: StudySetting): FightSetup {
  const resolved = resolveFight(bossId, seed);
  const fight = applyDialsToFight(resolved.fight, dials);
  const paired = fight.bosses.length > 1;
  return {
    fight,
    unfair: resolved.unfair,
    study: paired ? 0 : study,
    recordBossId: paired ? bossId : fight.bosses[0]!.id,
  };
}

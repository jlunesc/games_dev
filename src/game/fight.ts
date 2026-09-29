import type { BossDef } from '../bosses/schema';

/** How much angrier the survivor gets when its partner falls: its waits are multiplied by `gapScale` (below 1 is shorter), its walking speed by `walkScale`. */
export interface EnrageDef {
  gapScale: number;
  walkScale: number;
}

/** Who fights: index 0 is the primary boss (the one `GameState.boss` holds), the rest are its partners. */
export interface FightDef {
  bosses: readonly BossDef[];
  enrage: EnrageDef | null;
  /** `enraged[i]` is the boosted copy of `bosses[i]` the boss uses once a partner is down; the same object when there is no enrage. */
  enraged: readonly BossDef[];
}

/** A copy of the boss with shorter waits and faster walking. The boss file itself is not changed. */
export function enrageBoss(boss: BossDef, enrage: EnrageDef): BossDef {
  return {
    ...boss,
    phases: boss.phases.map((phase) => ({
      ...phase,
      gap: Math.max(1, Math.round(phase.gap * enrage.gapScale)),
      walkSpeed: phase.walkSpeed * enrage.walkScale,
      retreatSpeed: phase.retreatSpeed * enrage.walkScale,
    })),
  };
}

export function makeFight(bosses: readonly BossDef[], enrage: EnrageDef | null = null): FightDef {
  if (bosses.length === 0) throw new Error('A fight needs at least one boss');
  return {
    bosses,
    enrage,
    enraged: enrage === null ? bosses : bosses.map((boss) => enrageBoss(boss, enrage)),
  };
}

/** A plain boss is a fight of one; a fight is left as it is. */
export function asFight(source: BossDef | FightDef): FightDef {
  return 'bosses' in source ? source : { bosses: [source], enrage: null, enraged: [source] };
}

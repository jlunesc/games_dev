import type { ArenaDef, AttackDef, BossDef, ShotDef } from '../src/bosses/schema';
import { DUELIST } from './helpers';

export const bolt = (over: Partial<Extract<ShotDef, { kind: 'bolt' }>> = {}): ShotDef => ({
  kind: 'bolt',
  at: 20,
  height: 0,
  size: 30,
  speed: 600,
  ...over,
});

export const arc = (over: Partial<Extract<ShotDef, { kind: 'arc' }>> = {}): ShotDef => ({
  kind: 'arc',
  at: 20,
  flight: 40,
  peak: 250,
  target: 'player',
  radius: 60,
  burst: 6,
  ...over,
});

/** An attack that only fires `shots` (wind-up 20, active 8, recovery 20), usable from any distance. */
export const shootingAttack = (shots: ShotDef[], over: Partial<AttackDef> = {}): AttackDef => ({
  id: 'shoot',
  name: 'Shoot',
  pose: 'sideways',
  class: 'mustDodge',
  damage: 1,
  windup: 20,
  active: 8,
  recovery: 20,
  range: { min: 0, max: 1e9 },
  hits: [],
  shots,
  ...over,
});

/** A boss that only ever uses the `shoot` attack again and again, never walking, in one phase. */
export function shooter(shots: ShotDef[], arena?: ArenaDef, over: Partial<AttackDef> = {}): BossDef {
  return {
    ...DUELIST,
    spacing: { min: 0, max: 1e9 },
    attacks: [shootingAttack(shots, over)],
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: [{ id: 'shoot', weight: 1 }],
        gap: 1,
        maxChain: 1,
        chainChance: 0,
        walkSpeed: DUELIST.phases[0]!.walkSpeed,
        retreatSpeed: DUELIST.phases[0]!.retreatSpeed,
      },
    ],
    ...(arena === undefined ? {} : { arena }),
  };
}

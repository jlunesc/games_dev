import type { AttackDef, PhaseAttack, PhaseDef } from '../schema';
import { type Draw, uniform, uniformInt } from './draw';
import { GEN } from './tuning';

/** The four ways a second-phase attack can differ from the first-phase attack it is made from. */
export type TwistKind = 'snap' | 'reach' | 'followUp' | 'delay';

const TWIST_KINDS: readonly TwistKind[] = ['snap', 'reach', 'followUp', 'delay'];

/** The shortest wind-up a snapped copy of `attack` may have: the generator's own readability floor for that kind of attack. */
function snapFloor(attack: AttackDef): number {
  const fast = attack.leap !== undefined || (attack.move !== undefined && attack.move.speed >= GEN.moveFastSpeed);
  return fast ? GEN.leapWindupMin : GEN.windupMin;
}

function snappedWindup(attack: AttackDef): number {
  return Math.max(snapFloor(attack), Math.round(attack.windup * GEN.snapFactor));
}

const canSnap = (attack: AttackDef): boolean => attack.windup - snappedWindup(attack) >= GEN.snapMinCut;
const canDelay = (attack: AttackDef): boolean =>
  attack.shots === undefined && attack.hold === undefined && attack.blink === undefined && attack.windup >= 2;

/** The same attack with the wind-up cut: every later time moves up by the same number of updates. */
function snap(attack: AttackDef, id: string): AttackDef {
  const windup = snappedWindup(attack);
  const cut = attack.windup - windup;
  const copy = structuredClone(attack);
  copy.id = id;
  copy.name = id;
  copy.windup = windup;
  for (const h of copy.hits) {
    h.from -= cut;
    h.to -= cut;
  }
  if (copy.move !== undefined) {
    copy.move.from -= cut;
    copy.move.to -= cut;
  }
  if (copy.leap !== undefined) {
    copy.leap.from -= cut;
    copy.leap.to -= cut;
  }
  for (const shot of copy.shots ?? []) shot.at -= cut;
  return copy;
}

/** The same attack reaching further: wider hit boxes and bigger shots, and it starts from a little further away. */
function reach(attack: AttackDef, id: string): AttackDef {
  const copy = structuredClone(attack);
  copy.id = id;
  copy.name = id;
  copy.range.max = Math.round(copy.range.max * GEN.reachRangeFactor);
  for (const h of copy.hits) h.x1 = Math.round(h.x1 * GEN.reachFactor);
  for (const shot of copy.shots ?? []) {
    if (shot.kind === 'bolt') shot.size = Math.min(GEN.reachBoltSizeCap, Math.round(shot.size * GEN.reachFactor));
    else if (shot.kind === 'arc') shot.radius = Math.min(GEN.reachArcRadiusCap, Math.round(shot.radius * GEN.reachFactor));
    else shot.width = Math.min(GEN.reachEruptionWidthCap, Math.round(shot.width * GEN.reachFactor));
  }
  return copy;
}

/** The same attack with the strike held back by a random number of updates up to `hold`, so it cannot be timed by counting. */
function delay(attack: AttackDef, id: string, hold: number): AttackDef {
  const copy = structuredClone(attack);
  copy.id = id;
  copy.name = id;
  copy.hold = hold;
  return copy;
}

export interface SecondPhase {
  /** The attack made for the second phase, to add to the boss's attacks; absent for a follow-up (a combo of existing attacks). */
  attack?: AttackDef;
  phase: PhaseDef;
  twist: TwistKind;
}

/**
 * The second phase of a generated boss: the first phase's attacks plus one twist (a copy of one of its attacks that is
 * snappier, reaches further, is held late, or is followed at once by a second strike), a shorter gap, longer chains and a
 * faster walk. The counterable attack is never
 * twisted (its counter window belongs to its own wind-up). Deterministic in `state`; always draws the same three values.
 */
export function generateSecondPhase(
  state: number,
  attacks: readonly AttackDef[],
  first: PhaseDef,
  newId: string,
): Draw<SecondPhase> {
  const kindDraw = uniformInt(state, 0, TWIST_KINDS.length - 1);
  const baseDraw = uniform(kindDraw.state, 0, 1);
  const holdDraw = uniformInt(baseDraw.state, GEN.holdMin, GEN.holdMax);

  const strikes = attacks.filter((a) => a.class === 'mustDodge');
  const fits = (kind: TwistKind): AttackDef[] => {
    if (kind === 'snap') return strikes.filter(canSnap);
    if (kind === 'delay') return strikes.filter(canDelay);
    if (kind === 'followUp') return strikes.length >= 2 ? strikes : [];
    return strikes;
  };

  // A boss has at least two must-dodge attacks, so a reach twist always fits: the loop ends at the latest on it.
  let twist: TwistKind = 'reach';
  let candidates: AttackDef[] = strikes;
  for (let i = 0; i < TWIST_KINDS.length; i++) {
    const kind = TWIST_KINDS[(kindDraw.value + i) % TWIST_KINDS.length]!;
    const found = fits(kind);
    if (found.length > 0) {
      twist = kind;
      candidates = found;
      break;
    }
  }

  const phase: PhaseDef = {
    name: 'Second phase',
    startsAtHpFraction: GEN.phase2Start,
    attacks: first.attacks.map((a): PhaseAttack => ({ ...a })),
    gap: Math.max(GEN.phase2GapMin, Math.round(first.gap * GEN.phase2GapFactor)),
    maxChain: Math.max(GEN.phase2ChainMin, first.maxChain),
    chainChance: Math.max(GEN.phase2ChainChanceMin, first.chainChance),
    walkSpeed: Math.round(first.walkSpeed * GEN.phase2WalkFactor),
    retreatSpeed: Math.round(first.retreatSpeed * GEN.phase2WalkFactor),
  };
  const base = candidates[Math.min(candidates.length - 1, Math.floor(baseDraw.value * candidates.length))]!;

  if (twist === 'followUp') {
    // The second strike is another must-dodge attack, one a bot-sized player can read: not a shot if there is another.
    const others = strikes.filter((a) => a.id !== base.id);
    const second = others.find((a) => a.shots === undefined) ?? others[0]!;
    phase.attacks = phase.attacks.map((a) => (a.id === base.id ? { ...a, weight: GEN.twistWeight } : a));
    phase.combos = [[base.id, second.id]];
    return { value: { phase, twist }, state: holdDraw.state };
  }

  const attack = twist === 'snap' ? snap(base, newId) : twist === 'reach' ? reach(base, newId) : delay(base, newId, holdDraw.value);
  phase.attacks = [...phase.attacks, { id: newId, weight: GEN.twistWeight }];
  phase.opening = newId;
  return { value: { attack, phase, twist }, state: holdDraw.state };
}

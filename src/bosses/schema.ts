/** The arm pose shown while an attack winds up; it tells the player which attack is coming. */
export type Pose = 'raised' | 'sideways' | 'back' | 'down' | 'crouch';

/** Counterable attacks glow gold and can be countered; must-dodge attacks glow red. */
export type AttackClass = 'counterable' | 'mustDodge';

/**
 * A box that hurts the player. Times are updates counted from the attack's first update (0);
 * it is active while `from <= t < to`. Distances are measured from the boss's centre in the direction
 * it faces (`x0` near edge, `x1` far edge); `bottom` and `top` are heights above the floor.
 */
export interface HitWindow {
  from: number;
  to: number;
  x0: number;
  x1: number;
  bottom: number;
  top: number;
}

/**
 * The boss moves at `speed` units per second while `from <= t < to`: `forward` (the way it faces) when
 * `dir` is absent or `'forward'`, or `'back'` (away from the way it faces, still facing forward).
 */
export interface AttackMove {
  from: number;
  to: number;
  speed: number;
  dir?: 'forward' | 'back';
}

/** Where a leap lands: at the player's x when the leap starts, or a fixed distance forward or back of the boss. */
export type LeapTarget = 'player' | 'forward' | 'back';

/**
 * The boss leaps in an arc while `from <= t < to`, peaking `height` units above the floor. The landing x is
 * fixed when the leap starts (update `from`): the player's x for `'player'`, or `distance` units forward or
 * back of the boss for `'forward'` and `'back'` (`distance` is absent for `'player'`).
 */
export interface LeapDef {
  from: number;
  to: number;
  height: number;
  target: LeapTarget;
  distance?: number;
}

export interface AttackDef {
  id: string;
  name: string;
  pose: Pose;
  class: AttackClass;
  /** How many of the player's hits this attack costs when it lands (a whole number, 1 when a file does not say). */
  damage: number;
  windup: number;
  active: number;
  recovery: number;
  /** Distance from the player (centre to centre) at which the boss starts this attack. */
  range: { min: number; max: number };
  move?: AttackMove;
  leap?: LeapDef;
  /** May be empty only when the attack has a `move` or a `leap` (a reposition-only attack). */
  hits: HitWindow[];
}

export interface PhaseAttack {
  id: string;
  weight: number;
}

export interface PhaseDef {
  name: string;
  /** The phase begins when health falls to this fraction of the maximum or below (1 for the first phase). */
  startsAtHpFraction: number;
  attacks: PhaseAttack[];
  /** The attack the boss opens with when this phase begins (after the powering-up pause). */
  opening?: string;
  /** Updates the boss waits (walking and keeping its distance) before choosing its next attack. */
  gap: number;
  /** Attacks in a chain, in total: the first plus `maxChain - 1` follow-ups with no gap between them. 1 means never chain. */
  maxChain: number;
  /** Chance, rolled once per attack, that it starts a chain: on success the boss does exactly `maxChain` attacks in a row. */
  chainChance: number;
  walkSpeed: number;
  retreatSpeed: number;
}

export interface CounterDef {
  /** The last `window` updates of a counterable attack's wind-up in which a counter works. */
  window: number;
  /** How close (centre to centre) the player must be. */
  range: number;
  staggerTicks: number;
  damageMultiplier: number;
}

export interface BossDef {
  id: string;
  name: string;
  width: number;
  height: number;
  startX: number;
  maxHp: number;
  /** The distance the boss tries to keep from the player while it waits. */
  spacing: { min: number; max: number };
  /** Updates the boss may spend walking into an attack's range before it starts the attack anyway. */
  approachTimeout: number;
  /** 0 picks attacks by weighted random, 1 cycles through the phase's list in order. */
  predictability: number;
  counter: CounterDef;
  /** Length of the powering-up pause between phases, in which the boss cannot be hurt. */
  transitionTicks: number;
  attacks: AttackDef[];
  phases: PhaseDef[];
}

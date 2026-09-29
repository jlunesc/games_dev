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
  /** True: the same box also covers the mirrored side behind the boss (a spin that hurts both sides). */
  both?: boolean;
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
  /**
   * Updates the boss stays at the top of the leap, hovering, out of the `to - from` flight (it rises, hangs, then falls,
   * and slides along to the landing x the whole time). Absent means the plain arc. At most `to - from - 2`.
   */
  hang?: number;
}

/** `plunge`: drops onto the target and stays low. `swoop`: dives, skims along the floor, then climbs back to where it started. */
export type DiveShape = 'plunge' | 'swoop';

/**
 * A dive, for a boss that flies (`BossDef.flight`): from update `from` to `to` it moves from wherever it hangs to a
 * landing x fixed at update `from` (`target` and `distance` work as for a leap). A plunge falls, faster and faster, to
 * the floor and stays there (the boss rises again only after the attack ends). A swoop falls for a while, skims the
 * floor for `low` updates, then climbs back to the height it started from, sliding along the whole time.
 */
export interface DiveDef {
  from: number;
  to: number;
  shape: DiveShape;
  target: LeapTarget;
  distance?: number;
  /** Updates spent at floor level (a swoop only): the rest of the flight is split into the fall and the climb. */
  low?: number;
}

/**
 * A bolt: appears at the boss's edge at update `at` (counted like hit windows) and flies the way the boss faces (or
 * the opposite way for `dir: 'back'`). `height` is its bottom edge above the boss's feet (the floor for a boss on the
 * floor), `size` the side of its square, `speed` in units per second. With `aim` it flies in a straight line at the
 * player's body as it was at update `at` (it can fly down from a hovering boss); `speed` is then its speed along that line.
 */
export interface BoltDef {
  kind: 'bolt';
  at: number;
  height: number;
  size: number;
  speed: number;
  dir?: 'forward' | 'back';
  aim?: boolean;
}

/**
 * A lobbed arc: launched at update `at`, it lands `flight` updates later on an x fixed at launch (the same targeting
 * as a leap), peaking `peak` units above the floor. Only its landing burst hurts: `radius` either side of the landing
 * x, for `burst` updates. A red mark shows on the floor from launch until the burst ends.
 */
export interface ArcDef {
  kind: 'arc';
  at: number;
  flight: number;
  peak: number;
  target: LeapTarget;
  distance?: number;
  radius: number;
  burst: number;
}

/**
 * A floor eruption: at update `at` a red mark appears on the floor, centred on the player's x at that moment plus
 * `offset` (fixed from then on). `delay` updates later a blast fills the mark's `width` from the floor up for
 * `burst` updates.
 */
export interface EruptionDef {
  kind: 'eruption';
  at: number;
  offset: number;
  width: number;
  delay: number;
  burst: number;
}

export type ShotDef = BoltDef | ArcDef | EruptionDef;

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
  /** A dive. Only for a boss with `flight`; an attack may not have both a `leap` and a `dive`. */
  dive?: DiveDef;
  /** Shots fired during the active updates; they outlive the attack. Only a `mustDodge` attack may have them. */
  shots?: ShotDef[];
  /** May be empty only when the attack has a `move`, a `leap` or `shots` (a reposition-only or shooting attack). */
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

/** One standing piece of the arena, a platform or a cover: centred on `x`, `width` wide, `height` tall. */
export interface ArenaPiece {
  x: number;
  width: number;
  height: number;
}

/** Extra scenery for a fight. Both lists are always present once parsed (empty when the file omits one). */
export interface ArenaDef {
  platforms: ArenaPiece[];
  covers: ArenaPiece[];
}

/**
 * A boss that stays in the air: it starts, and rests between attacks, `height` units above the floor (high enough that
 * no swing reaches it), and climbs back to that height at `rise` units per second whenever it is lower and not
 * attacking. It can only be hit while it is low, after a dive.
 */
export interface FlightDef {
  height: number;
  rise: number;
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
  /** Present for a boss that flies (see `FlightDef`); absent for a boss that walks. */
  flight?: FlightDef;
  /** Platforms and cover in the arena. Absent means a bare arena. */
  arena?: ArenaDef;
}

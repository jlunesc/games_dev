/**
 * Tuning ranges for the boss generator. All in one place, all a single change to retune.
 * See `docs/superpowers/specs/2026-09-22-m5e-generator-design.md` for the reasoning behind
 * each range (the readability floor in particular).
 */
export const GEN = {
  /** Wind-up floor for every generated attack: 18 updates (300 ms at 60 updates/s). */
  windupMin: 18,
  windupMax: 40,
  /**
   * Wind-up floor for an attack whose effect is a `leap`, or a `move` whose `speed` is at or
   * above `moveFastSpeed`: 21 updates (350 ms). Their danger starts later than the pose.
   */
  leapWindupMin: 21,

  activeMin: 4,
  activeMax: 20,

  recoveryMin: 12,
  recoveryMax: 36,

  hitX0Max: 40,
  hitSpanMin: 80,
  hitSpanMax: 260,
  hitTopMin: 50,
  hitTopMax: 190,

  moveSpeedMin: 900,
  moveSpeedMax: 1700,
  /** At or above this speed a dash counts as "fast" and raises the wind-up floor. */
  moveFastSpeed: 1300,
  moveDurationMin: 8,
  moveDurationMax: 16,

  leapHeightMin: 120,
  leapHeightMax: 260,
  leapFlightMin: 16,
  leapFlightMax: 26,
  leapDistanceMin: 200,
  leapDistanceMax: 400,

  /**
   * Shots and eruptions (first guesses, tune from play). A shot attack can start from a distance, so its
   * range opens at 0 and reaches `shotRangeBonus` further than a strike's would.
   */
  shotRangeBonus: 250,
  /** Bolt volley: how many bolts, the gap between them (updates), and each bolt's size and speed. */
  boltCountMin: 1,
  boltCountMax: 3,
  boltGapMin: 6,
  boltGapMax: 9,
  /** All heights are below the top of a standing player (96), so a forward bolt always threatens an idle player. */
  boltHeightMin: 0,
  boltHeightMax: 80,
  boltSizeMin: 24,
  boltSizeMax: 40,
  boltSpeedMin: 450,
  boltSpeedMax: 800,
  /** Chance a bolt after the first is aimed at the player, and (of the rest) fired backward. */
  boltAimChance: 0.25,
  boltBackChance: 0.15,
  /** Lobbed arc that lands on the player's spot at launch. */
  arcFlightMin: 30,
  arcFlightMax: 50,
  arcPeakMin: 200,
  arcPeakMax: 320,
  arcRadiusMin: 60,
  arcRadiusMax: 90,
  arcBurstMin: 6,
  arcBurstMax: 10,
  /** Floor eruptions: the first mark is under the player; extra marks sit to either side of the player's spot. */
  eruptionCountMin: 1,
  eruptionCountMax: 3,
  eruptionGapMin: 4,
  eruptionGapMax: 9,
  eruptionWidthMin: 120,
  eruptionWidthMax: 180,
  /** The mark shows for this many updates before the blast: the warning the player has to leave it. */
  eruptionDelayMin: 26,
  eruptionDelayMax: 44,
  eruptionBurstMin: 6,
  eruptionBurstMax: 10,
  eruptionSideMin: 200,
  eruptionSideMax: 340,

  rangeMinMin: 40,
  rangeMinMax: 240,
  rangeSpanMin: 120,
  rangeSpanMax: 260,

  maxHpMin: 20,
  maxHpMax: 40,

  spacingMinMin: 100,
  spacingMinMax: 200,
  spacingSpan: 100,

  walkSpeedMin: 260,
  walkSpeedMax: 420,

  gapMin: 35,
  gapMax: 60,

  maxChainMin: 1,
  maxChainMax: 2,
  chainChanceMax: 0.3,

  predictabilityMin: 0.1,
  predictabilityMax: 0.3,

  approachTimeoutMin: 40,
  approachTimeoutMax: 50,

  attackCountMin: 3,
  attackCountMax: 5,

  counterWindowMin: 8,
  counterWindowMax: 14,
  counterRangeMin: 160,
  counterRangeMax: 220,
  staggerTicksMin: 70,
  staggerTicksMax: 100,

  bodyMin: 60,
  bodyMax: 110,

  /** Two fixed seeds for the fairness checker's own bots, never derived from the boss being checked. */
  fairnessSeeds: [11, 97],
  /** Update cap for the idle bot's run. */
  fairnessCapTicks: 3000,
  /** Update cap for the skilled bot's run (two phases take it up to about 4,000 updates when it does win). */
  fairnessSkilledCapTicks: 6000,
  /** Chance a generated boss's arena is bare (no pieces at all), like the Ember Duelist. */
  arenaBareChance: 0.4,
  arenaPieceCountMin: 1,
  arenaPieceCountMax: 3,
  /** Minimum height gap required between any two pieces in the same arena (the Ashen Hound's own
   * gap, 10, is what read as "crowded" — this is deliberately much larger). */
  arenaMinHeightGap: 90,
  arenaZoneJitterMax: 40,
  arenaPlatformWidthMin: 140,
  arenaPlatformWidthMax: 260,
  arenaCoverWidthMin: 50,
  arenaCoverWidthMax: 110,
  arenaPlatformHeightMin: 40,
  arenaPlatformHeightMax: 260,
  /** Capped below the ~163-unit jump height (docs/bosses.md, "Cover is a wall below its top") so a
   * generated cover is always jumpable, never a true wall. */
  arenaCoverHeightMin: 40,
  arenaCoverHeightMax: 160,

  /**
   * The second phase (first guesses, tune from play). It begins at half health, with a shorter gap, longer chains
   * and a faster walk, and one twist: a copy of a first-phase attack that is snappier, reaches further, is held late,
   * or is followed at once by a second strike. The twist is drawn `twistWeight` times as often as any other attack.
   */
  phase2Start: 0.5,
  phase2GapFactor: 0.7,
  phase2GapMin: 20,
  phase2ChainMin: 2,
  phase2ChainChanceMin: 0.35,
  phase2WalkFactor: 1.2,
  twistWeight: 3,
  /** Snap: the wind-up shrinks to this share, never below the readability floor, and only when it loses at least `snapMinCut` updates. */
  snapFactor: 0.65,
  snapMinCut: 4,
  /** Reach: hit boxes grow by `reachFactor`, the distance it starts from by `reachRangeFactor`; shots stop at the format's limits. */
  reachFactor: 1.3,
  reachRangeFactor: 1.2,
  reachBoltSizeCap: 80,
  reachArcRadiusCap: 200,
  reachEruptionWidthCap: 600,
  /** Delay: the strike is held back by up to this many updates (drawn per boss). */
  holdMin: 8,
  holdMax: 14,
} as const;

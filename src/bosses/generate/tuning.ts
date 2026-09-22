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
} as const;

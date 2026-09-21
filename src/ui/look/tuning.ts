/**
 * Every colour and number the looks use, in one place, so the owner can tweak the feel without hunting.
 * Purely cosmetic: nothing here changes how a fight plays. Times are in ticks (60 per second), lengths in
 * world units (the world is 16:9), speeds in world units per second unless a name says "PerTick".
 */
export const LOOK = {
  // ---- Impact effects: caps and how many of each thing a moment spawns ----
  maxParticles: 160,
  maxRings: 12,
  sparksOnBossHit: 8,
  sparksOnPlayerHit: 10,
  sparksOnCounter: 14,
  sparksOnStudyHit: 4,
  dustOnLand: 5,
  dustOnDash: 4,
  trailOnDash: 6,
  burstOnDefeat: 40,

  // ---- Effect colours ----
  spark: '#ffe9a8',
  counterRing: '#f5c542',
  hurtSpark: '#ff4a44',
  dust: '#b9b3a6',
  trail: '#7fd6ff',
  shockwave: '#ff9a4a',
  phaseRing: '#ffffff',
  burst: '#ffd27a',
  burstAlt: '#ff6a3a',

  // ---- Particle motion ----
  /** How long each kind lives, in ticks. */
  particleLifeTicks: { spark: 22, dust: 30, trail: 16, burst: 46 },
  /** Spark launch speed range, world units per second. */
  sparkSpeedMin: 140,
  sparkSpeedMax: 420,
  dustSpeedMin: 30,
  dustSpeedMax: 120,
  burstSpeedMin: 120,
  burstSpeedMax: 520,
  /** Downward pull on sparks and dust, world units per second squared. Trails do not fall. */
  gravity: 900,
  sparkSize: 5,
  dustSize: 9,
  trailSize: 12,
  burstSize: 7,
  /** Fraction of speed kept each tick (1 = no drag). */
  drag: 0.97,

  // ---- Rings ----
  ringGrowthPerTick: 5,
  ringLifeTicks: 22,
  ringWidth: 4,
  ringStartRadius: 10,
  bigRingGrowthPerTick: 9,
  bigRingLifeTicks: 34,
  bigRingWidth: 6,
  smallRingGrowthPerTick: 3,
  smallRingLifeTicks: 14,
  smallRingWidth: 3,
  shockwaveGrowthPerTick: 12,
  shockwaveLifeTicks: 26,

  // ---- Dash trail ----
  /** Distance between trail puffs along the dash path, world units. */
  dashTrailSpacing: 28,
  trailAlpha: 0.55,

  // ---- Background ----
  /** Default drift speeds for the far, middle and near layers, world units per second. Moods may differ. */
  layerSpeeds: [4, 10, 22],
  /** How far past each world edge a layer is drawn so the drift never shows a gap, world units. */
  layerMargin: 480,
  emberCount: 26,
  /** Ember rise speed, world units per second. */
  emberRiseSpeed: 22,
  /** Sideways sway: how far, world units, and how fast, radians per second. */
  emberSwayAmplitude: 26,
  emberSwaySpeed: 0.9,
  emberSizeMin: 2,
  emberSizeMax: 5,
  emberAlphaMin: 0.25,
  emberAlphaMax: 0.9,
  emberPulseSpeed: 1.6,
  layerAlpha: 1,

  // ---- Figures: the player ----
  headRadius: 13,
  capeLength: 34,
  capeSway: 6,
  legSwing: 14,
  /** Ticks for one full step cycle while running. */
  legCycleTicks: 24,
  legTuck: 10,
  bobAmplitude: 3,
  breatheAmplitude: 2,
  breatheTicks: 90,
  leanDash: 12,
  leanSwing: 8,
  leanWindup: 10,
  playerBody: '#e8e8f0',
  playerAccent: '#7fd6ff',
  playerDashAccent: '#7fd6ff',

  // ---- Figures: bosses ----
  bossHeadRadius: 16,
  bossTailLength: 60,
  bossSnoutLength: 30,
  bossBladeLength: 46,
  bossLegSwing: 18,
  bossBobAmplitude: 4,
  bossBreatheAmplitude: 3,
  bossLeanWindup: 14,
  bossCrouchDrop: 26,
  bossFigureMargin: 24,

  // ---- Floor, platforms and cover (copied from the old render.ts colours) ----
  floor: '#2a2a3a',
  floorLine: '#8a8aa0',
  platformBody: '#4b4b6e',
  platformGlow: '#8fa8ff',
  coverBody: '#23232f',
  coverEdge: '#6a6a86',
} as const;

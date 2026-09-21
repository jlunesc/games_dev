/**
 * The colours and numbers of the looks, in one place, so the owner can tweak the feel without hunting.
 * Purely cosmetic: nothing here changes how a fight plays. Times are in ticks (60 per second), lengths in
 * world units (the world is 16:9), speeds in world units per second unless a name says "PerTick".
 *
 * Colours in this file: the effects, the player's figure, the bosses' bodies and glows, the blade, and the plain
 * floor, ledge and wall colours. Colours that are NOT in this file:
 * - The backdrop of each boss (sky, background layers, embers, floor colours, the bright ledge edge) is in
 *   `moods.ts`, one block per boss. Those floor and edge colours replace `floor`, `floorLine` and `platformGlow` here
 *   whenever a mood is drawn (which is every fight); the ones here only serve the old plain drawing.
 * - The health bars, the black bars round the screen, the arena fill, the white hit flash and the white slash box are
 *   in `render.ts`.
 * The shapes of the figures (proportions of the legs, the body and the head) are in `figures.ts`.
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
  /** Layers and the sky are pre-rendered at this fraction of their size and drawn scaled up (a quarter of the memory at 0.5). */
  layerScale: 0.5,

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
  playerBody: '#e8e8f0',
  /** The body while dashing, and while flashing after a hit. */
  playerDashBody: '#7fd6ff',
  playerHurtBody: '#ff3b3b',
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
  /** The body of the Ember Duelist (and of any boss without a mood of its own), and of the Ashen Hound. */
  bossBodyEmber: '#c8642a',
  bossBodyAsh: '#66788f',
  /** The body while staggered (every boss), the glows: powering up, counterable attack, must-dodge attack. */
  bossStaggerBody: '#7fd6ff',
  bossPowerGlow: '#ffffff',
  bossCounterGlow: '#f5c542',
  bossDodgeGlow: '#e0403a',
  /** The blade's steel when nothing glows. */
  bossBladeSteel: '#e6e9f2',

  // ---- Floor, platforms and cover (copied from the old render.ts colours) ----
  floor: '#2a2a3a',
  floorLine: '#8a8aa0',
  platformBody: '#4b4b6e',
  platformGlow: '#8fa8ff',
  coverBody: '#23232f',
  coverEdge: '#6a6a86',
  /** Distance between the faint vertical tile lines on the floor, world units. */
  floorTileSpacing: 80,
  floorTileAlpha: 0.16,
  /** How far below the floor's top edge the faint horizontal tile line sits. */
  floorTileRow: 32,
} as const;

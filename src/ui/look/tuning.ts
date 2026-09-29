/**
 * The colours and numbers of the looks, in one place, so the owner can tweak the feel without hunting.
 * Purely cosmetic: nothing here changes how a fight plays. Times are in ticks (60 per second), lengths in
 * world units (the world is 16:9), speeds in world units per second unless a name says "PerTick".
 *
 * Colours in this file: the effects, the player's figure, the bosses' bodies and glows, the blade, and the plain
 * floor, ledge and wall colours. Colours that are NOT in this file:
 * - The backdrop of each boss (sky, background layers, embers, floor colours, the bright ledge edge) is in
 *   `moods.ts`, one block per boss. Those floor and edge colours replace `floor`, `floorLine` and `platformGlow` here
 *   whenever a mood is drawn (which is every fight); the ones here only serve the old plain drawing. A generated
 *   boss has no block there: its backdrop and body colour are invented from the fight's seed in `generated-mood.ts`.
 * - The black bars round the screen, the arena fill, the white hit flash and the white slash box are in `render.ts`.
 *   The health bars' size and spacing are in `hud` below; their red is in `render.ts`.
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

  // ---- Weather and sky effects (all cheap: the mist and glow are baked once, streaks are one stroke, lightning one fill) ----
  /** Streaks per frame, how fast they fly (world units per second), their angle below level (radians), length, width and opacity. */
  weather: {
    rain: { count: 28, speed: 620, angle: 1.25, length: 26, width: 1.5, alpha: 0.32 },
    wind: { count: 14, speed: 520, angle: 0.07, length: 80, width: 1.5, alpha: 0.22 },
  },
  /** Mist bands: how many soft blobs are baked into one band, and how wide and tall each is (fractions of the band). */
  haze: { blobs: 9, blobWidthMin: 220, blobWidthMax: 420 },
  /**
   * Lightning: time is cut into slots; each slot has a `chance` of one dim flash that starts at least `minStartTicks`
   * into it and fades over `flashTicks`. One flash at a time, at most once per slot, never brighter than `peakAlpha`.
   */
  lightning: { slotTicks: 420, chance: 0.7, minStartTicks: 90, flashTicks: 16, peakAlpha: 0.14 },

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

  // ---- The player's sword and slash (see playerfx.ts) ----
  /**
   * The sword: its length and width, steel, outline and grip colours, and the angle it points at (degrees, 0 straight ahead,
   * negative up, positive down) while winding up, sweeping through the active part of the swing, and lowering in recovery.
   */
  playerBlade: {
    length: 58,
    width: 10,
    steel: '#f4f8ff',
    outline: '#2a3550',
    grip: '#7fd6ff',
    windupDeg: [-120, -100],
    activeDeg: [-100, 40],
    recoverDeg: [40, 80],
    /** The same three angle ranges for a swing straight up and straight down (0 is level in front, negative is up, positive is down). */
    up: { windupDeg: [-175, -165], activeDeg: [-165, -15], recoverDeg: [-15, 80] },
    down: { windupDeg: [175, 165], activeDeg: [165, 15], recoverDeg: [15, 80] },
  },
  /**
   * The slash: a crescent inside the real hit box that sweeps from top to bottom over the active ticks, then fades over
   * `fadeTicks`. `inner` is how thin the head of the crescent is (0 to 1, higher is thinner). The faint box behind it
   * (`boxAlpha`) shows the real reach, like the bosses' strikes do.
   */
  playerSlash: { edge: '#7fd6ff', core: '#ffffff', inner: 0.5, steps: 8, fadeTicks: 6, alpha: 0.95, boxAlpha: 0.12 },

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
  /** The robe of the Vesper Sage. */
  bossBodySage: '#4a3a7a',
  /** The smoke from the Cinder Golem's chimney. */
  golemSmoke: '#9a9088',
  /** The darker iron of the Cinder Golem's legs and arms, so they read against its body. */
  golemIron: '#3c4658',
  /** The Quill Warden: pale bone for the body, dark olive for its legs, mantle, beak and lance shaft. */
  bossBodyQuill: '#cfc8a4',
  quillDark: '#4e5a3c',
  /** The Veil Dancer: rose gown, pale mask and needle, dark plum slippers. */
  bossBodyVeil: '#b8507e',
  veilMask: '#efe6f4',
  veilDark: '#4a2a5a',
  /** The Gale Reaver: sea-green body, a darker cloak, and dark legs and hood. */
  bossBodyGale: '#4a9a94',
  galeCloak: '#2f7276',
  galeDark: '#1f4a4e',
  /** The Brass Sentinel: brass plates and dark steel fittings. */
  bossBodyBrass: '#b8923a',
  sentinelSteel: '#5a5f6e',
  /** The hide of the Tremor Brute. */
  bossBodyBrute: '#7a5040',
  /** The Storm Kite: a storm-blue body, paler near wing, darker far wing, a pale belly, an amber beak and an electric eye. */
  bossBodyKite: '#3f5a9a',
  kite: {
    wing: '#7fa6e8',
    wingFar: '#2c4173',
    belly: '#cfe4ff',
    beak: '#f0c860',
    eye: '#eaf6ff',
    /** How long a wing is (never more than 0.4 of the boss's width), world units, and ticks for one full flap. */
    wingLength: 46,
    flapTicks: 44,
    /** Wing angle above level (radians): hanging, and the flap swing either side of it; wings raised; swept back; low for the volley; drooping on the floor; folded in a dive. */
    restElev: 0.35,
    flapSwing: 0.55,
    raisedElev: 1.15,
    backElev: 0.1,
    downElev: -0.35,
    groundElev: -0.55,
    foldElev: -0.4,
    /** Nose-down tilt (radians) at the bottom of a dive and for the volley, nose-up tilt for the raised wings, and how much a diving body shrinks. */
    divePitch: 0.8,
    downPitch: 0.25,
    raisedPitch: -0.2,
    diveScale: 0.75,
  },
  /** The body while staggered (every boss), the glows: powering up, counterable attack, must-dodge attack. */
  bossStaggerBody: '#7fd6ff',
  bossPowerGlow: '#ffffff',
  bossCounterGlow: '#f5c542',
  bossDodgeGlow: '#e0403a',
  /** The blade's steel when nothing glows. */
  bossBladeSteel: '#e6e9f2',

  // ---- Shots (bolts and arcs): drawn only, the real sizes come from the boss file ----
  shot: {
    /** The landing mark of an arc and of an eruption stays red for every boss (danger reads the same); the glow, halo and burst follow the boss's `palette`. */
    mark: '#e0403a',
    /** Halo size as a multiple of the shot's size, and how much of a bolt's length the trail spans (in its own sizes). */
    haloScale: 1.7,
    trailLength: 2.6,
    trailAlpha: 0.35,
    /** Radius of a flying arc's orb, world units. */
    arcOrbRadius: 16,
    /** Alpha of the landing mark while the arc flies (it pulses up to this) and of the burst. */
    markAlpha: 0.75,
    burstAlpha: 0.7,
    /** Eruptions: the floor mark's height, the warning column that grows over it (alpha), and the blast (alpha and hot core). */
    eruptionMarkHeight: 8,
    eruptionFillAlpha: 0.28,
    eruptionBlastAlpha: 0.85,
    eruptionCore: '#ffd27a',
  },

  // ---- The look of a boss's strike (see attackfx.ts): the shape drawn inside each live hit box ----
  slash: {
    /** The plain box behind the shape, so the real reach is always shown, and the shape's own opacity. */
    boxAlpha: 0.16,
    shapeAlpha: 0.9,
    /** A hit box on the floor no taller than this is drawn as spikes, one spike about `spikeWidth` wide, every other one `spikeShort` shorter. */
    lowHeight: 90,
    spikeWidth: 42,
    spikeShort: 0.35,
    /** A box at least this many times wider than tall is a spear; `spearBody` is how much of its height the spear's base takes. */
    spearRatio: 2.2,
    spearBody: 0.7,
    /** How much of a crescent's depth is hollowed out on the boss's side (0 to 1). */
    crescentInner: 0.55,
  },

  // ---- Signs on a boss that show what its attack will do (see `attackMarks` in figures.ts) ----
  mark: {
    /** A pip for each shot, a ring round it when aimed (red for every boss). Up to `maxPips` are shown, `pipSpacing` apart, `pipLift` above the head. The pips and springs take the boss's `palette.core`, the flare its `palette.halo`. */
    aimRing: '#e0403a',
    maxPips: 5,
    pipSpacing: 13,
    pipLift: 12,
    pipRadius: 4,
    /** Springs under the feet of a hovering attack, and the flare behind the body of a strike on both sides. */
    springHeight: 8,
    flareLength: 18,
  },

  // ---- The colours of a boss's attacks, one set per boss id (the same set is used by its strikes, shots and signs) ----
  /**
   * `edge`: the outline of its strikes, and the burst of its lobbed shots and eruptions. `core`: the hot middle of a strike,
   * of a shot, and its signs (pips, springs). `halo`: the glow and trail of its shots, and the flare. A boss with no set
   * of its own uses `default`.
   */
  palette: {
    default: { edge: '#ff7a5a', core: '#fff1c9', halo: '#b48cff' },
    'quill-warden': { edge: '#d8d08a', core: '#fffbe0', halo: '#9aa860' },
    'cinder-golem': { edge: '#ff8a2a', core: '#ffe2a0', halo: '#ff5a1a' },
    'veil-dancer': { edge: '#e0609a', core: '#ffe6f2', halo: '#c070e0' },
    'gale-reaver': { edge: '#5fd6c8', core: '#e6fffb', halo: '#3fb8b0' },
    'brass-sentinel': { edge: '#e8b84a', core: '#fff4d0', halo: '#d8a030' },
    'tremor-brute': { edge: '#d0703a', core: '#ffd8a8', halo: '#a04a30' },
    'storm-kite': { edge: '#7fd0ff', core: '#eaf6ff', halo: '#4a8cff' },
  } as Record<string, { edge: string; core: string; halo: string }>,

  // ---- Health bars: one per boss, stacked at the top right (a lone boss has the first one only) ----
  hud: {
    /** Gap to the right edge and to the top, world units. */
    margin: 24,
    barTop: 24,
    barWidth: 260,
    barHeight: 14,
    /** How far the next bar sits below the one above it. */
    barStep: 52,
    /** The phase tick starts this far above its bar and is this tall and wide. */
    tickRise: 4,
    tickHeight: 22,
    tickWidth: 3,
    /** The name sits this far below the top of its bar. */
    nameDrop: 22,
    /** How dim the bar and name of a fallen boss are (1 is not dimmed). */
    fallenAlpha: 0.35,
  },

  // ---- The turn marker: a pulsing triangle over the boss that holds the turn (fights with two bosses only) ----
  turnMarker: {
    color: '#fff6b0',
    alpha: 0.9,
    /** Half the width and the height of the triangle at rest, world units. */
    halfWidth: 12,
    height: 14,
    /** How far the tip stays above the top of the boss's drawn box. */
    gap: 30,
    /** The marker never goes higher than this (a boss hanging near the top of the world). */
    minTop: 8,
    /** How much it swells at the peak of the pulse (0.25 is a quarter bigger) and how long a pulse takes, in ticks. */
    pulse: 0.25,
    pulseTicks: 40,
  },

  // ---- A beaten boss of a pair, drawn as a low heap ----
  fallen: {
    /** The heap's height as a fraction of the boss's height, and its width as a multiple of the boss's width. */
    heightFraction: 0.25,
    widthScale: 1.15,
    /** How dim the heap is (1 is not dimmed). */
    alpha: 0.5,
  },

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

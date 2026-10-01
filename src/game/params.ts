/**
 * Every tunable value of the game in one place.
 * Durations are in updates (60 per second), distances in world units, speeds in units per second.
 * The values are first guesses; they are tuned from the owner's play feedback.
 */
export const WORLD = { width: 1280, height: 720, floorY: 640 };

export const PLAYER = {
  width: 48,
  height: 96,
  startX: 320,
  runSpeed: 420,
  gravity: 2600,
  maxFallSpeed: 1100,
  jumpSpeed: 900,
  jumpReleaseFactor: 0.4,
  inputBuffer: 3,
  maxHealth: 5,
  hitInvulnerability: 60,
  attack: { startup: 3, active: 4, recovery: 9, reach: 90, height: 80, moveFactor: 0.5, upDownReach: 90, upDownWidth: 90, pogoSpeed: 760 },
  dash: { duration: 11, speed: 1450, cooldown: 24 },
};

export const GAME = {
  defeatRestartTicks: 60,
  deadZone: 0.25,
  // How long the top button must be held to leave a fight, in ms.
  exitHoldMs: 1000,
};

export const FEEDBACK = {
  freezeOnBossHit: 4,
  freezeOnPlayerHit: 8,
  freezeOnCounter: 10,
  freezeOnBossDefeated: 12,
  shakeTicks: 10,
  shakeAmplitude: 6,
  bossFlashTicks: 6,
  playerFlashTicks: 12,
};

/** Shots: how tall an arc's landing burst is (from the floor up), world units. */
export const SHOT = { arcBurstHeight: 90 };

/** Eruptions: how tall a blast is (from the floor up), world units. A jump peaks near 163, so it does not clear it. */
export const ERUPTION = { height: 220 };

/** Embers: how tall the low fire left by a lingering eruption is (from the floor up). It is below a jump's peak, so it can be jumped. */
export const EMBER = { height: 40 };

/**
 * Temper: a boss that is left alone gets angrier. It builds for `start` + `ramp` updates (level 0 up to `start`, then rising to 1
 * over `ramp`), each hit takes `relief` off. At level 1 a `heavy` attack is `1 + headWeight * strength` times as likely and the
 * pause between attacks is `gapCut * strength` shorter.
 */
export const TEMPER = { start: 240, ramp: 360, relief: 180, headWeight: 2.5, gapCut: 0.5 };

/** A boss with a `rangeBias` that has chased a player for this many updates (3 s) without an attack that fits swings the one it picked anyway. */
export const RANGE_PATIENCE_TICKS = 180;

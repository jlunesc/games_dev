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
  attack: { startup: 3, active: 4, recovery: 9, reach: 90, height: 80, moveFactor: 0.5 },
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

import type { BossDef } from '../bosses/schema';
import { PLAYER, WORLD } from './params';

export interface Buffered {
  jump: number;
  attack: number;
  dash: number;
}

export interface PlayerState {
  /** Horizontal centre and feet height, in world units (y grows downward). */
  x: number;
  y: number;
  /** Position before the last update, so the renderer can blend between updates. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  jumpCut: boolean;
  health: number;
  /** Updates of untouchability left after being hit. */
  invulnerableTicks: number;
  /** -1 when not attacking, otherwise updates since the swing began (0 on its first update). */
  attackTick: number;
  attackConnected: boolean;
  /** -1 when not dashing, otherwise updates since the dash began (0 on its first update). */
  dashTick: number;
  dashDir: 1 | -1;
  dashCooldown: number;
  /** Updates a recent press stays usable. */
  buffer: Buffered;
}

/**
 * What the boss is doing: `gap` (walking and keeping its distance, waiting to attack), `approach`
 * (walking into range of the attack it chose), `attack`, `stagger` (countered), `transition` (powering up between phases).
 */
export type BossMode = 'gap' | 'approach' | 'attack' | 'stagger' | 'transition';

export interface BossState {
  /** Horizontal centre, in world units; the boss always stands on the floor. */
  x: number;
  /** Height of the boss's feet above the floor, in world units (0 on the floor; above 0 only during a leap). */
  lift: number;
  /** Where the running leap took off and where it will land (x); both null when no leap is running. */
  leapFromX: number | null;
  leapToX: number | null;
  facing: 1 | -1;
  hp: number;
  /** Index into the boss definition's phases. */
  phase: number;
  mode: BossMode;
  /** Updates spent in the current mode (0 on the update the mode began). */
  modeTick: number;
  /** The attack being performed (mode `attack`), and updates since it began (0 on its first update). */
  attackId: string | null;
  attackTick: number;
  /** The attack chosen while walking into range (mode `approach`). */
  pendingAttackId: string | null;
  /** Attacks still to follow straight after the current one. */
  chainLeft: number;
  /** The last two attacks started, to avoid three of the same in a row. */
  lastAttacks: string[];
  /** Position in the phase's attack list used when following the fixed cycle. */
  cycleIndex: number;
}

export type GameEvent =
  | 'bossHit'
  | 'playerHit'
  | 'dash'
  | 'bossWindupGold'
  | 'bossWindupRed'
  | 'counter'
  | 'phaseChange'
  | 'bossDefeated'
  | 'playerDefeated';

export interface GameState {
  tick: number;
  /** `defeated` and `victory` freeze the fight for `endTicks` updates, then a new fight starts. */
  phase: 'fight' | 'defeated' | 'victory';
  endTicks: number;
  player: PlayerState;
  boss: BossState;
  /** Events produced by the last update. */
  events: GameEvent[];
  /** State of the seeded random generator; advances only when the boss makes a random choice. */
  rng: number;
  /** The seed this fight started from, kept so it can be replayed and recorded. */
  seed: number;
}

export function createInitialState(boss: BossDef, seed = 1): GameState {
  const start = seed >>> 0;
  return {
    tick: 0,
    phase: 'fight',
    endTicks: 0,
    player: {
      x: PLAYER.startX,
      y: WORLD.floorY,
      prevX: PLAYER.startX,
      prevY: WORLD.floorY,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      jumpCut: false,
      health: PLAYER.maxHealth,
      invulnerableTicks: 0,
      attackTick: -1,
      attackConnected: false,
      dashTick: -1,
      dashDir: 1,
      dashCooldown: 0,
      buffer: { jump: 0, attack: 0, dash: 0 },
    },
    boss: {
      x: boss.startX,
      lift: 0,
      leapFromX: null,
      leapToX: null,
      facing: -1,
      hp: boss.maxHp,
      phase: 0,
      mode: 'gap',
      modeTick: 0,
      attackId: null,
      attackTick: 0,
      pendingAttackId: null,
      chainLeft: 0,
      lastAttacks: [],
      cycleIndex: 0,
    },
    events: [],
    rng: start,
    seed: start,
  };
}

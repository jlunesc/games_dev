import { DUMMY, PLAYER, WORLD } from './params';

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

export type DummyPhase = 'idle' | 'windup' | 'sweep' | 'recovery';

export interface DummyState {
  x: number;
  /** Direction of the coming or current sweep. */
  facing: 1 | -1;
  /** Display only: refills when it reaches zero, the dummy never dies. */
  hp: number;
  phase: DummyPhase;
  phaseTick: number;
  nextSweepIn: number;
}

export type GameEvent = 'dummyHit' | 'playerHit' | 'dash' | 'dummyWindup' | 'playerDefeated';

export interface GameState {
  tick: number;
  phase: 'fight' | 'defeated';
  defeatTicks: number;
  player: PlayerState;
  dummy: DummyState;
  /** Events produced by the last update. */
  events: GameEvent[];
}

export function createInitialState(): GameState {
  return {
    tick: 0,
    phase: 'fight',
    defeatTicks: 0,
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
    dummy: {
      x: DUMMY.x,
      facing: -1,
      hp: DUMMY.maxHp,
      phase: 'idle',
      phaseTick: 0,
      nextSweepIn: DUMMY.firstSweepIn,
    },
    events: [],
  };
}

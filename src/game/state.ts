import type { BossDef } from '../bosses/schema';
import { asFight, type FightDef } from './fight';
import { PLAYER, WORLD } from './params';
import { nextRandom } from './rng';

export interface Buffered {
  jump: number;
  attack: number;
  dash: number;
}

/** Where a swing points. */
export type AttackAim = 'forward' | 'up' | 'down';

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
  /** Where the running swing points: in front, straight up, or straight down (down only when the swing began in the air). */
  attackAim: AttackAim;
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
  /** Height of the boss's feet above the floor, in world units (0 on the floor; above 0 during a leap, and for a boss that flies whenever it hangs in the air). */
  lift: number;
  /** Where the running leap took off and where it will land (x); both null when no leap is running. */
  leapFromX: number | null;
  leapToX: number | null;
  /** The height the running dive took off from (null when no dive is running). */
  diveFromLift: number | null;
  /** Where the running blink will land (x); null when no blink is running. */
  blinkToX: number | null;
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
  /** Updates spent in the real fight (not the study), capped; a hit lowers it. See `TEMPER`. */
  temper: number;
  /** The attacks still to come in the running combo (see `PhaseDef.combos`); empty when no combo is running. */
  comboQueue: string[];
  /** Extra updates the running attack still spends frozen at the end of its wind-up (see `AttackDef.hold`). */
  holdLeft: number;
  /** Updates left before the boss may react to a hit again (see `BossDef.reaction`). */
  reactCooldown: number;
  /** Updates the boss has spent turning round toward a player behind its shield (see `BossDef.shield`). */
  turnTicks: number;
}

interface ShotBase {
  /** The attack that fired the shot, and the update on which that attack began (one attack occurrence). */
  attackId: string;
  originTick: number;
  /** Horizontal centre. */
  x: number;
  /** Height of the shot's bottom edge above the floor. */
  lift: number;
  /** Which boss fired it: an index into the fight's bosses. Absent means the primary boss, so a one-boss fight's shots are unchanged. */
  owner?: number;
}

/** A straight bolt in flight. */
export interface BoltState extends ShotBase {
  kind: 'bolt';
  dir: 1 | -1;
  /** Where it appeared, so a cover behind the boss cannot stop it. */
  originX: number;
  size: number;
  /** Sideways speed, units per second (in the way of `dir`). */
  speed: number;
  /** Vertical speed of the bottom edge, units per second (0 for a level bolt, negative when it flies down at the player). */
  climb: number;
}

/** A lobbed arc: in flight until `age` reaches `flight`, then a landing burst for `burst` updates. */
export interface ArcState extends ShotBase {
  kind: 'arc';
  age: number;
  flight: number;
  fromX: number;
  toX: number;
  launchLift: number;
  peak: number;
  radius: number;
  burst: number;
}

/** A floor eruption: the mark shows from `age` 0, the blast is live for `delay <= age < delay + burst`. */
export interface EruptionState extends ShotBase {
  kind: 'eruption';
  age: number;
  width: number;
  delay: number;
  burst: number;
  /** Updates the eruption stays on as low embers after its blast; absent for an eruption without embers. */
  linger?: number;
}

export type ShotState = BoltState | ArcState | EruptionState;

export type GameEvent =
  | 'bossHit'
  | 'bossBlocked'
  | 'playerHit'
  | 'dash'
  | 'bossWindupGold'
  | 'bossWindupRed'
  | 'counter'
  | 'phaseChange'
  | 'bossDefeated'
  | 'bossDown'
  | 'playerDefeated'
  | 'studyHit'
  | 'studyEnd';

/**
 * The study before the real fight: the boss demonstrates each first-phase attack and nothing can hurt anyone.
 * It is separate from `GameState.phase` (which means the fight ended); the fight is on while the study runs.
 */
export interface StudyState {
  active: boolean;
  /** Attack ids still to demonstrate, in order; the boss takes the first one each time it is ready to attack. */
  queue: string[];
  /** The update on which the last demonstration finished (0 until then). */
  endTick: number;
}

export interface GameState {
  tick: number;
  /** `defeated` and `victory` freeze the fight for `endTicks` updates, then a new fight starts. */
  phase: 'fight' | 'defeated' | 'victory';
  endTicks: number;
  player: PlayerState;
  /** The primary boss (index 0). */
  boss: BossState;
  /** The other bosses of a fight with more than one (index 1 and up); empty in a normal fight. */
  partners: BossState[];
  /** Events produced by the last update. */
  events: GameEvent[];
  /** State of the seeded random generator; advances only when the boss makes a random choice. */
  rng: number;
  /** The seed this fight started from, kept so it can be replayed and recorded. */
  seed: number;
  study: StudyState;
  /** Shots in flight. They outlive the attack that fired them; a phase change or the end of the fight clears them. */
  shots: ShotState[];
  /** The shots that hurt the player on the last update (removed at once), so the stats know which attack hurt. */
  shotHits: { attackId: string; originTick: number }[];
}

/**
 * The study queue: every first-phase attack once per round, each round in its own random order (Fisher-Yates
 * with the fight's seeded generator). Returns the queue and the advanced generator state.
 */
function planStudy(boss: BossDef, rng: number, rounds: number): { queue: string[]; rng: number } {
  const ids = (boss.phases[0]?.attacks ?? []).map((entry) => entry.id);
  const queue: string[] = [];
  let state = rng;
  for (let round = 0; round < rounds; round++) {
    const order = [...ids];
    for (let i = order.length - 1; i >= 1; i--) {
      const next = nextRandom(state);
      state = next.state;
      const j = Math.floor(next.value * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    queue.push(...order);
  }
  return { queue, rng: state };
}

/** The boss with this index: 0 is `boss`, 1 and up are `partners`. */
export function bossAt(s: GameState, index: number): BossState {
  const found = index === 0 ? s.boss : s.partners[index - 1];
  if (found === undefined) throw new Error(`The fight has no boss ${index}`);
  return found;
}

export const bossCount = (s: GameState): number => 1 + s.partners.length;

export const allBosses = (s: GameState): BossState[] => [s.boss, ...s.partners];

/**
 * A boss of a fight with partners that has been beaten. A lone boss at 0 health ends the fight at once, so in a
 * one-boss fight no boss is ever downed.
 */
export const isDowned = (s: GameState, index: number): boolean =>
  s.partners.length > 0 && bossAt(s, index).hp <= 0;

function initialBoss(boss: BossDef): BossState {
  return {
    x: boss.startX,
    lift: boss.flight?.height ?? 0,
    leapFromX: null,
    leapToX: null,
    diveFromLift: null,
    blinkToX: null,
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
    temper: 0,
    comboQueue: [],
    holdLeft: 0,
    reactCooldown: 0,
    turnTicks: 0,
  };
}

export function createInitialState(source: BossDef | FightDef, seed = 1, studyRounds = 0): GameState {
  const fight = asFight(source);
  const boss = fight.bosses[0]!;
  const start = seed >>> 0;
  // The study demonstrates one boss's attacks; a fight with partners has none until it is built for them.
  const rounds = fight.bosses.length > 1 ? 0 : Math.min(2, Math.floor(Math.max(0, studyRounds)));
  const study = rounds > 0 ? planStudy(boss, start, rounds) : { queue: [], rng: start };
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
      attackAim: 'forward',
      dashTick: -1,
      dashDir: 1,
      dashCooldown: 0,
      buffer: { jump: 0, attack: 0, dash: 0 },
    },
    boss: initialBoss(boss),
    partners: fight.bosses.slice(1).map(initialBoss),
    events: [],
    rng: study.rng,
    seed: start,
    study: { active: study.queue.length > 0, queue: study.queue, endTick: 0 },
    shots: [],
    shotHits: [],
  };
}

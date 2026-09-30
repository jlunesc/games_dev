import { resolveFight } from '../bosses/resolve';
import type { BossDef, ShotDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import { TICK_RATE } from '../engine/time';
import { applyDialsToFight } from '../game/difficulty';
import { asFight, type FightDef } from '../game/fight';
import { activeHitBoxes, overlaps, playerBox, shotBox } from '../game/geometry';
import { PLAYER, WORLD } from '../game/params';
import { step } from '../game/step';
import { bossAt, bossCount, createInitialState, isDowned, type GameState, type PlayerState } from '../game/state';
import { bossDefFor } from '../game/turns';
import { decodeInputs } from './input-log';
import type { FightRecord, Recording } from './record';

/** Distance bands between player and boss, in world units. */
export const CLOSE_BELOW = 160;
export const MID_UP_TO = 400;
/** The player's x is sampled once every this many updates (10 per second). */
export const POSITION_EVERY = 6;

export type PlayerAction = 'idle' | 'running' | 'airborne' | 'dashing' | 'attacking';
/**
 * `interrupted`: the attack was cut short before its dangerous window finished (the fight ended or was left,
 * or a phase change cancelled it).
 */
export type AttackOutcome = 'hit' | 'countered' | 'dodged' | 'interrupted';
/**
 * How a dodged attack was avoided, by priority: `dash`, `jump`, `platform` (standing on any raised surface, a
 * platform or the top of a cover, that the attack passes under), `cover` (behind a cover that blocked the attack),
 * else `distance` (out of its reach).
 */
export type Evasion = 'dash' | 'jump' | 'platform' | 'cover' | 'distance';

export interface AttackOccurrence {
  attackId: string;
  /** Which boss of the fight made the attack: 0 is the primary boss, 1 its partner. Always 0 in a fight of one. */
  boss: number;
  /** 1-based phase number the boss was in. */
  phase: number;
  /** The update the warning began, and the warning's length. */
  startTick: number;
  windupTicks: number;
  /** The first update on which the attack could hurt. */
  firstDangerTick: number;
  /** Distance to the player when the warning began (rounded to 0.1 world units), and what the player was doing. */
  distance: number;
  playerActionAtStart: PlayerAction;
  outcome: AttackOutcome;
  /** How a dodged attack was avoided; null for the other outcomes. */
  evasion: Evasion | null;
  /** From the start of the warning to the player's first dash or jump before the dangerous moment; null if none. */
  reactionTicks: number | null;
  reactionMs: number | null;
  /** Only set for a hit, or for a dodge by dash or jump, and only when the player made a dodge action; small means a tight dodge, negative means too late. */
  marginTicks: number | null;
  marginMs: number | null;
  /** Health this attack actually took from the player (a blow larger than the health left counts what was left), and what the player was doing when hit (null when not hit). */
  damageTaken: number;
  playerActionWhenHit: PlayerAction | null;
  /** True for a demonstration in the study (decided when the attack started); it hurts nobody. */
  study: boolean;
  /** How many shots (bolts and arcs) the attack fires; 0 for an attack without shots. Such an attack is resolved only once its last shot is gone. */
  shotsFired: number;
}

export interface PunishWindows {
  /** Recovery periods that closed or were hit; a window cut short by the end of the fight without a hit is not counted. */
  opened: number;
  /** Windows in which the player hit the boss. */
  taken: number;
  missed: number;
}

/** The study before the fight: how long it lasted and what the boss showed. All zero when there was none. */
export interface StudyAnalysis {
  rounds: number;
  /** Updates the study took (its end update; the updates played so far if the run ended during it). */
  ticks: number;
  /** Demonstrations shown (occurrences flagged `study`). */
  attacks: number;
  /** `studyHit` events (a demonstration that reached the player; it takes no health). One demonstration normally produces at most one. */
  hits: number;
}

/** What one boss of the fight did. A fight of one boss has one entry. */
export interface BossAnalysis {
  id: string;
  name: string;
  /** Health at the start, with the Health dial and the pair's health scale applied. */
  maxHp: number;
  hpLeft: number;
  /** 1-based: the highest phase this boss reached. */
  phaseReached: number;
  phaseCount: number;
  damageDealt: number;
}

export interface Analysis {
  ticks: number;
  /** The whole session, the study included. */
  seconds: number;
  /** The fight itself without the study, the same rule as `FightSummary.seconds`: `(ticks - study ticks) / 60`. */
  fightSeconds: number;
  /** The primary boss's phase reached and phase count; the others are in `bosses`. */
  phaseReached: number;
  phaseCount: number;
  /** Summed over every boss of the fight. */
  bossHpLeft: number;
  bossMaxHp: number;
  damageDealt: number;
  bosses: BossAnalysis[];
  /** Health actually lost (a blow larger than the health left counts what was left). */
  damageTaken: number;
  hitsTaken: number;
  bossHitTicks: number[];
  playerHitTicks: number[];
  swings: number;
  swingsThatHit: number;
  /** Swings that hit divided by swings; null when the player never swung. */
  accuracy: number | null;
  counters: number;
  dashes: number;
  jumps: number;
  attacks: AttackOccurrence[];
  study: StudyAnalysis;
  behavior: {
    updatesClose: number;
    updatesMid: number;
    updatesFar: number;
    /** How many of the updates above happened while the study was on (they add up to `study.ticks`); subtract for the real fight. */
    studyUpdatesClose: number;
    studyUpdatesMid: number;
    studyUpdatesFar: number;
    positionEvery: number;
    /** The player's x every `positionEvery` updates, rounded. */
    positions: number[];
    punish: PunishWindows;
    /** Updates (the whole session, the study included) on which the player stood on a platform or a cover top. */
    updatesOnPlatform: number;
  };
}

/** Standing (not falling or jumping) on a platform or a cover top rather than on the floor. */
const onRaisedSurface = (p: PlayerState): boolean => p.onGround && p.y < WORLD.floorY - 1;

const toMs = (ticks: number): number => Math.round(((ticks * 1000) / TICK_RATE) * 10) / 10;

/** What the player was doing, from the state and the input of that update. */
export function actionOf(p: PlayerState, frame: InputFrame): PlayerAction {
  if (p.dashTick >= 0) return 'dashing';
  if (p.attackTick >= 0) return 'attacking';
  if (!p.onGround) return 'airborne';
  return frame.moveX !== 0 ? 'running' : 'idle';
}

/** An attack being watched: filled in update by update, turned into an `AttackOccurrence` when it ends. */
interface OpenAttack {
  attackId: string;
  boss: number;
  phase: number;
  startTick: number;
  windup: number;
  dangerFrom: number;
  dangerTo: number;
  recoveryFrom: number;
  distance: number;
  actionAtStart: PlayerAction;
  dodgeStart: number | null;
  dashedInDanger: boolean;
  airborneInDanger: boolean;
  /** Standing (not dashing) on a raised surface (a platform or a cover top) that put the player under a window that would have reached the floor. */
  platformInDanger: boolean;
  /** Behind a cover that cut a window which would have reached the player. */
  coveredInDanger: boolean;
  hit: boolean;
  countered: boolean;
  damage: number;
  actionWhenHit: PlayerAction | null;
  /** The attack began while the study was on. */
  study: boolean;
  /** Attack time on the last update seen while the attack (or its shots) was watched. */
  lastT: number;
  shotsFired: number;
  /** The attack time of its last shot's firing update. */
  lastShotAt: number;
  /** Every shot has been fired and is gone. */
  shotsDone: boolean;
  /** A phase change or the end of the fight removed the shots that were left. */
  shotsCleared: boolean;
  windowOpen: boolean;
  windowTaken: boolean;
  /** Updates the attack spent frozen on the end of its wind-up (a hold); danger times are shifted by it. */
  held: number;
}

function occurrence(open: OpenAttack): AttackOccurrence {
  // Hits resolve for attack time in [from, to), so the last dangerous update is `dangerTo - 1`. An attack that
  // lived to that update without hurting or being countered was dodged; one cut short before it is interrupted.
  const resolved = open.lastT >= open.dangerTo - 1 && (open.shotsFired === 0 || open.shotsDone);
  const outcome: AttackOutcome = open.countered
    ? 'countered'
    : open.hit
      ? 'hit'
      : resolved
        ? 'dodged'
        : 'interrupted';
  const evasion: Evasion | null =
    outcome !== 'dodged'
      ? null
      : open.dashedInDanger
        ? 'dash'
        : open.airborneInDanger
          ? 'jump'
          : open.platformInDanger
            ? 'platform'
            : open.coveredInDanger
              ? 'cover'
              : 'distance';
  const firstDanger = open.startTick + open.held + open.dangerFrom;
  const dodge = open.dodgeStart;
  const reactionTicks = dodge !== null && dodge <= firstDanger ? dodge - open.startTick : null;
  const hasMargin = dodge !== null && (outcome === 'hit' || evasion === 'dash' || evasion === 'jump');
  const marginTicks = hasMargin ? firstDanger - dodge : null;
  return {
    attackId: open.attackId,
    boss: open.boss,
    phase: open.phase,
    startTick: open.startTick,
    windupTicks: open.windup + open.held,
    firstDangerTick: firstDanger,
    distance: Math.round(open.distance * 10) / 10,
    playerActionAtStart: open.actionAtStart,
    outcome,
    evasion,
    reactionTicks,
    reactionMs: reactionTicks === null ? null : toMs(reactionTicks),
    marginTicks,
    marginMs: marginTicks === null ? null : toMs(marginTicks),
    damageTaken: open.damage,
    playerActionWhenHit: open.actionWhenHit,
    study: open.study,
    shotsFired: open.shotsFired,
  };
}

/** Distance from the player to the nearest boss still standing (to the primary once every boss is down). */
function nearestDistance(s: GameState): number {
  let nearest = Infinity;
  for (let i = 0; i < bossCount(s); i++) {
    if (!isDowned(s, i)) nearest = Math.min(nearest, Math.abs(s.player.x - bossAt(s, i).x));
  }
  return nearest === Infinity ? Math.abs(s.player.x - s.boss.x) : nearest;
}

/**
 * The boss whose attack began on this update. Only one boss attacks at a time, and a boss that starts an attack is
 * at attack time 0. One countered on that very update is already staggered but was waiting with its attack chosen.
 */
function attackerOf(before: GameState, after: GameState): number {
  for (let i = 0; i < bossCount(after); i++) {
    const b = bossAt(after, i);
    if (b.mode === 'attack' && b.attackTick === 0) return i;
  }
  for (let i = 0; i < bossCount(after); i++) {
    if (bossAt(before, i).pendingAttackId !== null && bossAt(after, i).mode === 'stagger') return i;
  }
  return 0;
}

/**
 * Replays a fight through the real game and measures it. Pure: it only reads the states and events that
 * `step` produces, so the numbers can never disagree with what the game did.
 */
export function analyzeRun(
  source: BossDef | FightDef,
  initial: GameState,
  frames: readonly InputFrame[],
  /** Only for the report's `study.rounds`; everything else is read from the states. */
  studyRounds = 0,
): Analysis {
  const fight = asFight(source);
  let state = initial;
  const attacks: AttackOccurrence[] = [];
  const bossHitTicks: number[] = [];
  const playerHitTicks: number[] = [];
  const positions: number[] = [];
  const punish: PunishWindows = { opened: 0, taken: 0, missed: 0 };
  let swings = 0;
  let swingsThatHit = 0;
  let counters = 0;
  let dashes = 0;
  let jumps = 0;
  let hitsTaken = 0;
  let studyHits = 0;
  let studyUpdates = 0;
  let close = 0;
  let mid = 0;
  let far = 0;
  let studyClose = 0;
  let studyMid = 0;
  let studyFar = 0;
  let platformUpdates = 0;
  const maxPhases = Array.from({ length: bossCount(state) }, (_, i) => bossAt(state, i).phase);
  let open: OpenAttack | null = null;
  /** Attacks that are over but whose shots are still flying; each is emitted once its last shot is gone. */
  let lingering: OpenAttack[] = [];

  // `cutShort`: the run ended while the attack was still going. A punish window that was cut short and never
  // saw a hit is not counted: the player did not get the chance to use it.
  const finish = (attack: OpenAttack, cutShort: boolean): void => {
    // The boss cannot be hurt in the study, so a demonstration has no punish window.
    if (!attack.study && attack.windowOpen && !(cutShort && !attack.windowTaken)) {
      punish.opened += 1;
      if (attack.windowTaken) punish.taken += 1;
      else punish.missed += 1;
    }
    if (attack.shotsFired > 0 && !attack.shotsDone && !attack.shotsCleared && !cutShort) lingering.push(attack);
    else attacks.push(occurrence(attack));
  };

  const dodgeBegan = (before: GameState, after: GameState): boolean =>
    after.events.includes('dash') || (before.player.onGround && !after.player.onGround && after.player.vy < 0);

  /**
   * Feeds what the attack's shots did on this update: a dodge, how the player got past a shot (dash, jump,
   * standing above it), a hit by one of its shots, and whether they are all gone. Runs for the open attack and
   * for the ones still waiting on their shots.
   */
  const observeShots = (attack: OpenAttack, before: GameState, after: GameState, frame: InputFrame): void => {
    if (attack.shotsFired === 0) return;
    const { events, tick } = after;
    const t = tick - attack.startTick;
    attack.lastT = t;
    if (dodgeBegan(before, after) && attack.dodgeStart === null && t <= attack.dangerTo) attack.dodgeStart = tick;
    const mine = after.shots.filter(
      (x) => (x.owner ?? 0) === attack.boss && x.attackId === attack.attackId && x.originTick === attack.startTick,
    );
    const real = playerBox(after.player);
    const grounded = playerBox({ ...after.player, y: WORLD.floorY });
    for (const shot of mine) {
      const box = shotBox(shot);
      if (box === null) continue;
      const touches = overlaps(box, real);
      if (touches && after.player.dashTick >= 0) attack.dashedInDanger = true;
      else if (!touches && overlaps(box, grounded) && after.player.dashTick < 0) {
        if (!after.player.onGround) attack.airborneInDanger = true;
        else if (onRaisedSurface(after.player)) attack.platformInDanger = true;
      }
    }
    if (after.shotHits.some((h) => h.attackId === attack.attackId && h.originTick === attack.startTick)) {
      attack.hit = true;
      attack.damage += before.player.health - after.player.health;
      attack.actionWhenHit = actionOf(after.player, frame);
    }
    const owner = bossAt(after, attack.boss);
    const changedPhase = owner.phase !== bossAt(before, attack.boss).phase;
    if (
      (events.includes('phaseChange') && changedPhase) ||
      events.includes('bossDefeated') ||
      events.includes('playerDefeated') ||
      (isDowned(after, attack.boss) && !isDowned(before, attack.boss))
    ) {
      attack.shotsCleared = true;
    } else if (t >= attack.lastShotAt && mine.length === 0) {
      attack.shotsDone = true;
    }
  };

  /** Feeds what happened on this update to an attack being watched. */
  const observe = (
    attack: OpenAttack,
    before: GameState,
    after: GameState,
    frame: InputFrame,
  ): void => {
    const { events, tick } = after;
    const owner = bossAt(after, attack.boss);
    const was = bossAt(before, attack.boss);
    if (
      was.mode === 'attack' &&
      owner.mode === 'attack' &&
      was.attackId === owner.attackId &&
      owner.attackTick > 0 &&
      owner.attackTick === was.attackTick
    ) {
      attack.held += 1;
    }
    const t = tick - attack.startTick - attack.held;
    attack.lastT = t;
    const dodgeStarted = dodgeBegan(before, after);
    if (dodgeStarted && attack.dodgeStart === null && t <= attack.dangerTo) attack.dodgeStart = tick;

    // What saved the player is judged against the boxes that were really dangerous on this update (`boxes`, cut
    // by cover) and against what the attack would have covered in a bare arena (`bare`, the same list when the
    // boss has no arena). Each is asked about the player where they are (`real`) and where they would stand on the
    // floor at the same x (`grounded`).
    const def = bossDefFor(after, fight, attack.boss);
    const boxes = activeHitBoxes(owner, def);
    const real = playerBox(after.player);
    const bare = def.arena === undefined ? boxes : activeHitBoxes(owner, def, { ignoreCover: true });
    if (bare.length > 0) {
      const grounded = playerBox({ ...after.player, y: WORLD.floorY });
      const cutReal = boxes.some((b) => overlaps(b, real));
      const cutFloor = boxes.some((b) => overlaps(b, grounded));
      const rawReal = bare.some((b) => overlaps(b, real));
      const rawFloor = bare.some((b) => overlaps(b, grounded));
      // The dash asks whether the i-frames were really needed, so it uses the boxes that existed.
      if (cutReal && after.player.dashTick >= 0) attack.dashedInDanger = true;
      // Height saved the player: up there the bare attack misses, on the floor it would not have.
      if (!cutReal && !rawReal && rawFloor && !after.player.onGround && after.player.dashTick < 0) {
        attack.airborneInDanger = true;
      }
      // The same test from a raised surface (a dash along it is judged by the dash rule instead).
      if (!cutReal && !rawReal && rawFloor && onRaisedSurface(after.player) && after.player.dashTick < 0) {
        attack.platformInDanger = true;
      }
      // Cover saved the player: the bare attack would have reached them (standing or where they stood), the cut
      // one reaches neither.
      if (!cutReal && !cutFloor && (rawReal || rawFloor)) attack.coveredInDanger = true;
    }
    // A demonstration that reaches the player counts as a hit for this attack (it just takes no health).
    // A hit by a shot belongs to the attack that fired it (see `observeShots`), whichever attack is open now.
    if ((events.includes('playerHit') || events.includes('studyHit')) && after.shotHits.length === 0) {
      attack.hit = true;
      attack.damage += before.player.health - after.player.health;
      attack.actionWhenHit = actionOf(after.player, frame);
    }
    if (events.includes('counter')) attack.countered = true;
    if (
      !attack.countered &&
      owner.mode === 'attack' &&
      t >= attack.recoveryFrom &&
      !attack.windowOpen
    ) {
      attack.windowOpen = true;
    }
    if (attack.windowOpen && events.includes('bossHit')) attack.windowTaken = true;
    observeShots(attack, before, after, frame);
  };

  for (const frame of frames) {
    const before = state;
    // Once the fight is over the game only counts down to a restart; that is not part of this fight.
    if (before.phase !== 'fight') break;
    state = step(before, frame, fight);
    const after = state;
    const { events, tick } = after;

    const dashStarted = events.includes('dash');
    const jumpStarted = before.player.onGround && !after.player.onGround && after.player.vy < 0;
    const playerHit = events.includes('playerHit');
    if (dashStarted) dashes += 1;
    if (jumpStarted) jumps += 1;
    if (after.player.attackTick === 0) swings += 1;
    if (events.includes('bossHit')) {
      swingsThatHit += 1;
      bossHitTicks.push(tick);
    }
    if (events.includes('counter')) counters += 1;
    if (playerHit) {
      hitsTaken += 1;
      playerHitTicks.push(tick);
    }
    if (events.includes('studyHit')) studyHits += 1;
    if (after.study.active) studyUpdates += 1;
    maxPhases.forEach((reached, i) => {
      maxPhases[i] = Math.max(reached, bossAt(after, i).phase);
    });
    const distance = nearestDistance(after);
    // An update belongs to the study when it ran while the study was on (the study's last update included).
    const inStudy = before.study.active;
    if (distance < CLOSE_BELOW) {
      close += 1;
      if (inStudy) studyClose += 1;
    } else if (distance <= MID_UP_TO) {
      mid += 1;
      if (inStudy) studyMid += 1;
    } else {
      far += 1;
      if (inStudy) studyFar += 1;
    }
    if (onRaisedSurface(after.player)) platformUpdates += 1;
    if (tick % POSITION_EVERY === 0) positions.push(Math.round(after.player.x));

    for (const waiting of lingering) observeShots(waiting, before, after, frame);
    const settled = lingering.filter((x) => x.shotsDone || x.shotsCleared);
    if (settled.length > 0) {
      for (const x of settled) attacks.push(occurrence(x));
      lingering = lingering.filter((x) => !settled.includes(x));
    }
    if (open !== null) observe(open, before, after, frame);

    const started = events.includes('bossWindupGold') || events.includes('bossWindupRed');
    if (open !== null && (started || bossAt(after, open.boss).mode !== 'attack')) {
      finish(open, false);
      open = null;
    }
    // An attack countered on its very first update has no attack id any more: it is still the pending one before.
    const index = started ? attackerOf(before, after) : 0;
    const id = bossAt(after, index).attackId ?? bossAt(before, index).pendingAttackId;
    const def = started ? bossDefFor(after, fight, index).attacks.find((a) => a.id === id) : undefined;
    if (def !== undefined) {
      // A bolt is dangerous from the update it fires; an arc from the update it lands until its burst ends;
      // an eruption from the update its blast goes off until the blast ends.
      const shots = def.shots ?? [];
      const dangerStart = (x: ShotDef): number =>
        x.kind === 'arc' ? x.at + x.flight : x.kind === 'eruption' ? x.at + x.delay : x.at;
      const dangerEnd = (x: ShotDef): number =>
        x.kind === 'arc' ? x.at + x.flight + x.burst : x.kind === 'eruption' ? x.at + x.delay + x.burst + (x.linger ?? 0) : x.at + 1;
      const froms = [...def.hits.map((h) => h.from), ...shots.map(dangerStart)];
      const tos = [...def.hits.map((h) => h.to), ...shots.map(dangerEnd)];
      open = {
        attackId: def.id,
        boss: index,
        phase: bossAt(after, index).phase + 1,
        startTick: tick,
        windup: def.windup,
        dangerFrom: froms.length > 0 ? Math.min(...froms) : def.windup,
        dangerTo: tos.length > 0 ? Math.max(...tos) : def.windup + def.active,
        recoveryFrom: def.windup + def.active,
        distance: Math.abs(after.player.x - bossAt(after, index).x),
        actionAtStart: actionOf(after.player, frame),
        dodgeStart: null,
        dashedInDanger: false,
        airborneInDanger: false,
        platformInDanger: false,
        coveredInDanger: false,
        hit: false,
        countered: false,
        damage: 0,
        actionWhenHit: null,
        study: after.study.active,
        lastT: 0,
        shotsFired: shots.length,
        lastShotAt: shots.length > 0 ? Math.max(...shots.map((x) => x.at)) : 0,
        shotsDone: false,
        shotsCleared: false,
        windowOpen: false,
        windowTaken: false,
        held: 0,
      };
      // What happened on the update the attack began (a dodge, or a counter that cancels it at once) counts too.
      observe(open, before, after, frame);
      if (bossAt(after, index).mode !== 'attack') {
        finish(open, false);
        open = null;
      }
    }
  }
  if (open !== null) finish(open, true);
  // Shots still flying when the run ended: their attacks are not resolved.
  for (const waiting of lingering) attacks.push(occurrence(waiting));
  attacks.sort((a, b) => a.startTick - b.startTick);

  const studyTicks = state.study.active ? studyUpdates : state.study.endTick;
  const bosses: BossAnalysis[] = fight.bosses.map((def, i) => ({
    id: def.id,
    name: def.name,
    maxHp: def.maxHp,
    hpLeft: bossAt(state, i).hp,
    phaseReached: maxPhases[i]! + 1,
    phaseCount: def.phases.length,
    damageDealt: def.maxHp - bossAt(state, i).hp,
  }));
  const sum = (pick: (b: BossAnalysis) => number): number => bosses.reduce((total, b) => total + pick(b), 0);
  return {
    ticks: state.tick,
    seconds: state.tick / TICK_RATE,
    fightSeconds: (state.tick - studyTicks) / TICK_RATE,
    phaseReached: maxPhases[0]! + 1,
    phaseCount: fight.bosses[0]!.phases.length,
    bossHpLeft: sum((b) => b.hpLeft),
    bossMaxHp: sum((b) => b.maxHp),
    damageDealt: sum((b) => b.damageDealt),
    bosses,
    damageTaken: PLAYER.maxHealth - state.player.health,
    hitsTaken,
    bossHitTicks,
    playerHitTicks,
    swings,
    swingsThatHit,
    accuracy: swings === 0 ? null : swingsThatHit / swings,
    counters,
    dashes,
    jumps,
    attacks,
    study: {
      rounds: studyRounds,
      ticks: studyTicks,
      attacks: attacks.filter((x) => x.study).length,
      hits: studyHits,
    },
    behavior: {
      updatesClose: close,
      updatesMid: mid,
      updatesFar: far,
      studyUpdatesClose: studyClose,
      studyUpdatesMid: studyMid,
      studyUpdatesFar: studyFar,
      positionEvery: POSITION_EVERY,
      positions,
      punish,
      updatesOnPlatform: platformUpdates,
    },
  };
}

/** Analyzes a stored fight: rebuilds the boss from its id and dials and replays the recorded input. */
export function analyzeFight(
  // `study` is missing in records of schema version 1: those analyse as a fight without a study.
  record: Pick<FightRecord, 'bossId' | 'dials' | 'seed' | 'input'> & { study?: FightRecord['study'] },
): Analysis {
  const fight = applyDialsToFight(resolveFight(record.bossId, record.seed).fight, record.dials);
  const study = record.study ?? 0;
  return analyzeRun(fight, createInitialState(fight, record.seed, study), decodeInputs(record.input), study);
}

/** Analyzes a fight just recorded, taking everything (boss, dials, seed, study) from its meta, so none can be forgotten. */
export function analyzeRecording(recording: Recording): Analysis {
  return analyzeFight({
    bossId: recording.meta.bossId,
    dials: recording.meta.dials,
    seed: recording.meta.seed,
    input: recording.runs,
    study: recording.meta.study,
  });
}

import { bossById } from '../bosses';
import type { BossDef } from '../bosses/schema';
import type { InputFrame } from '../engine/input-frame';
import { TICK_RATE } from '../engine/time';
import { applyDials } from '../game/difficulty';
import { PLAYER } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState, type PlayerState } from '../game/state';
import { decodeInputs } from './input-log';
import type { FightRecord } from './record';

/** Distance bands between player and boss, in world units. */
export const CLOSE_BELOW = 160;
export const MID_UP_TO = 400;
/** The player's x is sampled once every this many updates (10 per second). */
export const POSITION_EVERY = 6;

export type PlayerAction = 'idle' | 'running' | 'airborne' | 'dashing' | 'attacking';
/** `interrupted`: the fight ended (or was left) while the attack was still going. */
export type AttackOutcome = 'hit' | 'countered' | 'dodged' | 'interrupted';
export type Evasion = 'dash' | 'jump' | 'distance';

export interface AttackOccurrence {
  attackId: string;
  /** 1-based phase number the boss was in. */
  phase: number;
  /** The update the warning began, and the warning's length. */
  startTick: number;
  windupTicks: number;
  /** The first update on which the attack could hurt. */
  firstDangerTick: number;
  /** Distance to the player when the warning began, and what the player was doing. */
  distance: number;
  playerActionAtStart: PlayerAction;
  outcome: AttackOutcome;
  /** How a dodged attack was avoided; null for the other outcomes. */
  evasion: Evasion | null;
  /** From the start of the warning to the player's first dash or jump before the dangerous moment; null if none. */
  reactionTicks: number | null;
  reactionMs: number | null;
  /** Dangerous moment minus the start of the dodge: small means a tight dodge, negative means too late. Null when there was no dodge action. */
  marginTicks: number | null;
  marginMs: number | null;
  /** Hits this attack cost the player, and what the player was doing when hit (null when not hit). */
  damageTaken: number;
  playerActionWhenHit: PlayerAction | null;
}

export interface PunishWindows {
  /** Recovery periods of attacks that were not countered. */
  opened: number;
  /** Windows in which the player hit the boss. */
  taken: number;
  missed: number;
}

export interface Analysis {
  ticks: number;
  seconds: number;
  phaseReached: number;
  phaseCount: number;
  bossHpLeft: number;
  bossMaxHp: number;
  damageDealt: number;
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
  behavior: {
    updatesClose: number;
    updatesMid: number;
    updatesFar: number;
    positionEvery: number;
    /** The player's x every `positionEvery` updates, rounded. */
    positions: number[];
    punish: PunishWindows;
  };
}

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
  hit: boolean;
  countered: boolean;
  damage: number;
  actionWhenHit: PlayerAction | null;
  windowOpen: boolean;
  windowTaken: boolean;
}

function occurrence(open: OpenAttack, interrupted: boolean): AttackOccurrence {
  const outcome: AttackOutcome = open.countered
    ? 'countered'
    : open.hit
      ? 'hit'
      : interrupted
        ? 'interrupted'
        : 'dodged';
  const evasion: Evasion | null =
    outcome !== 'dodged' ? null : open.dashedInDanger ? 'dash' : open.airborneInDanger ? 'jump' : 'distance';
  const firstDanger = open.startTick + open.dangerFrom;
  const dodge = open.dodgeStart;
  const reactionTicks = dodge !== null && dodge <= firstDanger ? dodge - open.startTick : null;
  const hasMargin = dodge !== null && (outcome === 'hit' || evasion === 'dash' || evasion === 'jump');
  const marginTicks = hasMargin ? firstDanger - dodge : null;
  return {
    attackId: open.attackId,
    phase: open.phase,
    startTick: open.startTick,
    windupTicks: open.windup,
    firstDangerTick: firstDanger,
    distance: open.distance,
    playerActionAtStart: open.actionAtStart,
    outcome,
    evasion,
    reactionTicks,
    reactionMs: reactionTicks === null ? null : toMs(reactionTicks),
    marginTicks,
    marginMs: marginTicks === null ? null : toMs(marginTicks),
    damageTaken: open.damage,
    playerActionWhenHit: open.actionWhenHit,
  };
}

/**
 * Replays a fight through the real game and measures it. Pure: it only reads the states and events that
 * `step` produces, so the numbers can never disagree with what the game did.
 */
export function analyzeRun(boss: BossDef, initial: GameState, frames: readonly InputFrame[]): Analysis {
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
  let close = 0;
  let mid = 0;
  let far = 0;
  let maxPhase = state.boss.phase;
  let open: OpenAttack | null = null;

  const finish = (attack: OpenAttack, interrupted: boolean): void => {
    if (attack.windowOpen) {
      if (attack.windowTaken) punish.taken += 1;
      else punish.missed += 1;
    }
    attacks.push(occurrence(attack, interrupted));
  };

  for (const frame of frames) {
    const before = state;
    state = step(before, frame, boss);
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
    maxPhase = Math.max(maxPhase, after.boss.phase);
    const distance = Math.abs(after.player.x - after.boss.x);
    if (distance < CLOSE_BELOW) close += 1;
    else if (distance <= MID_UP_TO) mid += 1;
    else far += 1;
    if (tick % POSITION_EVERY === 0) positions.push(Math.round(after.player.x));

    if (open !== null) {
      const t = tick - open.startTick;
      if ((dashStarted || jumpStarted) && open.dodgeStart === null && t <= open.dangerTo) {
        open.dodgeStart = tick;
      }
      if (after.boss.mode === 'attack' && t >= open.dangerFrom && t < open.dangerTo) {
        if (after.player.dashTick >= 0) open.dashedInDanger = true;
        if (!after.player.onGround) open.airborneInDanger = true;
      }
      if (playerHit) {
        open.hit = true;
        open.damage += before.player.health - after.player.health;
        open.actionWhenHit = actionOf(after.player, frame);
      }
      if (events.includes('counter')) open.countered = true;
      if (!open.countered && after.boss.mode === 'attack' && t >= open.recoveryFrom && !open.windowOpen) {
        open.windowOpen = true;
        punish.opened += 1;
      }
      if (open.windowOpen && events.includes('bossHit')) open.windowTaken = true;
    }

    const started = events.includes('bossWindupGold') || events.includes('bossWindupRed');
    if (open !== null && (started || after.boss.mode !== 'attack')) {
      finish(open, false);
      open = null;
    }
    const def = started ? boss.attacks.find((a) => a.id === after.boss.attackId) : undefined;
    if (def !== undefined) {
      const froms = def.hits.map((h) => h.from);
      const tos = def.hits.map((h) => h.to);
      open = {
        attackId: def.id,
        phase: after.boss.phase + 1,
        startTick: tick,
        windup: def.windup,
        dangerFrom: froms.length > 0 ? Math.min(...froms) : def.windup,
        dangerTo: tos.length > 0 ? Math.max(...tos) : def.windup + def.active,
        recoveryFrom: def.windup + def.active,
        distance,
        actionAtStart: actionOf(after.player, frame),
        dodgeStart: null,
        dashedInDanger: false,
        airborneInDanger: false,
        hit: false,
        countered: false,
        damage: 0,
        actionWhenHit: null,
        windowOpen: false,
        windowTaken: false,
      };
    }
  }
  if (open !== null) finish(open, true);

  return {
    ticks: state.tick,
    seconds: state.tick / TICK_RATE,
    phaseReached: maxPhase + 1,
    phaseCount: boss.phases.length,
    bossHpLeft: state.boss.hp,
    bossMaxHp: boss.maxHp,
    damageDealt: boss.maxHp - state.boss.hp,
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
    behavior: {
      updatesClose: close,
      updatesMid: mid,
      updatesFar: far,
      positionEvery: POSITION_EVERY,
      positions,
      punish,
    },
  };
}

/** Analyzes a stored fight: rebuilds the boss from its id and dials and replays the recorded input. */
export function analyzeFight(
  record: Pick<FightRecord, 'bossId' | 'dials' | 'seed' | 'input'>,
): Analysis {
  const boss = applyDials(bossById(record.bossId), record.dials);
  return analyzeRun(boss, createInitialState(boss, record.seed), decodeInputs(record.input));
}

import { NO_INPUT, type InputFrame } from '../../engine/input-frame';
import { PLAYER } from '../../game/params';
import { createInitialState, type GameState } from '../../game/state';
import { step } from '../../game/step';
import type { AttackDef, BossDef } from '../schema';
import { GEN } from './tuning';

export interface FairnessResult {
  fair: boolean;
  reasons: string[];
}

const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

const ATTACK_TOTAL = PLAYER.attack.startup + PLAYER.attack.active + PLAYER.attack.recovery;

/** Below this height a plain hit window is treated as low enough to dash through rather than jump over. */
const DASH_THROUGH_TOP = 90;

/**
 * Runs the idle bot (no input, ever) for one seed, up to `GEN.fairnessCapTicks` updates or until
 * the fight leaves `'fight'`. An idle player must always lose: true only when the run ends defeated.
 */
function idleLoses(boss: BossDef, seed: number): boolean {
  let s = createInitialState(boss, seed);
  for (let n = 0; n < GEN.fairnessCapTicks && s.phase === 'fight'; n++) {
    s = step(s, NO_INPUT, boss);
  }
  return s.phase === 'defeated';
}

/**
 * The skilled bot's input for the coming update, reacting to the boss's current attack (if any) by its
 * effect (`leap`, `move`, or a plain `hit`) exactly the way the M5a/M5c review bots did: a hard-coded,
 * deterministic answer keyed to the attack's own timing, not a general planner.
 */
function skilledInput(s: GameState, boss: BossDef): InputFrame {
  const { player: p, boss: b } = s;
  const dx = b.x - p.x;
  const towardBoss: 1 | -1 = dx >= 0 ? 1 : -1;

  if (b.mode === 'attack' && b.attackId !== null) {
    const attack: AttackDef | undefined = boss.attacks.find((a) => a.id === b.attackId);
    if (attack === undefined) return NO_INPUT;
    // The attack time the coming update (after this input is applied) will have.
    const t = b.attackTick + 1;

    if (attack.leap !== undefined) {
      // Hold still until the landing spot is known (fixed at take-off), then move away from it;
      // dash away instead if still close by the time it actually lands.
      if (b.leapToX === null) return NO_INPUT;
      const away: 1 | -1 = p.x < b.leapToX ? -1 : 1;
      const landed = t > attack.leap.to;
      const close = Math.abs(p.x - b.leapToX) < 150;
      if (landed && close) return withInput({ dashPressed: true, moveX: away });
      return withInput({ moveX: away });
    }

    // Every other reaction is a single scripted press on its exact update, holding still the rest
    // of the time: repeatedly walking during the windup would drift the player onto whichever side
    // of the boss it happens to be facing, undoing the point of dashing across to the far side.
    if (attack.move !== undefined) {
      // Dash through it, like the Duelist's lunge.
      const at = attack.windup - 3;
      return t === at ? withInput({ dashPressed: true, moveX: towardBoss }) : NO_INPUT;
    }

    // A plain hit-window attack: land a counter on a counterable one, otherwise dash through a
    // low window or jump over a high one (the jump apex, ~163, clears anything the dash cannot).
    if (attack.class === 'counterable') {
      const at = attack.windup - 6;
      return t === at ? withInput({ dashPressed: true, moveX: towardBoss }) : NO_INPUT;
    }
    const minTop = Math.min(...attack.hits.map((hit) => hit.top));
    if (minTop <= DASH_THROUGH_TOP) {
      const at = attack.windup - 6;
      return t === at ? withInput({ dashPressed: true, moveX: towardBoss }) : NO_INPUT;
    }
    const jumpAt = attack.windup - 10;
    if (t === jumpAt) return withInput({ jumpPressed: true, jumpHeld: true });
    if (t > jumpAt && t < jumpAt + 20) return withInput({ jumpHeld: true });
    return NO_INPUT;
  }

  // No attack running: walk toward the boss and, once close enough for the player's own swing to
  // reach it, press attack on a cadence no faster than a swing's own length.
  const distance = Math.abs(dx);
  const closeEnough = distance < PLAYER.attack.reach;
  return withInput({
    moveX: closeEnough ? 0 : towardBoss,
    attackPressed: closeEnough && s.tick % ATTACK_TOTAL === 0,
  });
}

interface SkilledRun {
  won: boolean;
  finished: boolean;
  tookDamage: boolean;
}

/** Runs the skilled bot for one seed, up to `GEN.fairnessSkilledCapTicks` updates or until the fight ends. */
function runSkilled(boss: BossDef, seed: number): SkilledRun {
  let s = createInitialState(boss, seed);
  let minHealth = s.player.health;
  for (let n = 0; n < GEN.fairnessSkilledCapTicks && s.phase === 'fight'; n++) {
    s = step(s, skilledInput(s, boss), boss);
    if (s.player.health < minHealth) minHealth = s.player.health;
  }
  return {
    won: s.phase === 'victory',
    finished: s.phase !== 'fight',
    tookDamage: minHealth < PLAYER.maxHealth,
  };
}

/**
 * General fairness checker: works on any `BossDef`, with no knowledge of how it was built. Runs a
 * small, cheap bot battery over two fixed seeds (never derived from the boss being checked):
 * - an idle player must always lose, for both seeds (proves the boss cannot stall);
 * - a scripted skilled bot must win without ever taking damage, for at least one of the two seeds
 *   (proves the boss is beatable and its attacks are readable).
 * Both checks must finish inside their update caps; a stalled fight is itself a failure.
 */
export function checkFairness(boss: BossDef): FairnessResult {
  const reasons: string[] = [];

  for (const seed of GEN.fairnessSeeds) {
    if (!idleLoses(boss, seed)) {
      reasons.push(`idle player did not lose at seed ${seed}`);
    }
  }

  const skilledRuns = GEN.fairnessSeeds.map((seed) => ({ seed, run: runSkilled(boss, seed) }));
  const cleanWin = skilledRuns.some(({ run }) => run.finished && run.won && !run.tookDamage);
  if (!cleanWin) {
    const unfinished = skilledRuns.filter(({ run }) => !run.finished);
    if (unfinished.length === skilledRuns.length) {
      reasons.push('skilled bot did not finish within the cap');
    } else if (skilledRuns.every(({ run }) => run.finished && run.won && run.tookDamage)) {
      reasons.push('skilled bot took damage at every seed');
    } else {
      reasons.push('skilled bot did not win without damage at any seed');
    }
  }

  return { fair: reasons.length === 0, reasons };
}

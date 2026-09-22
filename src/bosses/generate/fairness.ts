import { NO_INPUT, type InputFrame } from '../../engine/input-frame';
import { PLAYER, WORLD } from '../../game/params';
import { createInitialState, type GameState } from '../../game/state';
import { step } from '../../game/step';
import type { ArenaPiece, AttackDef, BossDef } from '../schema';
import { GEN } from './tuning';

export interface FairnessResult {
  fair: boolean;
  reasons: string[];
}

const withInput = (over: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...over });

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
 * Runs the idle bot (no input, ever) starting already perched at the centre of one arena piece's
 * top, instead of the floor — the camp-safety check. Closes a risk `docs/bosses.md` names but never
 * tests: a platform or cover tall enough could give the player a permanent safe spot. The centre is
 * the position most likely to be out of every attack's reach, so it stands in for the worst case
 * rather than an exhaustive search of every position on the piece.
 */
function idleLosesFromPerch(boss: BossDef, seed: number, piece: ArenaPiece): boolean {
  const perchY = WORLD.floorY - piece.height;
  let s = createInitialState(boss, seed);
  s = {
    ...s,
    player: { ...s.player, x: piece.x, prevX: piece.x, y: perchY, prevY: perchY, onGround: true },
  };
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
      // dash away instead if still close by the time it actually lands. The shockwave extends from
      // the landing spot in the direction the boss faces, so escape the opposite way — `p.x` cannot
      // tell us that, since it equals `leapToX` exactly at take-off (the leap targets the player's
      // own position then).
      if (b.leapToX === null) return NO_INPUT;
      const away: 1 | -1 = b.facing === 1 ? -1 : 1;
      const landed = t >= attack.leap.to;
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

    // A counterable attack: land a real counter, pressing attack once inside the counter window
    // while close enough (the boss's own `counter.range` and `counter.window`).
    if (attack.class === 'counterable') {
      const inWindow = t >= attack.windup - boss.counter.window && t <= attack.windup - 1;
      const inRange = Math.abs(p.x - b.x) <= boss.counter.range;
      return inWindow && inRange ? withInput({ attackPressed: true }) : NO_INPUT;
    }

    // A plain hit-window attack: dash through it. The dash grants full invulnerability for its
    // whole 11-update duration regardless of position, so time the press to make that window start
    // right as the hit itself starts (hits begin at `windup`); a hit window longer than the dash's
    // duration leaves an unavoidable gap near the end, which is fine.
    const at = attack.windup;
    return t === at ? withInput({ dashPressed: true, moveX: towardBoss }) : NO_INPUT;
  }

  // No attack running: walk toward the boss and, once close enough for the player's own swing to
  // reach it, swing again as soon as the previous swing/recovery has finished.
  const distance = Math.abs(dx);
  const closeEnough = distance < PLAYER.attack.reach;
  return withInput({
    moveX: closeEnough ? 0 : towardBoss,
    attackPressed: closeEnough && p.attackTick < 0,
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

  const pieces: ArenaPiece[] = [...(boss.arena?.platforms ?? []), ...(boss.arena?.covers ?? [])];
  for (const piece of pieces) {
    for (const seed of GEN.fairnessSeeds) {
      if (!idleLosesFromPerch(boss, seed, piece)) {
        reasons.push(
          `idle player camping on a piece at x=${piece.x} height=${piece.height} did not lose at seed ${seed}`,
        );
      }
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

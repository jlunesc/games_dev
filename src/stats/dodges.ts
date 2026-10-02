import type { InputFrame } from '../engine/input-frame';
import type { FightDef } from '../game/fight';
import { step } from '../game/step';
import { bossAt, type GameState } from '../game/state';
import { bossDefFor } from '../game/turns';
import { dangerSpan, type Analysis } from './analyze';
import { DETAILS_TUNING as T } from './details-tuning';
import type { AttackStart, ReplayMeasures } from './meter';

/**
 * How a dash or jump made during an attack (from its warning to the end of its danger) turned out, found by replaying the
 * attack as if the dash or jump had not been made:
 * - `saved`: without it the attack would have hit you, and with it it did not;
 * - `unneeded`: the attack would have missed you anyway;
 * - `hitAnyway`: you made it and the attack hit you all the same.
 */
export type DodgeVerdict = 'saved' | 'unneeded' | 'hitAnyway';

export interface DodgeRating {
  attackId: string;
  boss: number;
  /** The update the attack's warning began, into the real fight. */
  start: number;
  verdict: DodgeVerdict;
  /** For `saved`: how many updates later the dodge could have begun and still saved you (0: it only just worked; `T.maxSlackTicks`: at least that many). Otherwise null. */
  slackTicks: number | null;
}

/** Updates a replay may run past the end of an attack's danger waiting for its shots to be gone. */
const SHOT_WAIT = 120;

/** What the attack did to the player during a replay. Hits by another boss or another attack do not count. */
function hurtsPlayer(after: GameState, start: AttackStart): boolean {
  if (!after.events.includes('playerHit')) return false;
  if (after.shotHits.length > 0) return after.shotHits.some((h) => h.attackId === start.attackId && h.originTick === start.state.tick);
  const boss = bossAt(after, start.boss);
  return boss.mode === 'attack' && boss.attackId === start.attackId;
}

/**
 * Whether the attack hurts the player when the dashes and jumps from update `from` on begin `shift` updates later than
 * they really did (`Infinity`: never). Everything else the player did stays as it was.
 */
function hurtWhenShifted(fight: FightDef, start: AttackStart, frames: readonly InputFrame[], from: number, until: number, shift: number): boolean {
  let s = start.state;
  for (let i = start.tick; i < frames.length && i < until + SHOT_WAIT; i++) {
    if (i >= until && !s.shots.some((x) => (x.owner ?? 0) === start.boss && x.originTick === start.state.tick)) break;
    const real = frames[i]!;
    let frame = real;
    if (i >= from) {
      const source = shift === Infinity || i - shift < from ? undefined : frames[i - shift];
      frame = { ...real, dashPressed: source?.dashPressed ?? false, jumpPressed: source?.jumpPressed ?? false, jumpHeld: source?.jumpHeld ?? false };
    }
    s = step(s, frame, fight);
    if (hurtsPlayer(s, start)) return true;
    if (s.phase !== 'fight') break;
  }
  return false;
}

/** The most updates later the dodge could have begun, up to `T.maxSlackTicks`, with the attack still missing (found by halving; a dodge that works late works early). */
function slackOf(fight: FightDef, start: AttackStart, frames: readonly InputFrame[], from: number, until: number): number {
  if (!hurtWhenShifted(fight, start, frames, from, until, T.maxSlackTicks)) return T.maxSlackTicks;
  let works = 0;
  let fails: number = T.maxSlackTicks;
  while (fails - works > 1) {
    const mid = Math.floor((works + fails) / 2);
    if (hurtWhenShifted(fight, start, frames, from, until, mid)) fails = mid;
    else works = mid;
  }
  return works;
}

/**
 * Rates every attack of the real fight during which the player dashed or jumped (and was not countering it): would the
 * attack have hit without the dodge, and if it would have, how much later the dodge could have been. Replays only those
 * attacks from the moment their warning began, so it is cheap. Derived, never stored.
 */
export function rateDodges(fight: FightDef, analysis: Analysis, measures: ReplayMeasures): DodgeRating[] {
  const studyTicks = analysis.study.ticks;
  const { frames, dodgeTicks, starts } = measures.trace;
  const ratings: DodgeRating[] = [];
  for (const attack of analysis.attacks) {
    if (attack.study || (attack.outcome !== 'hit' && attack.outcome !== 'dodged')) continue;
    const begin = attack.startTick - studyTicks;
    const start = starts.find((x) => x.boss === attack.boss && x.attackId === attack.attackId && Math.abs(x.tick - begin) <= 1);
    if (start === undefined) continue;
    const def = bossDefFor(start.state, fight, start.boss).attacks.find((a) => a.id === attack.attackId);
    if (def === undefined) continue;
    const danger = dangerSpan(def);
    const until = Math.max(attack.firstDangerTick - studyTicks - danger.from + danger.to + 1, start.lastShotTick);
    const dodge = dodgeTicks.find((t) => t > start.tick && t <= until);
    if (dodge === undefined) continue;
    const rating = { attackId: attack.attackId, boss: attack.boss, start: start.tick };
    if (attack.outcome === 'hit') {
      ratings.push({ ...rating, verdict: 'hitAnyway', slackTicks: null });
      continue;
    }
    // Update `dodge` is frames[dodge - 1]: the replay changes the inputs from there.
    const from = dodge - 1;
    if (!hurtWhenShifted(fight, start, frames, from, until, Infinity)) ratings.push({ ...rating, verdict: 'unneeded', slackTicks: null });
    else ratings.push({ ...rating, verdict: 'saved', slackTicks: slackOf(fight, start, frames, from, until) });
  }
  return ratings;
}

import type { AttackDef } from '../../bosses/schema';
import type { FightDef } from '../../game/fight';
import { bossAt, bossCount, type BossState, type GameEvent, type GameState, type ShotState } from '../../game/state';
import { fellBosses, phasedBoss, struckBoss } from '../look/who';
import { HIT_VARIATION, PAIR_PAN, POSE_PITCH, PRIORITY, SHOT_PASS, type VoiceName } from './tuning';

/** One sound to play: which recipe, a pitch multiplier (1 = as written), a pan from -1 to 1, and its priority. */
export interface Cue {
  voice: VoiceName;
  pitch?: number;
  pan?: number;
  priority: number;
}

interface Extra {
  pitch?: number;
  pan?: number;
}

const PLAYER_EVENT_VOICE: Partial<Record<GameEvent, VoiceName>> = {
  playerHit: 'playerHurt',
  studyHit: 'studyHit',
  dash: 'dash',
  counter: 'counter',
  playerDefeated: 'defeat',
};

export const cue = (voice: VoiceName, extra: Extra = {}): Cue => ({ voice, priority: PRIORITY[voice], ...extra });

const extra = (pitch: number | undefined, pan: number | undefined): Extra => ({
  ...(pitch === undefined ? {} : { pitch }),
  ...(pan === undefined ? {} : { pan }),
});

/** Two cues that would sound the same are one cue (two hit events in one update must not double the volume). */
export function mergeCues(cues: readonly Cue[]): Cue[] {
  const seen = new Set<string>();
  const merged: Cue[] = [];
  for (const c of cues) {
    const key = `${c.voice}|${c.pitch ?? 1}|${c.pan ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  return merged;
}

/** A pitch multiplier for a boss hit that shifts a little with the tick, so repeated hits do not sound identical. Deterministic. */
export function hitPitch(tick: number): number {
  const step = (tick * 7919) % HIT_VARIATION.steps;
  return 1 + (step - (HIT_VARIATION.steps - 1) / 2) * HIT_VARIATION.spread;
}

/** In a pair fight boss 0 pans left and the others right; a fight of one is centred (undefined). */
const panOf = (fight: FightDef, index: number): number | undefined =>
  fight.bosses.length < 2 ? undefined : index === 0 ? -PAIR_PAN : PAIR_PAN;

const attackOf = (fight: FightDef, index: number, id: string | null): AttackDef | undefined =>
  id === null ? undefined : fight.bosses[index]?.attacks.find((a) => a.id === id);

/** Whether the boss began an attack in this update: a new one, a different one, or the same one from the top again. */
export function attackStarted(was: BossState, now: BossState): boolean {
  return (
    now.mode === 'attack' &&
    now.attackId !== null &&
    (was.mode !== 'attack' || was.attackId !== now.attackId || now.attackTick <= was.attackTick)
  );
}

/** Whether the running attack's tick reached `tick` in this update (the update an attack begins counts as reaching tick 0). */
function crossed(was: BossState, now: BossState, tick: number): boolean {
  if (now.mode !== 'attack' || now.attackId === null) return false;
  const from = attackStarted(was, now) ? -1 : was.attackTick;
  return from < tick && tick <= now.attackTick;
}

function bossCues(before: GameState, after: GameState, fight: FightDef, index: number, out: Cue[]): void {
  const was = bossAt(before, index);
  const now = bossAt(after, index);
  const pan = panOf(fight, index);
  const push = (voice: VoiceName, pitch?: number): void => {
    out.push(cue(voice, extra(pitch, pan)));
  };
  const attack = attackOf(fight, index, now.attackId);
  if (attack !== undefined) {
    if (attackStarted(was, now)) {
      push(attack.class === 'counterable' ? 'warningGold' : 'warningRed');
      if (attack.shots !== undefined && attack.shots.length > 0) push('charge');
      else push('swell', POSE_PITCH[attack.pose]);
    }
    if (attack.hits.length > 0 && crossed(was, now, attack.windup)) push('strike');
    if (attack.move !== undefined && crossed(was, now, attack.move.from)) push('whoosh');
  }
  // A dive shares the leap's take-off point but also records a height, so `diveFromLift` tells them apart.
  if (was.leapFromX === null && now.leapFromX !== null && now.diveFromLift === null) push('leapUp');
  if (was.diveFromLift === null && now.diveFromLift !== null) push('diveDown');
  // A leap or plunge that ends by a counter (stagger), a phase change (transition) or a defeat also drops the boss to the
  // floor, so only a landing while the boss is still up and not staggered counts as a slam.
  if (
    was.leapFromX !== null &&
    now.leapFromX === null &&
    now.lift <= 0 &&
    now.hp > 0 &&
    now.mode !== 'stagger' &&
    now.mode !== 'transition'
  ) {
    push('slam');
  }
}

const LAUNCH: Record<ShotState['kind'], VoiceName> = { bolt: 'shotLaunch', arc: 'arcLaunch', eruption: 'eruptionMark' };

function tally(shots: readonly ShotState[]): Map<string, { count: number; shot: ShotState }> {
  const counts = new Map<string, { count: number; shot: ShotState }>();
  for (const shot of shots) {
    const key = `${shot.kind}|${shot.owner ?? 0}|${shot.attackId}|${shot.originTick}`;
    const entry = counts.get(key);
    if (entry === undefined) counts.set(key, { count: 1, shot });
    else entry.count += 1;
  }
  return counts;
}

const nearBolts = (shots: readonly ShotState[], playerX: number): number =>
  shots.reduce((n, s) => n + (s.kind === 'bolt' && Math.abs(s.x - playerX) < SHOT_PASS.range ? 1 : 0), 0);

function shotCues(before: GameState, after: GameState, fight: FightDef, out: Cue[]): void {
  if (before.shots.length === 0 && after.shots.length === 0) return;
  const was = tally(before.shots);
  for (const [key, entry] of tally(after.shots)) {
    if (entry.count <= (was.get(key)?.count ?? 0)) continue;
    out.push(cue(LAUNCH[entry.shot.kind], extra(undefined, panOf(fight, entry.shot.owner ?? 0))));
  }
  for (const shot of after.shots) {
    const pan = panOf(fight, shot.owner ?? 0);
    if (shot.kind === 'arc' && shot.age === shot.flight) out.push(cue('arcLand', extra(undefined, pan)));
    if (shot.kind === 'eruption' && shot.age === shot.delay) out.push(cue('eruptionBlast', extra(undefined, pan)));
  }
  const playerX = after.player.x;
  if (nearBolts(after.shots, playerX) > nearBolts(before.shots, before.player.x)) {
    const bolt = after.shots.find((s) => s.kind === 'bolt' && Math.abs(s.x - playerX) < SHOT_PASS.range);
    if (bolt !== undefined) out.push(cue('boltPass', { pan: (bolt.x >= playerX ? 1 : -1) * SHOT_PASS.pan }));
  }
}

/**
 * The sounds for one update, worked out from the game state before and after it. Pure: it reads the states and
 * changes nothing, so a fight plays and replays the same with or without sound. Most important first.
 */
export function cuesFor(before: GameState, after: GameState, fight: FightDef): Cue[] {
  // The killing blow is the end of the fight: the defeat thump and the loss jingle play alone, with no hurt sound, strike or blast over them.
  if (after.events.includes('playerDefeated')) return [cue('defeat')];
  const cues: Cue[] = [];
  for (const event of after.events) {
    const voice = PLAYER_EVENT_VOICE[event];
    if (voice !== undefined) cues.push(cue(voice));
  }
  if (after.events.includes('bossHit')) {
    cues.push(cue('hit', extra(hitPitch(after.tick), panOf(fight, struckBoss(before, after)))));
  }
  if (after.events.includes('phaseChange')) {
    cues.push(cue('phaseChange', extra(undefined, panOf(fight, phasedBoss(before, after)))));
  }
  if (after.events.includes('bossDefeated') || after.events.includes('bossDown')) {
    const fell = fellBosses(before, after);
    if (fell.length === 0) cues.push(cue('fall'));
    for (const index of fell) cues.push(cue('fall', extra(undefined, panOf(fight, index))));
  }
  for (let index = 0; index < bossCount(after); index++) bossCues(before, after, fight, index, cues);
  shotCues(before, after, fight, cues);
  return mergeCues(cues).sort((a, b) => b.priority - a.priority);
}

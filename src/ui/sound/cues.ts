import type { FightDef } from '../../game/fight';
import type { GameEvent, GameState } from '../../game/state';
import { HIT_VARIATION, PRIORITY, type VoiceName } from './tuning';

/** One sound to play: which recipe, a pitch multiplier (1 = as written), a pan from -1 to 1, and its priority. */
export interface Cue {
  voice: VoiceName;
  pitch?: number;
  pan?: number;
  priority: number;
}

const EVENT_VOICE: Partial<Record<GameEvent, VoiceName>> = {
  bossHit: 'hit',
  playerHit: 'playerHurt',
  studyHit: 'studyHit',
  dash: 'dash',
  bossWindupGold: 'warningGold',
  bossWindupRed: 'warningRed',
  counter: 'counter',
  phaseChange: 'phaseChange',
  bossDefeated: 'fall',
  bossDown: 'fall',
  playerDefeated: 'defeat',
};

export const cue = (voice: VoiceName, extra: { pitch?: number; pan?: number } = {}): Cue => ({
  voice,
  priority: PRIORITY[voice],
  ...extra,
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

/**
 * The sounds for one update, worked out from the game state before and after it. Pure: it reads the states and
 * changes nothing, so a fight plays and replays the same with or without sound.
 */
export function cuesFor(_before: GameState, after: GameState, _fight: FightDef): Cue[] {
  const cues: Cue[] = [];
  for (const event of after.events) {
    const voice = EVENT_VOICE[event];
    if (voice === undefined) continue;
    cues.push(voice === 'hit' ? cue(voice, { pitch: hitPitch(after.tick) }) : cue(voice));
  }
  return mergeCues(cues);
}

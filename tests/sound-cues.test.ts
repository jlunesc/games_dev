import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { cuesFor } from '../src/ui/sound/cues';
import { PRIORITY } from '../src/ui/sound/tuning';

const fight = asFight(EMBER_DUELIST);
const idle = (): GameState => createInitialState(EMBER_DUELIST, 1);
const withEvents = (events: GameEvent[]): GameState => ({ ...idle(), events });
const voices = (events: GameEvent[]): string[] => cuesFor(idle(), withEvents(events), fight).map((c) => c.voice);

describe('cues from the game events', () => {
  it('gives no sound for a quiet update', () => {
    expect(voices([])).toEqual([]);
  });

  it('maps each event to its sound', () => {
    expect(voices(['bossHit'])).toEqual(['hit']);
    expect(voices(['playerHit'])).toEqual(['playerHurt']);
    expect(voices(['studyHit'])).toEqual(['studyHit']);
    expect(voices(['dash'])).toEqual(['dash']);
    expect(voices(['counter'])).toEqual(['counter']);
    expect(voices(['phaseChange'])).toEqual(['phaseChange']);
    expect(voices(['playerDefeated'])).toEqual(['defeat']);
    expect(voices(['bossWindupGold'])).toEqual(['warningGold']);
    expect(voices(['bossWindupRed'])).toEqual(['warningRed']);
  });

  it('keeps the gold and red warnings distinct', () => {
    expect(voices(['bossWindupGold', 'bossWindupRed'])).toEqual(['warningGold', 'warningRed']);
  });

  it('merges identical cues, so two boss events in one update do not double up', () => {
    expect(voices(['bossDefeated', 'bossDown'])).toEqual(['fall']);
    expect(voices(['bossHit', 'bossHit'])).toEqual(['hit']);
  });

  it('carries the priority of its sound', () => {
    const [cue] = cuesFor(idle(), withEvents(['playerHit']), fight);
    expect(cue!.priority).toBe(PRIORITY.playerHurt);
  });
});

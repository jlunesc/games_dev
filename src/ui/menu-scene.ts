import { NORMAL_DIALS } from '../game/difficulty';
import type { FightDef } from '../game/fight';
import { createInitialState, type GameState } from '../game/state';
import { NO_FEEDBACK } from './feedback';
import { setUpFight } from './fight-setup';
import { createBackground, type BackgroundCache } from './look/background';
import { NO_EFFECTS } from './look/effects';
import { moodFor, type Mood } from './look/moods';
import { drawFrame } from './render';

/** The seed of the picture behind the menus: fixed, so a generated boss looks the same every time the menu opens. */
const SCENE_SEED = 1;

export interface MenuScene {
  /** The mood of the boss on show, for the colours of the menu on top. */
  moodOf(bossId: string): Mood;
  /** Draws the arena with `bossId` and the player standing in it. `motion` false draws a still picture. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, bossId: string, tick: number, motion: boolean): void;
}

interface Shown {
  bossId: string;
  fight: FightDef;
  state: GameState;
  mood: Mood;
  background: BackgroundCache | null;
}

/** The arena behind the menus. It builds the boss's fight once per boss and keeps only the latest backdrop. */
export function createMenuScene(): MenuScene {
  let shown: Shown | null = null;

  function show(bossId: string): Shown {
    if (shown?.bossId === bossId) return shown;
    const { fight } = setUpFight(bossId, SCENE_SEED, NORMAL_DIALS, 0);
    const mood = moodFor(fight.bosses[0]!.id, SCENE_SEED);
    shown = {
      bossId,
      fight,
      state: createInitialState(fight, SCENE_SEED, 0),
      mood,
      background: createBackground(mood),
    };
    return shown;
  }

  return {
    moodOf: (bossId) => show(bossId).mood,
    draw(ctx, width, height, bossId, tick, motion) {
      const s = show(bossId);
      drawFrame(ctx, width, height, { ...s.state, tick }, s.fight, 1, NO_FEEDBACK, {
        effects: NO_EFFECTS,
        background: s.background,
        motion,
        scene: true,
      });
    },
  };
}

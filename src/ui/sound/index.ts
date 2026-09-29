import type { FightDef } from '../../game/fight';
import type { GameState } from '../../game/state';
import type { Volume } from '../settings';
import { cuesFor } from './cues';
import { createEngine, type Engine } from './engine';
import { playCue } from './voices';

export interface Sound {
  /** Browsers only allow sound after a user gesture; call this from a tap or button press. */
  unlock(): void;
  /** The master volume (the Settings row). Off makes no sound at all. */
  setVolume(volume: Volume): void;
  startFight(fight: FightDef, seed: number): void;
  /** Called once per simulation update with the states around it. Only reads them. */
  update(before: GameState, after: GameState, fight: FightDef): void;
  /** The fight is over or was left. */
  endFight(): void;
}

export interface SoundEnv {
  createContext(): AudioContext;
}

const browserEnv: SoundEnv = { createContext: () => new AudioContext() };

export function createSound(env: SoundEnv = browserEnv): Sound {
  let volume: Volume = 'medium';
  let engine: Engine | null = null;

  return {
    unlock(): void {
      try {
        if (engine === null) engine = createEngine(env.createContext(), volume);
        // Without a user gesture the browser rejects this; that must not surface as an unhandled rejection.
        void engine.ctx.resume().catch(() => {});
      } catch {
        engine = null;
      }
    },
    setVolume(next): void {
      volume = next;
      engine?.setVolume(next);
    },
    startFight(_fight, _seed): void {},
    update(before, after, fight): void {
      if (engine === null || volume === 'off' || engine.ctx.state !== 'running') return;
      for (const cue of cuesFor(before, after, fight)) playCue(engine, cue);
    },
    endFight(): void {},
  };
}

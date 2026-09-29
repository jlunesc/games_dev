import type { FightDef } from '../../game/fight';
import type { GameState } from '../../game/state';
import type { Volume } from '../settings';
import { cuesFor } from './cues';
import { createEngine, type Engine } from './engine';
import { browserTimer, createMusic, type Music, type Timer } from './music';
import { intensityOf, layersFor, themeFor } from './score';
import { MUSIC, type Theme, type VoiceName } from './tuning';
import { playCue } from './voices';

export interface Sound {
  /** Browsers only allow sound after a user gesture; call this from a tap or button press. */
  unlock(): void;
  /** The master volume (the Settings row). Off makes no sound at all, and no music. */
  setVolume(volume: Volume): void;
  /** A fight is starting: picks the music's key and tempo. The music itself starts with the first update. */
  startFight(fight: FightDef, seed: number): void;
  /** Called once per simulation update with the states around it. Only reads them. */
  update(before: GameState, after: GameState, fight: FightDef): void;
  /** The page went to the background: the music stops, and the next update in a fight starts it again. */
  suspend(): void;
  /** The fight is over or was left: the music fades out. */
  endFight(): void;
}

export interface SoundEnv {
  createContext(): AudioContext;
  timer?: Timer;
}

const browserEnv: SoundEnv = { createContext: () => new AudioContext() };

const DUCKS: ReadonlySet<VoiceName> = new Set<VoiceName>(['warningGold', 'warningRed']);

export function createSound(env: SoundEnv = browserEnv): Sound {
  let volume: Volume = 'medium';
  let engine: Engine | null = null;
  let music: Music | null = null;
  let theme: Theme | null = null;
  let finished = false;

  const band = (): Music | null => {
    if (engine === null) return null;
    music ??= createMusic(engine, env.timer ?? browserTimer);
    return music;
  };

  return {
    unlock(): void {
      try {
        if (engine === null) engine = createEngine(env.createContext(), volume);
        // Without a user gesture the browser rejects this; that must not surface as an unhandled rejection.
        void engine.ctx.resume().catch(() => {});
      } catch {
        engine = null;
        music = null;
      }
    },
    setVolume(next): void {
      volume = next;
      engine?.setVolume(next);
      if (next === 'off') music?.stop();
    },
    startFight(fight, seed): void {
      music?.stop();
      finished = false;
      theme = themeFor(
        fight.bosses.map((boss) => boss.id),
        seed,
      );
    },
    update(before, after, fight): void {
      if (engine === null || volume === 'off' || engine.ctx.state !== 'running') return;
      const cues = cuesFor(before, after, fight);
      if (after.events.includes('playerDefeated')) engine.silence();
      for (const cue of cues) playCue(engine, cue);
      const player = band();
      if (player === null || theme === null || finished) return;
      const ended = after.events.includes('playerDefeated') ? 'loss' : after.events.includes('bossDefeated') ? 'win' : null;
      if (ended !== null) {
        finished = true;
        player.stop();
        player.sting(ended, theme);
        return;
      }
      if (cues.some((cue) => DUCKS.has(cue.voice))) engine.duck();
      if (!player.running) player.start(theme, layersFor(intensityOf(after, fight)));
      else if (after.tick % MUSIC.checkEvery === 0) player.setLayers(layersFor(intensityOf(after, fight)));
    },
    suspend(): void {
      music?.stop();
    },
    endFight(): void {
      music?.stop();
      theme = null;
    },
  };
}

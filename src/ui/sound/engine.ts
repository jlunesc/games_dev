import type { Volume } from '../settings';
import { SOUND } from './tuning';

/** One sound effect being made: everything it plays connects to `out`; `start` is when it begins on the audio clock. */
export interface Voice {
  out: GainNode;
  start: number;
}

export interface Engine {
  readonly ctx: AudioContext;
  /** Sound effects feed this bus. */
  readonly effects: GainNode;
  /** The music feeds this bus, which is ducked when a warning plays. */
  readonly musicBus: GainNode;
  /** One second of white noise, built once and shared by every noise sound. */
  readonly noise: AudioBuffer;
  setVolume(volume: Volume): void;
  /**
   * Asks for a voice lasting about `seconds`. Returns null when the volume is off, or when the cap is reached and
   * every live voice is at least as important (higher `priority` wins). `pan` runs from -1 (left) to 1 (right).
   */
  begin(priority: number, seconds: number, pan?: number): Voice | null;
  /** Dips the music for a moment so a warning cuts through. */
  duck(): void;
}

interface Live {
  priority: number;
  end: number;
  out: GainNode;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * SOUND.noiseSeconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createEngine(ctx: AudioContext, volume: Volume, cap: number = SOUND.voiceCap): Engine {
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = SOUND.limiter.threshold;
  limiter.knee.value = SOUND.limiter.knee;
  limiter.ratio.value = SOUND.limiter.ratio;
  limiter.attack.value = SOUND.limiter.attack;
  limiter.release.value = SOUND.limiter.release;
  const effects = ctx.createGain();
  effects.gain.value = SOUND.effectsLevel;
  const musicBus = ctx.createGain();
  effects.connect(master);
  musicBus.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  let muted = false;
  const setVolume = (next: Volume): void => {
    master.gain.value = SOUND.master[next];
    muted = next === 'off';
  };
  setVolume(volume);

  const live: Live[] = [];

  return {
    ctx,
    effects,
    musicBus,
    noise: makeNoise(ctx),
    setVolume,
    begin(priority, seconds, pan = 0): Voice | null {
      if (muted) return null;
      const now = ctx.currentTime;
      for (let i = live.length - 1; i >= 0; i--) if (live[i]!.end <= now) live.splice(i, 1);
      if (live.length >= cap) {
        // The least important voice goes first; the oldest of equals (it was added first).
        let lowest = 0;
        for (let i = 1; i < live.length; i++) if (live[i]!.priority < live[lowest]!.priority) lowest = i;
        const victim = live[lowest]!;
        if (victim.priority >= priority) return null;
        victim.out.gain.cancelScheduledValues(now);
        victim.out.gain.setValueAtTime(victim.out.gain.value, now);
        victim.out.gain.linearRampToValueAtTime(0, now + SOUND.stealFadeSeconds);
        live.splice(lowest, 1);
      }
      const out = ctx.createGain();
      if (pan === 0) {
        out.connect(effects);
      } else {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        out.connect(panner);
        panner.connect(effects);
      }
      live.push({ priority, end: now + seconds, out });
      return { out, start: now };
    },
    duck(): void {
      const now = ctx.currentTime;
      const gain = musicBus.gain;
      gain.cancelScheduledValues(now);
      const held = now + SOUND.duck.attackSeconds + SOUND.duck.holdSeconds;
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(SOUND.duck.level, now + SOUND.duck.attackSeconds);
      gain.setValueAtTime(SOUND.duck.level, held);
      gain.linearRampToValueAtTime(1, held + SOUND.duck.recoverSeconds);
    },
  };
}

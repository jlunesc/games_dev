import type { Cue } from './cues';
import type { Engine } from './engine';
import { ENVELOPE_ATTACK, RECIPES, type Part } from './tuning';

export interface ToneOptions {
  tone: OscillatorType;
  from: number;
  to?: number;
  seconds: number;
  volume: number;
  delay?: number;
}

export interface NoiseOptions {
  noise: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  seconds: number;
  volume: number;
  delay?: number;
}

const ENDING = 0.0001;

function envelope(gain: GainNode, at: number, seconds: number, volume: number): void {
  gain.gain.setValueAtTime(ENDING, at);
  gain.gain.linearRampToValueAtTime(volume, at + ENVELOPE_ATTACK);
  gain.gain.exponentialRampToValueAtTime(ENDING, at + seconds);
}

/** One oscillator with a pitch glide and a decaying envelope, starting `start + delay` on the audio clock. */
export function tone(ctx: AudioContext, dest: AudioNode, start: number, part: ToneOptions): void {
  const at = start + (part.delay ?? 0);
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = part.tone;
  oscillator.frequency.setValueAtTime(part.from, at);
  if (part.to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(part.to, at + part.seconds);
  envelope(gain, at, part.seconds, part.volume);
  oscillator.connect(gain);
  gain.connect(dest);
  oscillator.start(at);
  oscillator.stop(at + part.seconds + 0.02);
}

/** A burst of the shared noise through a filter whose cutoff can glide, with the same envelope. */
export function noiseBurst(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode, start: number, part: NoiseOptions): void {
  const at = start + (part.delay ?? 0);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noise;
  filter.type = part.noise;
  filter.Q.value = part.q ?? 1;
  filter.frequency.setValueAtTime(part.freq, at);
  if (part.to !== undefined) filter.frequency.exponentialRampToValueAtTime(part.to, at + part.seconds);
  envelope(gain, at, part.seconds, part.volume);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(at);
  source.stop(at + part.seconds + 0.02);
}

export const partSeconds = (parts: readonly Part[]): number =>
  Math.max(...parts.map((part) => (part.delay ?? 0) + part.seconds));

/** Plays a cue: builds its recipe's tones and noise on a voice, if the engine grants one. `pitch` multiplies every frequency. */
export function playCue(engine: Engine, cue: Cue): void {
  const parts = RECIPES[cue.voice];
  const voice = engine.begin(cue.priority, partSeconds(parts) + 0.05, cue.pan);
  if (voice === null) return;
  const scale = cue.pitch ?? 1;
  for (const part of parts) {
    if ('tone' in part) {
      tone(engine.ctx, voice.out, voice.start, {
        ...part,
        from: part.from * scale,
        ...(part.to === undefined ? {} : { to: part.to * scale }),
      });
    } else {
      noiseBurst(engine.ctx, engine.noise, voice.out, voice.start, {
        ...part,
        freq: part.freq * scale,
        ...(part.to === undefined ? {} : { to: part.to * scale }),
      });
    }
  }
}

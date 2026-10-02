import type { Engine } from './engine';
import { darkTheme, midiToHz, notesFor, type Layers, type Note } from './score';
import { MUSIC, type Theme } from './tuning';
import { noiseBurst, tone } from './voices';

export type LayerName = 'pad' | 'bass' | 'drums' | 'lead' | 'melody';
const LAYER_NAMES: readonly LayerName[] = ['pad', 'bass', 'drums', 'lead', 'melody'];

/** setInterval and setTimeout behind a small door, so tests can drive the clock. */
export interface Timer {
  every(fn: () => void, ms: number): unknown;
  after(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

export const browserTimer: Timer = {
  every: (fn, ms) => setInterval(fn, ms),
  after: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => {
    clearInterval(handle as ReturnType<typeof setInterval>);
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface Music {
  readonly running: boolean;
  start(theme: Theme, layers: Layers): void;
  setLayers(layers: Layers): void;
  stop(): void;
  sting(kind: 'win' | 'loss', theme: Theme): void;
}

export function targetsFor(layers: Layers): Record<LayerName, number> {
  return {
    pad: !layers.pad ? 0 : layers.bass ? MUSIC.layerGain.pad : MUSIC.studyPadGain,
    bass: layers.bass ? MUSIC.layerGain.bass : 0,
    drums: layers.drums ? MUSIC.layerGain.drums : 0,
    lead: layers.lead ? MUSIC.layerGain.lead : 0,
    melody: layers.melody ? MUSIC.layerGain.melody : 0,
  };
}

/** Eight eighth-notes to the bar: an eighth is half a beat. */
const stepSeconds = (theme: Theme): number => 30 / theme.bpm;
const barSeconds = (theme: Theme): number => 240 / theme.bpm;

interface Session {
  /** The theme that is playing: `base`, or its darker phase 2 version. */
  theme: Theme;
  base: Theme;
  /** Whether `theme` is the phase 2 version, and whether it should be from the next bar line. */
  dark: boolean;
  wantDark: boolean;
  level: GainNode;
  gains: Record<LayerName, GainNode>;
  /** The gain each layer has been told to reach (at the last bar line). */
  applied: Record<LayerName, number>;
  /** The gain each layer should reach; taken up at the next bar line. */
  desired: Record<LayerName, number>;
  /** A layer that was switched off keeps sounding until its fade ends. */
  fadeOutEnd: Record<LayerName, number>;
  handle: unknown;
  nextTime: number;
  step: number;
  bar: number;
  barNotes: Note[];
}

const ENDING = 0.0001;
const RELEASE_MS_PAD = 100;

export function createMusic(engine: Engine, timer: Timer = browserTimer): Music {
  const ctx = engine.ctx;
  let session: Session | null = null;

  function beginBar(s: Session): void {
    const at = s.nextTime;
    if (s.dark !== s.wantDark) {
      s.dark = s.wantDark;
      s.theme = s.dark ? darkTheme(s.base) : s.base;
      s.bar = 0;
    }
    const bar = barSeconds(s.theme);
    for (const name of LAYER_NAMES) {
      const want = s.desired[name];
      if (want === s.applied[name]) continue;
      const gain = s.gains[name].gain;
      gain.cancelScheduledValues(at);
      gain.setValueAtTime(s.applied[name], at);
      gain.linearRampToValueAtTime(want, at + bar);
      if (want === 0) s.fadeOutEnd[name] = at + bar;
      s.applied[name] = want;
    }
    const sounding = (name: LayerName): boolean => s.applied[name] > 0 || at < s.fadeOutEnd[name];
    s.barNotes = notesFor(s.theme, s.bar, {
      pad: sounding('pad'),
      bass: sounding('bass'),
      drums: sounding('drums'),
      lead: sounding('lead'),
      melody: sounding('melody'),
      phaseTwo: s.dark,
    });
  }

  function sustained(dest: AudioNode, at: number, seconds: number, hz: number): void {
    const p = MUSIC.note.pad;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = p.tone;
    oscillator.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(ENDING, at);
    gain.gain.linearRampToValueAtTime(p.volume, at + p.attackSeconds);
    gain.gain.setValueAtTime(p.volume, at + seconds);
    gain.gain.linearRampToValueAtTime(ENDING, at + seconds + p.releaseSeconds);
    oscillator.connect(gain);
    gain.connect(dest);
    oscillator.start(at);
    oscillator.stop(at + seconds + p.releaseSeconds + 0.02);
  }

  function playNote(s: Session, note: Note, at: number): void {
    const n = MUSIC.note;
    switch (note.voice) {
      case 'pad':
        if (note.midi !== undefined) sustained(s.gains.pad, at, note.steps * stepSeconds(s.theme), midiToHz(note.midi));
        break;
      case 'bass':
        if (note.midi === undefined) break;
        for (const part of n.bass.parts) {
          tone(ctx, s.gains.bass, at, {
            tone: part.tone,
            from: midiToHz(note.midi + part.semitones),
            seconds: n.bass.seconds,
            volume: part.volume,
          });
        }
        break;
      case 'lead':
        if (note.midi !== undefined) {
          tone(ctx, s.gains.lead, at, { tone: n.lead.tone, from: midiToHz(note.midi), seconds: n.lead.seconds, volume: n.lead.volume });
        }
        break;
      case 'melody':
        if (note.midi === undefined) break;
        for (const part of n.melody.parts) {
          tone(ctx, s.gains.melody, at, {
            tone: part.tone,
            from: midiToHz(note.midi),
            seconds: Math.min(n.melody.maxSeconds, Math.max(n.melody.minSeconds, note.steps * stepSeconds(s.theme))),
            volume: part.volume,
          });
        }
        break;
      case 'kick':
        tone(ctx, s.gains.drums, at, { tone: 'sine', from: n.kick.from, to: n.kick.to, seconds: n.kick.seconds, volume: n.kick.volume });
        break;
      case 'hat':
        noiseBurst(ctx, engine.noise, s.gains.drums, at, {
          noise: 'highpass',
          freq: n.hat.freq,
          seconds: n.hat.seconds,
          volume: n.hat.volume,
        });
        break;
    }
  }

  function pump(): void {
    const s = session;
    if (s === null) return;
    const horizon = ctx.currentTime + MUSIC.lookaheadSeconds;
    while (s.nextTime < horizon) {
      if (s.step === 0) beginBar(s);
      const length = stepSeconds(s.theme);
      if (s.nextTime >= ctx.currentTime - MUSIC.lateSeconds) {
        for (const note of s.barNotes) if (note.step === s.step) playNote(s, note, s.nextTime);
      }
      s.nextTime += length;
      s.step += 1;
      if (s.step === 8) {
        s.step = 0;
        s.bar += 1;
      }
    }
  }

  function stop(): void {
    const s = session;
    if (s === null) return;
    session = null;
    timer.cancel(s.handle);
    const now = ctx.currentTime;
    s.level.gain.cancelScheduledValues(now);
    s.level.gain.setValueAtTime(s.level.gain.value, now);
    s.level.gain.linearRampToValueAtTime(0, now + MUSIC.stopFadeSeconds);
    timer.after(() => s.level.disconnect(), MUSIC.stopFadeSeconds * 1000 + RELEASE_MS_PAD);
  }

  return {
    get running(): boolean {
      return session !== null;
    },
    start(theme, layers): void {
      stop();
      const now = ctx.currentTime;
      const level = ctx.createGain();
      level.gain.setValueAtTime(ENDING, now);
      level.gain.linearRampToValueAtTime(MUSIC.level, now + MUSIC.startFadeSeconds);
      level.connect(engine.musicBus);
      const targets = targetsFor(layers);
      const make = (name: LayerName): GainNode => {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(targets[name], now);
        gain.connect(level);
        return gain;
      };
      session = {
        theme: layers.phaseTwo ? darkTheme(theme) : theme,
        base: theme,
        dark: layers.phaseTwo,
        wantDark: layers.phaseTwo,
        level,
        gains: { pad: make('pad'), bass: make('bass'), drums: make('drums'), lead: make('lead'), melody: make('melody') },
        applied: { ...targets },
        desired: { ...targets },
        fadeOutEnd: { pad: 0, bass: 0, drums: 0, lead: 0, melody: 0 },
        handle: null,
        nextTime: now + MUSIC.startDelaySeconds,
        step: 0,
        bar: 0,
        barNotes: [],
      };
      session.handle = timer.every(pump, MUSIC.timerMs);
      pump();
    },
    setLayers(layers): void {
      if (session === null) return;
      session.desired = targetsFor(layers);
      session.wantDark = layers.phaseTwo;
    },
    stop,
    sting(kind, theme): void {
      const spec = MUSIC.sting[kind];
      const voice = engine.begin(MUSIC.sting.priority, (spec.semitones.length - 1) * MUSIC.sting.spacing + spec.seconds + 0.05);
      if (voice === null) return;
      spec.semitones.forEach((semitones, index) => {
        tone(ctx, voice.out, voice.start, {
          tone: spec.tone,
          from: midiToHz(theme.root + spec.above + semitones),
          seconds: spec.seconds,
          volume: spec.volume,
          delay: index * MUSIC.sting.spacing,
        });
      });
    },
  };
}

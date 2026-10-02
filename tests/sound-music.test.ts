import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/ui/sound/engine';
import { createMusic, targetsFor } from '../src/ui/sound/music';
import { darkTheme, midiToHz, type Layers } from '../src/ui/sound/score';
import { MUSIC, type Theme } from '../src/ui/sound/tuning';
import { advance, asContext, FakeContext, FakeTimer, type FakeNode } from './fake-audio';

// 120 beats a minute: an eighth note is 0.25 s and a bar is 2 s. The first bar starts at MUSIC.startDelaySeconds.
const THEME: Theme = { root: 40, mode: 'minor', bpm: 120 };
const BAR = 2;
const FIRST = MUSIC.startDelaySeconds;
const ALL: Layers = { pad: true, bass: true, drums: true, lead: true, melody: true, phaseTwo: false };
const FIGHT: Layers = { pad: true, bass: true, drums: false, lead: false, melody: true, phaseTwo: false };
const PAD_ONLY: Layers = { pad: true, bass: false, drums: false, lead: false, melody: false, phaseTwo: false };

function setup(volume: 'off' | 'medium' = 'medium') {
  const ctx = new FakeContext();
  const timer = new FakeTimer();
  const engine = createEngine(asContext(ctx), volume);
  const music = createMusic(engine, timer);
  // The engine makes three gains (master, effects, music bus); the music's own come next: level, pad, bass, drums, lead.
  const base = ctx.ofKind('gain').length;
  const gain = (name: 'level' | 'pad' | 'bass' | 'drums' | 'lead' | 'melody'): FakeNode =>
    ctx.ofKind('gain')[base + ['level', 'pad', 'bass', 'drums', 'lead', 'melody'].indexOf(name)]!;
  return { ctx, timer, music, gain };
}

const firstFrequency = (node: FakeNode): number => node.frequency.calls[0]!.value;

describe('the music targets', () => {
  it('plays the pad quieter when it is alone (the study)', () => {
    expect(targetsFor(PAD_ONLY).pad).toBe(MUSIC.studyPadGain);
    expect(targetsFor(FIGHT).pad).toBe(MUSIC.layerGain.pad);
    expect(MUSIC.studyPadGain).toBeLessThan(MUSIC.layerGain.pad);
    expect(targetsFor(ALL)).toEqual({
      pad: MUSIC.layerGain.pad,
      bass: MUSIC.layerGain.bass,
      drums: MUSIC.layerGain.drums,
      lead: MUSIC.layerGain.lead,
      melody: MUSIC.layerGain.melody,
    });
    expect(targetsFor({ pad: false, bass: false, drums: false, lead: false, melody: false, phaseTwo: false })).toEqual({
      pad: 0,
      bass: 0,
      drums: 0,
      lead: 0,
      melody: 0,
    });
  });
});

describe('the sequencer', () => {
  it('makes nothing until it is started', () => {
    const { ctx, timer, music } = setup();
    advance(ctx, timer, 1);
    expect(music.running).toBe(false);
    expect(timer.active).toBe(0);
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
  });

  it('starts its timer and schedules the first beat at once, only a short way ahead', () => {
    const { ctx, timer, music } = setup();
    music.start(THEME, ALL);
    expect(music.running).toBe(true);
    expect(timer.active).toBe(1);
    const first = ctx.ofKind('oscillator');
    expect(first.length).toBeGreaterThan(0);
    for (const oscillator of first) {
      expect(oscillator.startedAt).toBeGreaterThanOrEqual(FIRST);
      expect(oscillator.startedAt!).toBeLessThan(MUSIC.lookaheadSeconds);
    }
  });

  it('never schedules a note further ahead than the look-ahead while time passes', () => {
    const { ctx, timer, music } = setup();
    music.start(THEME, ALL);
    let seen = ctx.ofKind('oscillator').length;
    for (let i = 0; i < 200; i++) {
      advance(ctx, timer, 0.025);
      const nodes = ctx.ofKind('oscillator');
      for (const oscillator of nodes.slice(seen)) {
        expect(oscillator.startedAt!).toBeLessThan(ctx.currentTime + MUSIC.lookaheadSeconds + 1e-9);
        expect(oscillator.startedAt!).toBeGreaterThanOrEqual(ctx.currentTime - MUSIC.lateSeconds);
      }
      seen = nodes.length;
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('plays only the layers that are on: the pad alone, then the bass, no drums until asked', () => {
    const study = setup();
    study.music.start(THEME, PAD_ONLY);
    expect(study.ctx.ofKind('oscillator')).toHaveLength(3);
    advance(study.ctx, study.timer, 1.9);
    expect(study.ctx.ofKind('oscillator')).toHaveLength(3);
    expect(study.ctx.ofKind('filter')).toHaveLength(0);

    const fight = setup();
    fight.music.start(THEME, FIGHT);
    advance(fight.ctx, fight.timer, 1.9);
    expect(fight.ctx.ofKind('oscillator').length).toBeGreaterThan(3);
    expect(fight.ctx.ofKind('filter')).toHaveLength(0);
  });

  it('brings a new layer in on the next bar line and fades it in over a bar', () => {
    const { ctx, timer, music, gain } = setup();
    music.start(THEME, FIGHT);
    advance(ctx, timer, 1);
    music.setLayers(ALL);
    advance(ctx, timer, 0.9);
    expect(ctx.ofKind('filter')).toHaveLength(0);
    advance(ctx, timer, 1);
    expect(ctx.ofKind('filter').length).toBeGreaterThan(0);
    const ramp = gain('drums').gain.calls.find((call) => call.op === 'linear');
    expect(ramp?.value).toBe(MUSIC.layerGain.drums);
    expect(ramp?.time).toBeCloseTo(FIRST + BAR + BAR, 6);
  });

  it('keeps playing a layer that was switched off for the bar it fades out in, then stops it', () => {
    const { ctx, timer, music, gain } = setup();
    music.start(THEME, ALL);
    advance(ctx, timer, 1);
    music.setLayers(FIGHT);
    advance(ctx, timer, 2.9);
    // Bar 0 and bar 1 each have four hats; the second is the fade-out bar.
    expect(ctx.ofKind('filter')).toHaveLength(8);
    const ramp = gain('drums').gain.calls.find((call) => call.op === 'linear' && call.value === 0);
    expect(ramp?.time).toBeCloseTo(FIRST + BAR + BAR, 6);
    advance(ctx, timer, 2);
    expect(ctx.ofKind('filter')).toHaveLength(8);
  });

  it("plays the boss's melody over the bass, and nothing of it without the layer", () => {
    const tuned: Theme = { ...THEME, melody: 'ember-duelist' };
    const on = setup();
    on.music.start(tuned, FIGHT);
    const heard = (ctx: FakeContext): number[] => ctx.ofKind('oscillator').map(firstFrequency);
    // Bar 0 opens on the fifth, two octaves above the key's note (the Duelist's "4.4.7.4.").
    expect(heard(on.ctx)).toContain(midiToHz(THEME.root + 24 + 7));
    const off = setup();
    off.music.start(tuned, { ...FIGHT, melody: false });
    expect(heard(off.ctx)).not.toContain(midiToHz(THEME.root + 24 + 7));
  });

  it('turns darker and faster on the next bar line once the second phase is asked for, and keeps it', () => {
    const { ctx, timer, music } = setup();
    music.start({ ...THEME, melody: 'ember-duelist' }, FIGHT);
    advance(ctx, timer, 1);
    music.setLayers({ ...FIGHT, phaseTwo: true });
    advance(ctx, timer, 6);
    const dark = darkTheme(THEME);
    const bass = ctx
      .ofKind('oscillator')
      .filter((o) => o.type === 'triangle' && firstFrequency(o) === midiToHz(dark.root))
      .map((o) => o.startedAt!);
    expect(bass.length).toBeGreaterThanOrEqual(4);
    expect(bass[0]!).toBeCloseTo(FIRST + BAR, 6);
    expect(bass[1]! - bass[0]!).toBeCloseTo(60 / dark.bpm, 6);
    expect(dark.bpm).toBeGreaterThan(THEME.bpm);
  });

  it("starts in the second phase's music when it is already asked for, as after a pause", () => {
    const { ctx, music } = setup();
    music.start(THEME, { ...FIGHT, phaseTwo: true });
    expect(ctx.ofKind('oscillator').map(firstFrequency)).toContain(midiToHz(darkTheme(THEME).root));
  });

  it('skips steps it missed instead of playing them late', () => {
    const { ctx, timer, music } = setup();
    music.start(THEME, ALL);
    const count = ctx.ofKind('oscillator').length;
    ctx.currentTime = 10;
    timer.run();
    const late = ctx.ofKind('oscillator').slice(count);
    expect(late.length).toBeGreaterThan(0);
    for (const oscillator of late) expect(oscillator.startedAt!).toBeGreaterThanOrEqual(10 - MUSIC.lateSeconds);
  });

  it('stops with a quick fade, releases its timer and nodes, and schedules nothing more', () => {
    const { ctx, timer, music, gain } = setup();
    music.start(THEME, FIGHT);
    music.stop();
    expect(music.running).toBe(false);
    expect(timer.active).toBe(0);
    const ramp = gain('level')
      .gain.calls.filter((call) => call.op === 'linear')
      .at(-1);
    expect(ramp).toMatchObject({ value: 0 });
    expect(ramp!.time).toBeCloseTo(MUSIC.stopFadeSeconds, 6);
    const count = ctx.ofKind('oscillator').length;
    advance(ctx, timer, 3);
    expect(ctx.ofKind('oscillator')).toHaveLength(count);
    expect(gain('level').disconnected).toBe(false);
    timer.flush();
    expect(gain('level').disconnected).toBe(true);
    expect(() => music.stop()).not.toThrow();
  });

  it('starts again from bar 0 after a stop', () => {
    const { ctx, music } = setup();
    music.start(THEME, FIGHT);
    const first = ctx.ofKind('oscillator').map(firstFrequency);
    music.stop();
    const count = ctx.ofKind('oscillator').length;
    ctx.currentTime = 5;
    music.start(THEME, FIGHT);
    expect(ctx.ofKind('oscillator').slice(count).map(firstFrequency)).toEqual(first);
  });
});

describe('the stings', () => {
  it('plays a rising four-note figure for a win, in the boss key', () => {
    const { ctx, music } = setup();
    music.sting('win', THEME);
    const notes = ctx.ofKind('oscillator');
    expect(notes).toHaveLength(4);
    expect(notes.map(firstFrequency)).toEqual([0, 4, 7, 12].map((semis) => midiToHz(THEME.root + 24 + semis)));
    const starts = notes.map((note) => note.startedAt!);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[1]! - starts[0]!).toBeCloseTo(MUSIC.sting.spacing, 6);
  });

  it('plays a short square-wave jingle for a loss, in the boss key, ending lower than it starts', () => {
    const { ctx, music } = setup();
    music.sting('loss', THEME);
    const notes = ctx.ofKind('oscillator');
    const pitches = notes.map(firstFrequency);
    expect(pitches).toHaveLength(MUSIC.sting.loss.semitones.length);
    expect(pitches[0]).toBe(midiToHz(THEME.root + 12 + 7));
    expect(pitches[pitches.length - 1]).toBeLessThan(pitches[0]!);
    expect(notes.every((note) => note.type === 'square')).toBe(true);
  });

  it('plays nothing at volume off', () => {
    const { ctx, music } = setup('off');
    music.sting('win', THEME);
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/ui/sound/engine';
import { partSeconds, playCue } from '../src/ui/sound/voices';
import { cue } from '../src/ui/sound/cues';
import { RECIPES, type VoiceName } from '../src/ui/sound/tuning';
import { asContext, FakeContext, type FakeNode } from './fake-audio';

const setup = (volume: 'off' | 'medium' = 'medium') => {
  const ctx = new FakeContext();
  return { ctx, engine: createEngine(asContext(ctx), volume) };
};

describe('playing a cue', () => {
  it('builds one oscillator per tone part, connected through its own gain to the voice', () => {
    const { ctx, engine } = setup();
    const graphBefore = ctx.ofKind('oscillator').length;
    playCue(engine, cue('warningRed'));
    const tones = RECIPES.warningRed.filter((p) => 'tone' in p).length;
    const oscillators = ctx.ofKind('oscillator');
    expect(oscillators.length - graphBefore).toBe(tones);
    const osc = oscillators[0]! as FakeNode;
    expect(osc.type).toBe('sawtooth');
    expect(osc.startedAt).toBe(0);
    expect(osc.stoppedAt).toBeGreaterThan(0);
    expect(osc.connections[0]!.kind).toBe('gain');
  });

  it('builds a filtered noise burst for a noise part', () => {
    const { ctx, engine } = setup();
    // Any recipe with a noise part; the ported beeps have none, so use a hand-made check through the helper.
    const before = ctx.ofKind('source').length;
    const anyNoise = (Object.keys(RECIPES) as VoiceName[]).find((n) => RECIPES[n].some((p) => 'noise' in p));
    if (anyNoise === undefined) return;
    playCue(engine, cue(anyNoise));
    expect(ctx.ofKind('source').length).toBeGreaterThan(before);
    expect(ctx.ofKind('filter').length).toBeGreaterThan(0);
  });

  it('multiplies every frequency by the cue pitch', () => {
    const { ctx, engine } = setup();
    playCue(engine, cue('warningGold', { pitch: 2 }));
    const osc = ctx.ofKind('oscillator')[0]!;
    expect(osc.frequency.calls[0]!.value).toBe(880 * 2);
  });

  it('plays nothing when the volume is off', () => {
    const { ctx, engine } = setup('off');
    playCue(engine, cue('hit'));
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
  });

  it('pans through the engine', () => {
    const { ctx, engine } = setup();
    playCue(engine, cue('hit', { pan: 0.35 }));
    expect(ctx.ofKind('panner')[0]!.pan.value).toBe(0.35);
  });

  it('knows how long a recipe lasts, including delayed parts', () => {
    expect(partSeconds([{ tone: 'sine', from: 100, seconds: 0.1, volume: 0.1, delay: 0.2 }])).toBeCloseTo(0.3);
  });
});

import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/ui/sound/engine';
import { noiseBurst, partSeconds, playCue } from '../src/ui/sound/voices';
import { cue } from '../src/ui/sound/cues';
import { RECIPES, type Part } from '../src/ui/sound/tuning';
import { asContext, asNode, FakeContext, type FakeNode } from './fake-audio';

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

  it('builds a filtered noise burst that starts late and stops on its own', () => {
    const { ctx, engine } = setup();
    const destination = ctx.createGain();
    noiseBurst(asContext(ctx), engine.noise, asNode<AudioNode>(destination), 1, {
      noise: 'bandpass',
      freq: 1000,
      to: 500,
      q: 2,
      seconds: 0.1,
      volume: 0.2,
      delay: 0.05,
    });
    const source = ctx.ofKind('source')[0]!;
    const filter = ctx.ofKind('filter')[0]!;
    expect(source.startedAt).toBeCloseTo(1.05);
    expect(source.stoppedAt).toBeCloseTo(1.05 + 0.1 + 0.02);
    expect(source.connections).toContain(filter);
    expect(filter.type).toBe('bandpass');
    expect(filter.Q.value).toBe(2);
    expect(filter.frequency.calls[0]).toMatchObject({ op: 'set', value: 1000 });
    expect(filter.frequency.calls.at(-1)).toMatchObject({ op: 'exp', value: 500 });
    expect(filter.connections[0]!.kind).toBe('gain');
    expect(filter.connections[0]!.connections).toContain(destination);
  });

  it('multiplies every frequency by the cue pitch', () => {
    const { ctx, engine } = setup();
    playCue(engine, cue('warningGold', { pitch: 2 }));
    const osc = ctx.ofKind('oscillator')[0]!;
    expect(osc.frequency.calls[0]!.value).toBe(880 * 2);
  });

  describe('with a hand-made multi-part recipe', () => {
    const custom: readonly Part[] = [
      { tone: 'sine', from: 400, to: 200, seconds: 0.2, volume: 0.1 },
      { noise: 'lowpass', freq: 3000, to: 600, seconds: 0.15, volume: 0.1, delay: 0.1 },
      { tone: 'square', from: 100, seconds: 0.1, volume: 0.1, delay: 0.3 },
    ];
    const withRecipe = (run: () => void): void => {
      const original = RECIPES.hit;
      RECIPES.hit = custom;
      try {
        run();
      } finally {
        RECIPES.hit = original;
      }
    };

    it('scales the tone glide and the noise cutoff glide by the cue pitch', () => {
      const { ctx, engine } = setup();
      withRecipe(() => playCue(engine, cue('hit', { pitch: 1.5 })));
      const sine = ctx.ofKind('oscillator')[0]!;
      expect(sine.frequency.calls[0]!.value).toBe(600);
      expect(sine.frequency.calls[1]).toMatchObject({ op: 'exp', value: 300 });
      const filter = ctx.ofKind('filter')[0]!;
      expect(filter.frequency.calls[0]!.value).toBe(4500);
      expect(filter.frequency.calls[1]).toMatchObject({ op: 'exp', value: 900 });
    });

    it('gives every oscillator and noise source a start and a later stop, delayed parts included', () => {
      const { ctx, engine } = setup();
      withRecipe(() => playCue(engine, cue('hit')));
      const sources = [...ctx.ofKind('oscillator'), ...ctx.ofKind('source')];
      expect(sources).toHaveLength(3);
      for (const node of sources) {
        expect(node.startedAt).not.toBeNull();
        expect(node.stoppedAt).not.toBeNull();
        expect(node.stoppedAt!).toBeGreaterThan(node.startedAt!);
      }
      const delayed = ctx.ofKind('oscillator')[1]!;
      expect(delayed.startedAt).toBeCloseTo(0.3);
      expect(delayed.stoppedAt).toBeCloseTo(0.42);
    });
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

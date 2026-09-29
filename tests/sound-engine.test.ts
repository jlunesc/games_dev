import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/ui/sound/engine';
import { SOUND } from '../src/ui/sound/tuning';
import { asContext, FakeContext, type FakeNode } from './fake-audio';

const make = (volume: 'off' | 'low' | 'medium' | 'high' = 'medium', cap?: number) => {
  const ctx = new FakeContext();
  const engine = createEngine(asContext(ctx), volume, cap);
  return { ctx, engine };
};
const node = (v: unknown): FakeNode => v as FakeNode;

describe('the sound engine', () => {
  it('routes both buses through the master gain and a limiter to the output', () => {
    const { ctx, engine } = make();
    const master = ctx.ofKind('gain').find((g) => g.connections.some((c) => c.kind === 'compressor'))!;
    expect(node(engine.effects).connections).toContain(master);
    expect(node(engine.musicBus).connections).toContain(master);
    const limiter = ctx.ofKind('compressor')[0]!;
    expect(limiter.connections).toContain(ctx.destination);
    expect(limiter.threshold.value).toBe(SOUND.limiter.threshold);
  });

  it('sets the master gain from the volume', () => {
    for (const volume of ['off', 'low', 'medium', 'high'] as const) {
      const { ctx } = make(volume);
      const master = ctx.ofKind('gain').find((g) => g.connections.some((c) => c.kind === 'compressor'))!;
      expect(master.gain.value).toBe(SOUND.master[volume]);
    }
  });

  it('builds the shared noise buffer once', () => {
    const { engine } = make();
    expect(engine.noise.length).toBe(8000 * SOUND.noiseSeconds);
  });

  it('gives a voice its own gain that feeds the effects bus', () => {
    const { engine } = make();
    const voice = engine.begin(5, 0.2)!;
    expect(voice.start).toBe(0);
    expect(node(voice.out).connections).toContain(node(engine.effects));
  });

  it('pans a voice through a stereo panner when asked to', () => {
    const { ctx, engine } = make();
    const voice = engine.begin(5, 0.2, -0.35)!;
    const panner = ctx.ofKind('panner')[0]!;
    expect(panner.pan.value).toBe(-0.35);
    expect(node(voice.out).connections).toContain(panner);
    expect(panner.connections).toContain(node(engine.effects));
    expect(ctx.ofKind('panner')).toHaveLength(1);
    engine.begin(5, 0.2);
    expect(ctx.ofKind('panner')).toHaveLength(1);
  });

  it('makes no voice at all when the volume is off, and again once it is turned up', () => {
    const { ctx, engine } = make('off');
    const before = ctx.nodes.length;
    expect(engine.begin(9, 0.2)).toBeNull();
    expect(ctx.nodes.length).toBe(before);
    engine.setVolume('low');
    expect(engine.begin(9, 0.2)).not.toBeNull();
  });

  it('drops a new voice that is not more important than the least important live one when full', () => {
    const { engine } = make('medium', 2);
    engine.begin(5, 1);
    engine.begin(5, 1);
    expect(engine.begin(3, 1)).toBeNull();
    expect(engine.begin(5, 1)).toBeNull();
  });

  it('pushes out the least important live voice for a more important one', () => {
    const { engine } = make('medium', 2);
    const low = engine.begin(2, 1)!;
    engine.begin(5, 1);
    const winner = engine.begin(9, 1);
    expect(winner).not.toBeNull();
    const ramp = node(low.out).gain.calls.find((c) => c.op === 'linear');
    expect(ramp?.value).toBe(0);
  });

  it('frees a slot once a voice has ended', () => {
    const { ctx, engine } = make('medium', 1);
    engine.begin(5, 0.5);
    expect(engine.begin(5, 0.5)).toBeNull();
    ctx.currentTime = 0.6;
    expect(engine.begin(5, 0.5)).not.toBeNull();
  });

  it('ducks the music bus with a short ramp, holds, then recovers', () => {
    const { ctx, engine } = make();
    ctx.currentTime = 2;
    node(engine.musicBus).gain.value = 1;
    engine.duck();
    const { attackSeconds, holdSeconds, recoverSeconds, level } = SOUND.duck;
    const calls = node(engine.musicBus).gain.calls.slice(-5);
    expect(calls[0]).toMatchObject({ op: 'cancel', time: 2 });
    expect(calls[1]).toMatchObject({ op: 'set', value: 1, time: 2 });
    expect(calls[2]).toMatchObject({ op: 'linear', value: level, time: 2 + attackSeconds });
    expect(calls[3]).toMatchObject({ op: 'set', value: level, time: 2 + attackSeconds + holdSeconds });
    expect(calls[4]).toMatchObject({ op: 'linear', value: 1, time: 2 + attackSeconds + holdSeconds + recoverSeconds });
    expect(calls.filter((call) => call.time === 2 && call.value === level)).toHaveLength(0);
  });
});

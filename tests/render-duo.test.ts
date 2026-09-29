import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, QUILL_WARDEN, VESPER_SAGE } from '../src/bosses';
import { asFight, makeFight } from '../src/game/fight';
import { createInitialState, type ShotState } from '../src/game/state';
import { NO_FEEDBACK } from '../src/ui/feedback';
import { NO_EFFECTS } from '../src/ui/look/effects';
import { moodFor } from '../src/ui/look/moods';
import { LOOK } from '../src/ui/look/tuning';
import { drawFrame, type FrameLook } from '../src/ui/render';

interface Call {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  alpha: unknown;
}

/** A recording stand-in for a 2D context: save and restore keep the drawing settings like a real one. */
function fakeContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  const stack: Record<string, unknown>[] = [];
  let depth = 0;
  let minDepth = 0;
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'save') {
          stack.push({ ...target });
          depth++;
        }
        if (key === 'restore') {
          Object.assign(target, stack.pop());
          depth--;
          minDepth = Math.min(minDepth, depth);
        }
        calls.push({ name: key, args, fillStyle: target.fillStyle, alpha: target.globalAlpha });
        if (key === 'createLinearGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, balance: () => depth, minDepth: () => minDepth };
}

const look: FrameLook = { effects: NO_EFFECTS, background: null, motion: true };
const fight = makeFight([ASHEN_HOUND, VESPER_SAGE]);

function frame(state: ReturnType<typeof createInitialState>, source: Parameters<typeof drawFrame>[4], withLook?: FrameLook) {
  const f = fakeContext();
  drawFrame(f.ctx, 1280, 720, state, source, 0.5, NO_FEEDBACK, withLook);
  return f;
}

const barBacks = (calls: Call[]): number =>
  calls.filter((c) => c.name === 'fillRect' && c.fillStyle === '#3a3a4a' && c.args[2] === LOOK.hud.barWidth).length;

describe('drawFrame with a pair', () => {
  it('draws without throwing, with and without the full look, and keeps save and restore balanced', () => {
    const state = createInitialState(fight, 1);
    for (const l of [undefined, look]) {
      const f = frame(state, fight, l);
      expect(f.balance()).toBe(0);
      expect(f.minDepth()).toBe(0);
    }
  });

  it('draws one health bar for each boss', () => {
    expect(barBacks(frame(createInitialState(fight, 1), fight, look).calls)).toBe(2);
    expect(barBacks(frame(createInitialState(ASHEN_HOUND, 1), asFight(ASHEN_HOUND), look).calls)).toBe(1);
  });

  it('draws a lone boss the same whether it is given as a boss or as a fight of one', () => {
    const state = createInitialState(ASHEN_HOUND, 1);
    const asBoss = frame(state, ASHEN_HOUND, look).calls;
    const asOne = frame(state, asFight(ASHEN_HOUND), look).calls;
    expect(JSON.stringify(asOne)).toBe(JSON.stringify(asBoss));
  });

  it('draws a fallen partner as a dimmed heap in its own colour', () => {
    const state = createInitialState(fight, 1);
    state.partners[0]!.hp = 0;
    const { calls } = frame(state, fight, look);
    const heap = calls.some(
      (c) =>
        c.name === 'fillRect' && c.alpha === LOOK.fallen.alpha && c.fillStyle === moodFor(VESPER_SAGE.id).bodyColor,
    );
    expect(heap).toBe(true);
  });

  it('draws the turn marker only while a boss holds the turn', () => {
    const idle = createInitialState(fight, 1);
    const holding = createInitialState(fight, 1);
    holding.boss.mode = 'attack';
    const marks = (calls: Call[]): number =>
      calls.filter((c) => c.name === 'fill' && c.fillStyle === LOOK.turnMarker.color).length;
    expect(marks(frame(idle, fight, look).calls)).toBe(0);
    expect(marks(frame(holding, fight, look).calls)).toBe(1);
  });

  it('gives each shot the colours of the boss that fired it', () => {
    const mixed = makeFight([ASHEN_HOUND, QUILL_WARDEN]);
    const bolt = (owner: number | undefined): ShotState => ({
      kind: 'bolt',
      attackId: 'x',
      originTick: 1,
      x: 500,
      lift: 0,
      dir: 1,
      originX: 500,
      size: 30,
      speed: 600,
      climb: 0,
      ...(owner === undefined ? {} : { owner }),
    });
    const quillCore = LOOK.palette['quill-warden']!.core;
    const withShot = (owner: number | undefined) => {
      const state = createInitialState(mixed, 1);
      state.shots = [bolt(owner)];
      return frame(state, mixed, look).calls.some((c) => c.name === 'fill' && c.fillStyle === quillCore);
    };
    expect(withShot(1)).toBe(true);
    expect(withShot(0)).toBe(false);
    expect(withShot(undefined)).toBe(false);
  });

  it('flashes only the boss named in the frame look', () => {
    const state = createInitialState(fight, 1);
    const flashing = { ...NO_FEEDBACK, bossFlashTicks: 3 };
    const whites = (flashBoss: number | undefined): number => {
      const f = fakeContext();
      drawFrame(f.ctx, 1280, 720, state, fight, 0.5, flashing, { ...look, flashBoss });
      return f.calls.filter((c) => c.name === 'fillRect' && c.fillStyle === '#ffffff').length;
    };
    expect(whites(0)).toBeGreaterThan(0);
    expect(whites(1)).toBeGreaterThan(0);
    expect(whites(undefined)).toBe(whites(0) + whites(1));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, EMBER_DUELIST } from '../src/bosses';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { NO_FEEDBACK } from '../src/ui/feedback';
import * as pose from '../src/ui/look/pose';
import { NO_EFFECTS, type EffectsState } from '../src/ui/look/effects';
import { moodFor } from '../src/ui/look/moods';
import { LOOK } from '../src/ui/look/tuning';
import * as render from '../src/ui/render';
import {
  bossBodyColor,
  drawFrame,
  FLOOR_TILE_XS,
  playerBlinking,
  playerBodyColor,
  type FrameLook,
} from '../src/ui/render';

/** A recording stand-in for a 2D context: every method call is noted, every property set is kept. */
function fakeContext() {
  const calls: { name: string; args: unknown[]; fillStyle: unknown }[] = [];
  let depth = 0;
  let minDepth = 0;
  const props: Record<string, unknown> = { fillStyle: '', globalAlpha: 1 };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'save') depth++;
        if (key === 'restore') {
          depth--;
          minDepth = Math.min(minDepth, depth);
        }
        calls.push({ name: key, args, fillStyle: target.fillStyle });
        if (key === 'createLinearGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    balance: () => depth,
    minDepth: () => minDepth,
    names: () => calls.map((c) => c.name),
  };
}

describe('the pose helpers moved out of render.ts', () => {
  it('are re-exported from render.ts as the very same things', () => {
    expect(render.armRect).toBe(pose.armRect);
    expect(render.bossDrawBox).toBe(pose.bossDrawBox);
    expect(render.bossLook).toBe(pose.bossLook);
    expect(render.BOSS_COLORS).toBe(pose.BOSS_COLORS);
  });

  it('leave no import cycle: pose.ts and figures.ts never import render.ts', () => {
    const importsRender = (file: string): boolean =>
      /from\s+['"](\.\.?\/)+render['"]/.test(readFileSync(new URL(file, import.meta.url), 'utf8'));
    expect(importsRender('../src/ui/look/pose.ts')).toBe(false);
    expect(importsRender('../src/ui/look/figures.ts')).toBe(false);
    expect(importsRender('../src/ui/look/effects.ts')).toBe(false);
    expect(importsRender('../src/ui/look/background.ts')).toBe(false);
  });
});

describe('colour and blink decisions', () => {
  const state = createInitialState(EMBER_DUELIST);

  it('turns the player red on a hit, blue while dashing, otherwise the normal colour (hurt wins)', () => {
    const dashing = { ...state, player: { ...state.player, dashTick: 3 } };
    expect(playerBodyColor(state, NO_FEEDBACK)).toBe('#e8e8f0');
    expect(playerBodyColor(dashing, NO_FEEDBACK)).toBe('#7fd6ff');
    expect(playerBodyColor(state, { ...NO_FEEDBACK, playerFlashTicks: 2 })).toBe('#ff3b3b');
    expect(playerBodyColor(dashing, { ...NO_FEEDBACK, playerFlashTicks: 2 })).toBe('#ff3b3b');
  });

  it('flashes the boss white after a hit, otherwise follows bossLook', () => {
    const look = pose.bossLook(state.boss, EMBER_DUELIST);
    expect(bossBodyColor(look, NO_FEEDBACK)).toBe(look.body);
    expect(bossBodyColor(look, { ...NO_FEEDBACK, bossFlashTicks: 1 })).toBe('#ffffff');
  });

  it('blinks only while invulnerable and not dashing, every other 3 ticks', () => {
    const hurt = (tick: number, dashTick = -1) => ({
      ...state,
      tick,
      player: { ...state.player, invulnerableTicks: 20, dashTick },
    });
    expect(playerBlinking(state)).toBe(false);
    expect(playerBlinking(hurt(0))).toBe(false);
    expect(playerBlinking(hurt(3))).toBe(true);
    expect(playerBlinking(hurt(6))).toBe(false);
    expect(playerBlinking(hurt(3, 2))).toBe(false);
  });

  it('places the floor tile lines evenly across the whole world', () => {
    const xs = FLOOR_TILE_XS;
    expect(xs[0]).toBe(0);
    expect(xs.every((x, i) => x === i * LOOK.floorTileSpacing)).toBe(true);
    expect(xs[xs.length - 1]! + LOOK.floorTileSpacing).toBeGreaterThan(WORLD.width);
  });
});

describe('every boss has a mood', () => {
  it('gives the shipped bosses their own moods and anything else the neutral one', () => {
    expect(moodFor(EMBER_DUELIST.id).id).toBe('ember-duelist');
    expect(moodFor(ASHEN_HOUND.id).id).toBe('ashen-hound');
    expect(moodFor('some-new-boss').id).toBe('neutral');
  });
});

const someEffects: EffectsState = {
  particles: [
    { kind: 'spark', x: 100, y: 100, vx: 0, vy: 0, life: 10, maxLife: 20, size: 5, color: '#fff' },
    { kind: 'dust', x: 120, y: 100, vx: 0, vy: 0, life: 10, maxLife: 20, size: 9, color: '#bbb' },
    { kind: 'trail', x: 140, y: 100, vx: 0, vy: 0, life: 10, maxLife: 16, size: 12, color: '#7fd6ff' },
  ],
  rings: [{ x: 300, y: 300, radius: 40, growth: 5, life: 10, maxLife: 22, color: '#f5c542', width: 4 }],
  rng: 1,
};

describe('drawFrame', () => {
  const duelist = createInitialState(EMBER_DUELIST);
  const hound = createInitialState(ASHEN_HOUND);

  it('still draws the plain old look with no look argument (no images, no arcs for particles)', () => {
    for (const [state, boss] of [[duelist, EMBER_DUELIST], [hound, ASHEN_HOUND]] as const) {
      const f = fakeContext();
      expect(() => drawFrame(f.ctx, 1280, 720, state, boss, 0.5, NO_FEEDBACK)).not.toThrow();
      expect(f.names()).toContain('fillRect');
      expect(f.names()).not.toContain('drawImage');
      expect(f.names()).not.toContain('createLinearGradient');
      expect(f.balance()).toBe(0);
      expect(f.minDepth()).toBe(0);
    }
  });

  it('draws the old floor colours without a look', () => {
    const f = fakeContext();
    drawFrame(f.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK);
    expect(f.calls.some((c) => c.name === 'fillRect' && c.fillStyle === LOOK.floor)).toBe(true);
  });

  const look = (motion: boolean, effects = someEffects): FrameLook => ({ effects, background: null, motion });

  it('draws the full look with a null background, balanced, with any settings and either boss', () => {
    for (const motion of [true, false]) {
      for (const [state, boss] of [[duelist, EMBER_DUELIST], [hound, ASHEN_HOUND]] as const) {
        const f = fakeContext();
        expect(() => drawFrame(f.ctx, 1600, 720, state, boss, 0.5, NO_FEEDBACK, look(motion))).not.toThrow();
        expect(f.names()).toContain('createLinearGradient');
        expect(f.balance()).toBe(0);
        expect(f.minDepth()).toBe(0);
      }
    }
  });

  it('draws the mood floor over everything below the layers, out to the bottom margin', () => {
    const mood = moodFor(EMBER_DUELIST.id);
    const f = fakeContext();
    drawFrame(f.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK, look(true, NO_EFFECTS));
    const floor = f.calls.find((c) => c.name === 'fillRect' && c.fillStyle === mood.floor);
    expect(floor).toBeDefined();
    const [x, y, w, h] = floor!.args as number[];
    expect(y).toBe(WORLD.floorY);
    expect(y! + h!).toBeGreaterThanOrEqual(WORLD.height + 8);
    expect(x).toBeLessThanOrEqual(-8);
    expect(x! + w!).toBeGreaterThanOrEqual(WORLD.width + 8);
  });

  it('draws the effects over the arena and before the HUD', () => {
    const f = fakeContext();
    drawFrame(f.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK, look(true));
    const ringAt = f.calls.findIndex((c) => c.name === 'stroke' && c.fillStyle !== undefined);
    const hudAt = f.calls.findIndex(
      (c) => c.name === 'fillRect' && c.args[0] === 24 && c.args[1] === 24 && c.args[2] === 22,
    );
    expect(ringAt).toBeGreaterThan(-1);
    expect(hudAt).toBeGreaterThan(ringAt);
    // No effects, no ring stroke from the effects (the boss has no glow at the start either).
    const none = fakeContext();
    drawFrame(none.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK, look(true, NO_EFFECTS));
    expect(none.names().filter((n) => n === 'stroke').length).toBeLessThan(
      f.names().filter((n) => n === 'stroke').length,
    );
  });

  it('keeps the hit-box, glow and landing drawing: the boss glow outline still strokes with the look', () => {
    const winding = {
      ...duelist,
      boss: { ...duelist.boss, mode: 'transition' as const },
    };
    const f = fakeContext();
    drawFrame(f.ctx, 1280, 720, winding, EMBER_DUELIST, 0, NO_FEEDBACK, look(true, NO_EFFECTS));
    expect(f.names()).toContain('strokeRect');
  });

  it('draws the player through the figure (polygons/circles) with the look, and a plain box without', () => {
    const withLook = fakeContext();
    drawFrame(withLook.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK, look(false, NO_EFFECTS));
    const plain = fakeContext();
    drawFrame(plain.ctx, 1280, 720, duelist, EMBER_DUELIST, 0, NO_FEEDBACK);
    expect(withLook.names()).toContain('arc');
    expect(plain.names()).not.toContain('arc');
    // The plain player is exactly one PLAYER-sized rectangle.
    expect(
      plain.calls.some((c) => c.name === 'fillRect' && c.args[2] === PLAYER.width && c.args[3] === PLAYER.height),
    ).toBe(true);
  });
});

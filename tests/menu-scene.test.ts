import { describe, expect, it } from 'vitest';
import { BOSS_CHOICES } from '../src/bosses';
import { moodFor } from '../src/ui/look/moods';
import { createMenuScene } from '../src/ui/menu-scene';

/** A recording stand-in for a 2D context: every method call is noted. */
function fakeContext() {
  const names: string[] = [];
  const props: Record<string, unknown> = { fillStyle: '', globalAlpha: 1 };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        names.push(key);
        void args;
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop() {} };
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, names };
}

describe('the picture behind the menus', () => {
  it('draws for every boss choice, pairs and the generated boss included', () => {
    const scene = createMenuScene();
    for (const choice of BOSS_CHOICES) {
      const { ctx, names } = fakeContext();
      expect(() => scene.draw(ctx, 800, 450, choice.id, 0, true)).not.toThrow();
      expect(names.length).toBeGreaterThan(0);
    }
  });

  it('draws for an id it does not know', () => {
    const { ctx } = fakeContext();
    expect(() => createMenuScene().draw(ctx, 800, 450, 'no-such-boss', 0, false)).not.toThrow();
  });

  it('takes the colours of the boss on show', () => {
    const scene = createMenuScene();
    expect(scene.moodOf('ember-duelist')).toEqual(moodFor('ember-duelist', 1));
    expect(scene.moodOf('ashen-hound').accent).toBe(moodFor('ashen-hound', 1).accent);
    expect(scene.moodOf('ember-duelist').accent).not.toBe(scene.moodOf('ashen-hound').accent);
  });

  it('shows the same generated boss every time', () => {
    expect(createMenuScene().moodOf('generated')).toEqual(createMenuScene().moodOf('generated'));
  });

  it('draws the arena and the figures but no health bars or end text', () => {
    const { ctx, names } = fakeContext();
    createMenuScene().draw(ctx, 800, 450, 'ember-duelist', 0, true);
    const texts = names.filter((n) => n === 'fillText' || n === 'strokeText');
    expect(texts).toHaveLength(0);
  });

  it('draws the same picture at the same tick', () => {
    const a = fakeContext();
    const b = fakeContext();
    createMenuScene().draw(a.ctx, 800, 450, 'ashen-hound', 30, true);
    createMenuScene().draw(b.ctx, 800, 450, 'ashen-hound', 30, true);
    expect(a.names).toEqual(b.names);
  });
});

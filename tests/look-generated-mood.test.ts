import { describe, expect, it } from 'vitest';
import { bossLook } from '../src/ui/look/pose';
import { generatedMood } from '../src/ui/look/generated-mood';
import { MOODS, moodFor } from '../src/ui/look/moods';
import { createInitialState } from '../src/game/state';
import { EMBER_DUELIST } from '../src/bosses';

const HEX = /^#[0-9a-f]{6}$/i;
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

/** Lightness (0 to 1) of a `#rrggbb` colour. */
function lightness(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(...c) + Math.min(...c)) / 2;
}

describe('a generated fight’s backdrop', () => {
  it('is the same for the same seed and different for different seeds', () => {
    expect(generatedMood(42)).toEqual(generatedMood(42));
    const skies = new Set(SEEDS.map((s) => generatedMood(s).skyBottom));
    expect(skies.size).toBeGreaterThan(150);
    const shapes = new Set(SEEDS.map((s) => generatedMood(s).layers.map((l) => l.shape).join()));
    expect(shapes.size).toBeGreaterThan(6);
  });

  it('is a well-formed mood: valid colours, 2 or 3 layers with distinct speeds and sensible heights', () => {
    for (const seed of SEEDS) {
      const m = generatedMood(seed);
      for (const c of [m.skyTop, m.skyBottom, m.ember, m.floor, m.floorLine, m.floorGlow, m.accent, m.bodyColor, ...m.layers.map((l) => l.color)]) {
        expect(c, `seed ${seed}`).toMatch(HEX);
      }
      expect(m.layers.length).toBeGreaterThanOrEqual(2);
      expect(m.layers.length).toBeLessThanOrEqual(3);
      expect(new Set(m.layers.map((l) => l.speed)).size).toBe(m.layers.length);
      expect(new Set(m.layers.map((l) => l.seed)).size).toBe(m.layers.length);
      for (const l of m.layers) {
        expect(l.heightFraction).toBeGreaterThan(0);
        expect(l.heightFraction).toBeLessThan(1);
        expect(Number.isInteger(l.seed)).toBe(true);
      }
    }
  });

  it('stays dark behind the action and keeps the floor edge and body clearly lighter', () => {
    for (const seed of SEEDS) {
      const m = generatedMood(seed);
      expect(lightness(m.skyBottom), `seed ${seed}`).toBeLessThan(0.3);
      for (const l of m.layers) expect(lightness(l.color), `seed ${seed}`).toBeLessThan(0.25);
      expect(lightness(m.floor)).toBeLessThan(0.2);
      expect(lightness(m.floorLine)).toBeGreaterThan(lightness(m.floor) + 0.2);
      expect(lightness(m.bodyColor)).toBeGreaterThan(lightness(m.skyBottom) + 0.2);
    }
  });

  it('is what moodFor gives a generated boss with a seed, with its own id; other ids ignore the seed', () => {
    expect(moodFor('generated', 5)).toEqual(generatedMood(5));
    expect(moodFor('generated', 5).id).toBe('generated-5');
    expect(moodFor('generated', 5).id).not.toBe(moodFor('generated', 6).id);
    expect(moodFor('generated')).toBe(MOODS.neutral);
    expect(moodFor('ember-duelist', 5)).toBe(MOODS['ember-duelist']);
  });

  it('colours the boss body when bossLook is given it', () => {
    const idle = createInitialState(EMBER_DUELIST).boss;
    expect(bossLook(idle, EMBER_DUELIST, '#123456').body).toBe('#123456');
  });
});

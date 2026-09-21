import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses/index';
import { LOOK } from '../src/ui/look/tuning';
import { MOODS, moodFor } from '../src/ui/look/moods';

const HEX = /^#[0-9a-f]{6}$/i;

describe('the moods', () => {
  it('give every shipped boss its own mood', () => {
    for (const boss of BOSSES) {
      expect(MOODS[boss.id], boss.id).toBeDefined();
      expect(moodFor(boss.id)).toBe(MOODS[boss.id]);
      expect(moodFor(boss.id).id).toBe(boss.id);
    }
    const ids = BOSSES.map((b) => moodFor(b.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('give an unknown boss id the neutral mood', () => {
    expect(MOODS.neutral).toBeDefined();
    expect(moodFor('no-such-boss')).toBe(MOODS.neutral);
    expect(moodFor('')).toBe(MOODS.neutral);
  });

  it('have 2 to 3 layers with distinct speeds and sensible heights', () => {
    for (const mood of Object.values(MOODS)) {
      expect(mood.layers.length, mood.id).toBeGreaterThanOrEqual(2);
      expect(mood.layers.length, mood.id).toBeLessThanOrEqual(3);
      expect(new Set(mood.layers.map((l) => l.speed)).size, mood.id).toBe(mood.layers.length);
      for (const layer of mood.layers) {
        expect(['pillars', 'ridge', 'spires']).toContain(layer.shape);
        expect(layer.heightFraction).toBeGreaterThan(0);
        expect(layer.heightFraction).toBeLessThan(1);
        expect(layer.color).toMatch(HEX);
        expect(Number.isInteger(layer.seed)).toBe(true);
      }
    }
  });

  it('use valid #rrggbb colours everywhere', () => {
    for (const mood of Object.values(MOODS)) {
      for (const c of [mood.skyTop, mood.skyBottom, mood.ember, mood.floor, mood.floorLine, mood.floorGlow, mood.accent]) {
        expect(c, mood.id).toMatch(HEX);
      }
    }
  });

  it('keep each mood stored under its own id', () => {
    for (const [key, mood] of Object.entries(MOODS)) expect(mood.id).toBe(key);
  });
});

describe('the look tuning', () => {
  it('has the caps and effect counts as positive whole numbers', () => {
    expect(LOOK.maxParticles).toBe(160);
    expect(LOOK.maxRings).toBe(12);
    for (const n of [LOOK.sparksOnBossHit, LOOK.sparksOnPlayerHit, LOOK.dustOnLand, LOOK.trailOnDash, LOOK.burstOnDefeat]) {
      expect(Number.isInteger(n) && n > 0).toBe(true);
    }
  });

  it('has valid colours for the effects and the arena pieces', () => {
    for (const c of [LOOK.spark, LOOK.counterRing, LOOK.hurtSpark, LOOK.dust, LOOK.trail, LOOK.shockwave]) {
      expect(c).toMatch(HEX);
    }
    expect(LOOK.floor).toBe('#2a2a3a');
  });
});

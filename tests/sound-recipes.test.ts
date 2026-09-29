import { describe, expect, it } from 'vitest';
import { RECIPES, type Part, type VoiceName } from '../src/ui/sound/tuning';

const names = Object.keys(RECIPES) as VoiceName[];
const loudness = (name: VoiceName): number => RECIPES[name].reduce((sum, p) => sum + p.volume, 0);
const lowest = (parts: readonly Part[]): number =>
  Math.min(...parts.map((p) => ('tone' in p ? Math.min(p.from, p.to ?? p.from) : Math.min(p.freq, p.to ?? p.freq))));
const highest = (parts: readonly Part[]): number =>
  Math.max(...parts.map((p) => ('tone' in p ? Math.max(p.from, p.to ?? p.from) : Math.max(p.freq, p.to ?? p.freq))));

describe('the sound recipes', () => {
  it('have at least one part, all with a positive length and a sane volume', () => {
    for (const name of names) {
      expect(RECIPES[name].length).toBeGreaterThan(0);
      for (const part of RECIPES[name]) {
        expect(part.seconds).toBeGreaterThan(0);
        expect(part.seconds).toBeLessThanOrEqual(0.9);
        expect(part.volume).toBeGreaterThan(0);
        expect(part.volume).toBeLessThanOrEqual(0.4);
        expect(part.delay ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('layer the important sounds: a hit is a thump plus a noise tick, a hurt has a noise layer', () => {
    expect(RECIPES.hit.some((p) => 'tone' in p)).toBe(true);
    expect(RECIPES.hit.some((p) => 'noise' in p)).toBe(true);
    expect(RECIPES.playerHurt.some((p) => 'noise' in p)).toBe(true);
    expect(RECIPES.counter.filter((p) => 'tone' in p).length).toBeGreaterThanOrEqual(2);
  });

  it('make the player being hurt the loudest fight sound', () => {
    for (const name of ['hit', 'counter', 'dash', 'studyHit', 'warningGold', 'warningRed'] as const) {
      expect(loudness('playerHurt')).toBeGreaterThan(loudness(name));
    }
  });

  it('make the study hit much softer than the real hurt', () => {
    expect(loudness('studyHit')).toBeLessThan(loudness('playerHurt') / 2);
  });

  it('keep the gold warning high and the red warning low, so they are never confused', () => {
    expect(lowest(RECIPES.warningGold)).toBeGreaterThan(highest(RECIPES.warningRed));
  });

  it('make the phase change and the falls long and low', () => {
    expect(lowest(RECIPES.phaseChange)).toBeLessThan(120);
    expect(lowest(RECIPES.defeat)).toBeLessThan(80);
  });
});

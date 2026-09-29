import { describe, expect, it } from 'vitest';
import { BOSSES, TRAINEE } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import {
  intensityOf,
  layersFor,
  midiToHz,
  notesFor,
  themeFor,
  type Layers,
} from '../src/ui/sound/score';
import { THEMES } from '../src/ui/sound/tuning';

const ALL: Layers = { pad: true, bass: true, drums: true, lead: true };
const PAD_ONLY: Layers = { pad: true, bass: false, drums: false, lead: false };
const SCALE = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] } as const;

describe('the themes', () => {
  it('give every boss in the roster (and the trainee) a key, a mode and a tempo', () => {
    for (const boss of [...BOSSES, TRAINEE]) {
      const theme = THEMES[boss.id];
      expect(theme, boss.id).toBeDefined();
      expect(theme!.root).toBeGreaterThanOrEqual(36);
      expect(theme!.root).toBeLessThanOrEqual(47);
      expect(theme!.bpm).toBeGreaterThanOrEqual(80);
      expect(theme!.bpm).toBeLessThanOrEqual(160);
    }
  });

  it('use the boss table for a known boss', () => {
    expect(themeFor(['ashen-hound'], 5)).toEqual(THEMES['ashen-hound']);
  });

  it('give an unknown or generated boss a key from the seed: stable per seed, varied across seeds', () => {
    expect(themeFor(['generated-7'], 12345)).toEqual(themeFor(['generated-9'], 12345));
    const roots = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const theme = themeFor(['generated-1'], seed);
      expect(theme.root).toBeGreaterThanOrEqual(36);
      expect(theme.root).toBeLessThanOrEqual(47);
      expect(theme.bpm).toBeGreaterThanOrEqual(96);
      expect(theme.bpm).toBeLessThan(140);
      roots.add(theme.root);
    }
    expect(roots.size).toBeGreaterThan(4);
  });

  it('never read a boss id as a property of the table itself', () => {
    expect(themeFor(['constructor'], 3)).toEqual(themeFor(['generated-1'], 3));
  });

  it('take the first boss key and the average tempo for a pair', () => {
    const a = THEMES['ashen-hound']!;
    const b = THEMES['vesper-sage']!;
    const pair = themeFor(['ashen-hound', 'vesper-sage'], 1);
    expect(pair.root).toBe(a.root);
    expect(pair.mode).toBe(a.mode);
    expect(pair.bpm).toBe(Math.round((a.bpm + b.bpm) / 2));
  });
});

describe('the layers', () => {
  const at = (over: Partial<Parameters<typeof layersFor>[0]> = {}): Layers =>
    layersFor({ study: false, hpFraction: 1, laterPhase: false, lastPhase: false, ...over });

  it('start with the bass and the pad', () => {
    expect(at()).toEqual({ pad: true, bass: true, drums: false, lead: false });
  });

  it('add drums from the second phase or at half health', () => {
    expect(at({ laterPhase: true }).drums).toBe(true);
    expect(at({ hpFraction: 0.5 }).drums).toBe(true);
    expect(at({ hpFraction: 0.51 }).drums).toBe(false);
  });

  it('add the lead in the last phase or at a quarter health', () => {
    expect(at({ lastPhase: true }).lead).toBe(true);
    expect(at({ hpFraction: 0.25 }).lead).toBe(true);
    expect(at({ hpFraction: 0.26 }).lead).toBe(false);
  });

  it('play only the pad in the study, whatever the health', () => {
    expect(at({ study: true, hpFraction: 0.1, laterPhase: true, lastPhase: true })).toEqual(PAD_ONLY);
  });
});

describe('reading the fight', () => {
  const multi = BOSSES.find((b) => b.phases.length > 1)!;

  it('reads a fresh fight as full health, first phase', () => {
    const fight = asFight(multi);
    expect(intensityOf(createInitialState(fight, 1), fight)).toEqual({
      study: false,
      hpFraction: 1,
      laterPhase: false,
      lastPhase: false,
    });
  });

  it('reads health, phase and the study', () => {
    const fight = asFight(multi);
    const base = createInitialState(fight, 1);
    const hurt = { ...base, boss: { ...base.boss, hp: multi.maxHp / 2, phase: multi.phases.length - 1 } };
    expect(intensityOf(hurt, fight)).toMatchObject({ hpFraction: 0.5, laterPhase: true, lastPhase: true });
    const study = createInitialState(fight, 1, 1);
    expect(study.study.active).toBe(true);
    expect(intensityOf(study, fight).study).toBe(true);
  });
});

describe('the notes', () => {
  it('play only the layers that are on', () => {
    const voices = (layers: Layers): Set<string> => new Set(notesFor(THEMES['ashen-hound']!, 0, layers).map((n) => n.voice));
    expect(voices(PAD_ONLY)).toEqual(new Set(['pad']));
    expect(voices({ ...PAD_ONLY, bass: true })).toEqual(new Set(['pad', 'bass']));
    expect(voices({ ...PAD_ONLY, drums: true })).toEqual(new Set(['pad', 'kick', 'hat']));
    expect(voices(ALL)).toEqual(new Set(['pad', 'bass', 'kick', 'hat', 'lead']));
  });

  it('keep every note inside the bar, in range and in the key, for every theme and bar', () => {
    for (const [id, theme] of Object.entries(THEMES)) {
      for (let bar = 0; bar < 8; bar++) {
        for (const note of notesFor(theme, bar, ALL)) {
          expect(note.step, id).toBeGreaterThanOrEqual(0);
          expect(note.steps, id).toBeGreaterThanOrEqual(1);
          expect(note.step + note.steps, id).toBeLessThanOrEqual(8);
          if (note.midi !== undefined) {
            expect(note.midi, id).toBeGreaterThanOrEqual(24);
            expect(note.midi, id).toBeLessThanOrEqual(96);
            const degree = (((note.midi - theme.root) % 12) + 12) % 12;
            expect(SCALE[theme.mode] as readonly number[], `${id} bar ${bar} midi ${note.midi}`).toContain(degree);
          } else {
            expect(['kick', 'hat']).toContain(note.voice);
          }
        }
      }
    }
  });

  it('repeat every four bars and are the same every time', () => {
    const theme = THEMES['gale-reaver']!;
    expect(notesFor(theme, 0, ALL)).toEqual(notesFor(theme, 4, ALL));
    expect(notesFor(theme, 1, ALL)).toEqual(notesFor(theme, 1, ALL));
    expect(notesFor(theme, 0, ALL)).not.toEqual(notesFor(theme, 1, ALL));
  });

  it('put the kick on the beat and the hat between', () => {
    const notes = notesFor(THEMES['gale-reaver']!, 0, ALL);
    expect(notes.filter((n) => n.voice === 'kick').map((n) => n.step)).toEqual([0, 4]);
    expect(notes.filter((n) => n.voice === 'hat').map((n) => n.step)).toEqual([1, 3, 5, 7]);
  });

  it('turn a MIDI note into a frequency', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });
});

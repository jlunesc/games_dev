import { describe, expect, it } from 'vitest';
import { BOSSES, TRAINEE } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState } from '../src/game/state';
import { intensityOf, layersFor, midiToHz, notesFor, themeFor, type Layers, darkTheme } from '../src/ui/sound/score';
import { MELODIES } from '../src/ui/sound/melodies';
import { PHASE_TWO, THEMES } from '../src/ui/sound/tuning';

const ALL: Layers = { pad: true, bass: true, drums: true, lead: true, melody: true, phaseTwo: false };
const PAD_ONLY: Layers = { pad: true, bass: false, drums: false, lead: false, melody: false, phaseTwo: false };
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
    expect(themeFor(['ashen-hound'], 5)).toEqual({ ...THEMES['ashen-hound']!, melody: 'ashen-hound' });
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
    expect(at()).toEqual({ pad: true, bass: true, drums: false, lead: false, melody: true, phaseTwo: false });
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

  it("turn to the second phase's music once a boss is past its first phase", () => {
    expect(at().phaseTwo).toBe(false);
    expect(at({ laterPhase: true }).phaseTwo).toBe(true);
    expect(at({ study: true, laterPhase: true }).phaseTwo).toBe(false);
  });

  it('play only the pad in the study, whatever the health', () => {
    expect(at({ study: true, hpFraction: 0.1, laterPhase: true, lastPhase: true })).toEqual(PAD_ONLY);
  });
});

describe('reading the fight', () => {
  const multi = BOSSES.find((b) => b.phases.length > 1)!;

  it('reads a fresh fight as full health, first phase', () => {
    const fight = asFight(multi);
    expect(intensityOf(createInitialState(fight, 1), fight)).toEqual({ study: false, hpFraction: 1, laterPhase: false, lastPhase: false });
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
    for (const [id, base] of Object.entries(THEMES)) {
      for (const theme of [{ ...base, melody: id }, darkTheme({ ...base, melody: id })]) {
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
    }
  });

  it('repeat every four bars (every eight with a melody) and are the same every time', () => {
    const theme = THEMES['gale-reaver']!;
    expect(notesFor(theme, 0, { ...ALL, melody: false })).toEqual(notesFor(theme, 4, { ...ALL, melody: false }));
    const tuned = { ...theme, melody: 'gale-reaver' };
    expect(notesFor(tuned, 0, ALL)).toEqual(notesFor(tuned, 8, ALL));
    expect(notesFor(tuned, 0, ALL)).not.toEqual(notesFor(tuned, 4, ALL));
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

describe('the melodies', () => {
  const SCALE_STEPS = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] } as const;

  it('give every boss in the roster and the trainee two melodies of four bars of eight steps', () => {
    for (const boss of [...BOSSES, TRAINEE]) {
      const tunes = MELODIES[boss.id];
      expect(tunes, boss.id).toBeDefined();
      expect(tunes).toHaveLength(2);
      for (const tune of tunes!) {
        expect(tune).toHaveLength(4);
        for (const bar of tune) expect(bar, boss.id).toMatch(/^[0-7.-]{8}$/);
      }
    }
  });

  it('have at least one note in every bar', () => {
    for (const [id, tunes] of Object.entries(MELODIES)) {
      for (const tune of tunes) for (const bar of tune) expect(bar, id).toMatch(/[0-7]/);
    }
  });

  it('hold only chord tones (root, third, fifth, octave) from the first or third beat', () => {
    for (const [id, base] of Object.entries(THEMES)) {
      for (const theme of [{ ...base, melody: id }, darkTheme({ ...base, melody: id })]) {
        for (let bar = 0; bar < 8; bar++) {
          const chord = bar % 4;
          const tune = MELODIES[id]![Math.floor(bar / 4)]![chord]!;
          for (const match of tune.matchAll(/([0-7])(-+)/g)) {
            const at = match.index!;
            if (at !== 0 && at !== 4) continue;
            expect([0, 2, 4, 7], `${id} bar ${bar} ${tune}`).toContain(Number(match[1]));
          }
          expect(theme.melody).toBe(id);
        }
      }
    }
  });

  it('play the first melody for four bars and then the second, in the notes of the chord scale', () => {
    const theme = { ...THEMES['ember-duelist']!, melody: 'ember-duelist' };
    const first = notesFor(theme, 0, ALL).filter((n) => n.voice === 'melody');
    // Bar 0 is the tonic chord: "0.24.42." is the root, the third, the fifth, the fifth and the third, with two rests.
    const scale = SCALE_STEPS.minor;
    const top = theme.root + 24;
    expect(first.map((n) => [n.step, n.midi])).toEqual([
      [0, top + scale[0]!],
      [2, top + scale[2]!],
      [3, top + scale[4]!],
      [5, top + scale[4]!],
      [6, top + scale[2]!],
    ]);
    const second = notesFor(theme, 4, ALL).filter((n) => n.voice === 'melody');
    expect(second[0]).toMatchObject({ step: 0, steps: 2, midi: top + scale[4]! });
  });

  it("count steps from the bar's own chord root", () => {
    const theme = { ...THEMES['ember-duelist']!, melody: 'ember-duelist' };
    // Bar 1 is the chord on the sixth degree (8 semitones above the tonic) and its melody starts on "2", that chord's third:
    // 12 semitones above the tonic.
    const note = notesFor(theme, 1, ALL).find((n) => n.voice === 'melody' && n.step === 0)!;
    expect(note.midi).toBe(theme.root + 24 + 12);
  });

  it('keep a boss without melodies silent in that layer', () => {
    expect(notesFor(THEMES['ember-duelist']!, 0, ALL).some((n) => n.voice === 'melody')).toBe(false);
    expect(notesFor({ ...THEMES['ember-duelist']!, melody: 'constructor' }, 0, ALL).some((n) => n.voice === 'melody')).toBe(false);
  });

  it('turn darker and faster in the second phase', () => {
    const theme = themeFor(['brass-sentinel'], 1);
    const dark = darkTheme(theme);
    expect(dark.mode).toBe('minor');
    expect(dark.root).toBe(theme.root + PHASE_TWO.rootShift);
    expect(dark.bpm).toBe(Math.round(theme.bpm * PHASE_TWO.tempoFactor));
    expect(dark.bpm).toBeGreaterThan(theme.bpm);
    expect(dark.melody).toBe('brass-sentinel');
    expect(darkTheme(THEMES['gale-reaver']!).mode).toBe('minor');
  });

  it('strike a long held note again every two steps in the second phase', () => {
    const base = { ...THEMES['cinder-golem']!, melody: 'cinder-golem' };
    // Bar 4 is "0-----2-": a six-step note and a two-step note.
    const plain = notesFor(base, 4, ALL).filter((n) => n.voice === 'melody');
    expect(plain.map((n) => [n.step, n.steps])).toEqual([
      [0, 6],
      [6, 2],
    ]);
    const dark = notesFor(darkTheme(base), 4, ALL).filter((n) => n.voice === 'melody');
    expect(dark.map((n) => [n.step, n.steps])).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
      [6, 2],
    ]);
    expect(new Set(dark.slice(0, 3).map((n) => n.midi)).size).toBe(1);
  });

  it('are given to the boss a fight starts with, including in a pair', () => {
    expect(themeFor(['vesper-sage', 'ashen-hound'], 1).melody).toBe('vesper-sage');
    expect(themeFor(['generated-3'], 7).melody).toBeUndefined();
  });
});

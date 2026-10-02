/**
 * Two melodies per boss, each four bars (one chord per bar, like the progression). A bar is eight characters, one per
 * eighth-note:
 * - a digit is a note, counted in steps of the scale up from that bar's chord root (0 the root, 2 the third, 4 the fifth,
 *   7 the octave; 1, 3, 5 and 6 are passing notes), so a tune fits any key and either mode;
 * - `-` keeps the note going;
 * - `.` is a rest.
 * The two melodies play one after the other, A then B, round and round. A note that is held for two or more steps and
 * starts on the first or the third beat of the bar is a chord tone (a test checks it). The phase 2 version is made from the
 * same notes by `darkTheme` and `melodyNotes` in `score.ts`.
 */
export type Melody = readonly [string, string, string, string];

export const MELODIES: Readonly<Record<string, readonly [Melody, Melody]>> = {
  // A fencer: quick stabs and a lunge, then a long held line.
  'ember-duelist': [
    ['0.24.42.', '2.42.4.6', '4.2.0.24', '4-6-2---'],
    ['4-42-0-2', '4-5-2---', '2-24-45-', '7---4-2-'],
  ],
  // A low beast: a growling riff on the root, then a long howl.
  'ashen-hound': [
    ['00.02.0.', '00.02.4.', '00.04.2.', '2.4.2.0.'],
    ['0---7---', '7-5-4---', '4---2---', '2-0-----'],
  ],
  // A zoner: single notes with space around them, like quills landing.
  'quill-warden': [
    ['0...4...', '2...5.4.', '4...2...', '6.4.2.0.'],
    ['0.2.4.7.', '5.4.2.0.', '2.4.7.4.', '6.4.2.0.'],
  ],
  // A slow, heavy walker: long low notes, then a climb that takes four bars.
  'cinder-golem': [
    ['0---0---', '4---2---', '2---2-0-', '4---4---'],
    ['0-----2-', '2-----4-', '4-----7-', '7-------'],
  ],
  // A trickster: the notes fall off the beat, so the tune keeps slipping away.
  'veil-dancer': [
    ['0.2.4.2.', '.2.4.7.4', '4.2.0.2.', '.0.2.4.6'],
    ['2.4.2.0.', '.4.7.4.2', '7.4.2.4.', '.2.0.2.4'],
  ],
  // A rushdown: eighth-note runs that never stop, then a pounding octave leap.
  'gale-reaver': [
    ['02420242', '24742474', '42024202', '64246420'],
    ['07070707', '47474747', '27272727', '47462420'],
  ],
  // A guard in brass: a dotted fanfare, then slow bells.
  'brass-sentinel': [
    ['0--24-4-', '4--24-0-', '2--24-7-', '4--20---'],
    ['7---4---', '4---2---', '4---7---', '4-2-0---'],
  ],
  // A caster: notes that drift and hang in the air.
  'vesper-sage': [
    ['2-------', '4---2---', '4-------', '2---0---'],
    ['0---2-4-', '2---4-7-', '4---7---', '4-6-2---'],
  ],
  // A bruiser: stomps on the beat, then a groan that sinks.
  'tremor-brute': [
    ['0.0.0-0.', '2.2.2-0.', '4.4.4-2.', '2.2.0---'],
    ['0-----2.', '4-----2.', '2-----0.', '4-2-0---'],
  ],
  // A bird: bright notes that climb and flit.
  'storm-kite': [
    ['0-2-4-7-', '7-4-2-4-', '4-5-4-2-', '2-4-2-4-'],
    ['4-4-7-4-', '7-6-4-2-', '4-7-4-7-', '4-2-4-0-'],
  ],
  // A plain, friendly tune.
  trainee: [
    ['0-2-4-2-', '4-2-0-2-', '2-4-2-0-', '4-2-0---'],
    ['0-0-4-4-', '4-4-2-2-', '2-2-0-0-', '4-2-0---'],
  ],
};

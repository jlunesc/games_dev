/**
 * One melody per boss, four bars (one chord per bar, like the progression), and a changed version of it for the second
 * phase. A bar is eight characters, one per eighth-note:
 * - a digit is a note, counted in steps of the scale up from that bar's chord root (0 the root, 2 the third, 4 the fifth,
 *   7 the octave, 9 the octave's third; the others are passing notes), so a tune fits any key and either mode;
 * - `-` keeps the note going;
 * - `.` is a rest.
 * A note that is held for two or more steps and starts on the first or the third beat of the bar is a chord tone (a test
 * checks it). The second phase also plays in a lower, minor key and faster (`darkTheme` in `score.ts`).
 */
export type Melody = readonly [string, string, string, string];

export const MELODIES: Readonly<Record<string, { readonly normal: Melody; readonly phaseTwo: Melody }>> = {
  // A fencer: sharp stabs on the beat with a lunge up; in phase 2 the stabs come in pairs.
  'ember-duelist': {
    normal: ['4.4.7.4.', '2.2.5.2.', '4.4.7.9.', '7.5.4.2.'],
    phaseTwo: ['44.47.97', '22.25.75', '44.47.9.', '97542.0.'],
  },
  // A low beast: a growling riff that circles the root; in phase 2 it gallops.
  'ashen-hound': {
    normal: ['00.0.1..', '00.0.1..', '00.0.2..', '1.1.0---'],
    phaseTwo: ['0000.1.0', '0000.1.0', '0000.2.1', '1.1.0.0.'],
  },
  // A zoner: single high notes that fall like quills, three steps apart; in phase 2 a volley.
  'quill-warden': {
    normal: ['9..7..4.', '7..5..2.', '9..7..4.', '5..4..2.'],
    phaseTwo: ['97.97.42', '75.75.24', '97.97.42', '54.54.2.'],
  },
  // A slow, heavy walker: one long low note per bar; in phase 2 it stomps.
  'cinder-golem': {
    normal: ['0-------', '0-----2-', '2-------', '4---2---'],
    phaseTwo: ['0-0-0-0-', '2-2-2-4-', '2-2-2-0-', '4-4-4-2-'],
  },
  // A trickster: only on the off-beats, so it never lands where you expect; in phase 2 it spirals up.
  'veil-dancer': {
    normal: ['.4.2.4.7', '.2.0.2.5', '.4.7.4.2', '.0.2.4.2'],
    phaseTwo: ['.4.7.9.7', '.2.5.7.5', '.4.7.9.7', '.2.4.7.9'],
  },
  // A rushdown: scales run up and down without a pause; in phase 2 they zigzag.
  'gale-reaver': {
    normal: ['01234567', '76543210', '01234567', '98765432'],
    phaseTwo: ['02134657', '75364213', '24354657', '97867564'],
  },
  // A guard in brass: a fanfare in groups of three; in phase 2 a hard march.
  'brass-sentinel': {
    normal: ['0--4--7-', '4--7--9-', '7--4--2-', '4--2--0-'],
    phaseTwo: ['0-0-4-7-', '4-4-7-9-', '7-7-4-4-', '4-2-0-0-'],
  },
  // A caster: a note that flickers against its neighbour and hangs; in phase 2 the flicker never stops.
  'vesper-sage': {
    normal: ['.9.8.9--', '.7.6.7--', '.9.8.9--', '.7.6.4--'],
    phaseTwo: ['98989898', '76767676', '98989898', '76764242'],
  },
  // A bruiser: heavy hits on the beat with a short groan; in phase 2 the hits come twice as fast.
  'tremor-brute': {
    normal: ['0...0.0.', '2...2.2.', '2...2.2.', '4...2.0.'],
    phaseTwo: ['0.0.0.00', '2.2.2.22', '2.2.2.22', '4.2.0.00'],
  },
  // A bird: a swoop up and a dive; in phase 2 the flight turns frantic.
  'storm-kite': {
    normal: ['0247.9.7', '4.7.9.97', '2479.9.4', '7.9.7.42'],
    phaseTwo: ['9797.947', '7979.724', '9797.947', '7.9.7.4.'],
  },
  // A plain, friendly tune.
  trainee: {
    normal: ['0-2-4-2-', '4-2-0-2-', '2-4-2-0-', '4-2-0---'],
    phaseTwo: ['0-0-4-4-', '4-4-2-2-', '2-2-0-0-', '4-2-0---'],
  },
};

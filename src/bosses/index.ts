import ashenHoundRaw from './ashen-hound.json';
import brassSentinelRaw from './brass-sentinel.json';
import cinderGolemRaw from './cinder-golem.json';
import raw from './ember-duelist.json';
import galeReaverRaw from './gale-reaver.json';
import { parseBoss } from './parse';
import quillWardenRaw from './quill-warden.json';
import type { BossDef } from './schema';
import rawTrainee from './trainee.json';
import tremorBruteRaw from './tremor-brute.json';
import veilDancerRaw from './veil-dancer.json';
import vesperSageRaw from './vesper-sage.json';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);

/** The Ashen Hound: a low, fast beast that dashes and leaps. Checked at load like the Duelist. */
export const ASHEN_HOUND = parseBoss(ashenHoundRaw);

/** The Quill Warden: a zoner that fights from range and punishes an unsafe approach. Checked at load like the Duelist. */
export const QUILL_WARDEN = parseBoss(quillWardenRaw);

/** The Cinder Golem: a slow, hard-hitting bruiser with long, readable telegraphs. Checked at load like the Duelist. */
export const CINDER_GOLEM = parseBoss(cinderGolemRaw);

/** The Veil Dancer: a trickster that fakes and repositions more than it damages. Checked at load like the Duelist. */
export const VEIL_DANCER = parseBoss(veilDancerRaw);

/** The Gale Reaver: a fast rushdown boss that closes distance and chains attacks. Checked at load like the Duelist. */
export const GALE_REAVER = parseBoss(galeReaverRaw);

/** The Brass Sentinel: mostly counterable attacks, rewarding precise counter timing over dodging. Checked at load like the Duelist. */
export const BRASS_SENTINEL = parseBoss(brassSentinelRaw);

/** The Vesper Sage: a caster that keeps its distance and fires bolts and lobbed arcs. Checked at load like the Duelist. */
export const VESPER_SAGE = parseBoss(vesperSageRaw);

/** The Tremor Brute: a close-range bruiser whose slams mark the floor for eruptions. Checked at load like the Duelist. */
export const TREMOR_BRUTE = parseBoss(tremorBruteRaw);

/**
 * The Trainee: a plain, generous, hand-built boss (two `mustDodge` attacks, no leap, no counter,
 * no arena). Checked at load like the Duelist and the Hound. Not part of `BOSSES` and not offered
 * in the menu's Boss row on its own — it exists only as the generator's fallback (see
 * `src/bosses/generate`), used when a generated candidate keeps failing the fairness check.
 */
export const TRAINEE = parseBoss(rawTrainee);

/** Every boss the menu offers, in menu order. */
export const BOSSES: readonly BossDef[] = [
  EMBER_DUELIST,
  ASHEN_HOUND,
  QUILL_WARDEN,
  CINDER_GOLEM,
  VEIL_DANCER,
  GALE_REAVER,
  BRASS_SENTINEL,
  VESPER_SAGE,
  TREMOR_BRUTE,
];

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}

/** One choice in the menu's Boss row: a named boss, or `'generated'` for a freshly generated one. */
export interface BossChoice {
  id: string;
  name: string;
}

/** Every choice the menu's Boss row offers, in menu order: the named bosses, then `'Generated'`. */
export const BOSS_CHOICES: readonly BossChoice[] = [
  ...BOSSES.map((b) => ({ id: b.id, name: b.name })),
  { id: 'generated', name: 'Generated' },
];

/** The display name for a boss choice id; an unknown id falls back to the Duelist's name, matching `bossById`. */
export function bossChoiceName(id: string): string {
  return BOSS_CHOICES.find((c) => c.id === id)?.name ?? EMBER_DUELIST.name;
}

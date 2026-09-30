import { PAIRS } from './pairs';
import { BOSSES, EMBER_DUELIST } from './roster';
import type { BossDef } from './schema';

export * from './roster';

/** The boss with this id; an unknown id (for example from old stored choices) falls back to the first boss. */
export function bossById(id: string): BossDef {
  return BOSSES.find((boss) => boss.id === id) ?? EMBER_DUELIST;
}

/** One choice in the menu's Boss row: a named boss, a pair (two bosses in one fight), or 'generated' for a freshly generated one. */
export interface BossChoice {
  id: string;
  name: string;
}

/** Every choice the menu's Boss row offers, in menu order: the named bosses, then each pair, then `'Generated'`. */
export const BOSS_CHOICES: readonly BossChoice[] = [
  ...BOSSES.map((b) => ({ id: b.id, name: b.name })),
  ...PAIRS.map((p) => ({ id: p.id, name: p.name })),
  { id: 'generated', name: 'Generated' },
];

/** The display name for a boss choice id; an unknown id falls back to the Duelist's name, matching `bossById`. */
export function bossChoiceName(id: string): string {
  return BOSS_CHOICES.find((c) => c.id === id)?.name ?? EMBER_DUELIST.name;
}

/** The menu's description line for a boss choice: a named boss has one; a pair, Generated and an unknown id have none. */
export function bossChoiceDescription(id: string): string | undefined {
  return BOSSES.find((boss) => boss.id === id)?.description;
}

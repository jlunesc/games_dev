import raw from './ember-duelist.json';
import { parseBoss } from './parse';

/** The Ember Duelist. It is checked when the game loads: a broken file fails here with a message naming the exact place. */
export const EMBER_DUELIST = parseBoss(raw);

/**
 * Golden test for the Ember Duelist, the reference boss.
 *
 * It plays two scripted fights against the real Duelist and folds every update's state into one
 * hash. The hash covers only the fields that existed before M5a boss movement skills, so adding new
 * fields to the boss state does not change it. Its statistics must stay comparable over time, so the
 * Duelist's simulation must not change by accident.
 *
 * If these numbers change, that must be deliberate: update them only when the Duelist's behaviour is
 * meant to change, and then bump `GAME_VERSION`.
 */
import { describe, expect, it } from 'vitest';
import type { InputFrame } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS, presetDials, type Dials } from '../src/game/difficulty';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { DUELIST, withInput } from './helpers';

/** A deterministic player: runs at the boss, then attacks, dashes and jumps on fixed beats. */
function scripted(n: number): InputFrame {
  if (n <= 60) return withInput({ moveX: 1 });
  return withInput({
    attackPressed: n % 40 === 0,
    dashPressed: n % 90 === 0,
    jumpPressed: n % 130 === 0,
    jumpHeld: n % 130 < 10,
  });
}

/** One update's state as text, from existing fields only. */
function fingerprint(s: GameState): string {
  const { player: p, boss: b } = s;
  return [
    s.tick,
    s.phase,
    s.endTicks,
    p.x,
    p.y,
    p.health,
    p.attackTick,
    p.dashTick,
    p.invulnerableTicks,
    b.x,
    b.facing,
    b.hp,
    b.phase,
    b.mode,
    b.modeTick,
    b.attackId,
    b.attackTick,
    b.pendingAttackId,
    b.chainLeft,
    s.events.join('+'),
    s.rng,
  ].join('|');
}

/** 32-bit FNV-1a over the UTF-16 code units of a string, continuing from `hash`. */
function fnv1a(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A deterministic brawler that cannot die: closes in on the boss (using the state), swings often,
 * and dashes and jumps now and then. Used to reach the Duelist's second phase and the victory.
 */
function brawler(n: number, s: GameState): InputFrame {
  const dx = s.boss.x - s.player.x;
  const near = Math.abs(dx) < 80;
  return withInput({
    moveX: near ? 0 : dx > 0 ? 1 : -1,
    attackPressed: n % 14 === 0,
    dashPressed: n % 97 === 0,
    jumpPressed: n % 150 === 0,
    jumpHeld: n % 150 < 8,
  });
}

/**
 * A reactive brawler that cannot die and tries to counter: when the previous state shows the boss
 * winding up a slam, facing the player and within counter range, it swings so that the swing lands
 * inside the counter window (the last 12 of the slam's 30 windup updates). Otherwise it stays within
 * about 150 units and swings every 20 updates.
 */
function counterBrawler(n: number, prev: GameState): InputFrame {
  const dx = prev.boss.x - prev.player.x;
  const facingPlayer = prev.boss.facing === (dx < 0 ? 1 : -1);
  const slamming = prev.boss.mode === 'attack' && prev.boss.attackId === 'slam' && facingPlayer;
  const inWindow = slamming && Math.abs(dx) <= 200 && prev.boss.attackTick >= 17 && prev.boss.attackTick <= 28;
  return withInput({
    moveX: Math.abs(dx) < 150 ? 0 : dx > 0 ? 1 : -1,
    attackPressed: inWindow || (!slamming && n % 20 === 0),
    dashPressed: n % 97 === 0,
    jumpPressed: n % 150 === 0,
    jumpHeld: n % 150 < 8,
  });
}

/** Plays up to `max` updates (stopping once the fight is over) and hashes every update's fingerprint. */
function play(
  dials: Dials,
  seed: number,
  max: number,
  inputFor: (n: number, s: GameState) => InputFrame = scripted,
  immortal = false,
): { hash: number; updates: number; state: GameState; counters: number; staggerUpdates: number } {
  const boss = applyDials(DUELIST, dials);
  let state = createInitialState(boss, seed);
  if (immortal) state = { ...state, player: { ...state.player, health: 1_000_000 } };
  let hash = 0x811c9dc5;
  let updates = 0;
  let counters = 0;
  let staggerUpdates = 0;
  for (let n = 1; n <= max; n++) {
    state = step(state, inputFor(n, state), boss);
    updates++;
    if (state.events.includes('counter')) counters++;
    if (state.boss.mode === 'stagger') staggerUpdates++;
    hash = fnv1a(hash, fingerprint(state) + '\n');
    if (state.phase !== 'fight') break;
  }
  return { hash, updates, state, counters, staggerUpdates };
}

/** The hash and update count are the pin; the rest are readable facts that make a failure easier to understand. */
const summary = (r: ReturnType<typeof play>) => ({
  hash: r.hash,
  updates: r.updates,
  phase: r.state.phase,
  bossPhase: r.state.boss.phase,
  bossHp: r.state.boss.hp,
  playerHealth: r.state.player.health,
  counters: r.counters,
  staggerUpdates: r.staggerUpdates,
});

describe('Ember Duelist golden fights', () => {
  // Recorded from the unmodified Duelist. The scripted player loses this fight (defeated in boss phase 0).
  it('Normal dials, seed 4242', () => {
    expect(summary(play(NORMAL_DIALS, 4242, 2400))).toEqual({
      hash: 207720573,
      updates: 1386,
      phase: 'defeated',
      bossPhase: 0,
      bossHp: 29,
      playerHealth: 0,
      counters: 2,
      staggerUpdates: 180,
    });
  });

  it('Hard dials, seed 99', () => {
    expect(summary(play(presetDials('hard'), 99, 2400))).toEqual({
      hash: 1087679676,
      updates: 623,
      phase: 'defeated',
      bossPhase: 0,
      bossHp: 42,
      playerHealth: 0,
      counters: 0,
      staggerUpdates: 0,
    });
  });

  // The player cannot die here, so the fight runs through the phase change to the end.
  it('Normal dials, seed 7001, immortal brawler (reaches phase 2)', () => {
    const r = play(NORMAL_DIALS, 7001, 6000, brawler, true);
    expect(summary(r)).toEqual({
      hash: 529258817,
      updates: 1027,
      phase: 'victory',
      bossPhase: 1,
      bossHp: 0,
      playerHealth: 999996,
      counters: 0,
      staggerUpdates: 0,
    });
  });

  // Counters and staggers really happen here, so a change to the counter code shows up.
  it('Normal dials, seed 3131, immortal counter brawler (counters and staggers)', () => {
    const r = play(NORMAL_DIALS, 3131, 4000, counterBrawler, true);
    expect(summary(r)).toEqual({
      hash: 2586793840,
      updates: 1723,
      phase: 'victory',
      bossPhase: 1,
      bossHp: 0,
      playerHealth: 999994,
      counters: 4,
      staggerUpdates: 293,
    });
  });
});

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

/** Plays up to `max` updates (stopping once the fight is over) and hashes every update's fingerprint. */
function play(dials: Dials, seed: number, max: number): { hash: number; updates: number; state: GameState } {
  const boss = applyDials(DUELIST, dials);
  let state = createInitialState(boss, seed);
  let hash = 0x811c9dc5;
  let updates = 0;
  for (let n = 1; n <= max; n++) {
    state = step(state, scripted(n), boss);
    updates++;
    hash = fnv1a(hash, fingerprint(state) + '\n');
    if (state.phase !== 'fight') break;
  }
  return { hash, updates, state };
}

/** The hash and update count are the pin; the rest are readable facts that make a failure easier to understand. */
const summary = (r: ReturnType<typeof play>) => ({
  hash: r.hash,
  updates: r.updates,
  phase: r.state.phase,
  bossPhase: r.state.boss.phase,
  bossHp: r.state.boss.hp,
  playerHealth: r.state.player.health,
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
    });
  });
});

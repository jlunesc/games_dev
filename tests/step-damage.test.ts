import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { PLAYER } from '../src/game/params';
import { solo, standAt, updatesWith } from './boss-helpers';
import { run } from './helpers';

/** The Duelist using only `id`, with that attack costing `damage` hits. */
function costing(id: string, damage: number): BossDef {
  const boss = solo(id);
  return { ...boss, attacks: boss.attacks.map((a) => (a.id === id ? { ...a, damage } : a)) };
}

describe('attack damage', () => {
  it('an attack costs one hit by default', () => {
    const boss = solo('slam');
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('an attack costs as many hits as its damage', () => {
    const boss = costing('slam', 2);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(PLAYER.maxHealth - 2);
  });

  it('a hit costing more than the player has ends the fight and health stops at zero', () => {
    const boss = costing('slam', PLAYER.maxHealth + 4);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.health).toBe(0);
    expect(states[hit - 1]!.phase).toBe('defeated');
    expect(states[hit - 1]!.events).toContain('playerDefeated');
  });

  it('the player is still untouchable for the same time after a costly hit', () => {
    const boss = costing('slam', 2);
    const states = run(standAt(boss, 120), 80, () => NO_INPUT, boss);
    const hit = updatesWith(states, 'playerHit')[0]!;
    expect(states[hit - 1]!.player.invulnerableTicks).toBe(PLAYER.hitInvulnerability);
  });
});

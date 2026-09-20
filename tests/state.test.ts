import { describe, expect, it } from 'vitest';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { DUELIST } from './helpers';

describe('createInitialState', () => {
  it('starts a fight with the player standing on the floor at full health', () => {
    const s = createInitialState(DUELIST);
    expect(s.tick).toBe(0);
    expect(s.phase).toBe('fight');
    expect(s.player.x).toBe(PLAYER.startX);
    expect(s.player.y).toBe(WORLD.floorY);
    expect(s.player.onGround).toBe(true);
    expect(s.player.health).toBe(PLAYER.maxHealth);
    expect(s.player.attackTick).toBe(-1);
    expect(s.player.dashTick).toBe(-1);
    expect(s.player.dashCooldown).toBe(0);
    expect(s.events).toEqual([]);
  });

  it('starts the boss waiting at its start position with full health', () => {
    const s = createInitialState(DUELIST);
    expect(s.boss.x).toBe(DUELIST.startX);
    expect(s.boss.hp).toBe(DUELIST.maxHp);
    expect(s.boss.phase).toBe(0);
    expect(s.boss.mode).toBe('gap');
    expect(s.boss.modeTick).toBe(0);
    expect(s.boss.attackId).toBeNull();
    expect(s.boss.pendingAttackId).toBeNull();
    expect(s.boss.lastAttacks).toEqual([]);
  });

  it('records the seed and starts the random generator from it', () => {
    const s = createInitialState(DUELIST, 1234);
    expect(s.seed).toBe(1234);
    expect(s.rng).toBe(1234);
    expect(createInitialState(DUELIST).seed).toBe(1);
  });

  it('gives an independent state every time', () => {
    const a = createInitialState(DUELIST);
    a.player.x = 1;
    a.player.buffer.jump = 3;
    a.events.push('dash');
    const b = createInitialState(DUELIST);
    expect(b.player.x).toBe(PLAYER.startX);
    expect(b.player.buffer.jump).toBe(0);
    expect(b.events).toEqual([]);
  });
});

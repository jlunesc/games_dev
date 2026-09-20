import { describe, expect, it } from 'vitest';
import { DUMMY, PLAYER, WORLD } from '../src/game/params';
import { createInitialState } from '../src/game/state';

describe('createInitialState', () => {
  it('starts a fight with the player standing on the floor at full health', () => {
    const s = createInitialState();
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

  it('starts the dummy idle with the first sweep two seconds away', () => {
    const s = createInitialState();
    expect(s.dummy.x).toBe(DUMMY.x);
    expect(s.dummy.phase).toBe('idle');
    expect(s.dummy.nextSweepIn).toBe(DUMMY.firstSweepIn);
    expect(DUMMY.firstSweepIn).toBe(120);
    expect(s.dummy.hp).toBe(DUMMY.maxHp);
  });

  it('gives an independent state every time', () => {
    const a = createInitialState();
    a.player.x = 1;
    a.player.buffer.jump = 3;
    a.events.push('dash');
    const b = createInitialState();
    expect(b.player.x).toBe(PLAYER.startX);
    expect(b.player.buffer.jump).toBe(0);
    expect(b.events).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { sweepBox } from '../src/game/geometry';
import { DUMMY, GAME, PLAYER } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { run, withInput } from './helpers';

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

/** The player stands 112 units left of the dummy's edge, inside the sweep's reach. */
function standingInReach(): GameState {
  const s = createInitialState();
  s.player.x = 800;
  s.player.prevX = 800;
  return s;
}

describe('the dummy sweep timeline', () => {
  const states = run(createInitialState(), 320, () => NO_INPUT);

  it('warns at update 120 and again every 180 updates', () => {
    expect(updatesWith(states, 'dummyWindup')).toEqual([120, 300]);
  });

  it('is sweeping on exactly 8 updates, starting 30 updates after the warning', () => {
    const sweeping = states.flatMap((s, i) => (s.dummy.phase === 'sweep' ? [i + 1] : []));
    expect(sweeping).toEqual(Array.from({ length: 8 }, (_, i) => 150 + i));
  });

  it('does not touch a player who stays far away', () => {
    expect(states[319]!.player.health).toBe(PLAYER.maxHealth);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
  });

  it('turns towards the player when the warning starts', () => {
    expect(states[119]!.dummy.facing).toBe(-1);
  });
});

describe('the sweep hurts', () => {
  it('hits a player standing in reach on the first sweeping update, once', () => {
    const states = run(standingInReach(), 200, () => NO_INPUT);
    expect(updatesWith(states, 'playerHit')).toEqual([150]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('cannot hit twice within the same sweep', () => {
    const start = standingInReach();
    start.dummy.phase = 'sweep';
    start.dummy.phaseTick = 0;
    start.dummy.facing = -1;
    start.dummy.nextSweepIn = 100000;
    const states = run(start, 3, () => NO_INPUT);
    expect(states[0]!.events).toContain('playerHit');
    expect(states[1]!.events).not.toContain('playerHit');
    expect(states[2]!.player.health).toBe(PLAYER.maxHealth - 1);
    expect(states[0]!.player.invulnerableTicks).toBe(PLAYER.hitInvulnerability);
  });

  it('can be jumped over', () => {
    const states = run(standingInReach(), 200, (n) =>
      withInput({ jumpPressed: n === 137, jumpHeld: n >= 137 && n <= 170 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth);
  });

  it('can be dashed through', () => {
    const states = run(standingInReach(), 200, (n) =>
      withInput({ dashPressed: n === 148, moveX: n === 148 ? 1 : 0 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[199]!.player.health).toBe(PLAYER.maxHealth);
  });
});

describe('the sweep has no safe spot inside the dummy', () => {
  it.each([0, 20, 40])('hits a player standing %i units right of the dummy centre on the first sweeping update', (offset) => {
    const start = createInitialState();
    start.player.x = DUMMY.x + offset;
    start.player.prevX = start.player.x;
    const firstSweeping = DUMMY.firstSweepIn + DUMMY.sweep.windup;
    const states = run(start, firstSweeping + 5, () => NO_INPUT);
    expect(states[firstSweeping - 1]!.dummy.facing).toBe(1);
    expect(states[firstSweeping - 1]!.dummy.phase).toBe('sweep');
    expect(updatesWith(states, 'playerHit')).toEqual([firstSweeping]);
  });
});

describe('sweepBox', () => {
  it('reaches out low in front of the dummy, on the side it faces', () => {
    const d = createInitialState().dummy;
    d.facing = -1;
    expect(sweepBox(d)).toEqual({ x: 692, y: 520, w: 268, h: 120 });
    d.facing = 1;
    expect(sweepBox(d)).toEqual({ x: 960, y: 520, w: 268, h: 120 });
  });
});

describe('defeat', () => {
  it('does not leave the player interpolating while the fight is paused', () => {
    const states = defeated(withInput({ moveX: 1 }));
    expect(states[0]!.phase).toBe('defeated');
    expect(states[0]!.player.prevX).not.toBe(states[0]!.player.x);
    for (let i = 1; i < GAME.defeatRestartTicks; i++) {
      expect(states[i]!.phase).toBe('defeated');
      const p = states[i]!.player;
      expect(p.prevX).toBe(p.x);
      expect(p.prevY).toBe(p.y);
    }
  });

  const defeated = (input: InputFrame = NO_INPUT): GameState[] => {
    const start = standingInReach();
    start.player.health = 1;
    start.dummy.phase = 'sweep';
    start.dummy.phaseTick = 0;
    start.dummy.facing = -1;
    start.dummy.nextSweepIn = 100000;
    return run(start, 70, () => input);
  };

  it('ends the fight when the last hit lands', () => {
    const states = defeated();
    expect(states[0]!.phase).toBe('defeated');
    expect(states[0]!.player.health).toBe(0);
    expect(states[0]!.events).toContain('playerDefeated');
  });

  it('restarts a fresh fight exactly 60 updates later', () => {
    const states = defeated();
    expect(states[59]!.phase).toBe('defeated');
    expect(states[60]!.phase).toBe('fight');
    expect(states[60]!.tick).toBe(0);
    expect(states[60]!.player.health).toBe(PLAYER.maxHealth);
  });
});

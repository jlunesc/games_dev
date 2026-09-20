import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { sweepBox } from '../src/game/geometry';
import { DUMMY, GAME, PLAYER } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { run, withInput } from './helpers';

const updatesWith = (states: GameState[], event: GameEvent): number[] =>
  states.flatMap((s, i) => (s.events.includes(event) ? [i + 1] : []));

/** The update on which the first sweep starts hurting (the warning starts on update DUMMY.firstSweepIn). */
const SWEEP_START = DUMMY.firstSweepIn + DUMMY.sweep.windup;

/** The player stands halfway into the sweep's reach, left of the dummy's edge. */
function standingInReach(): GameState {
  const s = createInitialState();
  s.player.x = DUMMY.x - DUMMY.width / 2 - DUMMY.sweep.reach / 2;
  s.player.prevX = s.player.x;
  return s;
}

describe('the dummy sweep timeline', () => {
  const total = SWEEP_START + DUMMY.sweep.every + DUMMY.sweep.active + 2;
  const states = run(createInitialState(), total, () => NO_INPUT);

  it('warns at the first sweep time and again every sweep period', () => {
    expect(updatesWith(states, 'dummyWindup')).toEqual([
      DUMMY.firstSweepIn,
      DUMMY.firstSweepIn + DUMMY.sweep.every,
    ]);
  });

  it('is sweeping on exactly the active updates, one wind-up after the warning', () => {
    const first = DUMMY.firstSweepIn + DUMMY.sweep.windup;
    const sweeping = states.flatMap((s, i) => (s.dummy.phase === 'sweep' ? [i + 1] : []));
    expect(sweeping.slice(0, DUMMY.sweep.active)).toEqual(
      Array.from({ length: DUMMY.sweep.active }, (_, i) => first + i),
    );
    expect(sweeping[DUMMY.sweep.active]).toBe(first + DUMMY.sweep.every);
  });

  it('does not touch a player who stays far away', () => {
    expect(states[total - 1]!.player.health).toBe(PLAYER.maxHealth);
    expect(updatesWith(states, 'playerHit')).toEqual([]);
  });

  it('turns towards a player on its left when the warning starts', () => {
    expect(states[DUMMY.firstSweepIn - 1]!.dummy.facing).toBe(-1);
  });

  it('turns towards a player on its right when the warning starts', () => {
    const start = createInitialState();
    start.player.x = DUMMY.x + DUMMY.width / 2 + 100;
    start.player.prevX = start.player.x;
    const right = run(start, DUMMY.firstSweepIn, () => NO_INPUT);
    expect(right[DUMMY.firstSweepIn - 1]!.dummy.facing).toBe(1);
  });
});

describe('the sweep hurts', () => {
  it('hits a player standing in reach on the first sweeping update, once', () => {
    const states = run(standingInReach(), SWEEP_START + 50, () => NO_INPUT);
    expect(updatesWith(states, 'playerHit')).toEqual([SWEEP_START]);
    expect(states[SWEEP_START + 49]!.player.health).toBe(PLAYER.maxHealth - 1);
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
    const press = SWEEP_START - 13;
    const states = run(standingInReach(), SWEEP_START + 50, (n) =>
      withInput({ jumpPressed: n === press, jumpHeld: n >= press && n <= press + 33 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[SWEEP_START + 49]!.player.health).toBe(PLAYER.maxHealth);
  });

  it('can be dashed through', () => {
    const press = SWEEP_START - 2;
    const states = run(standingInReach(), SWEEP_START + 50, (n) =>
      withInput({ dashPressed: n === press, moveX: n === press ? 1 : 0 }),
    );
    expect(updatesWith(states, 'playerHit')).toEqual([]);
    expect(states[SWEEP_START + 49]!.player.health).toBe(PLAYER.maxHealth);
  });
});

describe('the sweep has no safe spot inside the dummy', () => {
  it.each([0, 20, 40])('hits a player standing %i units right of the dummy centre on the first sweeping update', (offset) => {
    const start = createInitialState();
    start.player.x = DUMMY.x + offset;
    start.player.prevX = start.player.x;
    const firstSweeping = SWEEP_START;
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
    return run(start, GAME.defeatRestartTicks + 10, () => input);
  };

  it('ends the fight when the last hit lands', () => {
    const states = defeated();
    expect(states[0]!.phase).toBe('defeated');
    expect(states[0]!.player.health).toBe(0);
    expect(states[0]!.events).toContain('playerDefeated');
  });

  it('restarts a fresh fight once the defeat pause is over', () => {
    const states = defeated();
    const last = GAME.defeatRestartTicks;
    expect(states[last - 1]!.phase).toBe('defeated');
    expect(states[last]!.phase).toBe('fight');
    expect(states[last]!.tick).toBe(0);
    expect(states[last]!.player.health).toBe(PLAYER.maxHealth);
    expect(states[last]!.dummy.phase).toBe('idle');
    expect(states[last]!.dummy.nextSweepIn).toBe(DUMMY.firstSweepIn);
    expect(states[last]!.dummy.hp).toBe(DUMMY.maxHp);
  });
});

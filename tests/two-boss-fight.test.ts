import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/engine/input-frame';
import type { FightDef } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { dummy, pair, unit } from './duo-helpers';
import { DUELIST, withInput } from './helpers';
import { shootingAttack } from './shot-helpers';

/** One swing at the current spot, then 25 idle updates (a swing takes 16), returning the final state and every event. */
function swing(s: GameState, fight: FightDef): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let cur = step(s, withInput({ attackPressed: true }), fight);
  events.push(...cur.events);
  for (let i = 0; i < 25; i++) {
    cur = step(cur, NO_INPUT, fight);
    events.push(...cur.events);
  }
  return { state: cur, events };
}

/** The player stands at x = 600 facing right: the swing reaches 624 to 714. */
function stand(fight: FightDef): GameState {
  const s = createInitialState(fight);
  s.player.x = 600;
  s.player.prevX = 600;
  return s;
}

describe('the sword in a fight with two bosses', () => {
  it('hurts only the nearest boss in reach, whichever is listed first', () => {
    const fight = pair(dummy(700, 5), dummy(650, 5));
    const { state } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(5);
    expect(state.partners[0]!.hp).toBe(4);
  });

  it('hurts the first-listed boss when both are the same distance away', () => {
    const fight = pair(dummy(650, 5), dummy(650, 5));
    const { state } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(4);
    expect(state.partners[0]!.hp).toBe(5);
  });

  it('hurts nobody when neither boss is in reach', () => {
    const fight = pair(dummy(1000, 5), dummy(1100, 5));
    const { state, events } = swing(stand(fight), fight);
    expect(state.boss.hp).toBe(5);
    expect(state.partners[0]!.hp).toBe(5);
    expect(events).not.toContain('bossHit');
  });
});

describe('counters in a fight with two bosses', () => {
  it('staggers the boss that was countered and nobody else', () => {
    const counterable = {
      ...unit(5, 960),
      attacks: [shootingAttack([], { class: 'counterable' })],
    };
    const fight = pair(dummy(1100), counterable);
    let s = createInitialState(fight);
    s.player.x = 910;
    s.player.prevX = 910;
    const windup = counterable.attacks[0]!.windup;
    let countered = false;
    for (let n = 0; n < 200 && !countered; n++) {
      const b = s.partners[0]!;
      const press = b.mode === 'attack' && b.attackTick === windup - 3;
      s = step(s, withInput({ attackPressed: press }), fight);
      countered = s.events.includes('counter');
    }
    expect(countered).toBe(true);
    expect(s.partners[0]!.mode).toBe('stagger');
    expect(s.boss.mode).toBe('gap');
  });
});

describe('beating one boss', () => {
  it('lets the fight go on: the boss falls, its shots vanish, and no victory is declared', () => {
    const fight = pair(dummy(1000, 5), dummy(650, 1));
    const s0 = stand(fight);
    s0.shots.push({
      kind: 'bolt', attackId: 'shoot', originTick: 0, x: 900, lift: 400, dir: -1, originX: 900, size: 30, speed: 0, climb: 0, owner: 1,
    });
    const { state, events } = swing(s0, fight);
    expect(events).toContain('bossDown');
    expect(events).not.toContain('bossDefeated');
    expect(state.phase).toBe('fight');
    expect(state.partners[0]!.hp).toBe(0);
    expect(state.boss.hp).toBe(5);
    expect(state.shots).toEqual([]);
  });

  it('never lets a fallen boss act, be hit again or hold the turn', () => {
    const fight = pair(unit(5, 960), dummy(650, 1));
    let s = stand(fight);
    s = swing(s, fight).state;
    const before = JSON.stringify(s.partners[0]);
    for (let i = 0; i < 300; i++) {
      s = step(s, NO_INPUT, fight);
      expect(s.phase).toBe('fight');
    }
    expect(JSON.stringify(s.partners[0])).toBe(before);
    // The survivor kept attacking, so the fallen boss did not block its turns.
    expect(s.boss.mode === 'attack' || s.boss.mode === 'approach' || s.shots.length > 0 || s.boss.lastAttacks.length > 0).toBe(true);
  });

  it('enrages the survivor: it starts its next attack sooner than it would without the enrage', () => {
    const strong = { gapScale: 0.25, walkScale: 2 };
    const angry = pair(unit(60, 960), dummy(650, 1), strong);
    const calm = pair(unit(60, 960), dummy(650, 1));
    const a = swing(stand(angry), angry).state;
    const c = swing(stand(calm), calm).state;
    expect(a.boss.mode).not.toBe('gap');
    expect(c.boss.mode).toBe('gap');
  });

  it('does not enrage anyone while both bosses stand', () => {
    const fight = pair(unit(60, 960), unit(60, 1100), { gapScale: 0.25, walkScale: 2 });
    let s = createInitialState(fight);
    for (let i = 0; i < 20; i++) s = step(s, NO_INPUT, fight);
    expect(s.boss.mode).toBe('gap');
    expect(s.partners[0]!.mode).toBe('gap');
  });
});

describe('beating both bosses', () => {
  it('is a victory, with the usual event, once the last boss is at 0', () => {
    const fight = pair(dummy(700, 1), dummy(650, 1));
    const first = swing(stand(fight), fight);
    expect(first.events).toContain('bossDown');
    expect(first.state.phase).toBe('fight');
    const second = swing(first.state, fight);
    expect(second.events).toContain('bossDefeated');
    expect(second.state.phase).toBe('victory');
    expect(second.state.boss.hp).toBe(0);
    expect(second.state.partners[0]!.hp).toBe(0);
  });

  it('starts a fresh fight of the same two bosses after the end countdown', () => {
    const fight = pair(dummy(700, 1), dummy(650, 1));
    let s = swing(swing(stand(fight), fight).state, fight).state;
    expect(s.phase).toBe('victory');
    for (let i = 0; i < 200 && s.phase !== 'fight'; i++) s = step(s, NO_INPUT, fight);
    expect(s.phase).toBe('fight');
    expect(s.partners.length).toBe(1);
    expect(s.boss.hp).toBe(1);
    expect(s.partners[0]!.hp).toBe(1);
  });
});

describe('a plain boss still works as a fight of one', () => {
  it('accepts a BossDef and a one-boss fight alike, with the same result', () => {
    const solo = createInitialState(DUELIST, 4);
    let a = solo;
    let b = createInitialState(DUELIST, 4);
    for (let i = 0; i < 300; i++) {
      a = step(a, NO_INPUT, DUELIST);
      b = step(b, NO_INPUT, { bosses: [DUELIST], enrage: null, enraged: [DUELIST] });
    }
    expect(a).toEqual(b);
  });
});

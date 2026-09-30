import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { overlaps, playerBox, shotBox } from '../src/game/geometry';
import { EMBER, ERUPTION, WORLD } from '../src/game/params';
import { createInitialState, type EruptionState, type GameState } from '../src/game/state';
import { advance, QUIET_BOSS } from './helpers';
import { eruption, shooter } from './shot-helpers';

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** A fight with one eruption already on the floor under the player: mark from age 0, blast from age 10 for 4 updates, then 200 updates of embers. */
function embersUnderPlayer(health = 3): GameState {
  const s = createInitialState(QUIET_BOSS, 1);
  s.player.health = health;
  const shot: EruptionState = {
    kind: 'eruption',
    attackId: 'shoot',
    originTick: 0,
    x: s.player.x,
    lift: 0,
    age: 0,
    width: 200,
    delay: 10,
    burst: 4,
    linger: 200,
  };
  s.shots.push(shot);
  return s;
}

describe('lingering embers: parsing', () => {
  it('accepts linger on an eruption and rejects a bad one', () => {
    expect(parseBoss(clone(shooter([eruption({ linger: 90 })]))).attacks[0]!.shots![0]).toMatchObject({ linger: 90 });
    for (const bad of [0, 601, 2.5]) {
      expect(() => parseBoss(clone(shooter([eruption({ linger: bad })])))).toThrow(/linger/);
    }
  });
});

describe('lingering embers: playing', () => {
  it('stays after the blast as a low box, then goes when the linger is over', () => {
    // Plenty of health: the player is hurt every 61 updates and must outlast the embers, or the fight ends and clears the shots.
    const s0 = embersUnderPlayer(10);
    const during = advance(s0, 12);
    expect(shotBox(during.shots[0]!)!.h).toBe(ERUPTION.height);
    const after = advance(s0, 20);
    expect(after.shots.length).toBe(1);
    expect(shotBox(after.shots[0]!)!.h).toBe(EMBER.height);
    expect(advance(s0, 10 + 4 + 200 - 1).shots.length).toBe(1);
    expect(advance(s0, 10 + 4 + 200).shots.length).toBe(0);
  });

  it('can be jumped over but not walked through', () => {
    const after = advance(embersUnderPlayer(), 20);
    const embers = shotBox(after.shots[0]!)!;
    const standing = playerBox({ ...after.player, y: WORLD.floorY });
    const jumping = playerBox({ ...after.player, y: WORLD.floorY - 100 });
    expect(overlaps(embers, standing)).toBe(true);
    expect(overlaps(embers, jumping)).toBe(false);
  });

  it('hurts again each time the player stops being untouchable, and is not used up by a hit', () => {
    let s = embersUnderPlayer(10);
    for (let i = 0; i < 10 + 4 + 200; i++) s = advance(s, 1, NO_INPUT, QUIET_BOSS);
    // Hurt at updates 10, 71, 132 and 193: a used-up eruption would have hurt only once.
    expect(s.player.health).toBe(10 - 4);
  });

  it('does not change an eruption without linger: it is used up on its first hit and gone after its blast', () => {
    const s0 = embersUnderPlayer();
    const plain = { ...s0, shots: [{ ...(s0.shots[0] as EruptionState), linger: undefined }] } as GameState;
    delete (plain.shots[0] as { linger?: number }).linger;
    const hit = advance(plain, 11);
    expect(hit.player.health).toBe(2);
    expect(hit.shots.length).toBe(0);
  });
});

describe('lingering embers: difficulty dials', () => {
  it('keeps the linger through the dials', () => {
    const boss = shooter([eruption({ linger: 120 })]);
    expect(applyDials(boss, { ...NORMAL_DIALS, readability: 1.3, range: 1.2 }).attacks[0]!.shots![0]).toMatchObject({ linger: 120 });
  });
});

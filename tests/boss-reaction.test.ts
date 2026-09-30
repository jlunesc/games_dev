import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { PLAYER } from '../src/game/params';
import { createInitialState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';

/** A boss that waits (a very long gap) and, when hit, slips away with the "skitter" attack. */
const skittish = (over: Partial<BossDef> = {}): BossDef =>
  customBoss(
    [
      melee('cut'),
      melee('skitter', {
        windup: 4,
        active: 10,
        recovery: 4,
        hits: [],
        move: { from: 4, to: 14, speed: 300, dir: 'back' },
      }),
    ],
    { attacks: [{ id: 'cut', weight: 1 }], gap: 100000 },
    { reaction: { attack: 'skitter', cooldown: 200 }, ...over },
  );

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The player is about to land a forward swing on a boss that stands next to them. */
function aboutToHit(boss: BossDef): GameState {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.player.x = 640;
  s.player.prevX = 640;
  s.player.facing = 1;
  s.player.health = 1e9;
  s.player.attackTick = PLAYER.attack.startup - 1;
  s.player.attackConnected = false;
  s.player.attackAim = 'forward';
  return s;
}

describe('hit reaction: parsing', () => {
  it('accepts a reaction and rejects an unknown attack or a bad cooldown', () => {
    expect(parseBoss(clone(skittish())).reaction).toEqual({ attack: 'skitter', cooldown: 200 });
    const unknown = clone(skittish());
    unknown.reaction.attack = 'nothing';
    expect(() => parseBoss(unknown)).toThrow(/reaction/);
    for (const bad of [10, 5000, 60.5]) {
      const data = clone(skittish());
      data.reaction.cooldown = bad;
      expect(() => parseBoss(data)).toThrow(/reaction/);
    }
  });

  it('survives the difficulty dials', () => {
    expect(applyDials(skittish(), { ...NORMAL_DIALS, readability: 1.3 }).reaction).toEqual({ attack: 'skitter', cooldown: 200 });
    const lean = applyDials(skittish(), { ...NORMAL_DIALS, variety: 0.1 });
    expect(lean.reaction).toEqual({ attack: 'skitter', cooldown: 200 });
    expect(lean.attacks.some((a) => a.id === 'skitter')).toBe(true);
    expect(lean.phases.every((p) => p.attacks.every((a) => a.id !== 'skitter'))).toBe(true);
  });
});

describe('hit reaction: playing', () => {
  it('starts the reaction attack the moment a waiting boss is hit, and sets the cooldown', () => {
    const boss = skittish();
    const s = step(aboutToHit(boss), NO_INPUT, boss);
    expect(s.events).toContain('bossHit');
    expect(s.boss.mode).toBe('attack');
    expect(s.boss.attackId).toBe('skitter');
    expect(s.boss.attackTick).toBe(0);
    expect(s.boss.reactCooldown).toBe(200);
    expect(s.boss.comboQueue).toEqual([]);
  });

  it('counts the cooldown down, and does not react again while it runs', () => {
    const boss = skittish();
    const first = step(aboutToHit(boss), NO_INPUT, boss);
    expect(step(first, NO_INPUT, boss).boss.reactCooldown).toBe(199);
    const second = aboutToHit(boss);
    second.boss.reactCooldown = 50;
    const after = step(second, NO_INPUT, boss);
    expect(after.events).toContain('bossHit');
    expect(after.boss.mode).toBe('gap');
  });

  it('does not react in the middle of an attack, or when the hit defeats it', () => {
    const boss = skittish();
    const busy = aboutToHit(boss);
    busy.boss.mode = 'attack';
    busy.boss.attackId = 'cut';
    busy.boss.attackTick = 0;
    const attacking = step(busy, NO_INPUT, boss);
    expect(attacking.boss.attackId).toBe('cut');
    expect(attacking.boss.reactCooldown).toBe(0);

    const weak = skittish({ maxHp: 1 });
    const beaten = step(aboutToHit(weak), NO_INPUT, weak);
    expect(beaten.phase).toBe('victory');
    expect(beaten.boss.attackId).not.toBe('skitter');
  });

  it('a boss without a reaction behaves as before', () => {
    const plain = skittish();
    delete plain.reaction;
    const s = step(aboutToHit(plain), NO_INPUT, plain);
    expect(s.boss.mode).toBe('gap');
    expect(s.boss.reactCooldown).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSSES, EMBER_DUELIST, TRAINEE } from '../src/bosses';
import { parseBoss } from '../src/bosses/parse';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { RANGE_PATIENCE_TICKS } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';

/** A player who keeps running away from the boss (turning at the walls) and never gets hurt. */
function runAwayBites(boss: BossDef, attackId: string): { fromRange: number; outOfRange: number } {
  const attack = boss.attacks.find((a) => a.id === attackId)!;
  let fromRange = 0;
  let outOfRange = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let s = createInitialState(boss, seed);
    let dir: 1 | -1 = 1;
    let started: string | null = null;
    for (let n = 0; n < 2400 && s.phase === 'fight'; n++) {
      if (s.player.x > 1180) dir = -1;
      if (s.player.x < 100) dir = 1;
      const away = s.player.x >= s.boss.x ? 1 : -1;
      const want = Math.abs(s.player.x - s.boss.x) < 700 ? away : dir;
      const moveX = (s.player.x > 1180 && want === 1) || (s.player.x < 100 && want === -1) ? -want : want;
      s = step(s, { ...NO_INPUT, moveX: moveX as 1 | -1 }, boss);
      s.player.health = 99;
      const id = s.boss.mode === 'attack' ? s.boss.attackId : null;
      if (id === attackId && started !== attackId) {
        // The player has moved on by a few units since the boss decided: a small margin on the range.
        const distance = Math.abs(s.player.x - s.boss.x);
        fromRange += 1;
        if (distance < attack.range.min - 20 || distance > attack.range.max + 20) outOfRange += 1;
      }
      started = id;
    }
  }
  return { fromRange, outOfRange };
}

describe('rangeBias', () => {
  it('is on every hand-built boss except the Ember Duelist and the Trainee', () => {
    for (const boss of BOSSES) {
      if (boss.id === EMBER_DUELIST.id) expect(boss.rangeBias, boss.id).toBeUndefined();
      else expect(boss.rangeBias, boss.id).toBe(0.25);
    }
    expect(TRAINEE.rangeBias).toBeUndefined();
  });

  it('must be above 0 and at most 1', () => {
    expect(parseBoss({ ...ASHEN_HOUND, rangeBias: 1 }).rangeBias).toBe(1);
    expect(() => parseBoss({ ...ASHEN_HOUND, rangeBias: 0 })).toThrow();
    expect(() => parseBoss({ ...ASHEN_HOUND, rangeBias: 1.5 })).toThrow();
    expect(() => parseBoss({ ...ASHEN_HOUND, rangeBias: 'low' })).toThrow();
  });

  it('keeps the Hound from biting a player who runs away, where it did before', () => {
    const { rangeBias: _drop, ...plain } = ASHEN_HOUND;
    const before = runAwayBites(parseBoss(plain), 'bite');
    const after = runAwayBites(ASHEN_HOUND, 'bite');
    expect(before.fromRange).toBeGreaterThan(10);
    expect(before.outOfRange / before.fromRange).toBeGreaterThan(0.5);
    expect(after.fromRange).toBeGreaterThan(5);
    expect(after.outOfRange / after.fromRange).toBeLessThan(0.2);
  });

  it('never lets a boss chase for longer than its patience', () => {
    for (const boss of BOSSES.filter((b) => b.rangeBias !== undefined)) {
      let longest = 0;
      for (const seed of [1, 2, 3]) {
        let s = createInitialState(boss, seed);
        let chasing = 0;
        let dir: 1 | -1 = 1;
        for (let n = 0; n < 3600 && s.phase === 'fight'; n++) {
          if (s.player.x > 1180) dir = -1;
          if (s.player.x < 100) dir = 1;
          const away = s.player.x >= s.boss.x ? 1 : -1;
          const want = Math.abs(s.player.x - s.boss.x) < 700 ? away : dir;
          const moveX = (s.player.x > 1180 && want === 1) || (s.player.x < 100 && want === -1) ? -want : want;
          s = step(s, { ...NO_INPUT, moveX: moveX as 1 | -1 }, boss);
          s.player.health = 99;
          chasing = s.boss.mode === 'approach' && !s.study.active ? chasing + 1 : 0;
          longest = Math.max(longest, chasing);
        }
      }
      expect(longest, boss.id).toBeLessThanOrEqual(RANGE_PATIENCE_TICKS + 1);
    }
  });
});

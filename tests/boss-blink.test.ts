import { describe, expect, it } from 'vitest';
import { parseBoss } from '../src/bosses/parse';
import type { AttackDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { beginTransition } from '../src/game/boss';
import { applyDials, NORMAL_DIALS } from '../src/game/difficulty';
import { bossHidden } from '../src/game/geometry';
import { PLAYER } from '../src/game/params';
import { createInitialState } from '../src/game/state';
import { step } from '../src/game/step';
import { customBoss, melee } from './boss-helpers';
import { run } from './helpers';

const cutter = (over: Partial<AttackDef> = {}): AttackDef =>
  melee('cut', {
    windup: 14,
    active: 6,
    recovery: 4,
    hits: [{ from: 14, to: 18, x0: 0, x1: 60, bottom: 0, top: 60 }],
    blink: { from: 4, to: 12, target: 'player', distance: 80 },
    ...over,
  });

const blinker = (over: Partial<AttackDef> = {}): BossDef =>
  customBoss([cutter(over)], { attacks: [{ id: 'cut', weight: 1 }] });

const clone = (boss: BossDef): Record<string, any> => JSON.parse(JSON.stringify(boss)) as Record<string, any>;

/** The boss at 700 and the player at 600, so a blink "behind the player" by 80 lands on 520. */
function start(boss: BossDef) {
  const s = createInitialState(boss, 1);
  s.boss.x = 700;
  s.player.x = 600;
  s.player.prevX = 600;
  s.player.health = 1e9;
  return s;
}

describe('blink: parsing', () => {
  it('accepts a blink, and an attack with a blink and no hit windows', () => {
    expect(parseBoss(clone(blinker())).attacks[0]!.blink).toEqual({ from: 4, to: 12, target: 'player', distance: 80 });
    const away = clone(blinker({ hits: [], blink: { from: 2, to: 8, target: 'back', distance: 300 } }));
    expect(() => parseBoss(away)).not.toThrow();
  });

  it('rejects a blink that breaks a rule', () => {
    const bad = (change: (attack: Record<string, any>) => void): unknown => {
      const data = clone(blinker());
      change(data.attacks[0]);
      return data;
    };
    expect(() => parseBoss(bad((a) => (a.blink.from = 0)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 4)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 21)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.blink = { from: 4, to: 12, target: 'forward' })))).toThrow(/distance/);
    expect(() => parseBoss(bad((a) => (a.blink.to = 16)))).toThrow(/hit window/);
    expect(() => parseBoss(bad((a) => (a.class = 'counterable')))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.hold = 5)))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.leap = { from: 14, to: 18, height: 50, target: 'player' })))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => (a.shots = [{ kind: 'bolt', at: 14, height: 0, size: 30, speed: 600 }])))).toThrow(/blink/);
    expect(() => parseBoss(bad((a) => ((a.blink.to = 15), (a.move = { from: 14, to: 16, speed: 200 }))))).toThrow(/blink/);
  });
});

describe('blink: playing', () => {
  it('hides the boss, fixes the landing spot, then puts it there facing the player', () => {
    const boss = blinker();
    const states = run(start(boss), 25, () => NO_INPUT, boss);
    const hidden = states.filter((x) => bossHidden(x.boss, boss));
    expect(hidden.length).toBe(8);
    for (const x of hidden) {
      expect(x.boss.blinkToX).toBeCloseTo(520);
      expect(x.boss.x).toBe(700);
    }
    const back = states.find((x) => x.boss.mode === 'attack' && x.boss.attackTick === 12)!;
    expect(back.boss.x).toBeCloseTo(520);
    expect(back.boss.blinkToX).toBeNull();
    expect(back.boss.facing).toBe(1);
  });

  it('cannot be hit while hidden, and can be once it is back', () => {
    const boss = blinker();
    const swing = (attackTick: number, blinkToX: number | null) => {
      const s = start(boss);
      s.player.x = 640;
      s.player.prevX = 640;
      s.player.facing = 1;
      s.player.attackTick = PLAYER.attack.startup - 1;
      s.player.attackConnected = false;
      s.player.attackAim = 'forward';
      s.boss.mode = 'attack';
      s.boss.attackId = 'cut';
      s.boss.attackTick = attackTick;
      s.boss.blinkToX = blinkToX;
      s.boss.facing = -1;
      return step(s, NO_INPUT, boss);
    };
    const hiddenSwing = swing(6, 520);
    expect(hiddenSwing.boss.hp).toBe(boss.maxHp);
    expect(hiddenSwing.events).not.toContain('bossHit');
    const visibleSwing = swing(15, null);
    expect(visibleSwing.boss.hp).toBe(boss.maxHp - 1);
  });

  it('forgets the landing spot when the boss changes phase', () => {
    const boss = blinker();
    const s = start(boss);
    s.boss.blinkToX = 520;
    beginTransition(s, boss);
    expect(s.boss.blinkToX).toBeNull();
  });
});

describe('blink: difficulty dials', () => {
  it('shifts the blink with the warning length and scales its distance with the range', () => {
    const changed = applyDials(blinker(), { ...NORMAL_DIALS, readability: 1.3, range: 1.2 });
    const attack = changed.attacks[0]!;
    expect(attack.windup).toBe(18);
    expect(attack.blink).toEqual({ from: 8, to: 16, target: 'player', distance: 96 });
  });
});

import { describe, expect, it } from 'vitest';
import type { ArenaDef, BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { beginTransition } from '../src/game/boss';
import { PLAYER } from '../src/game/params';
import { createInitialState, type BoltState, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { arc, bolt, shooter } from './shot-helpers';

const COVER = (x: number, height: number): ArenaDef => ({ platforms: [], covers: [{ x, width: 100, height }] });

/** The boss never attacks by itself, so a test controls every shot. */
const quiet = (boss: BossDef): BossDef => ({
  ...boss,
  phases: boss.phases.map((p) => ({ ...p, gap: 1e6 })),
});

const mkBolt = (over: Partial<BoltState> = {}): BoltState => ({
  kind: 'bolt',
  attackId: 'shoot',
  originTick: 1,
  x: 520,
  lift: 0,
  dir: -1,
  originX: 520,
  size: 30,
  speed: 600,
  climb: 0,
  ...over,
});

function run(s: GameState, boss: BossDef, count: number, frame: (n: number) => InputFrame = () => NO_INPUT): GameState[] {
  const out: GameState[] = [];
  let cur = s;
  for (let n = 0; n < count; n++) {
    cur = step(cur, frame(n), boss);
    out.push(cur);
  }
  return out;
}

const withShots = (boss: BossDef, ...shots: BoltState[]): GameState => {
  const s = createInitialState(boss, 1);
  s.shots = shots;
  return s;
};

describe('a straight bolt', () => {
  it('appears at the boss front on the update the shot is due and then flies at its speed', () => {
    const boss = shooter([bolt({ at: 22, height: 40, speed: 600 })]);
    const states = run(createInitialState(boss, 1), boss, 60);
    const first = states.findIndex((s) => s.shots.length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    const born = states[first]!;
    const shot = born.shots[0] as BoltState;
    expect(born.boss.attackTick).toBe(22);
    expect(shot.x).toBeCloseTo(born.boss.x - boss.width / 2);
    expect(shot.lift).toBe(40);
    expect(shot.dir).toBe(-1);
    const next = states[first + 1]!.shots[0] as BoltState;
    expect(next.x).toBeCloseTo(shot.x - 10);
  });

  it('flies over a standing player when it is high enough, and disappears at the arena wall', () => {
    const boss = shooter([bolt({ height: 150 })]);
    const states = run(createInitialState(boss, 1), boss, 140);
    expect(states.every((s) => s.player.health === PLAYER.maxHealth)).toBe(true);
    const first = states.findIndex((s) => s.shots.length > 0);
    const origin = states[first]!.shots[0]!.originTick;
    const gone = states.findIndex((s, i) => i > first && !s.shots.some((x) => x.originTick === origin));
    expect(gone).toBeGreaterThan(first);
  });

  it('hurts a standing player for the attack damage and is used up', () => {
    const boss = shooter([bolt({ height: 0 })], undefined, { damage: 2 });
    const states = run(createInitialState(boss, 1), boss, 140);
    const at = states.findIndex((s) => s.events.includes('playerHit'));
    expect(at).toBeGreaterThan(0);
    const hit = states[at]!;
    expect(hit.player.health).toBe(PLAYER.maxHealth - 2);
    expect(hit.shots.some((x) => x.originTick === hit.shotHits[0]!.originTick)).toBe(false);
    expect(hit.shotHits).toHaveLength(1);
    expect(hit.shotHits[0]!.attackId).toBe('shoot');
    // The list is only for the update that hurt.
    expect(states[at + 1]!.shotHits).toEqual([]);
  });

  it('is jumped over when low', () => {
    const boss = quiet(shooter([bolt()]));
    const states = run(withShots(boss, mkBolt()), boss, 60, (n) => ({
      ...NO_INPUT,
      jumpPressed: n === 0,
      jumpHeld: n < 20,
    }));
    expect(states[states.length - 1]!.player.health).toBe(PLAYER.maxHealth);
    expect(states.some((s) => s.events.includes('playerHit'))).toBe(false);
  });

  it('is dashed through, and keeps flying afterwards', () => {
    const boss = quiet(shooter([bolt()]));
    const states = run(withShots(boss, mkBolt()), boss, PLAYER.dash.duration, (n) => ({ ...NO_INPUT, dashPressed: n === 0 }));
    const last = states[states.length - 1]!;
    expect(last.player.health).toBe(PLAYER.maxHealth);
    expect(last.shots).toHaveLength(1);
  });

  it('is stopped by a cover that reaches its bottom edge, and flies over a lower one', () => {
    const stopped = quiet(shooter([bolt()], COVER(420, 60)));
    const a = run(withShots(stopped, mkBolt({ x: 700, originX: 700 })), stopped, 60);
    expect(a[a.length - 1]!.shots).toEqual([]);
    expect(a[a.length - 1]!.player.health).toBe(PLAYER.maxHealth);

    const over = quiet(shooter([bolt()], COVER(420, 60)));
    const b = run(withShots(over, mkBolt({ x: 700, originX: 700, lift: 60 })), over, 60);
    expect(b.some((s) => s.events.includes('playerHit'))).toBe(true);
  });

  it('is not stopped by a cover behind where it appeared', () => {
    const boss = quiet(shooter([bolt()], COVER(420, 300)));
    const states = run(withShots(boss, mkBolt({ x: 700, originX: 700, dir: 1 })), boss, 5);
    expect(states[states.length - 1]!.shots).toHaveLength(1);
  });

  it('is not touched by the player swing', () => {
    const boss = quiet(shooter([bolt()]));
    const s = withShots(boss, mkBolt({ x: 390, originX: 390, dir: 1, speed: 60 }));
    const states = run(s, boss, PLAYER.attack.startup + PLAYER.attack.active + 1, (n) => ({
      ...NO_INPUT,
      attackPressed: n === 0,
    }));
    expect(states[states.length - 1]!.shots).toHaveLength(1);
  });

  it('two shots landing on one update hurt once', () => {
    const boss = quiet(shooter([bolt()]));
    const s = withShots(boss, mkBolt({ x: 330, originX: 330 }), mkBolt({ x: 330, originX: 330, originTick: 2 }));
    const after = step(s, NO_INPUT, boss);
    expect(after.player.health).toBe(PLAYER.maxHealth - 1);
    expect(after.shotHits).toHaveLength(2);
    expect(after.events.filter((e) => e === 'playerHit')).toHaveLength(1);
  });
});

describe('a lobbed arc', () => {
  const boss = shooter([arc({ at: 20, flight: 30, radius: 60, burst: 6 })]);

  it('fixes its landing at launch, so a player who moves away is not hurt', () => {
    const states = run(createInitialState(boss, 1), boss, 90, (n) => ({ ...NO_INPUT, moveX: n > 22 ? 1 : 0 }));
    const launched = states.find((s) => s.shots.length > 0)!;
    const shot = launched.shots[0]!;
    if (shot.kind !== 'arc') throw new Error('expected an arc');
    expect(shot.toX).toBeCloseTo(PLAYER.startX);
    const landed = states.find((s) => s.shots.some((x) => x.kind === 'arc' && x.age === x.flight))!;
    expect(landed.shots[0]!.x).toBeCloseTo(PLAYER.startX);
    expect(states.slice(0, 60).some((s) => s.events.includes('playerHit'))).toBe(false);
  });

  it('does nothing in the air and hurts a player standing on the mark when it lands', () => {
    const states = run(createInitialState(boss, 1), boss, 90);
    const hit = states.findIndex((s) => s.events.includes('playerHit'));
    expect(hit).toBeGreaterThan(0);
    const before = states[hit - 1]!;
    expect(before.shots.some((x) => x.kind === 'arc' && x.age < x.flight)).toBe(true);
    expect(states[hit]!.player.health).toBe(PLAYER.maxHealth - 1);
  });

  it('ignores a cover in its way', () => {
    const covered = shooter([arc({ at: 20, flight: 30, radius: 60, burst: 6 })], COVER(430, 400));
    const states = run(createInitialState(covered, 1), covered, 90);
    expect(states.some((s) => s.events.includes('playerHit'))).toBe(true);
  });
});

describe('the life of a shot', () => {
  it('outlives the attack that fired it', () => {
    const boss = shooter([bolt({ height: 0 })]);
    const states = run(createInitialState(boss, 1), boss, 140);
    const first = states.find((s) => s.shots.length > 0)!;
    const origin = first.shots[0]!.originTick;
    const later = states.find((s) => s.boss.attackTick === 0 && s.tick > origin + 25 && s.shots.some((x) => x.originTick === origin));
    expect(later ?? states.find((s) => s.boss.mode !== 'attack' && s.tick > origin && s.shots.some((x) => x.originTick === origin))).toBeDefined();
  });

  it('is cleared by a phase change', () => {
    const boss = quiet(shooter([bolt()]));
    const s = withShots(boss, mkBolt(), mkBolt({ originTick: 2 }));
    beginTransition(s);
    expect(s.shots).toEqual([]);
  });

  it('is cleared when the player is defeated', () => {
    const boss = quiet(shooter([bolt()]));
    const s = withShots(boss, mkBolt({ x: 330, originX: 330 }), mkBolt({ x: 900, originX: 900 }));
    s.player.health = 1;
    const after = step(s, NO_INPUT, boss);
    expect(after.phase).toBe('defeated');
    expect(after.shots).toEqual([]);
  });

  it('reaches a player in the study without hurting them', () => {
    const boss = shooter([bolt({ height: 0 })]);
    let s = createInitialState(boss, 1, 1);
    let studyHit = false;
    for (let n = 0; n < 140; n++) {
      s = step(s, NO_INPUT, boss);
      if (s.events.includes('studyHit')) studyHit = true;
    }
    expect(studyHit).toBe(true);
    expect(s.player.health).toBe(PLAYER.maxHealth);
    // The study waited for the last shot, so nothing from the demonstration reached the real fight.
    expect(s.study.active).toBe(false);
  });

  it('replays identically from the same seed and input', () => {
    const boss = shooter([bolt({ height: 0 }), arc({ at: 24 })]);
    const input = (n: number): InputFrame => ({ ...NO_INPUT, moveX: n % 40 < 20 ? 1 : -1, dashPressed: n % 55 === 0 });
    const a = run(createInitialState(boss, 7), boss, 400, input);
    const b = run(createInitialState(boss, 7), boss, 400, input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

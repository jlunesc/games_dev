import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { analyzeRun, swingReach } from '../src/stats/analyze';
import { customBoss, melee, solo, standAt, windupUpdates } from './boss-helpers';
import { QUIET_BOSS, run, withInput } from './helpers';

/** `count` idle updates with `at` (update numbers start at 1) overriding some of them. */
const frames = (count: number, at: Record<number, Partial<InputFrame>> = {}): InputFrame[] =>
  Array.from({ length: count }, (_, i) => withInput(at[i + 1] ?? {}));

/** The update (1-based) on which the boss's first attack warning begins when the player stands still. */
const firstWindup = (boss: BossDef, distance: number): number =>
  windupUpdates(run(standAt(boss, distance), 120, () => NO_INPUT, boss))[0]!;

// The sweep warns for 24 updates and is dangerous from update 24 (first + 24). A swing lasts 16 updates.
const sweepBoss = solo('sweep');
// A harmless poke (warning 6, dangerous from 6, reach 50), usable from any distance.
const pokeBoss = customBoss([melee('poke')], { attacks: [{ id: 'poke', weight: 1 }] });

describe('greedy swings', () => {
  it('counts a swing still going when the attack could first hurt, and the hit that followed', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 40, { [first + 15]: { attackPressed: true } }),
    );
    expect(a.attacks[0]!.swingAtDanger).toBe(true);
    expect(a.attacks[0]!.outcome).toBe('hit');
    expect(a.behavior.greedySwings).toBe(1);
    expect(a.behavior.greedyHits).toBe(1);
  });

  it('is false when the player was not swinging', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(sweepBoss, standAt(sweepBoss, 120), frames(first + 40));
    expect(a.attacks[0]!.swingAtDanger).toBe(false);
    expect(a.behavior.greedySwings).toBe(0);
    expect(a.behavior.greedyHits).toBe(0);
  });

  it('is false when the swing was already over at the danger', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 40, { [first + 2]: { attackPressed: true } }),
    );
    expect(a.attacks[0]!.swingAtDanger).toBe(false);
    expect(a.behavior.greedySwings).toBe(0);
  });

  it('counts a greedy swing that was not hurt (the attack missed) as a swing but not a hit', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(
      pokeBoss,
      standAt(pokeBoss, 400),
      frames(first + 10, { [first + 1]: { attackPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({ attackId: 'poke', outcome: 'dodged', swingAtDanger: true });
    expect(a.behavior.greedySwings).toBe(1);
    expect(a.behavior.greedyHits).toBe(0);
  });
});

// A long must-dodge swing: warning 30, dangerous for updates 30 to 60 over 400 units in front of the boss.
const longBoss = customBoss(
  [
    melee('long', {
      windup: 30,
      active: 30,
      recovery: 30,
      hits: [{ from: 30, to: 60, x0: 0, x1: 400, bottom: 0, top: 200 }],
    }),
  ],
  { attacks: [{ id: 'long', weight: 1 }] },
);

const dashTotal = (d: {
  escaped: number;
  hitAnyway: number;
  notNeeded: number;
  other: number;
  travel: { closer: number; farther: number; even: number };
}): number => d.escaped + d.hitAnyway + d.notNeeded + d.other + d.travel.closer + d.travel.farther + d.travel.even;

describe('dash use', () => {
  it('a dash that got the player through the attack escaped it', () => {
    const first = firstWindup(sweepBoss, 120);
    const a = analyzeRun(
      sweepBoss,
      standAt(sweepBoss, 120),
      frames(first + 60, { [first + 22]: { dashPressed: true } }),
    );
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'dash' });
    expect(a.dashUse).toEqual({
      escaped: 1,
      hitAnyway: 0,
      notNeeded: 0,
      other: 0,
      travel: { closer: 0, farther: 0, even: 0 },
    });
  });

  it('a dash that still ended in the attack was hit anyway', () => {
    const first = firstWindup(longBoss, 120);
    // Dash away, early: the player ends 380 units from the boss, still inside the 400-unit swing.
    const a = analyzeRun(
      longBoss,
      standAt(longBoss, 120),
      frames(first + 70, { [first + 5]: { dashPressed: true, moveX: -1 } }),
    );
    expect(a.attacks[0]!.outcome).toBe('hit');
    expect(a.dashUse.hitAnyway).toBe(1);
    expect(dashTotal(a.dashUse)).toBe(1);
  });

  it('a dash against an attack that would have missed anyway was not needed', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(pokeBoss, standAt(pokeBoss, 400), frames(first + 16, { [first + 2]: { dashPressed: true } }));
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'distance' });
    expect(a.dashUse.notNeeded).toBe(1);
    expect(dashTotal(a.dashUse)).toBe(1);
  });

  it('a dash with no attack live is a travel dash: toward the boss is closer, away is farther', () => {
    const toward = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 5: { dashPressed: true, moveX: 1 } }));
    expect(toward.dashUse.travel).toEqual({ closer: 1, farther: 0, even: 0 });
    const away = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 5: { dashPressed: true, moveX: -1 } }));
    expect(away.dashUse.travel).toEqual({ closer: 0, farther: 1, even: 0 });
  });

  it('a travel dash still going when the run ends is judged where it stood (a short one is even)', () => {
    const a = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), frames(40, { 40: { dashPressed: true, moveX: 1 } }));
    expect(a.dashUse.travel).toEqual({ closer: 0, farther: 0, even: 1 });
  });

  it('counts nothing for dashes made in the study', () => {
    const initial = createInitialState(sweepBoss, 1, 1);
    const states = run(initial, 1500, () => NO_INPUT, sweepBoss);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    expect(endTick).toBeGreaterThan(80);
    const a = analyzeRun(
      sweepBoss,
      initial,
      frames(endTick, { 5: { dashPressed: true }, 40: { dashPressed: true }, 75: { dashPressed: true } }),
      1,
    );
    expect(a.dashes).toBe(3);
    expect(dashTotal(a.dashUse)).toBe(0);
  });
});

// A harmless swing with a long recovery: the opening after it lasts 60 updates.
const slowBoss = customBoss([melee('slow', { recovery: 60 })], { attacks: [{ id: 'slow', weight: 1 }] });

describe('swing reach', () => {
  it('is the two half-widths plus the swing reach', () => {
    expect(swingReach(80)).toBe(24 + 90 + 40);
  });
});

describe('opening detail', () => {
  it('an opening nobody used: how far, how close, no swing', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(slowBoss, standAt(slowBoss, 100), frames(first + 75));
    const p = a.behavior.punish;
    expect(p.windows.length).toBe(p.opened);
    expect(p.windows[0]).toEqual({
      attackId: 'slow',
      boss: 0,
      startTick: first + 10,
      ticks: 60,
      distanceAtOpen: 100,
      closestDistance: 100,
      swung: false,
      hit: false,
      replyTicks: null,
      hitTicks: null,
      reachable: true,
    });
  });

  it('an opening used: a swing in the window that hit', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(
      slowBoss,
      standAt(slowBoss, 100),
      frames(first + 75, { [first + 20]: { attackPressed: true } }),
    );
    expect(a.behavior.punish.windows[0]).toMatchObject({ swung: true, hit: true, reachable: true });
    expect(a.behavior.punish.taken).toBe(1);
  });

  it('an opening too short to get to: not reachable', () => {
    const first = firstWindup(pokeBoss, 400);
    const a = analyzeRun(pokeBoss, standAt(pokeBoss, 400), frames(first + 20));
    // The poke's opening is 4 updates long: 400 units away cannot be closed at running speed.
    expect(a.behavior.punish.windows[0]).toMatchObject({ distanceAtOpen: 400, swung: false, hit: false, reachable: false });
    expect(a.behavior.punish.windows[0]!.ticks).toBe(4);
  });

  it('a player who runs in gets closer than they began', () => {
    const first = firstWindup(slowBoss, 400);
    const input = Array.from({ length: first + 75 }, (_, i) => withInput(i + 1 >= first + 10 ? { moveX: 1 } : {}));
    const a = analyzeRun(slowBoss, standAt(slowBoss, 400), input);
    const w = a.behavior.punish.windows[0]!;
    expect(w.distanceAtOpen).toBeGreaterThanOrEqual(w.closestDistance);
    expect(w.closestDistance).toBeLessThan(400);
    expect(w.reachable).toBe(true);
  });
});

describe('reply time', () => {
  it('an opening nobody used has no reply and no hit time', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(slowBoss, standAt(slowBoss, 100), frames(first + 75));
    expect(a.behavior.punish.windows[0]).toMatchObject({ replyTicks: null, hitTicks: null });
  });

  it('counts the updates from the opening to the swing that began in it, and to the hit it landed', () => {
    const first = firstWindup(slowBoss, 100);
    const a = analyzeRun(
      slowBoss,
      standAt(slowBoss, 100),
      frames(first + 75, { [first + 20]: { attackPressed: true } }),
    );
    const w = a.behavior.punish.windows[0]!;
    expect(w.startTick).toBe(first + 10);
    expect(w.replyTicks).toBe(10);
    expect(w.hitTicks).not.toBeNull();
    expect(w.hitTicks!).toBeGreaterThanOrEqual(10);
    expect(w.hitTicks!).toBeLessThan(w.ticks);
  });

  it('a swing in the opening that misses has a reply time and no hit time', () => {
    const first = firstWindup(slowBoss, 400);
    const a = analyzeRun(
      slowBoss,
      standAt(slowBoss, 400),
      frames(first + 75, { [first + 12]: { attackPressed: true } }),
    );
    expect(a.behavior.punish.windows[0]).toMatchObject({ replyTicks: 2, hit: false, hitTicks: null });
  });
});

describe('action ticks', () => {
  it('lists the update each swing, dash and jump began on', () => {
    const a = analyzeRun(
      QUIET_BOSS,
      standAt(QUIET_BOSS, 300),
      frames(80, {
        5: { attackPressed: true },
        40: { attackPressed: true },
        20: { dashPressed: true },
        60: { jumpPressed: true, jumpHeld: true },
      }),
    );
    expect(a.swingTicks).toEqual([5, 40]);
    expect(a.dashTicks).toEqual([20]);
    expect(a.jumpTicks).toEqual([60]);
    expect(a.swings).toBe(2);
    expect(a.dashes).toBe(1);
    expect(a.jumps).toBe(1);
  });
});

describe('distance to the boss in the real fight', () => {
  it('mean distance and updates within swing reach (quiet boss, idle player)', () => {
    const near = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 100), frames(10));
    expect(near.behavior.realMeanDistance).toBe(100);
    expect(near.behavior.realUpdatesInReach).toBe(10);
    const far = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 500), frames(10));
    expect(far.behavior.realMeanDistance).toBe(500);
    expect(far.behavior.realUpdatesInReach).toBe(0);
  });

  it('counts nothing for updates in the study', () => {
    const initial = createInitialState(sweepBoss, 1, 1);
    const states = run(initial, 1500, () => NO_INPUT, sweepBoss);
    const endTick = states.find((s) => s.events.includes('studyEnd'))!.tick;
    const a = analyzeRun(sweepBoss, initial, frames(endTick), 1);
    expect(a.behavior.realMeanDistance).toBe(0);
    expect(a.behavior.realUpdatesInReach).toBe(0);
  });
});

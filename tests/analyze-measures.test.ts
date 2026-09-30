import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { createInitialState } from '../src/game/state';
import { analyzeRun } from '../src/stats/analyze';
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

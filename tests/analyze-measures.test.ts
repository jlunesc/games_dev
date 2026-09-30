import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { analyzeRun } from '../src/stats/analyze';
import { customBoss, melee, solo, standAt, windupUpdates } from './boss-helpers';
import { run, withInput } from './helpers';

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

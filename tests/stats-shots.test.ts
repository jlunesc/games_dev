import { describe, expect, it } from 'vitest';
import type { BossDef, ShotDef } from '../src/bosses/schema';
import type { InputFrame } from '../src/engine/input-frame';
import { analyzeRun } from '../src/stats/analyze';
import { standAt } from './boss-helpers';
import { withInput } from './helpers';
import { arc, bolt, shooter } from './shot-helpers';

const frames = (count: number, at: Record<number, Partial<InputFrame>> = {}): InputFrame[] =>
  Array.from({ length: count }, (_, i) => withInput(at[i + 1] ?? {}));

const analyse = (boss: BossDef, distance: number, count: number, at: Record<number, Partial<InputFrame>> = {}) =>
  analyzeRun(boss, standAt(boss, distance), frames(count, at));

const boss = (shots: ShotDef[]) => shooter(shots);

describe('stats for attacks with shots', () => {
  it('a bolt that reaches an idle player is a hit for the attack that fired it', () => {
    const a = analyse(boss([bolt({ speed: 600 })]), 400, 90);
    expect(a.attacks[0]).toMatchObject({ attackId: 'shoot', outcome: 'hit', shotsFired: 1, damageTaken: 1 });
    expect(a.hitsTaken).toBe(1);
    expect(a.playerHitTicks).toHaveLength(1);
  });

  it('a high bolt that flies over a standing player is dodged, once the bolt is gone', () => {
    const a = analyse(boss([bolt({ height: 150 })]), 400, 200);
    expect(a.attacks[0]).toMatchObject({ outcome: 'dodged', evasion: 'distance', shotsFired: 1, damageTaken: 0 });
    expect(a.hitsTaken).toBe(0);
  });

  it('an attack whose shot is still flying when the run ends is interrupted, not dodged', () => {
    // The attack itself is over after 48 updates; a slow bolt is still in the air at update 60.
    const a = analyse(boss([bolt({ speed: 100 })]), 900, 60);
    expect(a.attacks[0]).toMatchObject({ outcome: 'interrupted', shotsFired: 1 });
  });

  it('a shot that lands after the next attack began is charged to the attack that fired it', () => {
    const slow = boss([bolt({ speed: 200 })]);
    const a = analyse(slow, 450, 260);
    expect(a.attacks.length).toBeGreaterThan(1);
    expect(a.attacks[0]!.outcome).toBe('hit');
    expect(a.attacks.slice(1).every((x) => x.outcome !== 'hit' || x.damageTaken > 0)).toBe(true);
    expect(a.hitsTaken).toBe(a.attacks.filter((x) => x.outcome === 'hit').length);
    const starts = a.attacks.map((x) => x.startTick);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });

  it('an arc that lands on an idle player is a hit; a player who dashes out of the mark dodges it', () => {
    const b = boss([arc({ at: 20, flight: 40, radius: 60, burst: 8 })]);
    const still = analyse(b, 400, 200);
    expect(still.attacks[0]).toMatchObject({ outcome: 'hit', shotsFired: 1 });
    const away = analyse(b, 400, 200, { 40: { dashPressed: true, moveX: -1 } });
    expect(away.attacks[0]).toMatchObject({ outcome: 'dodged', shotsFired: 1 });
  });

  it('two shots of one attack that both reach the player count as one hit for the attack', () => {
    const a = analyse(boss([bolt({ speed: 600 }), bolt({ at: 24, height: 0, speed: 600 })]), 400, 68);
    expect(a.attacks[0]).toMatchObject({ outcome: 'hit', shotsFired: 2 });
    expect(a.hitsTaken).toBe(1);
  });
});

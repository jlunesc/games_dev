import { describe, expect, it } from 'vitest';
import { bossBox } from '../src/game/geometry';
import { WORLD } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { NO_EFFECTS, spawnEffects, type EffectsState, type Particle } from '../src/ui/look/effects';
import { LOOK } from '../src/ui/look/tuning';
import { dummy, pair, unit } from './duo-helpers';

const fight = pair(unit(30, 400), dummy(800));
const fresh = (): GameState => createInitialState(fight, 1);
const later = (events: GameEvent[], change: (s: GameState) => void): GameState => {
  const s = structuredClone(fresh());
  s.events = events;
  change(s);
  return s;
};
const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const partnerCentre = (s: GameState) => centre(bossBox(s.partners[0]!, fight.bosses[1]!));
const kinds = (fx: EffectsState, kind: Particle['kind']): Particle[] => fx.particles.filter((p) => p.kind === kind);

describe('spawnEffects in a pair', () => {
  it('bursts at the partner when it goes down, with the big ring, and no shockwave', () => {
    const after = later(['bossDown'], (s) => {
      s.partners[0]!.hp = 0;
      s.partners[0]!.lift = 0;
    });
    const before = fresh();
    before.partners[0]!.lift = 90;
    const fx = spawnEffects(NO_EFFECTS, before, after, fight, true);
    const c = partnerCentre(after);
    const bursts = kinds(fx, 'burst');
    expect(bursts).toHaveLength(LOOK.burstOnDefeat);
    expect(bursts.every((p) => p.x === c.x && p.y === c.y)).toBe(true);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.growth).toBe(LOOK.bigRingGrowthPerTick);
  });

  it('bursts at the primary when the primary goes down', () => {
    const after = later(['bossDown'], (s) => {
      s.boss.hp = 0;
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = centre(bossBox(after.boss, fight.bosses[0]!));
    expect(kinds(fx, 'burst').every((p) => p.x === c.x && p.y === c.y)).toBe(true);
  });

  it('puts the counter ring on the boss that was staggered', () => {
    const after = later(['counter'], (s) => {
      s.partners[0]!.mode = 'stagger';
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = partnerCentre(after);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
  });

  it('puts the phase ring on the boss that changed phase', () => {
    const after = later(['phaseChange'], (s) => {
      s.partners[0]!.phase = 1;
    });
    const fx = spawnEffects(NO_EFFECTS, fresh(), after, fight, true);
    const c = partnerCentre(after);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.color).toBe(LOOK.phaseRing);
  });

  it("raises the partner's landing dust and shockwave at the partner", () => {
    const before = fresh();
    before.partners[0]!.lift = 100;
    const after = later([], () => {});
    const fx = spawnEffects(NO_EFFECTS, before, after, fight, true);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(after.partners[0]!.x);
    expect(fx.rings[0]!.y).toBe(WORLD.floorY);
    expect(kinds(fx, 'dust').length).toBeGreaterThan(0);
  });

  it('is unchanged for a boss given on its own', () => {
    const solo = unit(30, 400);
    const before = createInitialState(solo, 1);
    const after = structuredClone(before);
    after.events = ['bossDefeated'];
    after.boss.hp = 0;
    const a = spawnEffects(NO_EFFECTS, before, after, solo, true);
    const b = spawnEffects(NO_EFFECTS, before, after, { bosses: [solo], enrage: null, enraged: [solo] }, true);
    expect(b).toEqual(a);
    expect(kinds(a, 'burst')).toHaveLength(LOOK.burstOnDefeat);
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND } from '../src/bosses';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT } from '../src/engine/input-frame';
import { DT } from '../src/engine/time';
import { attackBox, bossBox, playerBox } from '../src/game/geometry';
import { PLAYER, WORLD } from '../src/game/params';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { step } from '../src/game/step';
import { LOOK } from '../src/ui/look/tuning';
import {
  NO_EFFECTS,
  spawnEffects,
  stepEffects,
  type EffectsState,
  type Particle,
  type Ring,
} from '../src/ui/look/effects';
import { solo, standAt, updatesWith, windupUpdates } from './boss-helpers';
import { DUELIST, run, withInput } from './helpers';

const clone = <T>(v: T): T => structuredClone(v);

/** A quiet fresh state with the given events, for the events that are easy to hand-make. */
function withEvents(events: GameEvent[], base: GameState = createInitialState(DUELIST, 1)): GameState {
  const s = clone(base);
  s.events = events;
  return s;
}

const kinds = (fx: EffectsState, kind: Particle['kind']): Particle[] => fx.particles.filter((p) => p.kind === kind);
const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

describe('NO_EFFECTS', () => {
  it('is empty with a non-zero generator state', () => {
    expect(NO_EFFECTS.particles).toEqual([]);
    expect(NO_EFFECTS.rings).toEqual([]);
    expect(NO_EFFECTS.rng).toBe(1);
  });
});

describe('spawnEffects: the events', () => {
  it('spawns nothing when there are no events', () => {
    const s = createInitialState(DUELIST, 1);
    const fx = spawnEffects(NO_EFFECTS, s, clone(s), DUELIST, true);
    expect(fx.particles).toEqual([]);
    expect(fx.rings).toEqual([]);
  });

  it('bossHit: sparks around the centre of the swing box and a short ring', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['bossHit'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(attackBox(after.player));
    const sparks = kinds(fx, 'spark');
    expect(sparks).toHaveLength(LOOK.sparksOnBossHit);
    expect(fx.particles).toHaveLength(LOOK.sparksOnBossHit);
    for (const p of sparks) {
      expect(p.x).toBe(c.x);
      expect(p.y).toBe(c.y);
      expect(p.color).toBe(LOOK.spark);
      expect(p.life).toBe(p.maxLife);
      expect(p.maxLife).toBe(LOOK.particleLifeTicks.spark);
      const speed = Math.hypot(p.vx, p.vy);
      expect(speed).toBeGreaterThanOrEqual(LOOK.sparkSpeedMin - 1e-9);
      expect(speed).toBeLessThanOrEqual(LOOK.sparkSpeedMax + 1e-9);
    }
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
    expect(fx.rings[0]!.radius).toBe(LOOK.ringStartRadius);
    expect(fx.rings[0]!.growth).toBe(LOOK.smallRingGrowthPerTick);
    expect(fx.rings[0]!.maxLife).toBe(LOOK.smallRingLifeTicks);
  });

  it('bossHit follows the facing of the player (the swing box is on the facing side)', () => {
    const before = createInitialState(DUELIST, 1);
    const right = withEvents(['bossHit'], before);
    right.player.facing = 1;
    const left = withEvents(['bossHit'], before);
    left.player.facing = -1;
    const a = spawnEffects(NO_EFFECTS, before, right, DUELIST, true);
    const b = spawnEffects(NO_EFFECTS, before, left, DUELIST, true);
    expect(a.rings[0]!.x).toBeGreaterThan(right.player.x);
    expect(b.rings[0]!.x).toBeLessThan(left.player.x);
  });

  it('counter: a counter ring at the centre of the boss plus sparks', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['counter'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(bossBox(after.boss, DUELIST));
    expect(kinds(fx, 'spark')).toHaveLength(LOOK.sparksOnCounter);
    for (const p of fx.particles) {
      expect(p.x).toBe(c.x);
      expect(p.y).toBe(c.y);
    }
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
    expect(fx.rings[0]!.color).toBe(LOOK.counterRing);
  });

  it('playerHit: red sparks at the centre of the player and a small ring', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['playerHit'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(playerBox(after.player));
    expect(kinds(fx, 'spark')).toHaveLength(LOOK.sparksOnPlayerHit);
    for (const p of fx.particles) {
      expect(p.color).toBe(LOOK.hurtSpark);
      expect(p.x).toBe(c.x);
      expect(p.y).toBe(c.y);
    }
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
    expect(fx.rings[0]!.growth).toBe(LOOK.smallRingGrowthPerTick);
  });

  it('dash: trail particles behind the dash start and a dust puff at the feet', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['dash'], before);
    after.player.dashDir = 1;
    after.player.dashTick = 0;
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const trail = kinds(fx, 'trail');
    const dust = kinds(fx, 'dust');
    expect(trail).toHaveLength(LOOK.trailOnDash);
    expect(dust).toHaveLength(LOOK.dustOnDash);
    // The trail lies along the path the dash leaves behind: at or behind the player, spaced out, standing still.
    for (const [i, p] of trail.entries()) {
      expect(p.x).toBeCloseTo(after.player.x - i * LOOK.dashTrailSpacing, 6);
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
      expect(p.y).toBeLessThan(after.player.y);
      expect(p.y).toBeGreaterThan(after.player.y - PLAYER.height);
    }
    for (const p of dust) expect(p.y).toBe(after.player.y);
  });

  it('dash to the left puts the trail on the right', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['dash'], before);
    after.player.dashDir = -1;
    after.player.dashTick = 0;
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const trail = kinds(fx, 'trail');
    expect(trail[trail.length - 1]!.x).toBeGreaterThan(after.player.x);
  });

  it('player landing: dust at the feet, only after a hard fall', () => {
    const before = createInitialState(DUELIST, 1);
    before.player.onGround = false;
    before.player.vy = 700;
    const after = clone(before);
    after.player.onGround = true;
    after.player.y = WORLD.floorY;
    after.player.vy = 0;
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const dust = kinds(fx, 'dust');
    expect(dust).toHaveLength(LOOK.dustOnLand);
    expect(fx.particles).toHaveLength(LOOK.dustOnLand);
    for (const p of dust) expect(p.y).toBe(after.player.y);

    const soft = clone(before);
    soft.player.vy = 300;
    expect(spawnEffects(NO_EFFECTS, soft, after, DUELIST, true).particles).toEqual([]);
    const already = clone(before);
    already.player.onGround = true;
    already.player.vy = 700;
    expect(spawnEffects(NO_EFFECTS, already, after, DUELIST, true).particles).toEqual([]);
  });

  it('boss landing: dust and a shockwave ring on the floor at the boss x', () => {
    const before = createInitialState(DUELIST, 1);
    before.boss.lift = 40;
    const after = clone(before);
    after.boss.lift = 0;
    after.boss.x = 900;
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    expect(kinds(fx, 'dust').length).toBeGreaterThan(0);
    for (const p of kinds(fx, 'dust')) {
      expect(p.y).toBe(WORLD.floorY);
      expect(Math.abs(p.x - 900)).toBeLessThanOrEqual(DUELIST.width);
    }
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.x).toBe(900);
    expect(fx.rings[0]!.y).toBe(WORLD.floorY);
    expect(fx.rings[0]!.color).toBe(LOOK.shockwave);
    expect(fx.rings[0]!.growth).toBe(LOOK.shockwaveGrowthPerTick);
    // A boss that is still in the air, or was already down, makes nothing.
    const stillUp = clone(after);
    stillUp.boss.lift = 10;
    expect(spawnEffects(NO_EFFECTS, before, stillUp, DUELIST, true).rings).toEqual([]);
    expect(spawnEffects(NO_EFFECTS, after, clone(after), DUELIST, true).rings).toEqual([]);
  });

  it('bossDefeated: a big ring and a burst at the centre of the boss', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['bossDefeated'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(bossBox(after.boss, DUELIST));
    expect(kinds(fx, 'burst')).toHaveLength(LOOK.burstOnDefeat);
    for (const p of fx.particles) {
      expect(p.x).toBe(c.x);
      expect(p.y).toBe(c.y);
    }
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.growth).toBe(LOOK.bigRingGrowthPerTick);
    expect(fx.rings[0]!.width).toBe(LOOK.bigRingWidth);
    expect(fx.rings[0]!.x).toBe(c.x);
  });

  it('playerDefeated: a burst at the player', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['playerDefeated'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(playerBox(after.player));
    expect(kinds(fx, 'burst')).toHaveLength(LOOK.burstOnDefeat);
    for (const p of fx.particles) {
      expect(p.x).toBe(c.x);
      expect(p.y).toBe(c.y);
    }
  });

  it('phaseChange: a white ring at the boss', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['phaseChange'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    const c = centre(bossBox(after.boss, DUELIST));
    expect(fx.particles).toEqual([]);
    expect(fx.rings).toHaveLength(1);
    expect(fx.rings[0]!.color).toBe(LOOK.phaseRing);
    expect(fx.rings[0]!.x).toBe(c.x);
    expect(fx.rings[0]!.y).toBe(c.y);
  });

  it('studyHit: four small red sparks', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['studyHit'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    expect(fx.particles).toHaveLength(LOOK.sparksOnStudyHit);
    expect(LOOK.sparksOnStudyHit).toBe(4);
    for (const p of fx.particles) {
      expect(p.kind).toBe('spark');
      expect(p.color).toBe(LOOK.hurtSpark);
    }
    expect(fx.rings).toEqual([]);
  });

  it('events that only warn or end the study spawn nothing', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['bossWindupGold', 'bossWindupRed', 'studyEnd'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    expect(fx.particles).toEqual([]);
    expect(fx.rings).toEqual([]);
  });

  it('several events in one update add up', () => {
    const before = createInitialState(DUELIST, 1);
    const after = withEvents(['bossHit', 'playerHit'], before);
    const fx = spawnEffects(NO_EFFECTS, before, after, DUELIST, true);
    expect(fx.particles).toHaveLength(LOOK.sparksOnBossHit + LOOK.sparksOnPlayerHit);
    expect(fx.rings).toHaveLength(2);
  });
});

describe('spawnEffects: real fights', () => {
  it('a scripted swing at the Duelist gives sparks at the swing box on the update of the bossHit', () => {
    let s = standAt(DUELIST, 60);
    let fx = NO_EFFECTS;
    let seen = false;
    for (let n = 1; n <= 40 && !seen; n++) {
      const before = s;
      s = step(s, withInput({ attackPressed: n === 1 }), DUELIST);
      fx = spawnEffects(fx, before, s, DUELIST, true);
      if (s.events.includes('bossHit')) {
        seen = true;
        const c = centre(attackBox(s.player));
        expect(kinds(fx, 'spark')).toHaveLength(LOOK.sparksOnBossHit);
        for (const p of fx.particles) {
          expect(p.x).toBe(c.x);
          expect(p.y).toBe(c.y);
        }
      }
    }
    expect(seen).toBe(true);
  });

  it('a hit from the boss gives red sparks at the player', () => {
    const boss = solo('slam');
    let s = standAt(boss, 120);
    let fx = NO_EFFECTS;
    let seen = false;
    for (let n = 1; n <= 120 && !seen; n++) {
      const before = s;
      s = step(s, NO_INPUT, boss);
      fx = spawnEffects(fx, before, s, boss, true);
      if (s.events.includes('playerHit')) seen = true;
    }
    expect(seen).toBe(true);
    expect(kinds(fx, 'spark').filter((p) => p.color === LOOK.hurtSpark)).toHaveLength(LOOK.sparksOnPlayerHit);
  });

  it('a counter gives a counter ring at the boss', () => {
    const boss = solo('slam');
    const first = windupUpdates(run(standAt(boss, 120), 60, () => NO_INPUT, boss))[0]!;
    const at = first + DUELIST.attacks.find((a) => a.id === 'slam')!.windup - 2;
    let s = standAt(boss, 120);
    let fx = NO_EFFECTS;
    for (let n = 1; n <= at; n++) {
      const before = s;
      s = step(s, withInput({ attackPressed: n === at }), boss);
      fx = spawnEffects(fx, before, s, boss, true);
    }
    expect(updatesWith([s], 'counter')).toEqual([1]);
    expect(fx.rings.some((r) => r.color === LOOK.counterRing)).toBe(true);
  });

  it('a dash gives trail particles and a dust puff', () => {
    let s = standAt(DUELIST, 300);
    let fx = NO_EFFECTS;
    const before = s;
    s = step(s, withInput({ dashPressed: true, moveX: 1 }), DUELIST);
    fx = spawnEffects(fx, before, s, DUELIST, true);
    expect(s.events).toContain('dash');
    expect(kinds(fx, 'trail')).toHaveLength(LOOK.trailOnDash);
    expect(kinds(fx, 'dust')).toHaveLength(LOOK.dustOnDash);
  });

  it('a jump and its landing give dust at the feet', () => {
    let s = standAt(DUELIST, 300);
    let fx = NO_EFFECTS;
    let landings = 0;
    for (let n = 1; n <= 90; n++) {
      const before = s;
      s = step(s, withInput({ jumpPressed: n === 1, jumpHeld: n < 40 }), DUELIST);
      fx = spawnEffects(fx, before, s, DUELIST, true);
      if (!before.player.onGround && s.player.onGround) {
        landings += 1;
        expect(kinds(fx, 'dust')).toHaveLength(LOOK.dustOnLand);
        for (const p of fx.particles) expect(p.y).toBe(s.player.y);
      }
    }
    expect(landings).toBe(1);
  });

  it('the Hound landing from a pounce gives dust and a shockwave ring at the floor', () => {
    const boss: BossDef = {
      ...ASHEN_HOUND,
      spacing: { min: 0, max: 1e9 },
      attacks: ASHEN_HOUND.attacks.map((a) => ({ ...a, range: { min: 0, max: 1e9 } })),
      phases: ASHEN_HOUND.phases.map((p) => ({
        ...p,
        gap: 1,
        maxChain: 1,
        chainChance: 0,
        attacks: [{ id: 'pounce', weight: 1 }],
      })),
    };
    let s = createInitialState(boss, 1);
    s.player.x = s.boss.x - 300;
    s.player.prevX = s.player.x;
    let fx = NO_EFFECTS;
    let landed = false;
    for (let n = 1; n <= 200 && !landed; n++) {
      const before = s;
      s = step(s, NO_INPUT, boss);
      fx = spawnEffects(fx, before, s, boss, true);
      if (before.boss.lift > 0 && s.boss.lift === 0) {
        landed = true;
        expect(fx.rings.filter((r) => r.color === LOOK.shockwave)).toHaveLength(1);
        expect(fx.rings.find((r) => r.color === LOOK.shockwave)!.x).toBe(s.boss.x);
        expect(fx.rings.find((r) => r.color === LOOK.shockwave)!.y).toBe(WORLD.floorY);
        expect(kinds(fx, 'dust').length).toBeGreaterThan(0);
      }
    }
    expect(landed).toBe(true);
  });
});

describe('spawnEffects: switch, caps, purity', () => {
  const before = createInitialState(DUELIST, 1);
  const busy = withEvents(['bossHit', 'playerHit', 'counter', 'dash', 'bossDefeated']);

  it('returns the very same state when disabled', () => {
    const fx: EffectsState = { particles: [], rings: [], rng: 77 };
    expect(spawnEffects(fx, before, busy, DUELIST, false)).toBe(fx);
    expect(NO_EFFECTS.particles).toEqual([]);
  });

  it('never goes over the caps, however many events, and drops the oldest', () => {
    let fx = NO_EFFECTS;
    for (let i = 0; i < 300; i++) fx = spawnEffects(fx, before, busy, DUELIST, true);
    expect(fx.particles.length).toBe(LOOK.maxParticles);
    expect(fx.rings.length).toBe(LOOK.maxRings);
    // The newest are kept: the last thing spawned (a burst from the defeat) is at the end.
    expect(fx.particles[fx.particles.length - 1]!.kind).toBe('burst');
    expect(fx.rings[fx.rings.length - 1]!.growth).toBe(LOOK.bigRingGrowthPerTick);
  });

  it('drops the oldest particles first', () => {
    const old: Particle = { kind: 'dust', x: -1, y: -1, vx: 0, vy: 0, life: 5, maxLife: 5, size: 1, color: '#000' };
    const oldRing: Ring = { x: -1, y: -1, radius: 1, growth: 1, life: 5, maxLife: 5, color: '#000', width: 1 };
    const full: EffectsState = {
      particles: Array.from({ length: LOOK.maxParticles }, () => ({ ...old })),
      rings: Array.from({ length: LOOK.maxRings }, () => ({ ...oldRing })),
      rng: 5,
    };
    const fx = spawnEffects(full, before, withEvents(['bossHit']), DUELIST, true);
    expect(fx.particles).toHaveLength(LOOK.maxParticles);
    expect(fx.rings).toHaveLength(LOOK.maxRings);
    expect(fx.particles.filter((p) => p.x === -1)).toHaveLength(LOOK.maxParticles - LOOK.sparksOnBossHit);
    expect(fx.rings.filter((r) => r.x === -1)).toHaveLength(LOOK.maxRings - 1);
  });

  it('is deterministic and advances the generator only when it spawns', () => {
    const a = spawnEffects(NO_EFFECTS, before, busy, DUELIST, true);
    const b = spawnEffects(NO_EFFECTS, before, busy, DUELIST, true);
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(NO_EFFECTS.rng);
    const quiet = spawnEffects(NO_EFFECTS, before, clone(before), DUELIST, true);
    expect(quiet.rng).toBe(NO_EFFECTS.rng);
  });

  it('different generator states scatter the sparks differently', () => {
    const a = spawnEffects({ ...NO_EFFECTS, rng: 1 }, before, withEvents(['bossHit']), DUELIST, true);
    const b = spawnEffects({ ...NO_EFFECTS, rng: 2 }, before, withEvents(['bossHit']), DUELIST, true);
    expect(a.particles.map((p) => p.vx)).not.toEqual(b.particles.map((p) => p.vx));
  });

  it('does not change its inputs', () => {
    const fx = spawnEffects(NO_EFFECTS, before, withEvents(['bossHit']), DUELIST, true);
    const snapshots = [clone(fx), clone(before), clone(busy), clone(NO_EFFECTS)];
    spawnEffects(fx, before, busy, DUELIST, true);
    expect(fx).toEqual(snapshots[0]);
    expect(before).toEqual(snapshots[1]);
    expect(busy).toEqual(snapshots[2]);
    expect(NO_EFFECTS).toEqual(snapshots[3]);
  });

  it('survives a JSON round trip', () => {
    const fx = spawnEffects(NO_EFFECTS, before, busy, DUELIST, true);
    expect(JSON.parse(JSON.stringify(fx))).toEqual(fx);
  });
});

describe('stepEffects', () => {
  const particle = (over: Partial<Particle>): Particle => ({
    kind: 'spark',
    x: 100,
    y: 200,
    vx: 60,
    vy: -120,
    life: 10,
    maxLife: 10,
    size: 5,
    color: '#fff',
    ...over,
  });
  const ring = (over: Partial<Ring> = {}): Ring => ({
    x: 50,
    y: 60,
    radius: 10,
    growth: 5,
    life: 4,
    maxLife: 4,
    color: '#fff',
    width: 3,
    ...over,
  });
  const fxOf = (particles: Particle[], rings: Ring[] = [], rng = 9): EffectsState => ({ particles, rings, rng });

  it('ages by one and moves by the velocity', () => {
    const out = stepEffects(fxOf([particle({ kind: 'trail' })]));
    const p = out.particles[0]!;
    expect(p.life).toBe(9);
    expect(p.maxLife).toBe(10);
    expect(p.x).toBeCloseTo(100 + 60 * DT, 9);
    expect(p.y).toBeCloseTo(200 - 120 * DT, 9);
  });

  it('applies gravity to sparks and dust, not to trails', () => {
    const out = stepEffects(
      fxOf([
        particle({ kind: 'spark', vx: 0, vy: 0 }),
        particle({ kind: 'dust', vx: 0, vy: 0 }),
        particle({ kind: 'trail', vx: 0, vy: 0 }),
      ]),
    );
    const [spark, dust, trail] = out.particles;
    expect(spark!.vy).toBeGreaterThan(0);
    expect(dust!.vy).toBeGreaterThan(0);
    expect(trail!.vy).toBe(0);
    // A second step moves the falling ones down and the trail not at all.
    const again = stepEffects(out);
    expect(again.particles[0]!.y).toBeGreaterThan(200);
    expect(again.particles[1]!.y).toBeGreaterThan(200);
    expect(again.particles[2]!.y).toBe(200);
  });

  it('slows a moving particle by the drag (trails keep their speed)', () => {
    const out = stepEffects(fxOf([particle({ kind: 'burst', vx: 100, vy: 0 }), particle({ kind: 'trail', vx: 100, vy: 0 })]));
    expect(out.particles[0]!.vx).toBeCloseTo(100 * LOOK.drag, 9);
    expect(out.particles[1]!.vx).toBe(100);
  });

  it('removes what has run out of life', () => {
    const out = stepEffects(fxOf([particle({ life: 1 }), particle({ life: 2 }), particle({ life: 0 })]));
    expect(out.particles).toHaveLength(1);
    expect(out.particles[0]!.life).toBe(1);
  });

  it('grows and ages the rings and removes the dead ones', () => {
    const out = stepEffects(fxOf([], [ring(), ring({ life: 1 })]));
    expect(out.rings).toHaveLength(1);
    expect(out.rings[0]!.life).toBe(3);
    expect(out.rings[0]!.radius).toBe(15);
    expect(out.rings[0]!.x).toBe(50);
  });

  it('keeps the generator state and never exceeds the caps', () => {
    const many = fxOf(
      Array.from({ length: LOOK.maxParticles + 40 }, (_, i) => particle({ x: i, life: 10 })),
      Array.from({ length: LOOK.maxRings + 5 }, (_, i) => ring({ x: i })),
      1234,
    );
    const out = stepEffects(many);
    expect(out.rng).toBe(1234);
    expect(out.particles).toHaveLength(LOOK.maxParticles);
    expect(out.rings).toHaveLength(LOOK.maxRings);
    // The oldest (first) are dropped.
    expect(out.particles[0]!.x).toBeGreaterThan(30);
  });

  it('everything is gone after enough steps', () => {
    let fx = spawnEffects(NO_EFFECTS, createInitialState(DUELIST, 1), withEvents(['bossDefeated']), DUELIST, true);
    for (let i = 0; i < 200; i++) fx = stepEffects(fx);
    expect(fx.particles).toEqual([]);
    expect(fx.rings).toEqual([]);
  });

  it('is deterministic, does not change its input and survives a JSON round trip', () => {
    const fx = fxOf([particle({}), particle({ kind: 'dust' })], [ring()]);
    const snapshot = clone(fx);
    const a = stepEffects(fx);
    expect(fx).toEqual(snapshot);
    expect(stepEffects(fx)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('still fades existing effects when spawning is switched off', () => {
    const before = createInitialState(DUELIST, 1);
    const fx = spawnEffects(NO_EFFECTS, before, withEvents(['bossHit']), DUELIST, true);
    const off = spawnEffects(fx, before, withEvents(['bossHit']), DUELIST, false);
    expect(off).toBe(fx);
    const stepped = stepEffects(off);
    expect(stepped.particles.every((p) => p.life === LOOK.particleLifeTicks.spark - 1)).toBe(true);
  });
});

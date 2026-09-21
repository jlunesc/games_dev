import type { BossDef } from '../../bosses/schema';
import { DT } from '../../engine/time';
import { attackBox, bossBox, playerBox, type Box } from '../../game/geometry';
import { PLAYER, WORLD } from '../../game/params';
import type { GameState } from '../../game/state';
import { nextRandom } from '../../game/rng';
import { LOOK } from './tuning';

/**
 * Impact effects: sparks, dust, dash trails and rings drawn on top of the fight. Purely cosmetic and pure:
 * `spawnEffects` reads two game states (before and after one update) and returns a new `EffectsState`, and
 * `stepEffects` ages it by one real 60th of a second. Nothing here touches the simulation, so a fight plays the
 * same with or without them. All positions are in world units (y grows downward). Randomness comes only from
 * `EffectsState.rng` (the same mulberry32 generator as the game), which is stepped and handed back.
 */

export type ParticleKind = 'spark' | 'dust' | 'trail' | 'burst';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** World units per second. */
  vx: number;
  vy: number;
  /** Ticks left; the particle is removed when it reaches 0. */
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  radius: number;
  /** Radius growth per tick. */
  growth: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface EffectsState {
  particles: Particle[];
  rings: Ring[];
  /** State of the effects' own random generator (never the game's). */
  rng: number;
}

export const NO_EFFECTS: EffectsState = { particles: [], rings: [], rng: 1 };

/** A player has to fall faster than this, world units per second, for the landing to raise dust. */
const HARD_LANDING_SPEED = 300;

const centreOf = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Builds the new particles and rings of one update, keeping its own copy of the generator state. */
class Spawner {
  readonly particles: Particle[] = [];
  readonly rings: Ring[] = [];
  rng: number;

  constructor(rng: number) {
    this.rng = rng;
  }

  private random(): number {
    const next = nextRandom(this.rng);
    this.rng = next.state;
    return next.value;
  }

  private between(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private add(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    color: string,
  ): void {
    const life = LOOK.particleLifeTicks[kind];
    this.particles.push({ kind, x, y, vx, vy, life, maxLife: life, size, color });
  }

  /** Particles thrown out in every direction from one point. */
  radial(kind: 'spark' | 'burst', count: number, x: number, y: number, min: number, max: number, colors: string[]): void {
    const size = kind === 'spark' ? LOOK.sparkSize : LOOK.burstSize;
    for (let i = 0; i < count; i++) {
      const angle = this.between(0, Math.PI * 2);
      const speed = this.between(min, max);
      this.add(kind, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, size, colors[i % colors.length]!);
    }
  }

  sparks(count: number, x: number, y: number, color: string, extra?: string): void {
    this.radial('spark', count, x, y, LOOK.sparkSpeedMin, LOOK.sparkSpeedMax, extra === undefined ? [color] : [color, extra]);
  }

  burst(x: number, y: number): void {
    this.radial('burst', LOOK.burstOnDefeat, x, y, LOOK.burstSpeedMin, LOOK.burstSpeedMax, [LOOK.burst, LOOK.burstAlt]);
  }

  /** Dust kicked up along the floor: spread sideways over `spread` units, drifting outward and a little up. */
  dust(count: number, x: number, y: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const side = this.between(-1, 1);
      const speed = this.between(LOOK.dustSpeedMin, LOOK.dustSpeedMax);
      this.add('dust', x + (side * spread) / 2, y, Math.sign(side) * speed, -this.between(0.2, 0.8) * speed, LOOK.dustSize, LOOK.dust);
    }
  }

  trail(x: number, y: number): void {
    this.add('trail', x, y, 0, 0, LOOK.trailSize, LOOK.trail);
  }

  ring(x: number, y: number, growth: number, life: number, width: number, color: string): void {
    this.rings.push({ x, y, radius: LOOK.ringStartRadius, growth, life, maxLife: life, color, width });
  }

  smallRing(x: number, y: number, color: string): void {
    this.ring(x, y, LOOK.smallRingGrowthPerTick, LOOK.smallRingLifeTicks, LOOK.smallRingWidth, color);
  }

  normalRing(x: number, y: number, color: string): void {
    this.ring(x, y, LOOK.ringGrowthPerTick, LOOK.ringLifeTicks, LOOK.ringWidth, color);
  }

  bigRing(x: number, y: number, color: string): void {
    this.ring(x, y, LOOK.bigRingGrowthPerTick, LOOK.bigRingLifeTicks, LOOK.bigRingWidth, color);
  }
}

/** Keeps the newest `max` items (the list is oldest first). */
const newest = <T>(items: T[], max: number): T[] => (items.length > max ? items.slice(items.length - max) : items);

/**
 * The effects for what happened in one update (`before` to `after`), added to `fx`. With `enabled` false it
 * returns `fx` itself and spawns nothing. Never goes over `LOOK.maxParticles` / `LOOK.maxRings`: the oldest go.
 */
export function spawnEffects(
  fx: EffectsState,
  before: GameState,
  after: GameState,
  boss: BossDef,
  enabled: boolean,
): EffectsState {
  if (!enabled) return fx;
  const out = new Spawner(fx.rng);
  const player = centreOf(playerBox(after.player));
  const bossCentre = centreOf(bossBox(after.boss, boss));

  for (const event of after.events) {
    switch (event) {
      case 'bossHit': {
        const c = centreOf(attackBox(after.player));
        out.sparks(LOOK.sparksOnBossHit, c.x, c.y, LOOK.spark);
        out.smallRing(c.x, c.y, LOOK.spark);
        break;
      }
      case 'counter':
        out.sparks(LOOK.sparksOnCounter, bossCentre.x, bossCentre.y, LOOK.counterRing, LOOK.spark);
        out.normalRing(bossCentre.x, bossCentre.y, LOOK.counterRing);
        break;
      case 'playerHit':
        out.sparks(LOOK.sparksOnPlayerHit, player.x, player.y, LOOK.hurtSpark);
        out.smallRing(player.x, player.y, LOOK.hurtSpark);
        break;
      case 'dash': {
        // Puffs left along the path the dash starts on, from the player back to where it began.
        const dir = after.player.dashDir;
        for (let i = 0; i < LOOK.trailOnDash; i++) out.trail(after.player.x - dir * i * LOOK.dashTrailSpacing, player.y);
        if (after.player.onGround) out.dust(LOOK.dustOnDash, after.player.x, after.player.y, PLAYER.width);
        break;
      }
      case 'bossDefeated':
        out.burst(bossCentre.x, bossCentre.y);
        out.bigRing(bossCentre.x, bossCentre.y, LOOK.burst);
        break;
      case 'playerDefeated':
        out.burst(player.x, player.y);
        break;
      case 'phaseChange':
        out.normalRing(bossCentre.x, bossCentre.y, LOOK.phaseRing);
        break;
      case 'studyHit':
        out.sparks(LOOK.sparksOnStudyHit, player.x, player.y, LOOK.hurtSpark);
        break;
      default:
        break;
    }
  }

  // Landings are read from the two states: no event marks them.
  if (!before.player.onGround && after.player.onGround && before.player.vy > HARD_LANDING_SPEED) {
    out.dust(LOOK.dustOnLand, after.player.x, after.player.y, PLAYER.width);
  }
  if (before.boss.lift > 0 && after.boss.lift === 0) {
    out.dust(LOOK.dustOnLand * 2, after.boss.x, WORLD.floorY, boss.width);
    out.ring(after.boss.x, WORLD.floorY, LOOK.shockwaveGrowthPerTick, LOOK.shockwaveLifeTicks, LOOK.ringWidth, LOOK.shockwave);
  }

  if (out.particles.length === 0 && out.rings.length === 0) return fx;
  return {
    particles: newest([...fx.particles, ...out.particles], LOOK.maxParticles),
    rings: newest([...fx.rings, ...out.rings], LOOK.maxRings),
    rng: out.rng,
  };
}

/** One real 60th of a second: move, pull sparks and dust down, slow everything but trails, age, drop the dead. */
export function stepEffects(fx: EffectsState): EffectsState {
  const particles: Particle[] = [];
  for (const p of fx.particles) {
    const life = p.life - 1;
    if (life <= 0) continue;
    const x = p.x + p.vx * DT;
    const y = p.y + p.vy * DT;
    if (p.kind === 'trail') {
      particles.push({ ...p, x, y, life });
      continue;
    }
    const pull = p.kind === 'burst' ? 0 : LOOK.gravity * DT;
    particles.push({ ...p, x, y, vx: p.vx * LOOK.drag, vy: (p.vy + pull) * LOOK.drag, life });
  }
  const rings: Ring[] = [];
  for (const r of fx.rings) {
    const life = r.life - 1;
    if (life <= 0) continue;
    rings.push({ ...r, radius: r.radius + r.growth, life });
  }
  return { particles: newest(particles, LOOK.maxParticles), rings: newest(rings, LOOK.maxRings), rng: fx.rng };
}

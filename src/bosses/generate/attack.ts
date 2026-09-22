import { nextRandom } from '../../game/rng';
import type { AttackDef, HitWindow, Pose } from '../schema';
import { GEN } from './tuning';

/** The three effects a generated attack can have. The generator never invents a new kind. */
export type EffectKind = 'hit' | 'move' | 'leap';

/** A value drawn from the stream, and the stream's state after drawing it. */
export interface Draw<T> {
  value: T;
  state: number;
}

/** Poses used for a `hit` or `move` attack. `'crouch'` is reserved for a `leap` (the jump cue). */
const HIT_POSES: readonly Pose[] = ['raised', 'sideways', 'back', 'down'];

/** Draws a uniform float in `[min, max]` and advances the stream. */
function uniform(state: number, min: number, max: number): Draw<number> {
  const draw = nextRandom(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/** Draws a uniform integer in `[min, max]` and advances the stream. */
function uniformInt(state: number, min: number, max: number): Draw<number> {
  const draw = uniform(state, min, max);
  return { value: Math.round(draw.value), state: draw.state };
}

/** Picks one of `options` with equal chance and advances the stream. */
function pick<T>(state: number, options: readonly T[]): Draw<T> {
  const draw = nextRandom(state);
  const index = Math.min(options.length - 1, Math.floor(draw.value * options.length));
  return { value: options[index]!, state: draw.state };
}

/** Builds the one `HitWindow` shared by the `hit` and `move` cases, and by a leap's landing shockwave. */
function buildHit(state: number, from: number, to: number): Draw<HitWindow> {
  const x0Draw = uniform(state, 0, GEN.hitX0Max);
  const spanDraw = uniform(x0Draw.state, GEN.hitSpanMin, GEN.hitSpanMax);
  const topDraw = uniform(spanDraw.state, GEN.hitTopMin, GEN.hitTopMax);
  const hit: HitWindow = {
    from,
    to,
    x0: x0Draw.value,
    x1: x0Draw.value + spanDraw.value,
    bottom: 0,
    top: topDraw.value,
  };
  return { value: hit, state: topDraw.state };
}

/**
 * Draws one randomized `AttackDef` from `state`, deterministic in `state` alone. `id` is a
 * short readable id given by the caller (also used as the attack's `name`); `counterable`
 * fixes the attack's `class`.
 */
export function generateAttack(state: number, id: string, counterable: boolean): Draw<AttackDef> {
  let s = state;

  const kindDraw = nextRandom(s);
  s = kindDraw.state;
  const kind: EffectKind = kindDraw.value < 1 / 3 ? 'hit' : kindDraw.value < 2 / 3 ? 'move' : 'leap';

  let pose: Pose;
  if (kind === 'leap') {
    pose = 'crouch';
  } else {
    const poseDraw = pick(s, HIT_POSES);
    s = poseDraw.state;
    pose = poseDraw.value;
  }

  const windupDraw = uniformInt(s, GEN.windupMin, GEN.windupMax);
  s = windupDraw.state;
  let windup = windupDraw.value;

  const activeDraw = uniformInt(s, GEN.activeMin, GEN.activeMax);
  s = activeDraw.state;
  let active = activeDraw.value;

  const recoveryDraw = uniformInt(s, GEN.recoveryMin, GEN.recoveryMax);
  s = recoveryDraw.state;
  const recovery = recoveryDraw.value;

  const rangeMinDraw = uniform(s, GEN.rangeMinMin, GEN.rangeMinMax);
  s = rangeMinDraw.state;
  const rangeSpanDraw = uniform(s, GEN.rangeSpanMin, GEN.rangeSpanMax);
  s = rangeSpanDraw.state;
  const range = { min: rangeMinDraw.value, max: rangeMinDraw.value + rangeSpanDraw.value };

  let hits: HitWindow[];
  let move: AttackDef['move'];
  let leap: AttackDef['leap'];

  if (kind === 'hit') {
    const hitDraw = buildHit(s, windup, windup + active);
    s = hitDraw.state;
    hits = [hitDraw.value];
  } else if (kind === 'move') {
    if (active === 1) {
      const redraw = uniformInt(s, 2, GEN.activeMax);
      s = redraw.state;
      active = redraw.value;
    }

    const durationDraw = uniformInt(s, GEN.moveDurationMin, GEN.moveDurationMax);
    s = durationDraw.state;
    const moveDuration = Math.min(active, durationDraw.value);

    const speedDraw = uniform(s, GEN.moveSpeedMin, GEN.moveSpeedMax);
    s = speedDraw.state;
    const speed = speedDraw.value;

    if (speed >= GEN.moveFastSpeed) windup = Math.max(windup, GEN.leapWindupMin);

    move = { from: windup, to: windup + moveDuration, speed, dir: 'forward' };

    const hitDraw = buildHit(s, windup, windup + active);
    s = hitDraw.state;
    hits = [hitDraw.value];
  } else {
    windup = Math.max(windup, GEN.leapWindupMin);

    const flightDraw = uniformInt(s, GEN.leapFlightMin, GEN.leapFlightMax);
    s = flightDraw.state;
    const flightLen = flightDraw.value;

    const heightDraw = uniform(s, GEN.leapHeightMin, GEN.leapHeightMax);
    s = heightDraw.state;
    const height = heightDraw.value;

    leap = { from: windup, to: windup + flightLen, height, target: 'player' };

    const landAt = windup + flightLen;
    const hitDraw = buildHit(s, landAt, landAt + active);
    s = hitDraw.state;
    hits = [hitDraw.value];

    active = flightLen + active;
  }

  const def: AttackDef = {
    id,
    name: id,
    pose,
    class: counterable ? 'counterable' : 'mustDodge',
    damage: 1,
    windup,
    active,
    recovery,
    range,
    hits,
    ...(move === undefined ? {} : { move }),
    ...(leap === undefined ? {} : { leap }),
  };

  return { value: def, state: s };
}

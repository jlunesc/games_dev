import { nextRandom } from '../../game/rng';
import type { AttackDef, HitWindow, Pose, ShotDef } from '../schema';
import { type Draw, pick, uniform, uniformInt } from './draw';
import { buildArc, buildBolts, buildEruptions, type ShotPlan } from './shots';
import { GEN } from './tuning';

export type { Draw };

/** The effects a generated attack can have. The generator never invents a new kind. */
export type EffectKind = 'hit' | 'move' | 'leap' | 'shot' | 'eruption';

const MELEE_KINDS: readonly EffectKind[] = ['hit', 'move', 'leap'];
const ALL_KINDS: readonly EffectKind[] = ['hit', 'move', 'leap', 'shot', 'eruption'];

/** Poses used for a `hit` or `move` attack. `'crouch'` is reserved for a `leap` (the jump cue). */
const HIT_POSES: readonly Pose[] = ['raised', 'sideways', 'back', 'down'];

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

  // Only a must-dodge attack can have shots, so the counterable one is always a strike, a dash or a leap.
  const kindDraw = pick(s, counterable ? MELEE_KINDS : ALL_KINDS);
  s = kindDraw.state;
  const kind = kindDraw.value;

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
  let range = { min: rangeMinDraw.value, max: rangeMinDraw.value + rangeSpanDraw.value };

  let hits: HitWindow[];
  let move: AttackDef['move'];
  let leap: AttackDef['leap'];
  let shots: ShotDef[] | undefined;

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
  } else if (kind === 'shot' || kind === 'eruption') {
    // A shot attack starts from a distance, and the shots come out of its own timing: no hit window at all.
    range = { min: 0, max: range.max + GEN.shotRangeBonus };
    let plan: Draw<ShotPlan>;
    if (kind === 'eruption') {
      plan = buildEruptions(s, windup);
    } else {
      const bolts = nextRandom(s);
      plan = bolts.value < 0.5 ? buildBolts(bolts.state, windup) : buildArc(bolts.state, windup, active);
    }
    s = plan.state;
    shots = plan.value.shots;
    active = plan.value.active;
    hits = [];
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
    ...(shots === undefined ? {} : { shots }),
  };

  return { value: def, state: s };
}

import { nextRandom } from '../../game/rng';
import type { ArcDef, BoltDef, EruptionDef, ShotDef } from '../schema';
import { type Draw, uniform, uniformInt } from './draw';
import { GEN } from './tuning';

/** The shots of a generated attack, and the length its active part needs to fire them all. */
export interface ShotPlan {
  shots: ShotDef[];
  active: number;
}

/**
 * A volley of one to three bolts fired at even gaps. The first bolt flies straight ahead, so a player who
 * stands still is always in its way; later ones can be aimed at the player or fired backward.
 */
export function buildBolts(state: number, windup: number): Draw<ShotPlan> {
  const countDraw = uniformInt(state, GEN.boltCountMin, GEN.boltCountMax);
  const gapDraw = uniformInt(countDraw.state, GEN.boltGapMin, GEN.boltGapMax);
  const sizeDraw = uniformInt(gapDraw.state, GEN.boltSizeMin, GEN.boltSizeMax);
  const speedDraw = uniform(sizeDraw.state, GEN.boltSpeedMin, GEN.boltSpeedMax);
  let s = speedDraw.state;

  const shots: BoltDef[] = [];
  for (let i = 0; i < countDraw.value; i++) {
    const heightDraw = uniform(s, GEN.boltHeightMin, GEN.boltHeightMax);
    const wayDraw = nextRandom(heightDraw.state);
    s = wayDraw.state;
    const bolt: BoltDef = {
      kind: 'bolt',
      at: windup + i * gapDraw.value,
      height: heightDraw.value,
      size: sizeDraw.value,
      speed: speedDraw.value,
    };
    if (i > 0) {
      if (wayDraw.value < GEN.boltAimChance) bolt.aim = true;
      else if (wayDraw.value < GEN.boltAimChance + GEN.boltBackChance) bolt.dir = 'back';
    }
    shots.push(bolt);
  }
  return { value: { shots, active: Math.max(GEN.activeMin, (countDraw.value - 1) * gapDraw.value + 1) }, state: s };
}

/** One lobbed arc that lands where the player stands at launch. */
export function buildArc(state: number, windup: number, active: number): Draw<ShotPlan> {
  const flightDraw = uniformInt(state, GEN.arcFlightMin, GEN.arcFlightMax);
  const peakDraw = uniform(flightDraw.state, GEN.arcPeakMin, GEN.arcPeakMax);
  const radiusDraw = uniform(peakDraw.state, GEN.arcRadiusMin, GEN.arcRadiusMax);
  const burstDraw = uniformInt(radiusDraw.state, GEN.arcBurstMin, GEN.arcBurstMax);
  const arc: ArcDef = {
    kind: 'arc',
    at: windup,
    flight: flightDraw.value,
    peak: peakDraw.value,
    target: 'player',
    radius: radiusDraw.value,
    burst: burstDraw.value,
  };
  return { value: { shots: [arc], active }, state: burstDraw.state };
}

/**
 * One to three marked floor eruptions. The first mark is under the player; the others sit to either side
 * of the player's spot at the moment they appear, alternating sides.
 */
export function buildEruptions(state: number, windup: number): Draw<ShotPlan> {
  const countDraw = uniformInt(state, GEN.eruptionCountMin, GEN.eruptionCountMax);
  const gapDraw = uniformInt(countDraw.state, GEN.eruptionGapMin, GEN.eruptionGapMax);
  const widthDraw = uniformInt(gapDraw.state, GEN.eruptionWidthMin, GEN.eruptionWidthMax);
  const delayDraw = uniformInt(widthDraw.state, GEN.eruptionDelayMin, GEN.eruptionDelayMax);
  const burstDraw = uniformInt(delayDraw.state, GEN.eruptionBurstMin, GEN.eruptionBurstMax);
  const sideDraw = nextRandom(burstDraw.state);
  let s = sideDraw.state;
  const firstSide = sideDraw.value < 0.5 ? -1 : 1;

  const shots: EruptionDef[] = [];
  for (let i = 0; i < countDraw.value; i++) {
    let offset = 0;
    if (i > 0) {
      const distanceDraw = uniform(s, GEN.eruptionSideMin, GEN.eruptionSideMax);
      s = distanceDraw.state;
      offset = (i % 2 === 1 ? firstSide : -firstSide) * distanceDraw.value;
    }
    shots.push({
      kind: 'eruption',
      at: windup + i * gapDraw.value,
      offset,
      width: widthDraw.value,
      delay: delayDraw.value,
      burst: burstDraw.value,
    });
  }
  return { value: { shots, active: Math.max(GEN.activeMin, (countDraw.value - 1) * gapDraw.value + 1) }, state: s };
}

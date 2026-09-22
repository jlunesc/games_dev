import { nextRandom } from '../../game/rng';
import type { ArenaDef, ArenaPiece } from '../schema';
import type { Draw } from './attack';
import { GEN } from './tuning';

/** One placement zone a generated arena can use: an x centre, and whether cover is allowed there. */
interface Zone {
  x: number;
  allowCover: boolean;
}

/**
 * Three zones spread across the arena, at the same x's the Ashen Hound's own hand-built arena uses
 * (330, 640, 950, rounded here to 320/640/960). The x = 320 zone is platform-only: it sits on the
 * player's start (`PLAYER.startX`), and `parseBoss` already rejects any cover that would cover it.
 */
const ZONES: readonly Zone[] = [
  { x: 320, allowCover: false },
  { x: 640, allowCover: true },
  { x: 960, allowCover: true },
];

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

/** Picks `count` zones out of `ZONES`, without repeats, in the order they are picked. */
function pickZones(state: number, count: number): Draw<Zone[]> {
  let s = state;
  const remaining = [...ZONES];
  const chosen: Zone[] = [];
  for (let i = 0; i < count; i++) {
    const draw = pick(s, remaining);
    s = draw.state;
    chosen.push(draw.value);
    remaining.splice(remaining.indexOf(draw.value), 1);
  }
  return { value: chosen, state: s };
}

/**
 * Draws a height in `[min, max]` at least `GEN.arenaMinHeightGap` away from every height in
 * `taken`. Tries up to `GEN.arenaHeightRetries` times; if none clears the gap, keeps whichever
 * candidate came closest (the largest minimum distance to any taken height) instead — bounded,
 * never an infinite loop.
 */
function drawSpreadHeight(
  state: number,
  min: number,
  max: number,
  taken: readonly number[],
): Draw<number | undefined> {
  let s = state;
  let best: { value: number; gap: number } | null = null;
  for (let i = 0; i < GEN.arenaHeightRetries; i++) {
    const draw = uniform(s, min, max);
    s = draw.state;
    const gap = taken.length === 0 ? Infinity : Math.min(...taken.map((h) => Math.abs(h - draw.value)));
    if (gap >= GEN.arenaMinHeightGap) return { value: draw.value, state: s };
    if (best === null || gap > best.gap) best = { value: draw.value, gap };
  }
  // Fall back to best candidate only if it satisfies the constraint, otherwise skip this piece
  return best !== null && best.gap >= GEN.arenaMinHeightGap ? { value: best.value, state: s } : { value: undefined, state: s };
}

/**
 * Draws a whole arena for a generated boss from `state`, deterministic in `state` alone: bare
 * (`undefined`) with chance `GEN.arenaBareChance`, otherwise 1 to 3 pieces at up to three fixed x
 * zones, spread apart in height by at least `GEN.arenaMinHeightGap`. Never touches a gameplay
 * `rng`, exactly like `generateAttack` and the rest of `generateBoss`.
 */
export function generateArena(state: number): Draw<ArenaDef | undefined> {
  const bareDraw = nextRandom(state);
  if (bareDraw.value < GEN.arenaBareChance) return { value: undefined, state: bareDraw.state };

  const countDraw = uniformInt(bareDraw.state, GEN.arenaPieceCountMin, GEN.arenaPieceCountMax);
  const zonesDraw = pickZones(countDraw.state, countDraw.value);

  let s = zonesDraw.state;
  const platforms: ArenaPiece[] = [];
  const covers: ArenaPiece[] = [];
  const heights: number[] = [];

  for (const zone of zonesDraw.value) {
    const typeDraw = zone.allowCover
      ? pick<'platform' | 'cover'>(s, ['platform', 'cover'])
      : { value: 'platform' as const, state: s };
    s = typeDraw.state;
    const isPlatform = typeDraw.value === 'platform';

    const jitterDraw = uniform(s, -GEN.arenaZoneJitterMax, GEN.arenaZoneJitterMax);
    s = jitterDraw.state;
    const x = zone.x + jitterDraw.value;

    const widthDraw = uniform(
      s,
      isPlatform ? GEN.arenaPlatformWidthMin : GEN.arenaCoverWidthMin,
      isPlatform ? GEN.arenaPlatformWidthMax : GEN.arenaCoverWidthMax,
    );
    s = widthDraw.state;

    const heightDraw = drawSpreadHeight(
      s,
      isPlatform ? GEN.arenaPlatformHeightMin : GEN.arenaCoverHeightMin,
      isPlatform ? GEN.arenaPlatformHeightMax : GEN.arenaCoverHeightMax,
      heights,
    );
    s = heightDraw.state;

    // Skip this piece if no valid height could be found
    if (heightDraw.value === undefined) continue;

    heights.push(heightDraw.value);

    const piece: ArenaPiece = { x, width: widthDraw.value, height: heightDraw.value };
    (isPlatform ? platforms : covers).push(piece);
  }

  return { value: { platforms, covers }, state: s };
}

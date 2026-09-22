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
 * Assigns a height to each entry of `isPlatform` (same order), guaranteeing every pair ends up at
 * least `GEN.arenaMinHeightGap` apart — by construction, not by retrying. Every cover ranks below
 * every platform (covers get the lowest heights, platforms the highest); ranks are spaced exactly
 * `GEN.arenaMinHeightGap` apart starting at the shared minimum (`GEN.arenaPlatformHeightMin`, equal
 * to `GEN.arenaCoverHeightMin`, both 40), then shifted by one shared random offset `d` — kept small
 * enough that the highest-ranked cover still fits under `GEN.arenaCoverHeightMax` and the
 * highest-ranked platform still fits under `GEN.arenaPlatformHeightMax`. This is always satisfiable
 * for 1 to 3 pieces with 0 to 2 of them cover (every combination the three zones can produce) —
 * checked by hand, not assumed; see the design doc. Which piece (among same-type pieces) lands on
 * which rank is itself shuffled, so the layout still varies.
 */
function assignHeights(state: number, isPlatform: readonly boolean[]): Draw<number[]> {
  const gap = GEN.arenaMinHeightGap;
  const base = GEN.arenaPlatformHeightMin; // === GEN.arenaCoverHeightMin
  const coverIndices: number[] = [];
  const platformIndices: number[] = [];
  isPlatform.forEach((p, i) => (p ? platformIndices : coverIndices).push(i));

  let s = state;
  function shuffle(indices: readonly number[]): number[] {
    const arr = [...indices];
    for (let i = arr.length - 1; i >= 1; i--) {
      const draw = nextRandom(s);
      s = draw.state;
      const j = Math.floor(draw.value * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
  const rankOrder = [...shuffle(coverIndices), ...shuffle(platformIndices)];

  const total = isPlatform.length;
  let dMax = Infinity;
  if (coverIndices.length > 0) {
    dMax = Math.min(dMax, GEN.arenaCoverHeightMax - base - (coverIndices.length - 1) * gap);
  }
  if (platformIndices.length > 0) {
    dMax = Math.min(dMax, GEN.arenaPlatformHeightMax - base - (total - 1) * gap);
  }
  const dDraw = uniform(s, 0, Math.max(0, dMax));
  s = dDraw.state;

  const heights = new Array<number>(total);
  rankOrder.forEach((originalIndex, rank) => {
    heights[originalIndex] = base + rank * gap + dDraw.value;
  });

  return { value: heights, state: s };
}

/**
 * Draws a whole arena for a generated boss from `state`, deterministic in `state` alone: bare
 * (`undefined`) with chance `GEN.arenaBareChance`, otherwise 1 to 3 pieces at up to three fixed x
 * zones, heights spread apart by `assignHeights` above. Never touches a gameplay `rng`, exactly like
 * `generateAttack` and the rest of `generateBoss`.
 */
export function generateArena(state: number): Draw<ArenaDef | undefined> {
  const bareDraw = nextRandom(state);
  if (bareDraw.value < GEN.arenaBareChance) return { value: undefined, state: bareDraw.state };

  const countDraw = uniformInt(bareDraw.state, GEN.arenaPieceCountMin, GEN.arenaPieceCountMax);
  const zonesDraw = pickZones(countDraw.state, countDraw.value);

  let s = zonesDraw.state;
  const isPlatform: boolean[] = [];
  const xs: number[] = [];
  const widths: number[] = [];

  for (const zone of zonesDraw.value) {
    const typeDraw = zone.allowCover
      ? pick(s, ['platform', 'cover'] as const)
      : { value: 'platform' as const, state: s };
    s = typeDraw.state;
    const platform = typeDraw.value === 'platform';
    isPlatform.push(platform);

    const jitterDraw = uniform(s, -GEN.arenaZoneJitterMax, GEN.arenaZoneJitterMax);
    s = jitterDraw.state;
    xs.push(zone.x + jitterDraw.value);

    const widthDraw = uniform(
      s,
      platform ? GEN.arenaPlatformWidthMin : GEN.arenaCoverWidthMin,
      platform ? GEN.arenaPlatformWidthMax : GEN.arenaCoverWidthMax,
    );
    s = widthDraw.state;
    widths.push(widthDraw.value);
  }

  const heightsDraw = assignHeights(s, isPlatform);
  s = heightsDraw.state;

  const platforms: ArenaPiece[] = [];
  const covers: ArenaPiece[] = [];
  isPlatform.forEach((platform, i) => {
    const piece: ArenaPiece = { x: xs[i]!, width: widths[i]!, height: heightsDraw.value[i]! };
    (platform ? platforms : covers).push(piece);
  });

  return { value: { platforms, covers }, state: s };
}

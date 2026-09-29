import { rng } from './background';
import type { LayerDef, Mood } from './moods';
import { LOOK } from './tuning';

/** Everything below is look only: a fresh backdrop for each generated fight, always the same for the same seed. */
const SHAPES = ['pillars', 'ridge', 'spires'] as const;

/** The sky's lightness stays low so the boss, its warnings and the player always stand out from the backdrop. */
const SKY_TOP_LIGHTNESS = [4, 8] as const;
const SKY_BOTTOM_LIGHTNESS = [13, 25] as const;
const SATURATION = [25, 65] as const;
/** Each nearer layer is this much darker than the sky's bottom edge (a fraction of its lightness). */
const LAYER_DARKNESS = [0.78, 0.6, 0.45] as const;
const HEIGHT_RANGES = [
  [0.4, 0.55],
  [0.4, 0.7],
  [0.3, 0.6],
] as const;

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const v = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * A backdrop invented from a seed: a random colour family (hue and strength), 2 or 3 layers of random shapes,
 * heights and drift, and embers, floor and accent in matching colours. The body colour sits opposite the sky on the
 * colour wheel, so the boss does not melt into it.
 */
export function generatedMood(seed: number): Mood {
  const next = rng(seed ^ 0x9e3779b9);
  const between = (lo: number, hi: number): number => lo + (hi - lo) * next();
  const hue = between(0, 360);
  const sat = between(SATURATION[0], SATURATION[1]);
  const skyBottomL = between(SKY_BOTTOM_LIGHTNESS[0], SKY_BOTTOM_LIGHTNESS[1]);
  const skyBottomHue = hue + between(-25, 25);

  const count = next() < 0.5 ? 2 : 3;
  const speeds = count === 3 ? LOOK.layerSpeeds : [LOOK.layerSpeeds[0], LOOK.layerSpeeds[2]];
  const layers: LayerDef[] = [];
  let previous = '';
  for (let i = 0; i < count; i++) {
    const slot = count === 3 ? i : i === 0 ? 0 : 2;
    const choices = SHAPES.filter((s) => s !== previous);
    const shape = choices[Math.floor(next() * choices.length)]!;
    previous = shape;
    const [lo, hi] = HEIGHT_RANGES[slot]!;
    layers.push({
      shape,
      color: hslToHex(hue + between(-10, 10), sat * 0.8, skyBottomL * LAYER_DARKNESS[slot]!),
      speed: speeds[i]!,
      heightFraction: between(lo, hi),
      seed: 1000 + Math.floor(next() * 1_000_000),
    });
  }

  const accentHue = hue + between(-20, 20);
  return {
    id: `generated-${seed >>> 0}`,
    skyTop: hslToHex(hue, sat * 0.8, between(SKY_TOP_LIGHTNESS[0], SKY_TOP_LIGHTNESS[1])),
    skyBottom: hslToHex(skyBottomHue, sat, skyBottomL),
    layers,
    ember: hslToHex(accentHue, 85, between(62, 74)),
    floor: hslToHex(hue, sat * 0.5, between(9, 15)),
    floorLine: hslToHex(accentHue, sat, between(45, 58)),
    floorGlow: hslToHex(accentHue, 80, between(55, 65)),
    accent: hslToHex(accentHue, 80, between(66, 76)),
    bodyColor: hslToHex(hue + between(150, 210), between(35, 55), between(54, 64)),
  };
}

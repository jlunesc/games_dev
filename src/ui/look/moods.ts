import { generatedMood } from './generated-mood';
import { LOOK } from './tuning';

/** One parallax layer of the backdrop. Farther layers are darker, lower and slower. */
export interface LayerDef {
  shape: 'pillars' | 'ridge' | 'spires';
  color: string;
  /** Drift speed in world units per second. */
  speed: number;
  /** The tallest shape as a fraction of the world height, between 0 and 1 (exclusive). */
  heightFraction: number;
  /** Makes the shapes of this layer different from every other layer's, always the same for the same seed. */
  seed: number;
}

/** A soft light in the sky (a moon, a sun or a horizon glow), baked into the sky picture. `x` and `y` are fractions of the world; `radius` is in world units; `disc` adds a solid disc of that radius in the middle. */
export interface GlowDef {
  color: string;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  disc?: number;
}

/** A band of mist or cloud that drifts like one more layer. `y` is the band's middle as a fraction of the floor height, `height` is in world units. */
export interface HazeDef {
  color: string;
  alpha: number;
  speed: number;
  y: number;
  height: number;
  seed: number;
}

/** Falling rain or blowing wind streaks. Counts and sizes are in `LOOK.weather`. */
export interface WeatherDef {
  kind: 'rain' | 'wind';
  color: string;
}

/** The colours and layers behind one boss's arena. */
export interface Mood {
  id: string;
  skyTop: string;
  skyBottom: string;
  layers: LayerDef[];
  ember: string;
  floor: string;
  floorLine: string;
  floorGlow: string;
  accent: string;
  /** The boss's body colour when nothing changes it (a hit flash, a stagger). */
  bodyColor: string;
  glow?: GlowDef;
  haze?: HazeDef;
  weather?: WeatherDef;
  /** Now and then a dim flash lights the whole sky in this colour. */
  lightning?: { color: string };
}

const [FAR, MID, NEAR] = LOOK.layerSpeeds;

export const MOODS: Record<string, Mood> = {
  neutral: {
    id: 'neutral',
    skyTop: '#0d0d16',
    skyBottom: '#1c1c2c',
    layers: [
      { shape: 'ridge', color: '#1f1f30', speed: FAR, heightFraction: 0.45, seed: 11 },
      { shape: 'pillars', color: '#171724', speed: NEAR, heightFraction: 0.6, seed: 12 },
    ],
    ember: '#8fa8ff',
    floor: LOOK.floor,
    floorLine: LOOK.floorLine,
    floorGlow: '#8fa8ff',
    accent: '#8fa8ff',
    bodyColor: LOOK.bossBodyEmber,
  },
  'ember-duelist': {
    id: 'ember-duelist',
    skyTop: '#1a0a08',
    skyBottom: '#4a1a0c',
    layers: [
      { shape: 'ridge', color: '#3a1410', speed: FAR, heightFraction: 0.5, seed: 21 },
      { shape: 'spires', color: '#2a0f0c', speed: MID, heightFraction: 0.7, seed: 22 },
      { shape: 'pillars', color: '#1c0a08', speed: NEAR, heightFraction: 0.55, seed: 23 },
    ],
    ember: '#ff9a3c',
    floor: '#2e1a14',
    floorLine: '#c8642a',
    floorGlow: '#ff7a2a',
    accent: '#ffb44a',
    bodyColor: LOOK.bossBodyEmber,
    glow: { color: '#ff7a2a', x: 0.5, y: 0.78, radius: 520, alpha: 0.22 },
    haze: { color: '#ff8a4a', alpha: 0.4, speed: 7, y: 0.62, height: 170, seed: 121 },
  },
  'ashen-hound': {
    id: 'ashen-hound',
    skyTop: '#0a0e16',
    skyBottom: '#232c3c',
    layers: [
      { shape: 'ridge', color: '#1a2230', speed: FAR, heightFraction: 0.42, seed: 31 },
      { shape: 'pillars', color: '#141a26', speed: NEAR, heightFraction: 0.65, seed: 32 },
    ],
    ember: '#a8c4e0',
    floor: '#1e2532',
    floorLine: '#8a9ab0',
    floorGlow: '#7fa0d0',
    accent: '#a8d0ff',
    bodyColor: LOOK.bossBodyAsh,
    glow: { color: '#b8d0f0', x: 0.78, y: 0.2, radius: 300, alpha: 0.2, disc: 26 },
    haze: { color: '#a8bcd8', alpha: 0.34, speed: 6, y: 0.7, height: 190, seed: 122 },
  },
  'quill-warden': {
    id: 'quill-warden',
    skyTop: '#0a1410',
    skyBottom: '#163a2c',
    layers: [
      { shape: 'ridge', color: '#123024', speed: FAR, heightFraction: 0.4, seed: 41 },
      { shape: 'spires', color: '#0e241c', speed: NEAR, heightFraction: 0.68, seed: 42 },
    ],
    ember: '#7fe0b0',
    floor: '#152b22',
    floorLine: '#4fae82',
    floorGlow: '#6fe0a8',
    accent: '#8fe8bc',
    bodyColor: LOOK.bossBodyQuill,
    glow: { color: '#a8f0c8', x: 0.25, y: 0.18, radius: 300, alpha: 0.18, disc: 22 },
    haze: { color: '#7fe0b0', alpha: 0.44, speed: 8, y: 0.68, height: 200, seed: 123 },
  },
  'cinder-golem': {
    id: 'cinder-golem',
    skyTop: '#140d08',
    skyBottom: '#3a2414',
    layers: [
      { shape: 'ridge', color: '#2c1c10', speed: FAR, heightFraction: 0.55, seed: 51 },
      { shape: 'pillars', color: '#1c120a', speed: NEAR, heightFraction: 0.72, seed: 52 },
    ],
    ember: '#e0a050',
    floor: '#241a10',
    floorLine: '#a06830',
    floorGlow: '#d08840',
    accent: '#e8b060',
    bodyColor: LOOK.bossBodyAsh,
    glow: { color: '#e08840', x: 0.15, y: 0.75, radius: 460, alpha: 0.2 },
    haze: { color: '#9a8a78', alpha: 0.52, speed: 9, y: 0.4, height: 170, seed: 124 },
  },
  'veil-dancer': {
    id: 'veil-dancer',
    skyTop: '#140a1c',
    skyBottom: '#341a44',
    layers: [
      { shape: 'spires', color: '#2a1438', speed: FAR, heightFraction: 0.5, seed: 61 },
      { shape: 'pillars', color: '#1c0e28', speed: NEAR, heightFraction: 0.6, seed: 62 },
    ],
    ember: '#c890f0',
    floor: '#20142c',
    floorLine: '#8858b0',
    floorGlow: '#b070e0',
    accent: '#d0a0f4',
    bodyColor: LOOK.bossBodyVeil,
    glow: { color: '#e0b8ff', x: 0.68, y: 0.2, radius: 340, alpha: 0.22, disc: 34 },
    haze: { color: '#b070e0', alpha: 0.4, speed: 6, y: 0.66, height: 180, seed: 125 },
  },
  'gale-reaver': {
    id: 'gale-reaver',
    skyTop: '#081418',
    skyBottom: '#0e3440',
    layers: [
      { shape: 'ridge', color: '#123844', speed: FAR, heightFraction: 0.44, seed: 71 },
      { shape: 'spires', color: '#0c2830', speed: MID, heightFraction: 0.62, seed: 72 },
    ],
    ember: '#6fe0e8',
    floor: '#0f2a30',
    floorLine: '#3ea8b4',
    floorGlow: '#5fd8e4',
    accent: '#8ff0f8',
    bodyColor: LOOK.bossBodyGale,
    haze: { color: '#8ff0f8', alpha: 0.4, speed: 16, y: 0.35, height: 150, seed: 126 },
    weather: { kind: 'wind', color: '#a8f4f8' },
  },
  'brass-sentinel': {
    id: 'brass-sentinel',
    skyTop: '#161208',
    skyBottom: '#3c3010',
    layers: [
      { shape: 'pillars', color: '#2c2410', speed: FAR, heightFraction: 0.5, seed: 81 },
      { shape: 'ridge', color: '#1e1a0c', speed: NEAR, heightFraction: 0.6, seed: 82 },
    ],
    ember: '#e8c860',
    floor: '#241f10',
    floorLine: '#b09040',
    floorGlow: '#e0c050',
    accent: '#f0d878',
    bodyColor: LOOK.bossBodyBrass,
    glow: { color: '#f0d070', x: 0.5, y: 0.3, radius: 420, alpha: 0.2, disc: 38 },
  },
  'vesper-sage': {
    id: 'vesper-sage',
    skyTop: '#0c0a1a',
    skyBottom: '#241a4a',
    layers: [
      { shape: 'spires', color: '#2a2048', speed: FAR, heightFraction: 0.55, seed: 91 },
      { shape: 'ridge', color: '#1a1432', speed: MID, heightFraction: 0.4, seed: 92 },
      { shape: 'pillars', color: '#120e24', speed: NEAR, heightFraction: 0.6, seed: 93 },
    ],
    ember: '#b48cff',
    floor: '#1a1530',
    floorLine: '#7a64b8',
    floorGlow: '#9a78e8',
    accent: '#b48cff',
    bodyColor: LOOK.bossBodySage,
    glow: { color: '#d4c0ff', x: 0.4, y: 0.16, radius: 320, alpha: 0.22, disc: 30 },
  },
  'tremor-brute': {
    id: 'tremor-brute',
    skyTop: '#140c0c',
    skyBottom: '#3a1c18',
    layers: [
      { shape: 'ridge', color: '#3a2220', speed: FAR, heightFraction: 0.5, seed: 101 },
      { shape: 'pillars', color: '#26130f', speed: MID, heightFraction: 0.45, seed: 102 },
      { shape: 'ridge', color: '#1a0c0a', speed: NEAR, heightFraction: 0.35, seed: 103 },
    ],
    ember: '#e0603a',
    floor: '#2a1a16',
    floorLine: '#a0553a',
    floorGlow: '#d8583a',
    accent: '#e8785a',
    bodyColor: LOOK.bossBodyBrute,
    haze: { color: '#c0805a', alpha: 0.48, speed: 8, y: 0.72, height: 180, seed: 127 },
  },
  'storm-kite': {
    id: 'storm-kite',
    skyTop: '#0a0c1c',
    skyBottom: '#4a3a62',
    layers: [
      { shape: 'ridge', color: '#3a3560', speed: FAR, heightFraction: 0.42, seed: 111 },
      { shape: 'spires', color: '#251f45', speed: MID, heightFraction: 0.4, seed: 112 },
      { shape: 'ridge', color: '#14122e', speed: NEAR, heightFraction: 0.3, seed: 113 },
    ],
    ember: '#9fc4ff',
    floor: '#171a30',
    floorLine: '#6f8fd8',
    floorGlow: '#5a9cff',
    accent: '#7fb0ff',
    bodyColor: LOOK.bossBodyKite,
    glow: { color: '#8a78c8', x: 0.6, y: 0.3, radius: 460, alpha: 0.2 },
    haze: { color: '#a090d0', alpha: 0.52, speed: 14, y: 0.3, height: 170, seed: 128 },
    weather: { kind: 'rain', color: '#b8d0ff' },
    lightning: { color: '#dce8ff' },
  },
};

/** The mood for a boss id; an unknown id gets the neutral one. A generated boss gets a mood made from the fight's `seed` (without one, the neutral mood). */
export function moodFor(bossId: string, seed?: number): Mood {
  if (bossId === 'generated' && seed !== undefined) return generatedMood(seed);
  return Object.hasOwn(MOODS, bossId) ? MOODS[bossId]! : MOODS.neutral!;
}

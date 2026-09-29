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
  },
};

/** The mood for a boss id; an unknown id gets the neutral one. */
export function moodFor(bossId: string): Mood {
  return Object.hasOwn(MOODS, bossId) ? MOODS[bossId]! : MOODS.neutral!;
}

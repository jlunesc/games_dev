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
      { shape: 'ridge', color: '#171724', speed: FAR, heightFraction: 0.45, seed: 11 },
      { shape: 'pillars', color: '#1f1f30', speed: NEAR, heightFraction: 0.6, seed: 12 },
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
};

/** The mood for a boss id; an unknown id gets the neutral one. */
export function moodFor(bossId: string): Mood {
  return Object.hasOwn(MOODS, bossId) ? MOODS[bossId]! : MOODS.neutral!;
}

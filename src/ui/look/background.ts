import { WORLD } from '../../game/params';
import { LOOK } from './tuning';
import type { LayerDef, Mood } from './moods';

/** One silhouette of a layer: it stands on the pattern's floor line, `w` wide and `h` tall, its left edge at `x`. */
export interface LayerShape {
  x: number;
  w: number;
  h: number;
}

/** One drifting ember. */
export interface Ember {
  x: number;
  y: number;
  alpha: number;
  size: number;
}

/** The off-screen pictures made once per mood. Opaque to callers: only `drawBackground` looks inside. */
export interface BackgroundCache {
  readonly sky: CanvasImageSource;
  readonly layers: readonly CanvasImageSource[];
  /** Width of every layer picture; the drift wraps at this width. */
  readonly patternWidth: number;
}

/** How far past the world edges the sky reaches, so screen shake never shows the page behind it. */
const SKY_BLEED = 8;

/** A small deterministic random number generator (mulberry32): the same seed always gives the same run of numbers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The silhouettes of one layer across a pattern `width` wide, always the same for the same layer.
 * Ridges are a run of adjoining peaks from edge to edge (both ends at ground level, so the pattern wraps
 * seamlessly); pillars and spires stand apart with clear ground before the first and after the last, so
 * wrapping never cuts one in half. No shape is taller than `heightFraction` of the world height.
 */
export function layerShapes(layer: LayerDef, width: number): LayerShape[] {
  const rand = rng(layer.seed * 7919 + 17);
  const maxH = layer.heightFraction * WORLD.height;
  const shapes: LayerShape[] = [];

  if (layer.shape === 'ridge') {
    let x = 0;
    while (x < width) {
      let w = 130 + rand() * 150;
      // Fold a sliver at the end into the last peak instead of leaving a stub.
      if (width - (x + w) < 90) w = width - x;
      shapes.push({ x, w, h: maxH * (0.4 + rand() * 0.6) });
      x += w;
    }
    return shapes;
  }

  const pillars = layer.shape === 'pillars';
  const minW = pillars ? 44 : 22;
  const spanW = pillars ? 70 : 26;
  const minGap = pillars ? 70 : 90;
  const spanGap = pillars ? 170 : 170;
  const minH = pillars ? 0.45 : 0.5;
  let x = minGap * 0.5 + rand() * spanGap * 0.5;
  for (;;) {
    const w = minW + rand() * spanW;
    // Stop when this one would crowd the far edge (keeps ground before the wrap).
    if (x + w > width - minGap * 0.5) break;
    shapes.push({ x, w, h: maxH * (minH + rand() * (1 - minH)) });
    x += w + minGap + rand() * spanGap;
  }
  return shapes;
}

/**
 * Where the embers are at a tick. Each ember has its own start, rise speed, sway and pulse worked out from its
 * index and the mood alone, so the same inputs always give the same picture and nothing has to be remembered.
 * Embers rise slowly, sway sideways, fade in and out along their climb, and wrap from the top back to the bottom.
 */
export function emberPositions(mood: Mood, tick: number, count: number): Ember[] {
  const t = tick / 60;
  const climb = WORLD.floorY;
  const out: Ember[] = [];
  const base = hashString(mood.id);
  for (let i = 0; i < count; i++) {
    const rand = rng(base + i * 104729);
    const startX = LOOK.emberSwayAmplitude + rand() * (WORLD.width - 2 * LOOK.emberSwayAmplitude);
    const startY = rand() * climb;
    const speed = LOOK.emberRiseSpeed * (0.6 + rand() * 0.8);
    const swayPhase = rand() * Math.PI * 2;
    const pulsePhase = rand() * Math.PI * 2;
    const size = LOOK.emberSizeMin + rand() * (LOOK.emberSizeMax - LOOK.emberSizeMin);

    const travelled = (startY + speed * t) % climb;
    const y = climb - travelled;
    const x = startX + Math.sin(t * LOOK.emberSwaySpeed + swayPhase) * LOOK.emberSwayAmplitude;
    const pulse = 0.5 + 0.5 * Math.sin(t * LOOK.emberPulseSpeed + pulsePhase);
    const fade = Math.min(1, travelled / 60, (climb - travelled) / 60);
    const alpha = (LOOK.emberAlphaMin + (LOOK.emberAlphaMax - LOOK.emberAlphaMin) * pulse) * Math.max(0, fade);
    out.push({ x, y, alpha: Math.min(1, Math.max(0, alpha)), size });
  }
  return out;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintLayer(g: CanvasRenderingContext2D, layer: LayerDef, width: number): void {
  const base = WORLD.floorY;
  g.fillStyle = layer.color;
  for (const s of layerShapes(layer, width)) {
    g.beginPath();
    if (layer.shape === 'pillars') {
      // A shaft with a slightly wider cap and foot.
      const inset = 4;
      g.rect(s.x + inset, base - s.h, s.w - 2 * inset, s.h);
      g.rect(s.x, base - s.h, s.w, 10);
      g.rect(s.x, base - 12, s.w, 12);
    } else {
      g.moveTo(s.x, base);
      g.lineTo(s.x + s.w * (layer.shape === 'ridge' ? 0.42 : 0.5), base - s.h);
      g.lineTo(s.x + s.w, base);
      g.closePath();
    }
    g.fill();
  }
}

/**
 * Pre-render the sky and every layer of a mood into off-screen pictures. Returns null when there is no
 * `document` (tests, workers) or a canvas cannot be made; the drawing then falls back to a plain gradient.
 */
export function createBackground(mood: Mood): BackgroundCache | null {
  if (typeof document === 'undefined') return null;
  const patternWidth = WORLD.width + 2 * LOOK.layerMargin;
  try {
    const skyCanvas = makeCanvas(WORLD.width + 2 * SKY_BLEED, WORLD.height + 2 * SKY_BLEED);
    const skyCtx = skyCanvas?.getContext('2d');
    if (!skyCanvas || !skyCtx) return null;
    const gradient = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, mood.skyTop);
    gradient.addColorStop(1, mood.skyBottom);
    skyCtx.fillStyle = gradient;
    skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

    const layers: CanvasImageSource[] = [];
    for (const layer of mood.layers) {
      const canvas = makeCanvas(patternWidth, WORLD.floorY);
      const g = canvas?.getContext('2d');
      if (!canvas || !g) return null;
      paintLayer(g, layer, patternWidth);
      layers.push(canvas);
    }
    return { sky: skyCanvas, layers, patternWidth };
  } catch {
    return null;
  }
}

/**
 * Draw the sky, the parallax layers and (with motion) the embers, in world coordinates, behind everything else.
 * With `motion` off the layers stand still and there are no embers. The floor is drawn by the caller.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  mood: Mood,
  cache: BackgroundCache | null,
  tick: number,
  motion: boolean,
): void {
  ctx.save();
  if (cache) {
    ctx.drawImage(cache.sky, -SKY_BLEED, -SKY_BLEED);
    ctx.globalAlpha = LOOK.layerAlpha;
    const p = cache.patternWidth;
    mood.layers.forEach((layer, i) => {
      const image = cache.layers[i];
      if (!image) return;
      const offset = motion ? ((tick / 60) * layer.speed) % p : 0;
      // The picture is one pattern wide and wraps, so two copies side by side leave no gap at any drift.
      const left = -LOOK.layerMargin - offset;
      ctx.drawImage(image, left, 0);
      ctx.drawImage(image, left + p, 0);
    });
  } else {
    const gradient = ctx.createLinearGradient(0, -SKY_BLEED, 0, WORLD.height + SKY_BLEED);
    gradient.addColorStop(0, mood.skyTop);
    gradient.addColorStop(1, mood.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(-SKY_BLEED, -SKY_BLEED, WORLD.width + 2 * SKY_BLEED, WORLD.height + 2 * SKY_BLEED);
  }
  if (motion) {
    ctx.fillStyle = mood.ember;
    for (const e of emberPositions(mood, tick, LOOK.emberCount)) {
      ctx.globalAlpha = e.alpha;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

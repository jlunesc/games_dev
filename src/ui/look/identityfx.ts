/**
 * The signs of the newer boss mechanics, as plain shapes: where a vanished boss will reappear, the arrow that warns
 * of a bolt from a side edge, the flames of lingering embers, the shield plate and how angry a boss looks. Purely
 * cosmetic and pure (no canvas): `render.ts` draws what these return. Every size and colour is in `tuning.ts`.
 */
import type { BossDef } from '../../bosses/schema';
import { bossHidden, shieldUp } from '../../game/geometry';
import { EMBER, WORLD } from '../../game/params';
import type { BossState, EruptionState } from '../../game/state';
import type { Primitive } from './figures';
import { bossDrawBox } from './pose';
import { LOOK } from './tuning';

/** Where a vanished boss will reappear, or null when the boss is not vanished. */
export function blinkMark(b: BossState, boss: BossDef): { x: number; width: number } | null {
  if (!bossHidden(b, boss) || b.blinkToX === null) return null;
  return { x: b.blinkToX, width: boss.width };
}

export interface EdgeWarning {
  side: 'left' | 'right';
  /** Height of the bolt's bottom edge above the floor, and the bolt's size. */
  height: number;
  size: number;
  /** 0 when the attack has just begun, 1 when the bolt leaves. */
  charge: number;
}

/** One warning for each side-edge bolt of the running attack that has not left yet. */
export function edgeWarnings(b: BossState, boss: BossDef): EdgeWarning[] {
  if (b.mode !== 'attack' || b.attackId === null) return [];
  const shots = boss.attacks.find((a) => a.id === b.attackId)?.shots;
  if (shots === undefined) return [];
  const out: EdgeWarning[] = [];
  for (const shot of shots) {
    if (shot.kind !== 'bolt' || shot.edge === undefined || b.attackTick >= shot.at) continue;
    out.push({ side: shot.edge, height: shot.height, size: shot.size, charge: Math.min(1, b.attackTick / shot.at) });
  }
  return out;
}

/** The arrow for one warning: inside the arena at that edge, on the line the bolt will fly, pointing inward. */
export function edgeArrow(w: EdgeWarning, tick: number): { primitives: Primitive[]; alpha: number } {
  const e = LOOK.edgeWarn;
  const cy = WORLD.floorY - w.height - w.size / 2;
  const dir = w.side === 'left' ? 1 : -1;
  const x0 = w.side === 'left' ? e.inset : WORLD.width - e.inset;
  const points: [number, number][] = [
    [x0, cy - e.half],
    [x0 + dir * e.length, cy],
    [x0, cy + e.half],
  ];
  const pulse = 0.75 + 0.25 * Math.sin(tick / 3);
  return { primitives: [{ kind: 'poly', points, color: e.color }], alpha: (e.minAlpha + (1 - e.minAlpha) * w.charge) * pulse };
}

export interface EmberSpan {
  left: number;
  right: number;
}

/** The floor the embers cover, or null unless this eruption is in its lingering stretch (after the blast, `linger` updates). */
export function emberSpan(shot: EruptionState): EmberSpan | null {
  if (shot.linger === undefined) return null;
  const start = shot.delay + shot.burst;
  if (shot.age < start || shot.age >= start + shot.linger) return null;
  return { left: shot.x - shot.width / 2, right: shot.x + shot.width / 2 };
}

/** A low base and a row of flames, each flickering between two heights. Nothing rises above `EMBER.height`, the real hit box. */
export function emberTongues(span: EmberSpan, tick: number, palette: { edge: string; core: string }): Primitive[] {
  const e = LOOK.ember;
  const width = span.right - span.left;
  const count = Math.max(1, Math.min(e.maxTongues, Math.round(width / e.tongueWidth)));
  const each = width / count;
  const out: Primitive[] = [
    { kind: 'rect', x: span.left, y: WORLD.floorY - EMBER.height * e.baseShare, w: width, h: EMBER.height * e.baseShare, color: palette.edge },
  ];
  for (let i = 0; i < count; i++) {
    const high = (tick + i * 3) % (e.flickerTicks * 2) < e.flickerTicks;
    const h = EMBER.height * (high ? 1 : e.lowShare);
    const x0 = span.left + i * each;
    out.push({
      kind: 'poly',
      color: palette.core,
      points: [
        [x0, WORLD.floorY],
        [x0 + each / 2, WORLD.floorY - h],
        [x0 + each, WORLD.floorY],
      ],
    });
  }
  return out;
}

/** The shield plate on the side the boss faces, or nothing while the shield is down (or the boss has none). */
export function shieldPlate(b: BossState, boss: BossDef): Primitive[] {
  if (!shieldUp(b, boss)) return [];
  const s = LOOK.shield;
  const { top, height } = bossDrawBox(b, boss);
  const h = height * s.heightShare;
  const y = top + (height - h) / 2;
  const near = b.x + b.facing * (boss.width / 2 + s.gap);
  const x = b.facing === 1 ? near : near - s.width;
  return [
    { kind: 'rect', x, y, w: s.width, h, color: s.edge },
    { kind: 'rect', x: x + 3, y: y + 3, w: s.width - 6, h: h - 6, color: s.color },
  ];
}

/** The opacity of the angry outline for a temper level from 0 to 1: nothing up to `LOOK.temper.from`, then rising to `alphaMax`. */
export function temperGlow(level: number): number {
  const t = LOOK.temper;
  if (level <= t.from) return 0;
  return t.alphaMax * Math.min(1, (level - t.from) / (1 - t.from));
}

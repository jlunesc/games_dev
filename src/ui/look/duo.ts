import type { FightDef } from '../../game/fight';
import { WORLD } from '../../game/params';
import { allBosses, bossAt, bossCount, isDowned, type GameState } from '../../game/state';
import { holdsTurn } from '../../game/turns';
import type { Primitive } from './figures';
import { moodFor } from './moods';
import { bossDrawBox, type Rect } from './pose';
import { LOOK } from './tuning';

/**
 * The look of a fight with two bosses: the stacked health bars, the marker over the boss that holds the turn, and the
 * heap a beaten boss leaves. Pure and look-only: nothing here changes how a fight plays. A fight of one boss gets the
 * one bar it always had and no marker.
 */

export interface HealthBar {
  index: number;
  name: string;
  back: Rect;
  fill: Rect;
  ticks: Rect[];
  nameX: number;
  nameY: number;
  /** The colour of the fill, or null for the plain red of a lone boss. */
  color: string | null;
  /** A fallen boss: its bar and name are drawn dim. */
  dim: boolean;
}

export function healthBars(state: GameState, fight: FightDef): HealthBar[] {
  const h = LOOK.hud;
  const left = WORLD.width - h.margin - h.barWidth;
  const paired = fight.bosses.length > 1;
  return fight.bosses.map((def, index) => {
    const top = h.barTop + index * h.barStep;
    const fraction = Math.max(0, Math.min(1, bossAt(state, index).hp / def.maxHp));
    return {
      index,
      name: !paired && state.study.active ? `STUDY  ${def.name}` : def.name,
      back: { x: left, y: top, w: h.barWidth, h: h.barHeight },
      fill: { x: left, y: top, w: h.barWidth * fraction, h: h.barHeight },
      ticks: def.phases.slice(1).map((phase) => ({
        x: left + h.barWidth * phase.startsAtHpFraction - 1,
        y: top - h.tickRise,
        w: h.tickWidth,
        h: h.tickHeight,
      })),
      nameX: WORLD.width - h.margin,
      nameY: top + h.nameDrop,
      color: paired ? moodFor(def.id).accent : null,
      dim: isDowned(state, index),
    };
  });
}

/** The boss that holds the turn, or null: in a fight of one, or once only one boss still stands, there is no turn to show. */
export function turnHolder(state: GameState, fight: FightDef): number | null {
  if (fight.bosses.length < 2) return null;
  const standing = allBosses(state).filter((_, index) => !isDowned(state, index)).length;
  if (standing < 2) return null;
  for (let index = 0; index < bossCount(state); index++) {
    if (holdsTurn(state, index)) return index;
  }
  return null;
}

export interface TurnMarker {
  boss: number;
  /** A triangle, tip down, as world points. */
  points: [number, number][];
}

export function turnMarker(state: GameState, fight: FightDef): TurnMarker | null {
  const boss = turnHolder(state, fight);
  if (boss === null) return null;
  const m = LOOK.turnMarker;
  const b = bossAt(state, boss);
  const { top } = bossDrawBox(b, fight.bosses[boss]!);
  const pulse = 1 + m.pulse * Math.sin((Math.PI * 2 * state.tick) / m.pulseTicks);
  const half = m.halfWidth * pulse;
  const height = m.height * pulse;
  const tip = Math.max(m.minTop + height, top - m.gap);
  return {
    boss,
    points: [
      [b.x - half, tip - height],
      [b.x + half, tip - height],
      [b.x, tip],
    ],
  };
}

/** What is left of a beaten boss: a low body on the floor with the head at the end it was facing. Draw it dimmed (`LOOK.fallen.alpha`). */
export function fallenFigure(
  cx: number,
  facing: 1 | -1,
  width: number,
  height: number,
  colors: { body: string; accent: string },
): Primitive[] {
  const f = LOOK.fallen;
  const w = width * f.widthScale;
  const h = height * f.heightFraction;
  const r = Math.min(LOOK.bossHeadRadius, h / 2);
  return [
    { kind: 'rect', x: cx - w / 2, y: WORLD.floorY - h, w, h, color: colors.body },
    { kind: 'circle', x: cx + facing * (w / 2 - r), y: WORLD.floorY - r, r, color: colors.accent },
  ];
}

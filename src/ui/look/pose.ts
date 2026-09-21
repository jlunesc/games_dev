/** The pure pose helpers shared by the game screen and the figures. Kept apart from render.ts so the figures can use them without an import cycle. */
import type { BossDef, Pose } from '../../bosses/schema';
import { WORLD } from '../../game/params';
import type { BossState } from '../../game/state';
import { moodFor } from './moods';
import { LOOK } from './tuning';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ARM_LENGTH = 90;
const ARM_THICKNESS = 16;

/** The boss's arm for a pose, as a rectangle hanging from the shoulder point. The pose tells the player which attack is coming. */
export function armRect(pose: Pose, facing: 1 | -1, shoulderX: number, shoulderY: number): Rect {
  const t = ARM_THICKNESS;
  const l = ARM_LENGTH;
  switch (pose) {
    case 'raised':
      return { x: shoulderX - t / 2, y: shoulderY - l, w: t, h: l };
    case 'down':
      return { x: shoulderX + facing * 30 - t / 2, y: shoulderY, w: t, h: l };
    case 'sideways':
      return { x: facing === 1 ? shoulderX : shoulderX - l, y: shoulderY - t / 2, w: l, h: t };
    case 'back':
      return { x: facing === 1 ? shoulderX - l : shoulderX, y: shoulderY - t / 2, w: l, h: t };
    case 'crouch':
      // Hangs low in front of the boss, shorter than the 'down' arm, as if the boss is gathering itself to spring.
      return { x: shoulderX + facing * 20 - t / 2, y: shoulderY + 30, w: t, h: l * 0.6 };
  }
}

export const BOSS_COLORS = {
  ember: LOOK.bossBodyEmber,
  stagger: LOOK.bossStaggerBody,
  power: LOOK.bossPowerGlow,
  gold: LOOK.bossCounterGlow,
  red: LOOK.bossDodgeGlow,
};

export interface BossLook {
  body: string;
  /** The colour of the glow around the boss, or null for none. */
  glow: string | null;
}

/**
 * How the boss looks right now: gold glow while a counterable attack winds up or is active, red for a
 * must-dodge one, blue when staggered, white while powering up between phases.
 */
export function bossLook(b: BossState, boss: BossDef): BossLook {
  const base = moodFor(boss.id).bodyColor;
  if (b.mode === 'transition') return { body: base, glow: BOSS_COLORS.power };
  if (b.mode === 'stagger') return { body: BOSS_COLORS.stagger, glow: null };
  if (b.mode === 'attack' && b.attackId !== null) {
    const attack = boss.attacks.find((a) => a.id === b.attackId);
    if (attack !== undefined && b.attackTick < attack.windup + attack.active) {
      return {
        body: base,
        glow: attack.class === 'counterable' ? BOSS_COLORS.gold : BOSS_COLORS.red,
      };
    }
  }
  return { body: base, glow: null };
}

/**
 * The boss body's vertical extent. A boss crouching to spring (a crouch-pose attack still winding up on the floor)
 * is 25% shorter; otherwise it is drawn `lift` units above the floor.
 */
export function bossDrawBox(b: BossState, boss: BossDef): { top: number; height: number; crouching: boolean } {
  const attack =
    b.mode === 'attack' && b.attackId !== null ? boss.attacks.find((a) => a.id === b.attackId) : undefined;
  const crouching =
    attack !== undefined && attack.pose === 'crouch' && b.lift === 0 && b.attackTick < attack.windup;
  const height = crouching ? boss.height * 0.75 : boss.height;
  return { top: WORLD.floorY - height - b.lift, height, crouching };
}

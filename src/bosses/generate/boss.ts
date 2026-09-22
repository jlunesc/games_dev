import { nextRandom } from '../../game/rng';
import { parseBoss } from '../parse';
import type { AttackDef, BossDef, PhaseAttack } from '../schema';
import { generateArena } from './arena';
import { generateAttack } from './attack';
import { GEN } from './tuning';

/** Mixed into `seed` so the generator has its own stream, never a gameplay `rng`'s. */
const SEED_MIX = 0x51ed270b;

/** Draws a uniform float in `[min, max]` and advances the stream. */
function uniform(state: number, min: number, max: number): { value: number; state: number } {
  const draw = nextRandom(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/** Draws a uniform integer in `[min, max]` and advances the stream. */
function uniformInt(state: number, min: number, max: number): { value: number; state: number } {
  const draw = uniform(state, min, max);
  return { value: Math.round(draw.value), state: draw.state };
}

/**
 * Builds a whole randomized `BossDef` from `seed`, deterministic in `seed` alone. Mixes `seed`
 * into its own stream (never a gameplay `rng`'s) so calling this never advances a fight's random
 * draws. The assembled boss is run through `parseBoss` before being returned, so a bad draw
 * fails loudly here rather than producing an unparseable file.
 */
export function generateBoss(seed: number): BossDef {
  let s = (seed ^ SEED_MIX) >>> 0;

  const countDraw = uniformInt(s, GEN.attackCountMin, GEN.attackCountMax);
  s = countDraw.state;
  const attackCount = countDraw.value;

  const counterableDraw = uniformInt(s, 0, attackCount - 1);
  s = counterableDraw.state;
  const counterableIndex = counterableDraw.value;

  const attacks: AttackDef[] = [];
  for (let i = 0; i < attackCount; i++) {
    const draw = generateAttack(s, `attack-${i}`, i === counterableIndex);
    s = draw.state;
    attacks.push(draw.value);
  }
  const counterableAttack = attacks[counterableIndex]!;

  const widthDraw = uniformInt(s, GEN.bodyMin, GEN.bodyMax);
  s = widthDraw.state;
  const heightDraw = uniformInt(s, GEN.bodyMin, GEN.bodyMax);
  s = heightDraw.state;

  const maxHpDraw = uniformInt(s, GEN.maxHpMin, GEN.maxHpMax);
  s = maxHpDraw.state;

  const spacingMinDraw = uniformInt(s, GEN.spacingMinMin, GEN.spacingMinMax);
  s = spacingMinDraw.state;
  const spacing = { min: spacingMinDraw.value, max: spacingMinDraw.value + GEN.spacingSpan };

  const approachTimeoutDraw = uniformInt(s, GEN.approachTimeoutMin, GEN.approachTimeoutMax);
  s = approachTimeoutDraw.state;

  const predictabilityDraw = uniform(s, GEN.predictabilityMin, GEN.predictabilityMax);
  s = predictabilityDraw.state;

  const counterWindowDraw = uniformInt(s, GEN.counterWindowMin, GEN.counterWindowMax);
  s = counterWindowDraw.state;
  const counterRangeDraw = uniform(s, GEN.counterRangeMin, GEN.counterRangeMax);
  s = counterRangeDraw.state;
  const staggerTicksDraw = uniformInt(s, GEN.staggerTicksMin, GEN.staggerTicksMax);
  s = staggerTicksDraw.state;

  const gapDraw = uniformInt(s, GEN.gapMin, GEN.gapMax);
  s = gapDraw.state;
  const maxChainDraw = uniformInt(s, GEN.maxChainMin, GEN.maxChainMax);
  s = maxChainDraw.state;
  const chainChanceDraw = uniform(s, 0, GEN.chainChanceMax);
  s = chainChanceDraw.state;

  const walkSpeedDraw = uniform(s, GEN.walkSpeedMin, GEN.walkSpeedMax);
  s = walkSpeedDraw.state;
  const retreatSpeedDraw = uniform(s, GEN.walkSpeedMin, GEN.walkSpeedMax);
  s = retreatSpeedDraw.state;

  const phaseAttacks: PhaseAttack[] = attacks.map((a) => ({ id: a.id, weight: 1 }));

  const arenaDraw = generateArena(s);
  s = arenaDraw.state;

  // Bosses ignore the arena physically (M5c simplification), so a piece taller than every attack's
  // hit window would be a permanent safe spot. Guarantee at least one attack can always reach the
  // tallest piece, rather than leaving it to chance — deterministic, no new random draw.
  const pieces = arenaDraw.value === undefined
    ? []
    : [...arenaDraw.value.platforms, ...arenaDraw.value.covers];
  const tallestPiece = pieces.length === 0 ? 0 : Math.max(...pieces.map((p) => p.height));
  if (tallestPiece > 0) {
    let tallestHit = attacks[0]!.hits[0]!;
    let tallestHitAttack = attacks[0]!;
    for (const a of attacks) {
      for (const h of a.hits) {
        if (h.top > tallestHit.top) {
          tallestHit = h;
          tallestHitAttack = a;
        }
      }
    }
    if (tallestHit.top <= tallestPiece) {
      tallestHit.top = tallestPiece + 10;
    }
    // Also guarantee the same hit box reaches all the way across its own attack's trigger range,
    // not just up: a camping player is stationary, so the boss can trigger this attack from
    // anywhere up to range.max away, and the hit box needs to actually reach that far.
    if (tallestHit.x1 < tallestHitAttack.range.max + 60) {
      tallestHit.x1 = tallestHitAttack.range.max + 60;
    }
  }

  const boss = {
    id: 'generated',
    name: 'Generated Boss',
    width: widthDraw.value,
    height: heightDraw.value,
    startX: 960,
    maxHp: maxHpDraw.value,
    spacing,
    approachTimeout: approachTimeoutDraw.value,
    predictability: predictabilityDraw.value,
    counter: {
      window: Math.min(counterWindowDraw.value, counterableAttack.windup),
      range: counterRangeDraw.value,
      staggerTicks: staggerTicksDraw.value,
      damageMultiplier: 2,
    },
    transitionTicks: 60,
    attacks,
    phases: [
      {
        name: 'Only phase',
        startsAtHpFraction: 1,
        attacks: phaseAttacks,
        gap: gapDraw.value,
        maxChain: maxChainDraw.value,
        chainChance: chainChanceDraw.value,
        walkSpeed: walkSpeedDraw.value,
        retreatSpeed: retreatSpeedDraw.value,
      },
    ],
    ...(arenaDraw.value === undefined ? {} : { arena: arenaDraw.value }),
  };

  return parseBoss(boss);
}

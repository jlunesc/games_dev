import { describe, expect, it } from 'vitest';
import {
  ASHEN_HOUND,
  BRASS_SENTINEL,
  CINDER_GOLEM,
  GALE_REAVER,
  QUILL_WARDEN,
  TRAINEE,
  VEIL_DANCER,
} from '../src/bosses';
import { DIALS, applyDials, presetDials, type Dials, type PresetId } from '../src/game/difficulty';
import type { BossDef } from '../src/bosses/schema';

/** The six single-phase bosses that got a second phase: the twist each one carries, as the design promises it. */
const EXPECTED: { boss: BossDef; twin: string | null; of: string | null; combo: [string, string] | null }[] = [
  { boss: ASHEN_HOUND, twin: 'snap-rush', of: 'rush', combo: null },
  { boss: BRASS_SENTINEL, twin: 'long-sweep', of: 'wide-sweep', combo: null },
  { boss: CINDER_GOLEM, twin: null, of: null, combo: ['crag-slam', 'fault-slam'] },
  { boss: GALE_REAVER, twin: 'held-cyclone', of: 'gale-cyclone', combo: null },
  { boss: QUILL_WARDEN, twin: 'far-thrust', of: 'reaching-poke', combo: null },
  { boss: VEIL_DANCER, twin: null, of: null, combo: ['piercing-veil', 'shadow-cut'] },
];

describe('the second phase of the six bosses that gained one', () => {
  for (const { boss, twin, of, combo } of EXPECTED) {
    describe(boss.name, () => {
      const [first, second] = boss.phases;

      it('has two phases and the second starts at half health', () => {
        expect(boss.phases).toHaveLength(2);
        expect(second!.startsAtHpFraction).toBe(0.5);
      });

      it('keeps every attack of the first phase and adds only its twist', () => {
        const firstIds = first!.attacks.map((a) => a.id);
        const secondIds = second!.attacks.map((a) => a.id);
        expect(secondIds.slice(0, firstIds.length)).toEqual(firstIds.slice(0, firstIds.length));
        for (const id of firstIds) expect(secondIds).toContain(id);
        expect(secondIds.length).toBe(firstIds.length + (twin === null ? 0 : 1));
        // The twin is not in the first phase: the study never shows it.
        if (twin !== null) expect(firstIds).not.toContain(twin);
      });

      it('names every attack of both phases in the boss attack list', () => {
        const known = new Set(boss.attacks.map((a) => a.id));
        for (const phase of boss.phases) for (const a of phase.attacks) expect(known.has(a.id)).toBe(true);
      });

      it('waits less between attacks, and moves faster, than the first phase', () => {
        expect(second!.gap).toBeLessThan(first!.gap);
        expect(second!.gap).toBeGreaterThanOrEqual(20);
        expect(second!.walkSpeed).toBeGreaterThan(first!.walkSpeed);
        expect(second!.maxChain).toBeGreaterThanOrEqual(first!.maxChain);
        expect(second!.chainChance).toBeGreaterThanOrEqual(0.35);
      });

      it('opens with its twist (or follows up with a combo) and gives it extra weight', () => {
        if (twin !== null) {
          expect(second!.opening).toBe(twin);
          const w = second!.attacks.find((a) => a.id === twin)!.weight;
          expect(w).toBeGreaterThan(Math.max(...first!.attacks.map((a) => a.weight)) - 1);
        } else {
          expect(second!.opening).toBeUndefined();
          expect(second!.combos).toContainEqual(combo);
        }
      });

      if (twin !== null && of !== null) {
        it(`${twin} is a copy of ${of} changed one way`, () => {
          const a = boss.attacks.find((x) => x.id === of)!;
          const b = boss.attacks.find((x) => x.id === twin)!;
          expect(b.class).toBe(a.class);
          expect(b.damage).toBe(a.damage);
          const shorter = b.windup < a.windup;
          const longer = JSON.stringify(b.hits) !== JSON.stringify(a.hits) || b.range.max > a.range.max;
          const held = b.hold !== undefined && a.hold === undefined;
          expect([shorter, longer, held].filter(Boolean).length).toBeGreaterThanOrEqual(1);
        });
      }

      it('survives every difficulty preset and the extreme dials', () => {
        for (const preset of ['easy', 'normal', 'hard'] as PresetId[]) {
          expect(() => applyDials(boss, presetDials(preset))).not.toThrow();
        }
        for (const extreme of ['min', 'max'] as const) {
          const dials = Object.fromEntries(DIALS.map((d) => [d.id, extreme === 'min' ? d.min : d.max])) as Dials;
          expect(() => applyDials(boss, dials)).not.toThrow();
        }
      });
    });
  }

  it('leaves the Trainee with one phase', () => {
    expect(TRAINEE.phases).toHaveLength(1);
  });
});

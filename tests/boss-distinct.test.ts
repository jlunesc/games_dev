import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses';
import type { AttackDef } from '../src/bosses/schema';

/** What an attack asks of the player, in one word. A move with no hit box is a slip (a fake or a retreat), not a dash. A low bolt (height 0) is its own kind: it is answered by a jump, not a sidestep. */
function kinds(a: AttackDef): string[] {
  const out: string[] = [];
  if (a.dive !== undefined) out.push('dive');
  if (a.leap !== undefined) out.push('leap');
  if (a.blink !== undefined) out.push('blink');
  if (a.move !== undefined && a.leap === undefined && a.dive === undefined) out.push(a.hits.length > 0 ? 'dash' : 'slip');
  for (const s of a.shots ?? []) out.push(s.kind === 'bolt' && s.height === 0 ? 'lowBolt' : s.kind);
  return out.length > 0 ? out : ['melee'];
}

const reach = (a: AttackDef): number => Math.max(0, ...a.hits.map((h) => h.x1));

/** Near-copies (same kind, pose and class, wind-up within 6 updates, reach within 35%) between different bosses after Rounds 2 and 3. Lower it as later rounds remove more; never raise it. */
const CEILING = 12;

const roster = BOSSES.map((b) => ({ id: b.id, attacks: b.attacks }));

describe('every boss is distinct', () => {
  it('no special kind of attack is on more than three bosses', () => {
    const owners = new Map<string, Set<string>>();
    for (const b of roster) {
      for (const a of b.attacks) {
        for (const k of kinds(a)) {
          if (k === 'melee') continue;
          if (!owners.has(k)) owners.set(k, new Set());
          owners.get(k)!.add(b.id);
        }
      }
    }
    for (const [kind, ids] of owners) expect(ids.size, `${kind}: ${[...ids].join(', ')}`).toBeLessThanOrEqual(3);
  });

  it('no boss has two attacks that are the same to the player', () => {
    for (const b of roster) {
      const seen = new Set<string>();
      for (const a of b.attacks) {
        const key = `${kinds(a).join('+')}|${a.pose}|${a.class}|${Math.round(a.windup / 6)}`;
        expect(seen.has(key), `${b.id}: ${a.id} looks like another attack of the same boss`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('few attacks on different bosses are near-copies of each other', () => {
    const near: string[] = [];
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        for (const a of roster[i]!.attacks) {
          for (const c of roster[j]!.attacks) {
            const ra = reach(a);
            const rc = reach(c);
            const closeReach = Math.abs(ra - rc) <= 0.35 * Math.max(ra, rc, 1);
            if (kinds(a).join() === kinds(c).join() && a.pose === c.pose && a.class === c.class && Math.abs(a.windup - c.windup) <= 6 && closeReach) {
              near.push(`${roster[i]!.id}:${a.id} ~ ${roster[j]!.id}:${c.id}`);
            }
          }
        }
      }
    }
    expect(near.length, near.join('\n')).toBeLessThanOrEqual(CEILING);
  });
});

import { describe, expect, it } from 'vitest';
import { ASHEN_HOUND, BOSSES, EMBER_DUELIST, VESPER_SAGE } from '../src/bosses';
import type { AttackDef } from '../src/bosses/schema';
import { asFight, makeFight, type FightDef } from '../src/game/fight';
import {
  createInitialState,
  type ArcState,
  type BoltState,
  type BossState,
  type EruptionState,
  type GameEvent,
  type GameState,
  type ShotState,
} from '../src/game/state';
import { attackStarted, cuesFor, hitPitch, type Cue } from '../src/ui/sound/cues';
import { PAIR_PAN, POSE_PITCH, PRIORITY, SHOT_PASS } from '../src/ui/sound/tuning';

const fight = asFight(EMBER_DUELIST);
const idle = (f: FightDef = fight): GameState => createInitialState(f, 1);
const withEvents = (events: GameEvent[], base: GameState = idle()): GameState => ({ ...base, events });
const voices = (cues: Cue[]): string[] => cues.map((c) => c.voice);
const fromEvents = (events: GameEvent[]): string[] => voices(cuesFor(idle(), withEvents(events), fight));

function withBoss(state: GameState, index: number, patch: Partial<BossState>): GameState {
  if (index === 0) return { ...state, boss: { ...state.boss, ...patch } };
  return { ...state, partners: state.partners.map((p, i) => (i === index - 1 ? { ...p, ...patch } : p)) };
}

const attacking = (state: GameState, attack: AttackDef, tick: number, index = 0): GameState =>
  withBoss(state, index, { mode: 'attack', attackId: attack.id, attackTick: tick });

/** The cues when boss 0 of `f` reaches `tick` of `attack` (tick 0 means the attack has just begun). */
function atTick(f: FightDef, attack: AttackDef, tick: number): Cue[] {
  const base = idle(f);
  const before = tick === 0 ? base : attacking(base, attack, tick - 1);
  return cuesFor(before, attacking(base, attack, tick), f);
}

describe('cues from the game events', () => {
  it('gives no sound for a quiet update', () => {
    expect(fromEvents([])).toEqual([]);
  });

  it('maps each event to its sound', () => {
    expect(fromEvents(['bossHit'])).toEqual(['hit']);
    expect(fromEvents(['playerHit'])).toEqual(['playerHurt']);
    expect(fromEvents(['studyHit'])).toEqual(['studyHit']);
    expect(fromEvents(['dash'])).toEqual(['dash']);
    expect(fromEvents(['counter'])).toEqual(['counter']);
    expect(fromEvents(['phaseChange'])).toEqual(['phaseChange']);
    expect(fromEvents(['playerDefeated'])).toEqual(['defeat']);
    expect(fromEvents(['bossDefeated'])).toEqual(['fall']);
  });

  it('gives the killing blow the defeat sound only, not the buzzing hurt sound as well', () => {
    expect(fromEvents(['playerHit', 'playerDefeated'])).toEqual(['defeat']);
  });

  it('merges identical cues, so two boss events in one update do not double up', () => {
    expect(fromEvents(['bossDefeated', 'bossDown'])).toEqual(['fall']);
    expect(fromEvents(['bossHit', 'bossHit'])).toEqual(['hit']);
  });

  it('orders cues by priority, the most important first', () => {
    expect(fromEvents(['dash', 'bossHit', 'playerHit'])).toEqual(['playerHurt', 'hit', 'dash']);
    const [first] = cuesFor(idle(), withEvents(['playerHit']), fight);
    expect(first!.priority).toBe(PRIORITY.playerHurt);
  });

  it('varies the boss hit pitch with the tick, within eight percent, deterministically', () => {
    const seen = new Set<number>();
    for (let tick = 0; tick < 40; tick++) {
      const pitch = hitPitch(tick);
      expect(pitch).toBeGreaterThanOrEqual(0.919);
      expect(pitch).toBeLessThanOrEqual(1.081);
      expect(hitPitch(tick)).toBe(pitch);
      seen.add(pitch);
    }
    expect(seen.size).toBeGreaterThan(3);
    const [cue] = cuesFor(idle(), { ...withEvents(['bossHit']), tick: 5 }, fight);
    expect(cue!.pitch).toBe(hitPitch(5));
  });
});

describe('when an attack starts', () => {
  it('spots a new attack, a changed attack and a restarted attack, but not a running one', () => {
    const attack = EMBER_DUELIST.attacks[0]!;
    const other = EMBER_DUELIST.attacks[1]!;
    const base = idle().boss;
    const running = { ...base, mode: 'attack' as const, attackId: attack.id, attackTick: 5 };
    expect(attackStarted(base, { ...running, attackTick: 0 })).toBe(true);
    expect(attackStarted(running, { ...running, attackId: other.id, attackTick: 6 })).toBe(true);
    expect(attackStarted(running, { ...running, attackTick: 0 })).toBe(true);
    expect(attackStarted(running, { ...running, attackTick: 6 })).toBe(false);
    expect(attackStarted(base, base)).toBe(false);
  });

  it('gives every attack of every boss its warning and a signature, using the real boss files', () => {
    for (const boss of BOSSES) {
      const f = asFight(boss);
      for (const attack of boss.attacks) {
        const played = voices(atTick(f, attack, 0));
        const warning = attack.class === 'counterable' ? 'warningGold' : 'warningRed';
        const signature = attack.shots !== undefined && attack.shots.length > 0 ? 'charge' : 'swell';
        expect(played, `${boss.id} ${attack.id}`).toContain(warning);
        expect(played, `${boss.id} ${attack.id}`).toContain(signature);
      }
    }
  });

  it('pitches the swell by the pose', () => {
    const attack = EMBER_DUELIST.attacks.find((a) => a.shots === undefined)!;
    const swell = atTick(fight, attack, 0).find((c) => c.voice === 'swell')!;
    expect(swell.pitch).toBe(POSE_PITCH[attack.pose]);
    expect(POSE_PITCH.raised).toBeGreaterThan(POSE_PITCH.sideways);
    expect(POSE_PITCH.sideways).toBeGreaterThan(POSE_PITCH.down);
    expect(POSE_PITCH.back).toBeGreaterThan(POSE_PITCH.crouch);
  });

  it('plays a strike when the wind-up ends for an attack that has hit windows, once', () => {
    for (const boss of BOSSES) {
      const f = asFight(boss);
      for (const attack of boss.attacks) {
        const at = voices(atTick(f, attack, attack.windup));
        const before = voices(atTick(f, attack, attack.windup - 1));
        const after = voices(atTick(f, attack, attack.windup + 1));
        if (attack.hits.length > 0) {
          expect(at, `${boss.id} ${attack.id}`).toContain('strike');
        } else {
          expect(at, `${boss.id} ${attack.id}`).not.toContain('strike');
        }
        expect(before).not.toContain('strike');
        expect(after).not.toContain('strike');
      }
    }
  });

  it('plays a whoosh when a move begins', () => {
    let seen = 0;
    for (const boss of BOSSES) {
      const f = asFight(boss);
      for (const attack of boss.attacks) {
        if (attack.move === undefined) continue;
        seen += 1;
        expect(voices(atTick(f, attack, attack.move.from)), `${boss.id} ${attack.id}`).toContain('whoosh');
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('leaps and dives', () => {
  it('plays a launch at take-off and a slam on landing, but no slam for a leap cut short by a counter', () => {
    const base = idle();
    const takeoff = cuesFor(
      withBoss(base, 0, { leapFromX: null, leapToX: null }),
      withBoss(base, 0, { leapFromX: 100, leapToX: 300, lift: 20 }),
      fight,
    );
    expect(voices(takeoff)).toContain('leapUp');
    expect(voices(takeoff)).not.toContain('diveDown');
    const landing = cuesFor(
      withBoss(base, 0, { mode: 'attack', leapFromX: 100, leapToX: 300, lift: 6 }),
      withBoss(base, 0, { mode: 'attack', leapFromX: null, leapToX: null, lift: 0 }),
      fight,
    );
    expect(voices(landing)).toContain('slam');
    const cut = cuesFor(
      withBoss(base, 0, { mode: 'attack', leapFromX: 100, leapToX: 300, lift: 60 }),
      withBoss(base, 0, { mode: 'stagger', leapFromX: null, leapToX: null, lift: 0 }),
      fight,
    );
    expect(voices(cut)).not.toContain('slam');
  });

  it('plays a falling whistle when a dive begins', () => {
    const base = idle();
    const dive = cuesFor(
      withBoss(base, 0, { leapFromX: null, diveFromLift: null }),
      withBoss(base, 0, { leapFromX: 100, leapToX: 300, diveFromLift: 200 }),
      fight,
    );
    expect(voices(dive)).toContain('diveDown');
    expect(voices(dive)).not.toContain('leapUp');
  });
});

describe('shots', () => {
  const owner = { attackId: 'shoot', originTick: 0, lift: 0 };
  const bolt = (x: number): BoltState => ({ ...owner, kind: 'bolt', x, dir: 1, originX: x, size: 20, speed: 300, climb: 0 });
  const arc = (age: number): ArcState => ({
    ...owner,
    kind: 'arc',
    x: 300,
    age,
    flight: 10,
    fromX: 100,
    toX: 300,
    launchLift: 0,
    peak: 120,
    radius: 30,
    burst: 6,
  });
  const eruption = (age: number): EruptionState => ({ ...owner, kind: 'eruption', x: 300, age, width: 80, delay: 20, burst: 8 });
  const played = (before: ShotState[], after: ShotState[], playerX = 0): string[] => {
    const b = idle();
    const player = { ...b.player, x: playerX };
    const a = { ...idle(), shots: after, player };
    return voices(cuesFor({ ...b, shots: before, player }, a, fight));
  };

  it('plays a launch for each new shot by kind, and not again while it flies', () => {
    expect(played([], [bolt(900)])).toContain('shotLaunch');
    expect(played([], [arc(0)])).toContain('arcLaunch');
    expect(played([], [eruption(0)])).toContain('eruptionMark');
    expect(played([bolt(900)], [bolt(880)])).not.toContain('shotLaunch');
  });

  it('plays a landing when an arc reaches the end of its flight, and a blast when an eruption goes off', () => {
    expect(played([arc(9)], [arc(10)])).toContain('arcLand');
    expect(played([arc(8)], [arc(9)])).not.toContain('arcLand');
    expect(played([eruption(19)], [eruption(20)])).toContain('eruptionBlast');
    expect(played([eruption(18)], [eruption(19)])).not.toContain('eruptionBlast');
  });

  it('plays a quiet pass-by when a bolt comes near the player, panned to its side, only once', () => {
    const near = SHOT_PASS.range - 10;
    const right = cuesFor(
      { ...idle(), shots: [bolt(1000)] },
      { ...idle(), shots: [bolt(near)], player: { ...idle().player, x: 0 } },
      fight,
    ).find((c) => c.voice === 'boltPass');
    expect(right?.pan).toBe(SHOT_PASS.pan);
    const left = cuesFor(
      { ...idle(), shots: [bolt(-1000)] },
      { ...idle(), shots: [bolt(-near)], player: { ...idle().player, x: 0 } },
      fight,
    ).find((c) => c.voice === 'boltPass');
    expect(left?.pan).toBe(-SHOT_PASS.pan);
    expect(played([bolt(near)], [bolt(near - 5)])).not.toContain('boltPass');
  });
});

describe('a pair fight', () => {
  const pair = makeFight([ASHEN_HOUND, VESPER_SAGE]);

  it('pans each boss to its own side and leaves a one-boss fight centred', () => {
    const hound = ASHEN_HOUND.attacks[0]!;
    const sage = VESPER_SAGE.attacks[0]!;
    const base = idle(pair);
    const left = cuesFor(base, attacking(base, hound, 0, 0), pair);
    const right = cuesFor(base, attacking(base, sage, 0, 1), pair);
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((c) => c.pan === -PAIR_PAN)).toBe(true);
    expect(right.length).toBeGreaterThan(0);
    expect(right.every((c) => c.pan === PAIR_PAN)).toBe(true);
    const single = atTick(fight, EMBER_DUELIST.attacks[0]!, 0);
    expect(single.every((c) => c.pan === undefined)).toBe(true);
  });

  it('pans a hit to the boss that was struck', () => {
    const base = idle(pair);
    const after = withEvents(['bossHit'], withBoss(base, 1, { hp: base.partners[0]!.hp - 5 }));
    const hit = cuesFor(base, after, pair).find((c) => c.voice === 'hit');
    expect(hit?.pan).toBe(PAIR_PAN);
  });
});

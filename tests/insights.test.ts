import { describe, expect, it } from 'vitest';
import { analyzeRun, type Analysis, type AttackOccurrence, type PunishWindow } from '../src/stats/analyze';
import { classifyHit, insightsFor } from '../src/stats/insights';
import { standAt } from './boss-helpers';
import { QUIET_BOSS, withInput } from './helpers';

/** A real Analysis of a one-update fight, used as the base that each test overrides. */
const empty: Analysis = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), [withInput({})]);

// Warning 30 updates (100 to 130). Late means margin <= 6, early means reaction <= 7.5 (so 7 or less).
const hit = (over: Partial<AttackOccurrence> = {}): AttackOccurrence => ({
  attackId: 'slam',
  boss: 0,
  phase: 1,
  startTick: 100,
  windupTicks: 30,
  firstDangerTick: 130,
  distance: 120,
  playerActionAtStart: 'idle',
  outcome: 'hit',
  evasion: null,
  reactionTicks: null,
  reactionMs: null,
  marginTicks: null,
  marginMs: null,
  damageTaken: 1,
  playerActionWhenHit: 'idle',
  study: false,
  shotsFired: 0,
  swingAtDanger: false,
  ...over,
});

/** A hit after a dodge action begun `reaction` updates after the warning began. */
const dodgedHit = (reaction: number, over: Partial<AttackOccurrence> = {}): AttackOccurrence =>
  hit({ reactionTicks: reaction <= 30 ? reaction : null, marginTicks: 30 - reaction, ...over });

const withAttacks = (attacks: AttackOccurrence[], over: Partial<Analysis> = {}): Analysis => ({
  ...empty,
  attacks,
  ...over,
});

const windowOf = (over: Partial<PunishWindow> = {}): PunishWindow => ({
  attackId: 'slam',
  boss: 0,
  startTick: 200,
  ticks: 30,
  distanceAtOpen: 100,
  closestDistance: 100,
  swung: false,
  hit: false,
  reachable: true,
  ...over,
});

const withWindows = (windows: PunishWindow[], over: Partial<Analysis['behavior']> = {}): Analysis => ({
  ...empty,
  bossMaxHp: 100,
  damageDealt: 20,
  swingsThatHit: 4,
  behavior: {
    ...empty.behavior,
    punish: {
      opened: windows.length,
      taken: windows.filter((w) => w.hit).length,
      missed: windows.filter((w) => !w.hit).length,
      windows,
    },
    ...over,
  },
});

describe('classifyHit', () => {
  it('late: a dodge that began in the last 20% of the warning, edge included', () => {
    expect(classifyHit(dodgedHit(24))).toBe('late'); // margin 6 of 30 = exactly 20%
    expect(classifyHit(dodgedHit(23))).toBe('other'); // margin 7
  });
  it('late: a dodge that began after the danger (negative margin)', () => {
    expect(classifyHit(dodgedHit(33))).toBe('late');
  });
  it('early: a dodge that began in the first 25% of the warning, edge included, and still hit', () => {
    expect(classifyHit(dodgedHit(7))).toBe('early'); // 7 of 30 = 23%
    expect(classifyHit(dodgedHit(8))).toBe('other'); // 27%
  });
  it('no dodge: no dash or jump made; greedy when a swing was going at the danger', () => {
    expect(classifyHit(hit())).toBe('no-dodge');
    expect(classifyHit(hit({ swingAtDanger: true }))).toBe('greedy');
  });
  it('a dodge action wins over a swing at the danger', () => {
    expect(classifyHit(dodgedHit(26, { swingAtDanger: true }))).toBe('late');
  });
});

describe('insightsFor: dodging', () => {
  it('reports late dodges with their attacks and cost (health lost over max health)', () => {
    const a = withAttacks([
      dodgedHit(26, { attackId: 'sweep' }),
      dodgedHit(27, { attackId: 'slam' }),
      dodgedHit(25, { attackId: 'sweep' }),
    ]);
    expect(insightsFor(a)).toEqual([
      { skill: 'dodge-late', cost: 3 / 5, attackIds: ['sweep', 'slam'], hits: 3 },
    ]);
  });

  it('needs at least two hits of a kind', () => {
    expect(insightsFor(withAttacks([dodgedHit(26)]))).toEqual([]);
  });

  it('ignores hits in the study and attacks that did not hit', () => {
    const a = withAttacks([
      dodgedHit(26, { study: true }),
      dodgedHit(26, { study: true }),
      hit({ outcome: 'dodged', evasion: 'dash', damageTaken: 0 }),
    ]);
    expect(insightsFor(a)).toEqual([]);
  });

  it('ranks by cost, highest first, keeps three, and breaks ties by the skill order', () => {
    const a = withAttacks([
      dodgedHit(3, { damageTaken: 2 }),
      dodgedHit(4, { damageTaken: 2 }), // early: cost 4/5
      dodgedHit(26),
      dodgedHit(27),
      dodgedHit(25), // late: cost 3/5
      hit(),
      hit(), // no-dodge: cost 2/5
      dodgedHit(12),
      dodgedHit(13), // other: cost 2/5, same as no-dodge
    ]);
    const skills = insightsFor(a).map((i) => i.skill);
    expect(skills).toEqual(['dodge-early', 'dodge-late', 'dodge-other']);
  });
});

describe('insightsFor: greedy swings', () => {
  it('reports a swing that was still going when the attack hurt', () => {
    const a = withAttacks([hit({ swingAtDanger: true }), hit({ swingAtDanger: true, attackId: 'sweep' })], {
      behavior: { ...empty.behavior, greedySwings: 3, greedyHits: 2 },
    });
    expect(insightsFor(a)).toEqual([
      { skill: 'greedy-swing', cost: 2 / 5, attackIds: ['slam', 'sweep'], swings: 3, hurt: 2 },
    ]);
  });

  it('shows nothing when the greedy swings cost no health (cost 0)', () => {
    const a = withAttacks([hit({ outcome: 'dodged', evasion: 'distance', damageTaken: 0, swingAtDanger: true })], {
      behavior: { ...empty.behavior, greedySwings: 3, greedyHits: 0 },
    });
    expect(insightsFor(a)).toEqual([]);
  });
});

describe('insightsFor: openings and approach', () => {
  it('missed openings where the player was close enough are the openings skill', () => {
    const a = withWindows([windowOf({ hit: true, swung: true }), windowOf(), windowOf({ attackId: 'sweep' })]);
    // 2 missed, each worth 20 / 4 = 5 damage of 100 => cost 0.1
    expect(insightsFor(a)).toEqual([
      { skill: 'openings', cost: 0.1, attackIds: ['slam', 'sweep'], opened: 3, taken: 1, closeButMissed: 2 },
    ]);
  });

  it('missed openings the player could not reach are the approach skill, with the distance numbers', () => {
    const a = withWindows(
      [windowOf({ reachable: false }), windowOf({ reachable: false, attackId: 'sweep' }), windowOf({ hit: true })],
      { realMeanDistance: 312.4, realUpdatesInReach: 60 },
    );
    const found = insightsFor({ ...a, ticks: 600, study: { ...a.study, ticks: 0 } });
    expect(found).toEqual([
      {
        skill: 'approach',
        cost: 0.1,
        attackIds: ['slam', 'sweep'],
        opened: 3,
        tooFar: 2,
        meanDistance: 312.4,
        inReachPercent: 10,
      },
    ]);
  });

  it('needs three openings before the rate is judged, and two missed of one cause', () => {
    expect(insightsFor(withWindows([windowOf(), windowOf()]))).toEqual([]);
    expect(insightsFor(withWindows([windowOf(), windowOf({ hit: true }), windowOf({ hit: true })]))).toEqual([]);
  });

  it('counts 1 damage per missed opening when the player never landed a hit', () => {
    const a = { ...withWindows([windowOf(), windowOf(), windowOf()]), swingsThatHit: 0, damageDealt: 0 };
    const [found] = insightsFor(a);
    expect(found!.cost).toBeCloseTo(3 / 100);
  });
});

describe('insightsFor: old analyses and quiet fights', () => {
  it('skips the skills that need version 7 fields', () => {
    const old = { ...withAttacks([hit(), hit(), dodgedHit(26), dodgedHit(27)]), dashUse: undefined } as unknown as Analysis;
    expect(insightsFor(old).map((i) => i.skill)).toEqual(['dodge-late']);
  });

  it('a fight with nothing in it gives no insights', () => {
    expect(insightsFor(empty)).toEqual([]);
  });
});

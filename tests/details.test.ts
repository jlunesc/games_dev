import { describe, expect, it } from 'vitest';
import { analyzeRun, type Analysis, type AttackOccurrence, type PunishWindow } from '../src/stats/analyze';
import type { FightDef } from '../src/game/fight';
import { fightDetails, harmlessAttacks } from '../src/stats/details';
import type { DodgeRating } from '../src/stats/dodges';
import { resolveFight } from '../src/bosses/resolve';
import { standAt } from './boss-helpers';
import { QUIET_BOSS, withInput } from './helpers';

/** A real Analysis of a one-update fight, used as the base that each test overrides. */
const empty: Analysis = analyzeRun(QUIET_BOSS, standAt(QUIET_BOSS, 300), [withInput({})]);

const attack = (over: Partial<AttackOccurrence> = {}): AttackOccurrence => ({
  attackId: 'slam',
  boss: 0,
  phase: 1,
  startTick: 100,
  windupTicks: 30,
  firstDangerTick: 130,
  distance: 120,
  playerActionAtStart: 'idle',
  outcome: 'dodged',
  evasion: 'distance',
  reactionTicks: null,
  reactionMs: null,
  marginTicks: null,
  marginMs: null,
  damageTaken: 0,
  playerActionWhenHit: null,
  study: false,
  shotsFired: 0,
  swingAtDanger: false,
  ...over,
});

const window = (over: Partial<PunishWindow> = {}): PunishWindow => ({
  attackId: 'slam',
  boss: 0,
  startTick: 200,
  ticks: 30,
  distanceAtOpen: 100,
  closestDistance: 100,
  swung: false,
  hit: false,
  replyTicks: null,
  hitTicks: null,
  reachable: true,
  ...over,
});

const many = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));

/** A fight of 60 seconds with no study and nothing in it, to be overridden. */
const base = (over: Partial<Analysis> = {}, behavior: Partial<Analysis['behavior']> = {}): Analysis => ({
  ...empty,
  ticks: 3600,
  seconds: 60,
  fightSeconds: 60,
  study: { rounds: 0, ticks: 0, attacks: 0, hits: 0 },
  attacks: [],
  swingTicks: [],
  dashTicks: [],
  jumpTicks: [],
  bossHitTicks: [],
  playerHitTicks: [],
  ...over,
  behavior: { ...empty.behavior, updatesClose: 0, updatesMid: 0, updatesFar: 0, studyUpdatesClose: 0, studyUpdatesMid: 0, studyUpdatesFar: 0, ...behavior },
});

const withWindows = (windows: PunishWindow[], over: Partial<Analysis> = {}): Analysis =>
  base(over, { punish: { opened: windows.length, taken: windows.filter((w) => w.hit).length, missed: windows.filter((w) => !w.hit).length, windows } });

describe('attacks avoided', () => {
  it('counts dodged and countered attacks against hits, and leaves out interrupted and study ones', () => {
    const a = base({
      attacks: [
        attack({ outcome: 'dodged' }),
        attack({ outcome: 'dodged' }),
        attack({ outcome: 'countered', evasion: null }),
        attack({ outcome: 'hit', evasion: null, damageTaken: 1 }),
        attack({ outcome: 'interrupted', evasion: null }),
        attack({ outcome: 'hit', evasion: null, study: true }),
      ],
    });
    expect(fightDetails(a).avoided).toMatchObject({ avoided: 3, hit: 1, total: 4, share: 0.75 });
  });

  it('has no share when nothing was resolved', () => {
    expect(fightDetails(base()).avoided.share).toBeNull();
  });
});

describe('hit rate and actions per minute', () => {
  it('counts only the swings of the real fight', () => {
    const a = base({
      study: { rounds: 1, ticks: 600, attacks: 2, hits: 0 },
      fightSeconds: 50,
      swingTicks: [100, 500, 700, 800, 900],
      bossHitTicks: [705, 905],
    });
    expect(fightDetails(a).hitRate).toEqual({ swings: 3, hits: 2, share: 2 / 3 });
  });

  it('has no hit rate when the player never swung', () => {
    expect(fightDetails(base()).hitRate.share).toBeNull();
  });

  it('gives each action per minute over the real fight', () => {
    const a = base({
      study: { rounds: 1, ticks: 600, attacks: 2, hits: 0 },
      fightSeconds: 30,
      swingTicks: [100, 700, 800, 900],
      dashTicks: [650, 1000],
      jumpTicks: [2000],
    });
    expect(fightDetails(a).perMinute).toEqual({ swings: 6, dashes: 4, jumps: 2 });
  });
});

describe('replying to attacks', () => {
  it('counts countered attacks and openings with a swing as replied, against every answerable attack', () => {
    const a = withWindows(
      [
        window({ swung: true, replyTicks: 10 }),
        window({ swung: false }),
        window({ ticks: 4 }),
        window({ swung: true, replyTicks: 20, hit: true, hitTicks: 25 }),
      ],
      { attacks: [attack({ outcome: 'countered', evasion: null })] },
    );
    const r = fightDetails(a).reply;
    // The 4-update opening is too short to answer; the counter, two swings and one idle opening remain.
    expect(r).toMatchObject({ answerable: 4, replied: 3, share: 0.75 });
  });

  it('takes the median of the reply times', () => {
    const a = withWindows([
      window({ swung: true, replyTicks: 10, hit: true, hitTicks: 14 }),
      window({ swung: true, replyTicks: 20 }),
      window({ swung: true, replyTicks: 50, hit: true, hitTicks: 55 }),
    ]);
    const r = fightDetails(a).reply;
    expect(r.medianTicks).toBe(20);
  });

  it('has no median when the player never replied', () => {
    expect(fightDetails(withWindows([window(), window()])).reply.medianTicks).toBeNull();
  });

  it('counts a countered attack as answered in its own row', () => {
    const a = withWindows([window({ attackId: 'slam' })], { attacks: [attack({ attackId: 'sweep', outcome: 'countered', evasion: null })] });
    expect(fightDetails(a).reply.perAttack).toEqual([
      { attackId: 'slam', answerable: 1, replied: 0, medianTicks: null },
      { attackId: 'sweep', answerable: 1, replied: 1, medianTicks: null },
    ]);
  });

  it('gives a row per attack with how often it was replied to and the median time', () => {
    const a = withWindows([
      window({ attackId: 'slam', swung: true, replyTicks: 10 }),
      window({ attackId: 'slam', swung: true, replyTicks: 30 }),
      window({ attackId: 'slam' }),
      window({ attackId: 'sweep' }),
    ]);
    const rows = fightDetails(a).reply.perAttack;
    expect(rows).toEqual([
      { attackId: 'slam', answerable: 3, replied: 2, medianTicks: 20 },
      { attackId: 'sweep', answerable: 1, replied: 0, medianTicks: null },
    ]);
  });
});

describe('where the player stood', () => {
  it('uses the real fight only', () => {
    const a = base(
      { study: { rounds: 1, ticks: 600, attacks: 1, hits: 0 }, ticks: 1200 },
      { updatesClose: 500, updatesMid: 500, updatesFar: 200, studyUpdatesClose: 100, studyUpdatesMid: 300, studyUpdatesFar: 200 },
    );
    expect(fightDetails(a).distance).toEqual({ close: 400, mid: 200, far: 0 });
  });
});

describe('timeline', () => {
  it('lists the hits landed, hits taken and swings of the real fight, as updates into the fight', () => {
    const a = base({
      study: { rounds: 1, ticks: 600, attacks: 1, hits: 0 },
      ticks: 1600,
      swingTicks: [100, 700, 900],
      bossHitTicks: [705],
      playerHitTicks: [800, 1000],
    });
    expect(fightDetails(a).timeline).toEqual({ length: 1000, landed: [105], taken: [200, 400], swings: [100, 300] });
  });
});

describe('dashes and jumps', () => {
  const rating = (start: number, until: number, verdict: DodgeRating['verdict']): DodgeRating => ({ attackId: 'slam', boss: 0, start, until, verdict, slackTicks: null });

  it('tells each dash and jump by the rating of the attack it was made in, and outside when none was live', () => {
    const a = base({ dashTicks: [110, 160, 500], jumpTicks: [120, 305], attacks: [attack({ startTick: 100 }), attack({ startTick: 300, outcome: 'hit', evasion: null })] });
    const ratings = [rating(100, 150, 'saved'), rating(300, 350, 'hitAnyway')];
    const { moves } = fightDetails(a, undefined, ratings);
    expect(moves.dashes).toEqual([
      { tick: 110, verdict: 'saved' },
      { tick: 160, verdict: 'outside' },
      { tick: 500, verdict: 'outside' },
    ]);
    expect(moves.jumps).toEqual([
      { tick: 120, verdict: 'saved' },
      { tick: 305, verdict: 'hitAnyway' },
    ]);
  });

  it('does not count a dash on the update the warning began on, as in the dodge rating', () => {
    const a = base({ dashTicks: [100], attacks: [attack({ startTick: 100 })] });
    expect(fightDetails(a, undefined, [rating(100, 150, 'unneeded')]).moves.dashes[0]!.verdict).toBe('outside');
  });

  it('calls a move during an attack unrated when no ratings were given', () => {
    const a = base({ dashTicks: [110, 400], attacks: [attack({ startTick: 100, firstDangerTick: 130 })] });
    expect(fightDetails(a).moves.dashes.map((m) => m.verdict)).toEqual(['unrated', 'outside']);
  });
});

describe('attacks that cannot hurt', () => {
  const slip = (boss: number, id: string): boolean => boss === 0 && id === 'slip';

  it('leaves them out of the counts, the bands and the movement marks', () => {
    const a = base({
      dashTicks: [110],
      attacks: [attack({ attackId: 'slip', startTick: 100 }), attack({ attackId: 'slam', startTick: 300, outcome: 'hit', evasion: null })],
    });
    const ratings: DodgeRating[] = [{ attackId: 'slip', boss: 0, start: 100, until: 150, verdict: 'unneeded', slackTicks: null }];
    const d = fightDetails(a, undefined, ratings, slip);
    expect(d.avoided).toMatchObject({ avoided: 0, hit: 1, total: 1 });
    expect(d.numbers.boss.perAttack.map((x) => x.attackId)).toEqual(['slam']);
    expect(d.attackBands.map((b) => b.attackId)).toEqual(['slam']);
    expect(d.moves.dashes).toEqual([{ tick: 110, verdict: 'outside' }]);
  });

  it('leaves their openings out of the reply numbers', () => {
    const a = withWindows([window({ attackId: 'slip' }), window({ attackId: 'slam' })]);
    expect(fightDetails(a, undefined, undefined, slip).reply.answerable).toBe(1);
  });

  it('names the attacks of a boss file with no hit box and no shots', () => {
    const fight = {
      bosses: [
        {
          attacks: [
            { id: 'slip', hits: [] },
            { id: 'blast', hits: [], shots: [{}] },
            { id: 'slam', hits: [{}] },
          ],
        },
      ],
    } as unknown as FightDef;
    const harmless = harmlessAttacks(fight);
    expect([harmless(0, 'slip'), harmless(0, 'blast'), harmless(0, 'slam'), harmless(0, 'unknown'), harmless(1, 'slip')]).toEqual([true, false, false, false, false]);
  });
});

describe('recommendation', () => {
  const hit = (attackId: string) => attack({ attackId, outcome: 'hit', evasion: null, damageTaken: 1 });
  const dodged = (attackId: string) => attack({ attackId, outcome: 'dodged' });
  const answered = (attackId: string) => window({ attackId, swung: true, replyTicks: 10 });
  const ignored = (attackId: string) => window({ attackId });

  it('names the attack that hit the player most', () => {
    const a = base({ attacks: [hit('slam'), hit('slam'), hit('sweep'), dodged('sweep'), dodged('sweep'), dodged('slam')] });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'hurt', attackId: 'slam', hits: 2, resolved: 3 });
  });

  it('breaks a tie in hits by the larger share of its appearances, then by the first one', () => {
    const share = base({ attacks: [hit('slam'), hit('sweep'), dodged('slam'), dodged('slam')] });
    expect(fightDetails(share).recommendation).toMatchObject({ attackId: 'sweep', hits: 1, resolved: 1 });
    const first = base({ attacks: [hit('slam'), hit('sweep')] });
    expect(fightDetails(first).recommendation).toMatchObject({ attackId: 'slam' });
  });

  it('names one hit as much as many: there is no number it has to reach', () => {
    const a = base({ attacks: [hit('slam'), ...many(30, () => dodged('slam')), ...many(10, () => dodged('sweep'))] });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'hurt', attackId: 'slam', hits: 1, resolved: 31 });
  });

  it('counts only the real fight and leaves out interrupted attacks', () => {
    const a = base({ attacks: [attack({ attackId: 'slam', outcome: 'hit', evasion: null, study: true }), attack({ attackId: 'slam', outcome: 'interrupted', evasion: null }), dodged('sweep')] });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'none' });
  });

  it('names the attack whose openings went unanswered most when nothing hit', () => {
    const a = withWindows([answered('slam'), ignored('slam'), ignored('slam'), ignored('sweep'), answered('sweep')], {
      attacks: [dodged('slam'), dodged('sweep')],
    });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'unanswered', attackId: 'slam', missed: 2, answerable: 3 });
  });

  it('does not count an opening too short to answer', () => {
    const a = withWindows([window({ ticks: 4 }), answered('slam')], { attacks: [dodged('slam')] });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'none' });
  });

  it('says nothing stands out when nothing hit and every opening was answered', () => {
    const a = withWindows(many(6, () => answered('slam')), { attacks: many(6, () => dodged('slam')) });
    expect(fightDetails(a).recommendation).toEqual({ kind: 'none' });
  });

  it('says there is nothing to judge when the boss never attacked', () => {
    expect(fightDetails(base()).recommendation).toEqual({ kind: 'few' });
  });

  it('gives no block for a fight with no real time (left during the study)', () => {
    expect(fightDetails(base({ fightSeconds: 0, ticks: 300, study: { rounds: 1, ticks: 300, attacks: 1, hits: 0 } })).recommendation).toEqual({ kind: 'few' });
  });
});

describe('harmlessAttacks on the real bosses', () => {
  it('finds the slips and blinks and none of the attacks that hurt', () => {
    const veil = harmlessAttacks(resolveFight('veil-dancer', 1).fight);
    expect([veil(0, 'veil-slip'), veil(0, 'blink-away'), veil(0, 'needle-fan'), veil(0, 'shadow-cut'), veil(0, 'twin-cut')]).toEqual([true, true, false, false, false]);
    const hound = harmlessAttacks(resolveFight('ashen-hound', 1).fight);
    expect([hound(0, 'slip'), hound(0, 'feint'), hound(0, 'skitter')]).toEqual([true, true, true]);
  });
});

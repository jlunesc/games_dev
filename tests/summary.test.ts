import { describe, expect, it } from 'vitest';
import type { BossDef } from '../src/bosses/schema';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import { step } from '../src/game/step';
import { createInitialState, type GameState } from '../src/game/state';
import {
  createTracker,
  summarize,
  trackUpdate,
  type SummaryTracker,
} from '../src/game/summary';
import { solo, standAt, updatesWith } from './boss-helpers';
import { DUELIST, run } from './helpers';

/** Plays `count` updates from `start`, feeding every update to a tracker. */
function play(
  start: GameState,
  count: number,
  boss: BossDef,
  inputFor: (n: number) => InputFrame = () => NO_INPUT,
): { tracker: SummaryTracker; last: GameState } {
  let tracker = createTracker();
  let previous = start;
  for (let n = 1; n <= count; n++) {
    const next = step(previous, inputFor(n), boss);
    tracker = trackUpdate(tracker, next, previous);
    previous = next;
  }
  return { tracker, last: previous };
}

describe('a fight with no hits taken', () => {
  const start = createInitialState(DUELIST);
  const { tracker, last } = play(start, 30, DUELIST);
  const summary = summarize(tracker, last, DUELIST, 'left');

  it('reports the time in seconds from the updates played', () => {
    expect(summary.ticks).toBe(30);
    expect(summary.seconds).toBe(0.5);
  });

  it('has no hits and no most dangerous attack', () => {
    expect(summary.hitsTaken).toBe(0);
    expect(summary.mostDangerousAttack).toBeNull();
  });

  it('starts at phase 1 of the boss phases and passes the result and boss health through', () => {
    expect(summary.result).toBe('left');
    expect(summary.phaseReached).toBe(1);
    expect(summary.phaseCount).toBe(DUELIST.phases.length);
    expect(summary.bossHpLeft).toBe(DUELIST.maxHp);
    expect(summary.bossMaxHp).toBe(DUELIST.maxHp);
  });
});

describe('a fight where the player is hit', () => {
  const boss = solo('slam');
  const slam = DUELIST.attacks.find((a) => a.id === 'slam')!;
  const start = standAt(boss, 120);
  start.player.health = 1000;
  const states = run(start, 200, () => NO_INPUT, boss);
  const hits = updatesWith(states, 'playerHit').length;
  const { tracker, last } = play(start, 200, boss);
  const summary = summarize(tracker, last, boss, 'defeat');

  it('counts every hit taken', () => {
    expect(hits).toBeGreaterThan(1);
    expect(summary.hitsTaken).toBe(hits);
  });

  it('names the attack that hurt the player most', () => {
    expect(summary.mostDangerousAttack).toEqual({ id: 'slam', name: slam.name, hits });
  });
});

describe('the most dangerous attack', () => {
  const someState = createInitialState(DUELIST);

  it('goes to the attack listed first in the boss file when two are tied', () => {
    const tied: SummaryTracker = { hitsByAttack: { sweep: 2, slam: 2 }, hitsTaken: 4, phaseReached: 1 };
    expect(summarize(tied, someState, DUELIST, 'defeat').mostDangerousAttack!.id).toBe(
      DUELIST.attacks[0]!.id,
    );
  });

  it('ignores hits by an attack the boss file does not know', () => {
    const odd: SummaryTracker = { hitsByAttack: { mystery: 5 }, hitsTaken: 5, phaseReached: 1 };
    expect(summarize(odd, someState, DUELIST, 'defeat').mostDangerousAttack).toBeNull();
  });
});

describe('the phase reached', () => {
  it('follows the boss and never goes back', () => {
    const a = createInitialState(DUELIST);
    const b = createInitialState(DUELIST);
    b.boss.phase = 1;
    let tracker = trackUpdate(createTracker(), b, a);
    expect(tracker.phaseReached).toBe(2);
    tracker = trackUpdate(tracker, a, b);
    expect(tracker.phaseReached).toBe(2);
  });
});

describe('trackUpdate', () => {
  it('does not modify the tracker it is given', () => {
    const t = createTracker();
    const before = JSON.stringify(t);
    const s = createInitialState(DUELIST);
    s.events.push('playerHit');
    trackUpdate(t, s, createInitialState(DUELIST));
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe('a fight with a study', () => {
  const study = () => createInitialState(DUELIST, 3, 1);

  it('leaves the study out of the time and reports it on its own', () => {
    let s = study();
    let tracker = createTracker();
    let endTick = 0;
    for (let n = 1; n <= 1500; n++) {
      const next = step(s, NO_INPUT, DUELIST);
      tracker = trackUpdate(tracker, next, s);
      s = next;
      if (next.events.includes('studyEnd')) endTick = next.tick;
      if (n === 1200) break;
    }
    expect(endTick).toBeGreaterThan(0);
    expect(s.study.endTick).toBe(endTick);
    const summary = summarize(tracker, s, DUELIST, 'left');
    expect(summary.ticks).toBe(s.tick);
    expect(summary.studySeconds).toBe(endTick / 60);
    expect(summary.seconds).toBe((s.tick - endTick) / 60);
  });

  it('does not count a study hit as a hit taken', () => {
    let s = study();
    let tracker = createTracker();
    let studyHits = 0;
    while (s.study.active) {
      const next = step(s, NO_INPUT, DUELIST);
      tracker = trackUpdate(tracker, next, s);
      studyHits += next.events.filter((e) => e === 'studyHit').length;
      s = next;
    }
    expect(studyHits).toBeGreaterThan(0);
    expect(tracker.hitsTaken).toBe(0);
    expect(summarize(tracker, s, DUELIST, 'left').mostDangerousAttack).toBeNull();
  });

  it('a fight left during the study has no fight time yet', () => {
    let s = study();
    let tracker = createTracker();
    for (let n = 1; n <= 90; n++) {
      const next = step(s, NO_INPUT, DUELIST);
      tracker = trackUpdate(tracker, next, s);
      s = next;
    }
    expect(s.study.active).toBe(true);
    const summary = summarize(tracker, s, DUELIST, 'left');
    expect(summary.seconds).toBe(0);
    expect(summary.studySeconds).toBe(1.5);
  });

  it('with no study, the study time is zero and the time is all the fight', () => {
    const summary = summarize(createTracker(), createInitialState(DUELIST), DUELIST, 'left');
    expect(summary.studySeconds).toBe(0);
    expect(summary.seconds).toBe(0);
    const later = { ...createInitialState(DUELIST), tick: 120 };
    expect(summarize(createTracker(), later, DUELIST, 'left')).toMatchObject({ seconds: 2, studySeconds: 0 });
  });
});

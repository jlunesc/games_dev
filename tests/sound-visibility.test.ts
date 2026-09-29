import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { createSound } from '../src/ui/sound';
import { asContext, FakeContext, FakeTimer } from './fake-audio';

const fight = asFight(EMBER_DUELIST);
const calm = (): GameState => createInitialState(fight, 1);

function setup() {
  const ctx = new FakeContext();
  const timer = new FakeTimer();
  const sound = createSound({ createContext: () => asContext(ctx), timer });
  sound.unlock();
  sound.startFight(fight, 1);
  return { ctx, timer, sound };
}

describe('the sound when the page goes to the background', () => {
  it('stops the music and its timer', () => {
    const { timer, sound } = setup();
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
    sound.suspend();
    expect(timer.active).toBe(0);
  });

  it('starts the music again on the next update of a fight in progress', () => {
    const { timer, sound } = setup();
    sound.update(calm(), calm(), fight);
    sound.suspend();
    sound.unlock();
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
  });

  it('stays silent after a finished fight', () => {
    const { timer, sound } = setup();
    sound.update(calm(), calm(), fight);
    sound.update(calm(), { ...calm(), events: ['bossDefeated'] }, fight);
    expect(timer.active).toBe(0);
    sound.suspend();
    sound.unlock();
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
  });

  it('does nothing before any sound exists', () => {
    const sound = createSound({ createContext: () => asContext(new FakeContext()), timer: new FakeTimer() });
    expect(() => sound.suspend()).not.toThrow();
  });
});

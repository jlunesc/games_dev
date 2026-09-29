import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameState } from '../src/game/state';
import { createSound } from '../src/ui/sound';
import { asContext, FakeContext } from './fake-audio';

const fight = asFight(EMBER_DUELIST);
const hitState = (): GameState => ({ ...createInitialState(EMBER_DUELIST, 1), events: ['bossHit'] });

const make = () => {
  const ctx = new FakeContext();
  const sound = createSound({ createContext: () => asContext(ctx) });
  return { ctx, sound };
};

describe('the sound object', () => {
  it('plays nothing before it is unlocked', () => {
    const { ctx, sound } = make();
    sound.update(createInitialState(EMBER_DUELIST, 1), hitState(), fight);
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
  });

  it('plays a sound for an event once unlocked', () => {
    const { ctx, sound } = make();
    sound.unlock();
    sound.update(createInitialState(EMBER_DUELIST, 1), hitState(), fight);
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0);
  });

  it('plays nothing at volume off, and again after it is turned back up', () => {
    const { ctx, sound } = make();
    sound.unlock();
    sound.setVolume('off');
    sound.update(createInitialState(EMBER_DUELIST, 1), hitState(), fight);
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
    sound.setVolume('high');
    sound.update(createInitialState(EMBER_DUELIST, 1), hitState(), fight);
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0);
  });

  it('remembers a volume set before the first tap', () => {
    const { ctx, sound } = make();
    sound.setVolume('off');
    sound.unlock();
    sound.update(createInitialState(EMBER_DUELIST, 1), hitState(), fight);
    expect(ctx.ofKind('oscillator')).toHaveLength(0);
  });

  it('never throws when the browser refuses to resume or to make a context', () => {
    const ctx = new FakeContext();
    ctx.rejectResume = true;
    const refused = createSound({ createContext: () => asContext(ctx) });
    expect(() => refused.unlock()).not.toThrow();
    const broken = createSound({
      createContext: () => {
        throw new Error('no audio here');
      },
    });
    expect(() => broken.unlock()).not.toThrow();
    expect(() => broken.update(hitState(), hitState(), fight)).not.toThrow();
  });

  it('does not change the states it reads', () => {
    const { sound } = make();
    sound.unlock();
    const before = createInitialState(EMBER_DUELIST, 1);
    const after = hitState();
    const copies = [structuredClone(before), structuredClone(after)];
    sound.update(before, after, fight);
    sound.startFight(fight, 1);
    sound.endFight();
    expect([before, after]).toEqual(copies);
  });
});

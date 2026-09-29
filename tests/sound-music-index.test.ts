import { describe, expect, it } from 'vitest';
import { EMBER_DUELIST } from '../src/bosses';
import { asFight } from '../src/game/fight';
import { createInitialState, type GameEvent, type GameState } from '../src/game/state';
import { createSound } from '../src/ui/sound';
import { midiToHz, themeFor } from '../src/ui/sound/score';
import { MUSIC, SOUND } from '../src/ui/sound/tuning';
import { advance, asContext, FakeContext, FakeTimer } from './fake-audio';

const fight = asFight(EMBER_DUELIST);
const theme = themeFor([EMBER_DUELIST.id], 1);
const calm = (): GameState => createInitialState(fight, 1);

function setup() {
  const ctx = new FakeContext();
  const timer = new FakeTimer();
  const sound = createSound({ createContext: () => asContext(ctx), timer });
  sound.unlock();
  return { ctx, timer, sound };
}

const withEvents = (state: GameState, events: GameEvent[]): GameState => ({ ...state, events });
const frequencies = (ctx: FakeContext): number[] => ctx.ofKind('oscillator').map((node) => node.frequency.calls[0]!.value);

describe('the music in the sound object', () => {
  it('does not play music until a fight has started', () => {
    const { timer, sound } = setup();
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
  });

  it('starts on the first update of a fight, with the bass and pad', () => {
    const { ctx, timer, sound } = setup();
    sound.startFight(fight, 1);
    expect(timer.active).toBe(0);
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(3);
    expect(ctx.ofKind('filter')).toHaveLength(0);
  });

  it('plays only the pad in the study', () => {
    const { ctx, sound } = setup();
    const study = createInitialState(fight, 1, 1);
    expect(study.study.active).toBe(true);
    sound.startFight(fight, 1);
    sound.update(study, study, fight);
    expect(ctx.ofKind('oscillator')).toHaveLength(3);
  });

  it('waits for the browser to allow sound, then starts', () => {
    const { ctx, timer, sound } = setup();
    ctx.state = 'suspended';
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
    ctx.state = 'running';
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
  });

  it('adds drums and the lead when a boss is nearly beaten, on a bar line', () => {
    const { ctx, timer, sound } = setup();
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    const hurt: GameState = { ...calm(), tick: MUSIC.checkEvery, boss: { ...calm().boss, hp: EMBER_DUELIST.maxHp * 0.2 } };
    sound.update(calm(), hurt, fight);
    advance(ctx, timer, 5);
    expect(ctx.ofKind('filter').length).toBeGreaterThan(0);
  });

  it('stops at volume off and starts again when the volume comes back', () => {
    const { timer, sound } = setup();
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    sound.setVolume('off');
    expect(timer.active).toBe(0);
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
    sound.setVolume('medium');
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
  });

  it('stops when the fight ends, and starts again with the next fight', () => {
    const { timer, sound } = setup();
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    sound.endFight();
    expect(timer.active).toBe(0);
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
    sound.startFight(fight, 2);
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(1);
  });

  it('plays the win sting and stops the music when the boss is beaten, and does not restart it', () => {
    const { ctx, timer, sound } = setup();
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    sound.update(calm(), withEvents(calm(), ['bossDefeated']), fight);
    expect(timer.active).toBe(0);
    expect(frequencies(ctx)).toContain(midiToHz(theme.root + 24));
    const count = ctx.ofKind('oscillator').length;
    sound.update(calm(), calm(), fight);
    expect(timer.active).toBe(0);
    expect(ctx.ofKind('oscillator')).toHaveLength(count);
  });

  it('plays the loss sting when the player is defeated', () => {
    const { ctx, timer, sound } = setup();
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    sound.update(calm(), withEvents(calm(), ['playerDefeated']), fight);
    expect(timer.active).toBe(0);
    expect(frequencies(ctx)).toContain(midiToHz(theme.root + 12 + 7));
  });

  it('ducks the music when a warning plays, and not for a quiet update', () => {
    const { ctx, sound } = setup();
    const busCalls = () => ctx.ofKind('gain')[2]!.gain.calls.filter((call) => call.op === 'set' && call.value === SOUND.duck.level);
    sound.startFight(fight, 1);
    sound.update(calm(), calm(), fight);
    sound.update(calm(), calm(), fight);
    expect(busCalls()).toHaveLength(0);
    const attack = EMBER_DUELIST.attacks[0]!;
    const before = calm();
    const after: GameState = { ...before, boss: { ...before.boss, mode: 'attack', attackId: attack.id, attackTick: 0 } };
    sound.update(before, after, fight);
    expect(busCalls().length).toBeGreaterThan(0);
  });

  it('still makes no change to the states it reads', () => {
    const { sound } = setup();
    const before = calm();
    const after = withEvents(calm(), ['bossHit']);
    const copies = [structuredClone(before), structuredClone(after)];
    sound.startFight(fight, 1);
    sound.update(before, after, fight);
    sound.endFight();
    expect([before, after]).toEqual(copies);
  });
});

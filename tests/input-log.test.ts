import { describe, expect, it } from 'vitest';
import { NO_INPUT, type InputFrame } from '../src/engine/input-frame';
import {
  countUpdates,
  decodeInputs,
  encodeInputs,
  packFrame,
  pushFrame,
  unpackFrame,
  type InputRun,
} from '../src/stats/input-log';
import { withInput } from './helpers';

/** The fields a fight uses: everything except the menu-only ones. */
const fightPart = (f: InputFrame) => ({
  moveX: f.moveX,
  jumpHeld: f.jumpHeld,
  jumpPressed: f.jumpPressed,
  attackPressed: f.attackPressed,
  dashPressed: f.dashPressed,
});

describe('packing a frame', () => {
  it('round-trips every combination of the fight fields', () => {
    for (const moveX of [-1, 0, 1]) {
      for (let bits = 0; bits < 16; bits++) {
        const frame = withInput({
          moveX,
          jumpHeld: (bits & 1) !== 0,
          jumpPressed: (bits & 2) !== 0,
          attackPressed: (bits & 4) !== 0,
          dashPressed: (bits & 8) !== 0,
        });
        expect(unpackFrame(packFrame(frame))).toEqual(frame);
      }
    }
  });

  it('gives different numbers to different frames, and stores the direction plus one', () => {
    // Left is stored as 0, no direction as 1, right as 2.
    expect(packFrame(withInput({ moveX: -1 }))).toBe(0);
    expect(packFrame(NO_INPUT)).toBe(1);
    expect(packFrame(withInput({ moveX: 1 }))).toBe(2);
    expect(packFrame(withInput({ moveX: -1 }))).not.toBe(packFrame(withInput({ moveX: 1 })));
    expect(packFrame(withInput({ dashPressed: true }))).not.toBe(packFrame(NO_INPUT));
    expect(unpackFrame(packFrame(NO_INPUT))).toEqual(NO_INPUT);
  });

  it('ignores the menu-only fields', () => {
    const menu = withInput({ moveY: 1, confirm: true, alt: true });
    expect(packFrame(menu)).toBe(packFrame(NO_INPUT));
  });

  it('turns an analog stick value into its direction', () => {
    expect(unpackFrame(packFrame(withInput({ moveX: 0.7 }))).moveX).toBe(1);
    expect(unpackFrame(packFrame(withInput({ moveX: -0.2 }))).moveX).toBe(-1);
  });

  it('packs analog edge values by their sign, and NaN and -0 as no direction', () => {
    const one = packFrame(withInput({ moveX: 1 }));
    expect(packFrame(withInput({ moveX: 0.0001 }))).toBe(one);
    expect(packFrame(withInput({ moveX: 0.7 }))).toBe(one);
    expect(packFrame(withInput({ moveX: -0.0001 }))).toBe(packFrame(withInput({ moveX: -1 })));
    expect(packFrame(withInput({ moveX: NaN }))).toBe(packFrame(NO_INPUT));
    expect(packFrame(withInput({ moveX: -0 }))).toBe(packFrame(NO_INPUT));
    expect(unpackFrame(packFrame(withInput({ moveX: NaN }))).moveX).toBe(0);
  });

  it('reads the unused direction pattern 3 as right, never as 2', () => {
    expect(unpackFrame(3).moveX).toBe(1);
    expect(unpackFrame(3 | 4 | 32).moveX).toBe(1);
  });
});

describe('runs', () => {
  it('merge repeated frames and split on any change', () => {
    const frames = [NO_INPUT, NO_INPUT, NO_INPUT, withInput({ moveX: 1 }), withInput({ moveX: 1 }), NO_INPUT];
    const runs = encodeInputs(frames);
    expect(runs).toEqual([
      [packFrame(NO_INPUT), 3],
      [packFrame(withInput({ moveX: 1 })), 2],
      [packFrame(NO_INPUT), 1],
    ]);
    expect(countUpdates(runs)).toBe(6);
  });

  it('decode is the exact inverse of encode for random fight input', () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    const frames: InputFrame[] = [];
    for (let i = 0; i < 2000; i++) {
      const same = next() < 0.6 && frames.length > 0;
      frames.push(
        same
          ? frames[frames.length - 1]!
          : withInput({
              moveX: Math.floor(next() * 3) - 1,
              jumpHeld: next() < 0.3,
              jumpPressed: next() < 0.1,
              attackPressed: next() < 0.1,
              dashPressed: next() < 0.1,
            }),
      );
    }
    expect(decodeInputs(encodeInputs(frames)).map(fightPart)).toEqual(frames.map(fightPart));
  });

  it('countUpdates adds the counts over several runs', () => {
    const runs: InputRun[] = [
      [packFrame(NO_INPUT), 5],
      [packFrame(withInput({ moveX: 1 })), 1],
      [packFrame(NO_INPUT), 12],
    ];
    expect(countUpdates(runs)).toBe(18);
    expect(countUpdates(decodeInputs(runs).length === 18 ? runs : [])).toBe(decodeInputs(runs).length);
  });

  it('an empty log is empty both ways', () => {
    expect(encodeInputs([])).toEqual([]);
    expect(decodeInputs([])).toEqual([]);
    expect(countUpdates([])).toBe(0);
  });

  it('pushFrame extends or starts a run and never changes the array it is given', () => {
    const start: InputRun[] = [[packFrame(NO_INPUT), 2]];
    const before = JSON.stringify(start);
    const same = pushFrame(start, NO_INPUT);
    const other = pushFrame(start, withInput({ attackPressed: true }));
    expect(JSON.stringify(start)).toBe(before);
    expect(same).toEqual([[packFrame(NO_INPUT), 3]]);
    expect(other).toEqual([
      [packFrame(NO_INPUT), 2],
      [packFrame(withInput({ attackPressed: true })), 1],
    ]);
    expect(pushFrame([], NO_INPUT)).toEqual([[packFrame(NO_INPUT), 1]]);
  });
});

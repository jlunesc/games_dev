import type { InputFrame } from '../engine/input-frame';

/** A frame packed into one small integer, and how many updates in a row it repeated. */
export type InputRun = [frame: number, count: number];

/**
 * Packs the part of an input frame that a fight uses: bits 0-1 hold the direction plus one, bit 2 jump held,
 * bit 3 jump pressed, bit 4 attack pressed, bit 5 dash pressed. Menu-only fields are not kept.
 */
export function packFrame(frame: InputFrame): number {
  return (
    (Math.sign(frame.moveX) + 1) |
    (frame.jumpHeld ? 4 : 0) |
    (frame.jumpPressed ? 8 : 0) |
    (frame.attackPressed ? 16 : 0) |
    (frame.dashPressed ? 32 : 0)
  );
}

export function unpackFrame(packed: number): InputFrame {
  return {
    moveX: (packed & 3) - 1,
    moveY: 0,
    jumpHeld: (packed & 4) !== 0,
    jumpPressed: (packed & 8) !== 0,
    attackPressed: (packed & 16) !== 0,
    dashPressed: (packed & 32) !== 0,
    confirm: false,
    alt: false,
  };
}

/** Adds one update's input to a log: extends the last run when the frame repeats. Returns a new array. */
export function pushFrame(runs: readonly InputRun[], frame: InputFrame): InputRun[] {
  const packed = packFrame(frame);
  const last = runs[runs.length - 1];
  if (last !== undefined && last[0] === packed) {
    return [...runs.slice(0, -1), [packed, last[1] + 1]];
  }
  return [...runs, [packed, 1]];
}

export function encodeInputs(frames: readonly InputFrame[]): InputRun[] {
  let runs: InputRun[] = [];
  for (const frame of frames) runs = pushFrame(runs, frame);
  return runs;
}

export function decodeInputs(runs: readonly InputRun[]): InputFrame[] {
  const frames: InputFrame[] = [];
  for (const [packed, count] of runs) {
    for (let i = 0; i < count; i++) frames.push(unpackFrame(packed));
  }
  return frames;
}

export const countUpdates = (runs: readonly InputRun[]): number =>
  runs.reduce((total, [, count]) => total + count, 0);

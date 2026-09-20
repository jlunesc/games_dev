import { describe, expect, it } from 'vitest';
import { NO_INPUT, NO_PRESSES, addPresses, applyPresses } from '../src/engine/input-frame';

describe('pending presses', () => {
  it('remember a press seen on a frame that ran no update', () => {
    const pressed = { ...NO_INPUT, jumpPressed: true };
    const later = { ...NO_INPUT };
    const pending = addPresses(addPresses(NO_PRESSES, pressed), later);
    expect(pending).toEqual({ jump: true, attack: false, dash: false });
  });

  it('are applied onto the input of the update that runs, keeping the rest', () => {
    const input = { ...NO_INPUT, moveX: -1, jumpHeld: true };
    const applied = applyPresses(input, { jump: true, attack: false, dash: true });
    expect(applied).toEqual({
      ...NO_INPUT,
      moveX: -1,
      jumpHeld: true,
      jumpPressed: true,
      attackPressed: false,
      dashPressed: true,
    });
  });
});

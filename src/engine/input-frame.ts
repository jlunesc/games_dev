/** What the player asked for during one update. `*Pressed` and `confirm`/`alt` are true only on the update where the button went down. */
export interface InputFrame {
  moveX: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  attackPressed: boolean;
  dashPressed: boolean;
  confirm: boolean;
  alt: boolean;
}

export const NO_INPUT: InputFrame = {
  moveX: 0,
  jumpHeld: false,
  jumpPressed: false,
  attackPressed: false,
  dashPressed: false,
  confirm: false,
  alt: false,
};

/** Presses seen on a frame but not yet used by an update (a 120 Hz screen has frames with no update). */
export interface PendingPresses {
  jump: boolean;
  attack: boolean;
  dash: boolean;
}

export const NO_PRESSES: PendingPresses = { jump: false, attack: false, dash: false };

/** Remembers any press in `input` until an update uses it. */
export function addPresses(pending: PendingPresses, input: InputFrame): PendingPresses {
  return {
    jump: pending.jump || input.jumpPressed,
    attack: pending.attack || input.attackPressed,
    dash: pending.dash || input.dashPressed,
  };
}

/** The input for the update that runs: the latest held state and movement, with the remembered presses. */
export function applyPresses(input: InputFrame, pending: PendingPresses): InputFrame {
  return {
    ...input,
    jumpPressed: pending.jump,
    attackPressed: pending.attack,
    dashPressed: pending.dash,
  };
}

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

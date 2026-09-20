import { NO_INPUT, type InputFrame } from './input-frame';

/** The part of a browser Gamepad the game reads. The real `Gamepad` satisfies it. */
export interface PadLike {
  readonly id: string;
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: ReadonlyArray<number>;
}

/** Which physical button numbers do which action. Measured values are in docs/controllers.md. */
export interface ControllerProfile {
  name: string;
  jump: number;
  attack: number;
  dash: number;
  alt: number;
  dpadLeft: number;
  dpadRight: number;
  /** Axis number of the left stick, sideways. */
  stickX: number;
}

export const SN30_PRO_ID = '8Bitdo SN30 Pro (STANDARD GAMEPAD Vendor: 045e Product: 02e0)';

/** 8BitDo SN30 Pro in X-input mode on Android Chrome. Buttons 6 and 7 and the right stick are deliberately unused. */
export const SN30_PRO_PROFILE: ControllerProfile = {
  name: '8BitDo SN30 Pro',
  jump: 0,
  attack: 3,
  dash: 9,
  alt: 4,
  dpadLeft: 14,
  dpadRight: 15,
  stickX: 0,
};

/** The standard layout, for pads whose browser reports `mapping: standard` and that have no profile of their own. */
export const STANDARD_PROFILE: ControllerProfile = {
  name: 'Standard layout',
  jump: 0,
  attack: 2,
  dash: 5,
  alt: 3,
  dpadLeft: 14,
  dpadRight: 15,
  stickX: 0,
};

export type ProfileSelection =
  | { kind: 'profile'; profile: ControllerProfile }
  | { kind: 'unsupported'; id: string };

const KNOWN: ReadonlyArray<{ id: string; profile: ControllerProfile }> = [
  { id: SN30_PRO_ID, profile: SN30_PRO_PROFILE },
];

/** Picks the profile for a pad by its full id text; never guesses for an unknown non-standard layout. */
export function selectProfile(id: string, mapping: string): ProfileSelection {
  const known = KNOWN.find((entry) => entry.id === id);
  if (known) return { kind: 'profile', profile: known.profile };
  if (mapping === 'standard') return { kind: 'profile', profile: STANDARD_PROFILE };
  return { kind: 'unsupported', id };
}

export interface HeldButtons {
  jump: boolean;
  attack: boolean;
  dash: boolean;
  alt: boolean;
}

export const NOTHING_HELD: HeldButtons = { jump: false, attack: false, dash: false, alt: false };

const isDown = (pad: PadLike, index: number): boolean => pad.buttons[index]?.pressed ?? false;

/** Reads the pad once through a profile. `previous` is what was held on the last read, to find new presses. */
export function sampleInput(
  pad: PadLike,
  profile: ControllerProfile,
  previous: HeldButtons,
  deadZone: number,
): { input: InputFrame; held: HeldButtons } {
  const held: HeldButtons = {
    jump: isDown(pad, profile.jump),
    attack: isDown(pad, profile.attack),
    dash: isDown(pad, profile.dash),
    alt: isDown(pad, profile.alt),
  };
  const dpad = (isDown(pad, profile.dpadRight) ? 1 : 0) - (isDown(pad, profile.dpadLeft) ? 1 : 0);
  const stick = pad.axes[profile.stickX] ?? 0;
  const stickDirection = Math.abs(stick) < deadZone ? 0 : stick > 0 ? 1 : -1;

  const input: InputFrame = {
    ...NO_INPUT,
    moveX: dpad !== 0 ? dpad : stickDirection,
    jumpHeld: held.jump,
    jumpPressed: held.jump && !previous.jump,
    attackPressed: held.attack && !previous.attack,
    dashPressed: held.dash && !previous.dash,
    confirm: held.jump && !previous.jump,
    alt: held.alt && !previous.alt,
  };
  return { input, held };
}

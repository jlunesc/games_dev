/** One step of menu navigation. */
export type NavAction = 'up' | 'down' | 'left' | 'right';

export interface NavState {
  direction: NavAction | null;
  /** When the current direction was first pressed, in ms. */
  since: number;
  /** When it last fired, in ms. */
  lastFired: number;
}

export const NAV_START: NavState = { direction: null, since: 0, lastFired: 0 };

/** A held direction repeats after this long, then once per interval. */
export const NAV_REPEAT_DELAY_MS = 400;
export const NAV_REPEAT_INTERVAL_MS = 120;

function directionOf(moveX: number, moveY: number): NavAction | null {
  if (moveY < 0) return 'up';
  if (moveY > 0) return 'down';
  if (moveX < 0) return 'left';
  if (moveX > 0) return 'right';
  return null;
}

/**
 * Turns the held direction of a frame into at most one menu step: one on the press itself, then repeats
 * while it stays held. Pure: the caller keeps the state and supplies the time.
 */
export function advanceNav(
  state: NavState,
  moveX: number,
  moveY: number,
  now: number,
): { state: NavState; action: NavAction | null } {
  const direction = directionOf(moveX, moveY);
  if (direction === null) return { state: NAV_START, action: null };
  if (direction !== state.direction) {
    return { state: { direction, since: now, lastFired: now }, action: direction };
  }
  if (now - state.since >= NAV_REPEAT_DELAY_MS && now - state.lastFired >= NAV_REPEAT_INTERVAL_MS) {
    return { state: { ...state, lastFired: now }, action: direction };
  }
  return { state, action: null };
}

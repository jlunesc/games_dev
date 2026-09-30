/** Rough width of one character in pixels and the width of the strip the text crosses; only used to keep the speed steady. */
const CHAR_PX = 8;
const STRIP_PX = 360;
const SPEED_PX_PER_SECOND = 50;
const MIN_SECONDS = 8;

/** How long one pass of the scrolling description takes: longer text gets longer, so the speed stays about the same. */
export function tickerSeconds(text: string): number {
  return Math.max(MIN_SECONDS, (text.length * CHAR_PX + STRIP_PX) / SPEED_PX_PER_SECOND);
}

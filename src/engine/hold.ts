/** How long a button has been held without a break. Returns to zero on release. Pure: the caller supplies the elapsed time. */
export function advanceHold(
  heldMs: number,
  isHeld: boolean,
  deltaMs: number,
  thresholdMs: number,
): { heldMs: number; done: boolean } {
  if (!isHeld) return { heldMs: 0, done: false };
  const next = heldMs + Math.max(0, deltaMs);
  return { heldMs: next, done: next >= thresholdMs };
}

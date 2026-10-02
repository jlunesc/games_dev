/** Every cut-off and bin of the fight details in one place (see docs/stats.md section 7.6). The recommendation has none: it only ranks counts. */
export const DETAILS_TUNING = {
  /** An opening shorter than this many updates is too short to answer (a swing needs 3 updates to start up and 4 to hit), so it is left out of the reply numbers. */
  minReplyWindowTicks: 12,
  /** Bin edges in updates. A value goes in the first bin whose upper edge is above it. */
  replyBinEdges: [15, 30, 45, 60, 90],
  /** The dodge timing: updates between the dodge beginning and the danger beginning (negative: it began after). */
  dodgeBinEdges: [0, 6, 12, 24, 48],
  /** The player counts as next to a wall within this many world units of either end of the arena (the arena is 1280 wide). */
  wallMargin: 100,
} as const;

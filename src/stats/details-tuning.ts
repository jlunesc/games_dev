/** Every cut-off of the fight details and their recommendation in one place (see docs/stats.md section 7.6). */
export const DETAILS_TUNING = {
  /** An opening shorter than this many updates is too short to answer (a swing needs 3 updates to start up and 4 to hit), so it is left out of the reply numbers. */
  minReplyWindowTicks: 12,
  /** The recommendation is only made from a number that rests on at least this many cases. */
  minAttacks: 6,
  minSwings: 5,
  minAnswerable: 6,
  minReplies: 3,
  /** What each number should reach: shares from 0 to 1, and the median reply time in updates (30 is half a second). */
  targets: { avoided: 0.7, hitRate: 0.5, answered: 0.6, replyTicks: 30 },
  /** Bin edges in updates. A value goes in the first bin whose upper edge is above it. */
  replyBinEdges: [15, 30, 45, 60, 90],
  /** The dodge timing: updates between the dodge beginning and the danger beginning (negative: it began after). */
  dodgeBinEdges: [0, 6, 12, 24, 48],
} as const;

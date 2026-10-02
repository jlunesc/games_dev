/** Every cut-off and bin of the fight details in one place (see docs/stats.md section 7.6). The recommendation has none: it only ranks counts. */
export const DETAILS_TUNING = {
  /** An opening shorter than this many updates is too short to answer (a swing needs 3 updates to start up and 4 to hit), so it is left out of the reply numbers. */
  minReplyWindowTicks: 12,
  /** The longest delay tried when finding how much later a dodge could have begun (half a second). */
  maxSlackTicks: 30,
} as const;

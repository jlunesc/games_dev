/** Every cut-off of the fight insights in one place (see docs/stats.md section 7.6). */
export const INSIGHT_TUNING = {
  /** How many lines the summary shows at most. */
  maxLines: 3,
  /** A dodge that began within this share of the warning-to-danger time before the danger is late (inclusive). */
  lateShare: 0.2,
  /** A dodge that began within this share of that time after the warning began is early (inclusive). */
  earlyShare: 0.25,
  /** The fewest hits of one kind before it is called a pattern. */
  minHitsForPattern: 2,
  /** The fewest greedy swings before they are called a pattern. */
  minGreedySwings: 2,
  /** The fewest openings before the opening rate is judged. */
  minOpenings: 3,
  /** The fewest missed openings of one cause before it is called a pattern. */
  minMissedOpenings: 2,
} as const;

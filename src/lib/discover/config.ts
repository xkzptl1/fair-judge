// ----------------------------------------------------------------
// Phase 6.5 discovery configuration
//
// All promotion decisions are derived from these values alone.
// No editorial judgment is required or encoded here.
//
// To move from observation → auto-promotion:
//   1. Validate threshold quality from candidate_topics rows
//   2. Set autoPromote: true
//   3. Optionally adjust thresholds based on observed false-positive rate
// ----------------------------------------------------------------

export const DISCOVER_CONFIG = {
  // Phase 6.5a: false  →  Phase 6.5b: true
  autoPromote: false as boolean,

  // Minimum score required for promotion
  promotionThreshold: 0.65,

  // Hard requirement gates — all must pass before scoring matters
  hardRequirements: {
    minArticles:       5,    // clusters smaller than this are noise
    minDomains:        3,    // prevents single-outlet stories from promoting
    maxAgeHours:       72,   // articles must be recent
    maxEntityOverlap:  0.6,  // max overlap with any existing topic (dedup)
  },

  // Scoring signal weights — must sum to 1.0
  scoring: {
    crossLocale:      { weight: 0.35, targetLocales:  3 },
    sourceDiversity:  { weight: 0.25, targetDomains:  8 },
    articleVolume:    { weight: 0.20, targetArticles: 15 },
    clusterCoherence: { weight: 0.20 },
  },

  // Discovery parameters
  discovery: {
    // Minimum Jaccard entity-overlap to merge two articles into the same cluster
    minClusterOverlap:    0.25,
    // Minimum cluster size to even consider as a candidate
    minRawClusterSize:    3,
  },
} as const;

export type DiscoverConfig = typeof DISCOVER_CONFIG;

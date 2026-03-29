// ----------------------------------------------------------------
// Promotion Decision Engine — Framework v2.0
//
// Pure functions only. No DB calls, no side effects.
// Input: a candidate object + caller-supplied context (entity sets).
// Output: decision, reason, rule_trigger — serialisable for logs/UI.
//
// Caller responsibility for dedup context:
//   SELECT ct.entities, ct.promoted_topic_id AS topic_id, t.title
//   FROM   candidate_topics ct
//   JOIN   topics t ON t.id = ct.promoted_topic_id
//   WHERE  t.is_active = true
//   AND    ct.promoted_topic_id IS NOT NULL
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// Input types
// ----------------------------------------------------------------

export interface HardRequirementGate {
  pass:          boolean;
  value?:        number;
  threshold?:    number;
  oldest_hours?: number;
  overlap?:      number;
  note?:         string;
}

export interface HardRequirements {
  min_articles:  HardRequirementGate;
  min_domains:   HardRequirementGate;
  freshness:     HardRequirementGate;
  no_duplicate:  HardRequirementGate;
}

export interface CandidateInput {
  id:                 string;
  title:              string;
  entities:           string[];
  promotion_score:    number;
  domain_count:       number;
  article_count:      number;
  hard_requirements:  HardRequirements;
  promotion_snapshot: { category?: string } | null;
  status:             string;
  discovered_at:      string;  // ISO 8601
}

/**
 * Entity set for one active promoted topic.
 * Caller must resolve from candidate_topics via promoted_topic_id — the
 * topics table does not store entities directly.
 */
export interface TopicEntitySet {
  topic_id: string;
  title:    string;
  entities: string[];
}

export interface DecisionContext {
  /** Entity sets of all active promoted topics. Required for dedup. */
  activeTopicEntitySets: TopicEntitySet[];
  /**
   * Inject current time for deterministic unit tests.
   * Defaults to new Date() when omitted.
   */
  now?: Date;
}

// ----------------------------------------------------------------
// Output types
// ----------------------------------------------------------------

export interface DedupMatchResult {
  topic_id:    string;
  title:       string;
  jaccard:     number;
  directional: number;
  action:      'reject' | 'hold' | 'pass';
}

export interface CandidateDedupResult {
  /** Candidate to keep as pending. */
  winner_id:  string;
  /** Candidate to reject or flag. */
  loser_id:   string;
  jaccard:    number;
  action:     'reject_lower' | 'note_near_duplicate' | 'pass';
}

export interface DecisionResult {
  candidate_id:  string;
  /** promote = eligible; auto-promotion is disabled — no action is taken. */
  decision:      'promote' | 'hold' | 'reject';
  /** Human-readable sentence suitable for logs and review UI. */
  reason:        string;
  /** Machine-readable snake_case rule identifier. */
  rule_trigger:  string;
  score:         number;
  /** Populated only when a dedup check influenced the decision. */
  dedup_match?:  DedupMatchResult;
}

// ----------------------------------------------------------------
// Thresholds — single source of truth, directly from framework v2.0
// ----------------------------------------------------------------

/** SPEC NOTE: exactly 0.80 is BORDERLINE (>= 0.65 and <= 0.80), not strong.
 *  A score of 0.80 triggers manual review, not auto-promotion.
 *  If this is unintentional, change SCORE_STRONG_MIN to 0.79 and update
 *  the borderline upper bound to < 0.80. */
const SCORE_STRONG_MIN      = 0.80;   // strictly greater than to be strong
const SCORE_BORDER_MIN      = 0.65;
const SCORE_HOLD_MIN        = 0.60;
const SCORE_REJECT_MAX      = 0.50;   // <= this value = reject

const DEDUP_JACCARD_REJECT      = 0.75;
const DEDUP_JACCARD_HOLD        = 0.50;
const DEDUP_JACCARD_SECONDARY   = 0.40;  // apply directional check above this
const DEDUP_DIRECTIONAL_BLOCK   = 0.90;

const DEDUP_CAND_JACCARD_REJECT = 0.80;
const DEDUP_CAND_JACCARD_NOTE   = 0.60;

const OBSERVATION_WINDOW_H  = 48;
const FIRST_CYCLE_PROXY_H   = 24;  // proxy for "one discovery cycle"; see spec ambiguity §1
const STALE_REJECT_DAYS     = 7;

// ----------------------------------------------------------------
// Noise cluster detection
// ----------------------------------------------------------------

/** Two-word or more Title-Case phrases that are NOT person names. */
const KNOWN_NON_PERSON_PHRASES = new Set([
  'Middle East', 'North Korea', 'South Korea', 'Saudi Arabia',
  'Hong Kong', 'New Zealand', 'Costa Rica', 'El Salvador',
  'United States', 'United Kingdom', 'European Union',
  'White House', 'United Nations', 'World Bank', 'Black Sea',
  'Red Sea', 'South China Sea', 'Persian Gulf', 'Gaza Strip',
]);

/**
 * Heuristic: entity is a person name if it is two or more Title-Case words
 * and is not a known geopolitical or organisational multi-word phrase.
 *
 * Matches: "Israel Adesanya", "Joe Pyfer", "Elon Musk"
 * Does NOT match: "Middle East", "Saudi Arabia", "Iran", "UFC"
 */
export function looksLikePersonName(entity: string): boolean {
  if (KNOWN_NON_PERSON_PHRASES.has(entity)) return false;
  return /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(entity);
}

/**
 * Sport and entertainment organisations that signal a noise cluster when
 * combined with a geopolitical entity name collision.
 * This list is intentionally conservative. Extend as new noise patterns emerge.
 */
const SPORT_ENTERTAINMENT_ORGS = new Set([
  'UFC', 'NBA', 'MLB', 'NHL', 'NFL', 'FIFA', 'WWE', 'Bellator',
  'PFL', 'ONE Championship', 'Premier League', 'La Liga',
  'Olympics', 'IOC', 'NCAA', 'Boxing', 'MMA',
]);

/**
 * Returns true when the entity list contains both a person name and a
 * sport/entertainment organisation — canonical signal of a geo/person
 * entity collision cluster that is not a topic.
 */
export function isNoisyCluster(entities: string[]): boolean {
  const hasPerson   = entities.some(looksLikePersonName);
  const hasSportOrg = entities.some((e) => SPORT_ENTERTAINMENT_ORGS.has(e));
  return hasPerson && hasSportOrg;
}

// ----------------------------------------------------------------
// Overlap metrics
// ----------------------------------------------------------------

/**
 * Jaccard similarity between two entity lists.
 * |A ∩ B| / |A ∪ B|
 * Returns 1 for two empty lists (no divergence), 0 if one is empty.
 */
export function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const e of setA) {
    if (setB.has(e)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Directional overlap: what fraction of candidate's entities appear in the topic.
 * |candidate ∩ topic| / |candidate|
 * Used only as a secondary signal when Jaccard is in [0.40, 0.49].
 */
export function directionalOverlap(candidate: string[], topic: string[]): number {
  if (candidate.length === 0) return 0;
  const topicSet = new Set(topic);
  return candidate.filter((e) => topicSet.has(e)).length / candidate.length;
}

// ----------------------------------------------------------------
// Dedup helpers
// ----------------------------------------------------------------

/**
 * Evaluate a candidate against all active promoted topic entity sets.
 * Returns the single worst (most blocking) match, or null if all pass.
 *
 * Algorithm (per framework v2.0 §4a):
 *   1. Compute Jaccard for each topic.
 *   2. If Jaccard >= 0.75 → reject.
 *   3. If Jaccard >= 0.50 → hold.
 *   4. If Jaccard >= 0.40 AND directional >= 0.90 → hold.
 *   5. Otherwise → pass.
 */
export function evaluateDedupVsTopics(
  candidateEntities: string[],
  activeTopics:      TopicEntitySet[],
): DedupMatchResult | null {
  let worst: DedupMatchResult | null = null;

  for (const topic of activeTopics) {
    const jaccard     = jaccardOverlap(candidateEntities, topic.entities);
    const directional = directionalOverlap(candidateEntities, topic.entities);

    let action: DedupMatchResult['action'];
    if (jaccard >= DEDUP_JACCARD_REJECT) {
      action = 'reject';
    } else if (jaccard >= DEDUP_JACCARD_HOLD) {
      action = 'hold';
    } else if (jaccard >= DEDUP_JACCARD_SECONDARY && directional >= DEDUP_DIRECTIONAL_BLOCK) {
      action = 'hold';
    } else {
      action = 'pass';
    }

    if (action === 'pass') continue;

    // Keep the worst result: reject beats hold; within same action, higher jaccard wins.
    if (
      !worst ||
      (action === 'reject' && worst.action !== 'reject') ||
      (action === worst.action && jaccard > worst.jaccard)
    ) {
      worst = { topic_id: topic.topic_id, title: topic.title, jaccard, directional, action };
    }
  }

  return worst;
}

/**
 * Evaluate two pending candidates against each other (§4b).
 * Call before enrichment to avoid LLM cost on near-duplicates.
 *
 * Tiebreak: higher score wins; if scores within 0.05, higher domain_count wins.
 */
export function evaluateDedupVsCandidate(
  a: Pick<CandidateInput, 'id' | 'entities' | 'promotion_score' | 'domain_count'>,
  b: Pick<CandidateInput, 'id' | 'entities' | 'promotion_score' | 'domain_count'>,
): CandidateDedupResult {
  const jaccard = jaccardOverlap(a.entities, b.entities);

  const aWins =
    a.promotion_score > b.promotion_score + 0.05 ? true
    : b.promotion_score > a.promotion_score + 0.05 ? false
    : a.domain_count >= b.domain_count;

  if (jaccard >= DEDUP_CAND_JACCARD_REJECT) {
    return { winner_id: aWins ? a.id : b.id, loser_id: aWins ? b.id : a.id, jaccard, action: 'reject_lower' };
  }
  if (jaccard >= DEDUP_CAND_JACCARD_NOTE) {
    return { winner_id: aWins ? a.id : b.id, loser_id: aWins ? b.id : a.id, jaccard, action: 'note_near_duplicate' };
  }
  return { winner_id: a.id, loser_id: b.id, jaccard, action: 'pass' };
}

// ----------------------------------------------------------------
// Decision engine — main entry point
// ----------------------------------------------------------------

/**
 * Evaluate a single candidate against the Promotion Decision Framework v2.0.
 *
 * Evaluation order:
 *   Phase A — Hard rejects (cheapest checks first, no dedup computation)
 *   Phase B — Dedup check against active topics
 *   Phase C — Hold conditions (score bands, gates, enrichment, time windows)
 *   Phase D — Promote (strong signal; auto-promotion is disabled)
 */
export function evaluateCandidate(
  candidate: CandidateInput,
  context:   DecisionContext,
): DecisionResult {
  const now          = context.now ?? new Date();
  const discoveredAt = new Date(candidate.discovered_at);
  const ageHours     = (now.getTime() - discoveredAt.getTime()) / 3_600_000;
  const ageDays      = ageHours / 24;
  const score        = candidate.promotion_score;
  const req          = candidate.hard_requirements;

  function make(
    decision:     DecisionResult['decision'],
    rule_trigger: string,
    reason:       string,
    dedup_match?: DedupMatchResult,
  ): DecisionResult {
    return { candidate_id: candidate.id, decision, reason, rule_trigger, score, dedup_match };
  }

  // ── Phase A: Hard rejects ──────────────────────────────────────────

  // A1. Pre-normalization stale row (pre-Phase 6.5b entity extraction)
  if (req.no_duplicate.note?.includes('Phase 6.5b')) {
    return make('reject', 'stale_row_pre_normalization',
      'Row created before entity normalization (Phase 6.5b). Entity data is unreliable and cannot be evaluated.');
  }

  // A2. Noise cluster: person name + sport/entertainment org collision
  if (isNoisyCluster(candidate.entities)) {
    return make('reject', 'noise_cluster_person_sport',
      `Entities contain a person name combined with a sport or entertainment organisation (${candidate.entities.join(', ')}). Not a topic.`);
  }

  // A3. Score at or below minimum (0.50 is not a passing score)
  if (score <= SCORE_REJECT_MAX) {
    return make('reject', 'score_at_or_below_minimum',
      `Score ${score.toFixed(3)} is at or below the minimum threshold of ${SCORE_REJECT_MAX}.`);
  }

  // A4. Low score band (0.50–0.59) with expired hold window
  if (score < SCORE_HOLD_MIN && ageHours >= OBSERVATION_WINDOW_H) {
    return make('reject', 'score_band_low_expired',
      `Score ${score.toFixed(3)} (low band 0.50–0.59) and the ${OBSERVATION_WINDOW_H}h observation window has expired without improvement.`);
  }

  // A5. Stale candidate: older than 7 days and below promotion threshold
  if (ageDays > STALE_REJECT_DAYS && score < SCORE_BORDER_MIN) {
    return make('reject', 'stale_candidate_7_days',
      `Candidate is ${Math.floor(ageDays)} days old with score ${score.toFixed(3)} — below promotion threshold. Topic window has passed.`);
  }

  // A6. Single-source cluster
  if (candidate.domain_count === 1 && candidate.article_count <= 3) {
    return make('reject', 'single_source_cluster',
      `Only 1 domain and ${candidate.article_count} articles. Cannot provide multi-perspective coverage.`);
  }

  // A7. Unclassifiable category with low score
  const category = candidate.promotion_snapshot?.category;
  if (category === 'その他' && score < 0.75) {
    return make('reject', 'category_other_low_confidence',
      `Category resolved to 'その他' (unclassified) and score ${score.toFixed(3)} is below the 0.75 threshold for unclassified topics.`);
  }

  // ── Phase B: Dedup vs active topics ───────────────────────────────

  const dedupResult = evaluateDedupVsTopics(candidate.entities, context.activeTopicEntitySets);

  if (dedupResult?.action === 'reject') {
    return make('reject', 'dedup_reject_jaccard_high',
      `Jaccard overlap ${dedupResult.jaccard.toFixed(3)} ≥ ${DEDUP_JACCARD_REJECT} with active topic "${dedupResult.title}". Near-duplicate.`,
      dedupResult);
  }

  // ── Phase C: Holds ─────────────────────────────────────────────────

  // C1. Dedup borderline hold (carry forward from Phase B)
  if (dedupResult?.action === 'hold') {
    const reason = dedupResult.jaccard >= DEDUP_JACCARD_HOLD
      ? `Jaccard overlap ${dedupResult.jaccard.toFixed(3)} is in borderline range (${DEDUP_JACCARD_HOLD}–${DEDUP_JACCARD_REJECT}) with active topic "${dedupResult.title}". Re-evaluate when that topic ages out.`
      : `Jaccard ${dedupResult.jaccard.toFixed(3)} with directional ${dedupResult.directional.toFixed(3)} ≥ ${DEDUP_DIRECTIONAL_BLOCK} against "${dedupResult.title}". Candidate is a near-subset.`;
    return make('hold', 'dedup_hold_borderline', reason, dedupResult);
  }

  // C2. Any hard gate failing
  const failedGates = (
    [
      ['min_articles', req.min_articles],
      ['min_domains',  req.min_domains],
      ['freshness',    req.freshness],
      ['no_duplicate', req.no_duplicate],
    ] as [string, HardRequirementGate][]
  ).filter(([, gate]) => !gate.pass);

  if (failedGates.length > 0) {
    const names       = failedGates.map(([n]) => n).join(', ');
    const primaryGate = failedGates[0][0];
    return make('hold', `gate_fail_${primaryGate}`,
      `Gate(s) failing: ${names}. Waiting for conditions to improve.`);
  }

  // C3. Enrichment not yet run
  if (candidate.promotion_snapshot === null) {
    return make('hold', 'enrichment_missing',
      'Enrichment has not run yet. Run /api/discover/enrich/trigger before evaluating this candidate.');
  }

  // C4. Permanent hold: score 0.63–0.64 (below borderline, never promote)
  if (score >= 0.63 && score < SCORE_BORDER_MIN) {
    return make('hold', 'score_near_threshold_hold',
      `Score ${score.toFixed(3)} is in the 0.63–0.64 range. This band does not qualify for promotion regardless of other conditions.`);
  }

  // C5. First-cycle hold: score 0.65–0.67 within first discovery cycle proxy
  if (score >= SCORE_BORDER_MIN && score <= 0.67 && ageHours < FIRST_CYCLE_PROXY_H) {
    return make('hold', 'score_borderline_first_cycle',
      `Score ${score.toFixed(3)} is in the 0.65–0.67 range and candidate is ${Math.floor(ageHours)}h old (within first-cycle proxy of ${FIRST_CYCLE_PROXY_H}h). Hold one cycle before review.`);
  }

  // C6. Observation window: all scores >= 0.60 held for 48h after discovery
  if (score >= SCORE_HOLD_MIN && ageHours < OBSERVATION_WINDOW_H) {
    return make('hold', 'observation_window',
      `Candidate is ${Math.floor(ageHours)}h old. Holding for ${OBSERVATION_WINDOW_H}h observation window before any promotion decision.`);
  }

  // C7. Low score band still within hold window (score 0.50–0.59, age < 48h)
  // Reaching here means score is in (0.50, 0.60) and age < 48h (A4 already handled expired case).
  if (score < SCORE_HOLD_MIN) {
    return make('hold', 'score_band_low_hold',
      `Score ${score.toFixed(3)} is in the low band (0.50–0.59). Hold until ${OBSERVATION_WINDOW_H}h observation window expires.`);
  }

  // C8. Borderline: score 0.65–0.80 (inclusive) — requires manual review
  // SPEC NOTE: score exactly 0.80 falls here, not in Phase D.
  if (score >= SCORE_BORDER_MIN && score <= SCORE_STRONG_MIN) {
    return make('hold', 'score_borderline_manual_review',
      `Score ${score.toFixed(3)} is in the borderline range (${SCORE_BORDER_MIN}–${SCORE_STRONG_MIN}). Manual operator review required before promotion.`);
  }

  // ── Phase D: Promote ───────────────────────────────────────────────

  // D1. Strong signal: score > 0.80, all gates pass, enriched
  // Auto-promotion is DISABLED. Returns 'promote' signal only — no action is taken.
  if (score > SCORE_STRONG_MIN) {
    return make('promote', 'score_strong_signal',
      `Score ${score.toFixed(3)} exceeds strong-signal threshold (> ${SCORE_STRONG_MIN}). All gates pass. Eligible for promotion. Auto-promotion is disabled — manual trigger required.`);
  }

  // Fallback: should not be reachable given the conditions above.
  return make('hold', 'fallback_hold',
    `No rule matched. Score: ${score.toFixed(3)}. Manual inspection required.`);
}

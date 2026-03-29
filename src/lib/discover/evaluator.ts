// ----------------------------------------------------------------
// Phase 10: Promotion Decision Evaluator
//
// Runs the decision engine against all pending candidates,
// persists the result, and updates status.
//
// Status transitions:
//   pending → rejected           (decision = reject)
//   pending → ready_for_promotion (decision = promote)
//   pending → pending             (decision = hold, no status change)
//
// Idempotency:
//   Only fetches status='pending'. Rejected and ready_for_promotion
//   candidates are excluded from re-evaluation on subsequent runs.
//   Hold candidates remain pending and ARE re-evaluated each run —
//   their decision_result is overwritten with the latest evaluation,
//   which is correct because hold conditions change over time (e.g.
//   the observation window expires).
//
// DB write per candidate:
//   decision_result JSONB  ← always written
//   status                 ← written only if reject or promote
//   updated_at             ← always written
//
// Called from: runEnrichment() (end of enrich pipeline)
//              POST /api/discover/evaluate (standalone)
// ----------------------------------------------------------------

import { supabase } from '@/lib/supabase';
import {
  evaluateCandidate,
  type CandidateInput,
  type TopicEntitySet,
  type DecisionResult,
} from './decision';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface CandidateRow {
  id:                 string;
  cluster_key:        string;
  entities:           string[];
  promotion_score:    number;
  domain_count:       number;
  article_count:      number;
  hard_requirements:  unknown;
  promotion_snapshot: { category?: string } | null;
  status:             string;
  discovered_at:      string;
  title:              string;
}

interface ActiveTopicRow {
  entities:          string[];
  promoted_topic_id: string;
  topics:            { title: string };
}

export interface EvaluationRowResult {
  candidateId:    string;
  clusterKey:     string;
  decision:       DecisionResult['decision'];
  rule_trigger:   string;
  previousStatus: string;
  newStatus:      string;
}

export interface EvaluationRunResult {
  evaluated:           number;
  ready_for_promotion: number;
  rejected:            number;
  held:                number;
  errors:              number;
  results:             EvaluationRowResult[];
}

// ----------------------------------------------------------------
// Fetch context: active topic entity sets for dedup
//
// Joins candidate_topics → topics to recover the entity list for
// each promoted topic. The topics table itself has no entities column.
// ----------------------------------------------------------------

async function fetchActiveTopicEntitySets(): Promise<TopicEntitySet[]> {
  const { data, error } = await supabase
    .from('candidate_topics')
    .select('entities, promoted_topic_id, topics!inner(title)')
    .not('promoted_topic_id', 'is', null)
    .eq('topics.is_active', true);

  if (error || !data) {
    console.warn('[evaluate] could not fetch active topic entity sets:', error?.message);
    return [];
  }

  return (data as unknown as ActiveTopicRow[]).map((row) => ({
    topic_id: row.promoted_topic_id,
    title:    row.topics?.title ?? '',
    entities: Array.isArray(row.entities) ? row.entities : [],
  }));
}

// ----------------------------------------------------------------
// Map DB row to the typed CandidateInput the engine expects
// ----------------------------------------------------------------

function toCandidateInput(row: CandidateRow): CandidateInput {
  const req = row.hard_requirements as Record<string, {
    pass: boolean;
    value?: number;
    threshold?: number;
    oldest_hours?: number;
    overlap?: number;
    note?: string;
  }> | null;

  const gate = (key: string) => ({
    pass:          req?.[key]?.pass          ?? false,
    value:         req?.[key]?.value,
    threshold:     req?.[key]?.threshold,
    oldest_hours:  req?.[key]?.oldest_hours,
    overlap:       req?.[key]?.overlap,
    note:          req?.[key]?.note,
  });

  return {
    id:                 row.id,
    title:              row.title,
    entities:           row.entities,
    promotion_score:    row.promotion_score,
    domain_count:       row.domain_count,
    article_count:      row.article_count,
    hard_requirements: {
      min_articles:  gate('min_articles'),
      min_domains:   gate('min_domains'),
      freshness:     gate('freshness'),
      no_duplicate:  gate('no_duplicate'),
    },
    promotion_snapshot: row.promotion_snapshot,
    status:             row.status,
    discovered_at:      row.discovered_at,
  };
}

// ----------------------------------------------------------------
// Persist decision for one candidate
// ----------------------------------------------------------------

async function persistDecision(
  candidateId: string,
  result:      DecisionResult,
): Promise<{ error: string | null }> {
  const newStatus =
    result.decision === 'reject'  ? 'rejected' :
    result.decision === 'promote' ? 'ready_for_promotion' :
    null;  // hold → no status change

  const update: Record<string, unknown> = {
    decision_result: {
      decision:      result.decision,
      rule_trigger:  result.rule_trigger,
      reason:        result.reason,
      score:         result.score,
      dedup_match:   result.dedup_match ?? null,
      evaluated_at:  new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  if (newStatus !== null) {
    update.status = newStatus;
  }

  const { error } = await supabase
    .from('candidate_topics')
    .update(update)
    .eq('id', candidateId);

  return { error: error?.message ?? null };
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------

export async function runEvaluation(): Promise<EvaluationRunResult> {
  // 1. Fetch all pending candidates (excludes rejected and ready_for_promotion)
  const { data, error: fetchError } = await supabase
    .from('candidate_topics')
    .select(
      'id, cluster_key, title, entities, promotion_score, domain_count, ' +
      'article_count, hard_requirements, promotion_snapshot, status, discovered_at'
    )
    .eq('status', 'pending')
    .order('promotion_score', { ascending: false });

  if (fetchError) {
    console.error('[evaluate] fetch error:', fetchError.message);
    return { evaluated: 0, ready_for_promotion: 0, rejected: 0, held: 0, errors: 1, results: [] };
  }

  const candidates = (data as unknown as CandidateRow[]) ?? [];
  console.log(`[evaluate] ${candidates.length} pending candidates to evaluate`);

  // 2. Fetch dedup context once for the whole batch
  const activeTopicEntitySets = await fetchActiveTopicEntitySets();
  console.log(`[evaluate] dedup context: ${activeTopicEntitySets.length} active topic entity sets`);

  // 3. Evaluate and persist each candidate
  const results: EvaluationRowResult[] = [];
  let readyCount = 0;
  let rejectedCount = 0;
  let heldCount = 0;
  let errors = 0;

  for (const row of candidates) {
    const candidate = toCandidateInput(row);
    const decisionResult = evaluateCandidate(candidate, { activeTopicEntitySets });

    const { error: persistError } = await persistDecision(row.id, decisionResult);

    if (persistError) {
      console.error(`[evaluate] DB write failed for ${row.cluster_key}:`, persistError);
      errors++;
      continue;
    }

    const newStatus =
      decisionResult.decision === 'reject'  ? 'rejected' :
      decisionResult.decision === 'promote' ? 'ready_for_promotion' :
      'pending';

    console.log(
      `[evaluate] ${row.cluster_key} → ${decisionResult.decision} ` +
      `[${decisionResult.rule_trigger}]`
    );

    results.push({
      candidateId:    row.id,
      clusterKey:     row.cluster_key,
      decision:       decisionResult.decision,
      rule_trigger:   decisionResult.rule_trigger,
      previousStatus: row.status,
      newStatus,
    });

    if (decisionResult.decision === 'promote') readyCount++;
    else if (decisionResult.decision === 'reject') rejectedCount++;
    else heldCount++;
  }

  console.log(
    `[evaluate] done — ready: ${readyCount}, rejected: ${rejectedCount}, ` +
    `held: ${heldCount}, errors: ${errors}`
  );

  return {
    evaluated:           candidates.length,
    ready_for_promotion: readyCount,
    rejected:            rejectedCount,
    held:                heldCount,
    errors,
    results,
  };
}

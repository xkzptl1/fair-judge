// ----------------------------------------------------------------
// Phase 12: Auto-Promotion
//
// Selects the single best candidate that meets all high-confidence
// criteria and promotes it to the topics table.
//
// Conservative by design:
//   - Only operates on candidates already evaluated to
//     status='ready_for_promotion' by the decision engine.
//   - Applies additional numeric guards on top.
//   - Hard cap of 1 promotion per run.
//   - Dry-run mode returns what would be promoted without writing.
//
// Trigger point:
//   Called at the END of POST /api/discover/age-topics, after
//   runAging() and runEvaluation() have both completed.
//   This ensures:
//     1. Stale topics have been deactivated (dedup context is fresh)
//     2. All pending candidates have just been re-evaluated
//     3. Any candidate that aged past the observation window has had
//        its status updated before we look at it
//
// Safety guards — a candidate must pass ALL of the following:
//   G1. status = 'ready_for_promotion'     (decision engine approved)
//   G2. promotion_score > 0.80             (strong signal only)
//   G3. discovered_at <= now() - 24h       (observation window cleared)
//   G4. promotion_snapshot IS NOT NULL     (LLM enrichment complete)
//   G5. all hard_requirements gates pass   (checked in application code)
//   G6. decision_result.dedup_match IS NULL (no active topic overlap)
//
// G5 and G6 are redundant given the decision engine, but are kept as
// defence-in-depth. The engine is the source of truth; these guards
// protect against DB state inconsistencies (e.g. a status was manually
// set to ready_for_promotion without running the evaluator).
//
// Status written:
//   candidate_topics.status = 'auto_promoted'
//   (same as the pipeline auto-promote path; promotion_snapshot
//    distinguishes them via promote_config.source = 'auto')
// ----------------------------------------------------------------

import { supabase } from '@/lib/supabase';
import { ingestDiscoveredTopic, type DiscoveredIngestResult } from '@/lib/ingest/discovered';

// ----------------------------------------------------------------
// Thresholds — intentionally not in DISCOVER_CONFIG so they are
// not accidentally loosened by a config change.
// ----------------------------------------------------------------
const SCORE_MIN     = 0.80;  // strictly greater than
const MIN_AGE_HOURS = 24;

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface CandidateRow {
  id:                 string;
  title:              string;
  cluster_key:        string;
  entities:           string[];
  article_urls:       string[];
  article_titles:     string[];
  locales:            string[];
  domain_count:       number;
  article_count:      number;
  promotion_score:    number;
  score_breakdown:    unknown;
  hard_requirements:  Record<string, { pass: boolean }> | null;
  promotion_snapshot: { category?: string; refined_title?: string } | null;
  decision_result:    { dedup_match: unknown } | null;
  discovered_at:      string;
}

export interface AutoPromotion {
  id:       string;
  title:    string;
  topic_id: string;
  score:    number;
  ingest:   Omit<DiscoveredIngestResult, 'topicId' | 'title' | 'entities' | 'keywords'> | null;
}

export interface AutoPromotionResult {
  dry_run:       boolean;
  promoted:      boolean;
  candidate:     AutoPromotion | null;
  skipped_count: number;   // passed score/age but failed G5 or G6
  errors:        string[];
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------

export async function runAutoPromotion(
  options: { dryRun?: boolean } = {}
): Promise<AutoPromotionResult> {
  const dryRun  = options.dryRun ?? false;
  const errors: string[] = [];

  const cutoff24h = new Date(Date.now() - MIN_AGE_HOURS * 3_600_000).toISOString();

  // Fetch all candidates that pass the SQL-filterable guards (G1–G4)
  const { data, error: fetchError } = await supabase
    .from('candidate_topics')
    .select(
      'id, title, cluster_key, entities, article_urls, article_titles, locales, ' +
      'domain_count, article_count, promotion_score, score_breakdown, ' +
      'hard_requirements, promotion_snapshot, decision_result, discovered_at'
    )
    .eq('status', 'ready_for_promotion')      // G1
    .gt('promotion_score', SCORE_MIN)          // G2
    .lte('discovered_at', cutoff24h)           // G3
    .not('promotion_snapshot', 'is', null)     // G4
    .order('promotion_score', { ascending: false });

  if (fetchError) {
    return { dry_run: dryRun, promoted: false, candidate: null, skipped_count: 0, errors: [fetchError.message] };
  }

  const rows = (data as unknown as CandidateRow[]) ?? [];

  if (rows.length === 0) {
    console.log('[auto-promote] no eligible candidates');
    return { dry_run: dryRun, promoted: false, candidate: null, skipped_count: 0, errors: [] };
  }

  // Apply application-level guards (G5, G6) and pick the first that passes
  let skipped = 0;
  let chosen: CandidateRow | null = null;

  for (const row of rows) {
    // G5: all hard gates must pass
    const req = row.hard_requirements;
    if (!req || !Object.values(req).every((g) => g.pass)) {
      console.log(`[auto-promote] skipping "${row.cluster_key}" — hard gate fail (G5)`);
      skipped++;
      continue;
    }

    // G6: no dedup match in decision_result
    if (row.decision_result?.dedup_match !== null && row.decision_result?.dedup_match !== undefined) {
      console.log(`[auto-promote] skipping "${row.cluster_key}" — dedup_match present (G6)`);
      skipped++;
      continue;
    }

    chosen = row;
    break;  // hard cap: only consider the first eligible candidate
  }

  if (!chosen) {
    console.log(`[auto-promote] ${skipped} candidate(s) failed application guards`);
    return { dry_run: dryRun, promoted: false, candidate: null, skipped_count: skipped, errors: [] };
  }

  const topicTitle = chosen.promotion_snapshot?.refined_title ?? chosen.title;
  const category   = chosen.promotion_snapshot?.category ?? '国際';

  console.log(`[auto-promote] selected "${chosen.cluster_key}" (score: ${chosen.promotion_score})`);

  // ── Dry-run: return intent without writing ──────────────────────
  if (dryRun) {
    console.log(`[auto-promote] dry-run — would promote "${topicTitle}"`);
    return {
      dry_run:       true,
      promoted:      false,
      candidate:     { id: chosen.id, title: topicTitle, topic_id: '(dry-run)', score: chosen.promotion_score, ingest: null },
      skipped_count: skipped,
      errors:        [],
    };
  }

  // ── Live promotion ──────────────────────────────────────────────

  const promotedAt = new Date().toISOString();

  // Insert into topics
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .insert({
      title:          topicTitle,
      summary:        null,
      main_issues:    [],
      category,
      overseas_ratio: 0.8,
      article_count:  0,
      source_count:   0,
      is_active:      true,
      origin:         'discovered',
      promoted_at:    promotedAt,
    })
    .select('id')
    .maybeSingle();

  if (topicError || !topic) {
    const msg = topicError?.message ?? 'topic insert returned null';
    console.error('[auto-promote] topic insert error:', msg);
    return { dry_run: false, promoted: false, candidate: null, skipped_count: skipped, errors: [msg] };
  }

  const topicId = topic.id as string;

  // Update candidate
  const promotionSnapshot = {
    promotion_score:   chosen.promotion_score,
    score_breakdown:   chosen.score_breakdown,
    hard_requirements: chosen.hard_requirements,
    promoted_at:       promotedAt,
    promote_config:    { source: 'auto', version: '12.0' },
  };

  const { error: updateError } = await supabase
    .from('candidate_topics')
    .update({
      status:             'auto_promoted',
      promoted_at:        promotedAt,
      promoted_topic_id:  topicId,
      promotion_snapshot: promotionSnapshot,
      updated_at:         promotedAt,
    })
    .eq('id', chosen.id);

  if (updateError) {
    console.error('[auto-promote] candidate update error:', updateError.message);
    // Topic was inserted; log the orphan for manual recovery
    errors.push(`topic ${topicId} created but candidate update failed: ${updateError.message}`);
  }

  console.log(`[auto-promote] promoted "${topicTitle}" → topic ${topicId}`);

  // Trigger article ingestion (best-effort — failure does not roll back promotion)
  let ingestSummary: AutoPromotion['ingest'] = null;
  try {
    const ingest = await ingestDiscoveredTopic(topicId);
    ingestSummary = {
      fetched:     ingest.fetched,
      afterFilter: ingest.afterFilter,
      added:       ingest.added,
      skipped:     ingest.skipped,
      errors:      ingest.errors,
    };
    console.log(
      `[auto-promote] ingest done — added: ${ingest.added}, skipped: ${ingest.skipped}, errors: ${ingest.errors.length}`
    );
  } catch (e) {
    const msg = `ingest failed for topic ${topicId}: ${e}`;
    console.error('[auto-promote]', msg);
    errors.push(msg);
  }

  return {
    dry_run:       false,
    promoted:      true,
    candidate:     { id: chosen.id, title: topicTitle, topic_id: topicId, score: chosen.promotion_score, ingest: ingestSummary },
    skipped_count: skipped,
    errors,
  };
}

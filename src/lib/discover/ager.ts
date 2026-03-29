// ----------------------------------------------------------------
// Phase 11: Topic Aging
//
// Deactivates discovered topics that have gone stale, freeing held
// candidates whose dedup match was blocking them.
//
// Aging rules (both applied independently):
//   A. last_article_at < now() - 72h
//      Topic has had no new article activity for 3 days.
//      Applies only when last_article_at IS NOT NULL (i.e. at least
//      one article has been ingested for this topic).
//
//   B. promoted_at < now() - 7d
//      Hard cap: topic is retired regardless of article activity.
//
// Scoped to origin='discovered' only.
// Config-managed topics (origin='config') are not touched.
//
// Called from: POST /api/discover/age-topics
//              (which then chains runEvaluation() so held candidates
//               are re-evaluated in the same run)
// ----------------------------------------------------------------

import { supabase } from '@/lib/supabase';

export interface AgingResult {
  deactivated: number;
  topicIds:    string[];
  errors:      string[];
}

export async function runAging(): Promise<AgingResult> {
  const now       = Date.now();
  const cutoff72h = new Date(now - 72 * 3_600_000).toISOString();
  const cutoff7d  = new Date(now - 7 * 24 * 3_600_000).toISOString();

  // Rule A fires only when last_article_at IS NOT NULL and is stale.
  // Rule B fires unconditionally on promoted_at age.
  // NULL < timestamp evaluates to NULL (false) in Postgres, so a NULL
  // last_article_at silently skips Rule A — correct behaviour.
  const { data, error } = await supabase
    .from('topics')
    .update({ is_active: false })
    .eq('is_active', true)
    .eq('origin', 'discovered')
    .or(`last_article_at.lt.${cutoff72h},promoted_at.lt.${cutoff7d}`)
    .select('id, title');

  if (error) {
    console.error('[age-topics] update error:', error.message);
    return { deactivated: 0, topicIds: [], errors: [error.message] };
  }

  const rows = (data ?? []) as { id: string; title: string }[];
  console.log(`[age-topics] deactivated ${rows.length} topic(s)`);
  for (const r of rows) {
    console.log(`  ✗ ${r.title} (${r.id})`);
  }

  return {
    deactivated: rows.length,
    topicIds:    rows.map((r) => r.id),
    errors:      [],
  };
}

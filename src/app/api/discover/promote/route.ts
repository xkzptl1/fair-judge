import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ----------------------------------------------------------------
// POST /api/discover/promote
// Body: { candidateId: string }
//
// Manually promotes a ready_for_promotion candidate to the topics
// table. Mirrors the auto-promote path in pipeline.ts.
//
// Status logic:
//   Both auto-promote (pipeline) and manual-promote (this route)
//   write status = 'auto_promoted'. There is no separate
//   'manually_promoted' value — the promoted_at timestamp and
//   promotion_snapshot.promote_config.source distinguish them.
//
// Idempotency:
//   If the candidate already has promoted_topic_id set, the request
//   is rejected with 409 to prevent double-insertion.
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
  hard_requirements:  unknown;
  promotion_snapshot: { category?: string; refined_title?: string } | null;
  status:             string;
  promoted_topic_id:  string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { candidateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { candidateId } = body;
  if (!candidateId) {
    return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
  }

  // Fetch candidate
  const { data: row, error: fetchError } = await supabase
    .from('candidate_topics')
    .select(
      'id, title, cluster_key, entities, article_urls, article_titles, locales, ' +
      'domain_count, article_count, promotion_score, score_breakdown, ' +
      'hard_requirements, promotion_snapshot, status, promoted_topic_id'
    )
    .eq('id', candidateId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  const candidate = row as unknown as CandidateRow;

  if (candidate.status !== 'ready_for_promotion') {
    return NextResponse.json(
      { error: `Cannot promote candidate with status '${candidate.status}'. Must be ready_for_promotion.` },
      { status: 422 }
    );
  }

  if (candidate.promoted_topic_id) {
    return NextResponse.json(
      { error: 'Candidate already has a promoted_topic_id — possible double-submit.' },
      { status: 409 }
    );
  }

  // Derive title: prefer LLM-enriched title if available
  const topicTitle = candidate.promotion_snapshot?.refined_title ?? candidate.title;

  // Derive category from enrichment snapshot, fall back to '国際'
  const category = candidate.promotion_snapshot?.category ?? '国際';

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
    return NextResponse.json(
      { error: topicError?.message ?? 'Topic insert failed' },
      { status: 500 }
    );
  }

  // Update candidate: reuses auto_promoted status (see spec note above)
  const promotionSnapshot = {
    promotion_score:    candidate.promotion_score,
    score_breakdown:    candidate.score_breakdown,
    hard_requirements:  candidate.hard_requirements,
    promoted_at:        promotedAt,
    promote_config:     { source: 'manual', version: '11.0' },
  };

  const { error: updateError } = await supabase
    .from('candidate_topics')
    .update({
      status:             'auto_promoted',
      promoted_at:        promotedAt,
      promoted_topic_id:  topic.id,
      promotion_snapshot: promotionSnapshot,
      updated_at:         promotedAt,
    })
    .eq('id', candidateId);

  if (updateError) {
    // Topic was created but candidate update failed — log for manual fix
    console.error(
      `[promote] topic created (${topic.id}) but candidate update failed:`,
      updateError.message
    );
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log(`[promote] manually promoted "${topicTitle}" → topic ${topic.id}`);
  return NextResponse.json({ topicId: topic.id, title: topicTitle });
}

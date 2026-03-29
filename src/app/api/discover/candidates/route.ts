import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('candidate_topics')
    .select(
      'id, title, cluster_key, entities, locales, domain_count, article_count, ' +
      'promotion_score, score_breakdown, hard_requirements, status, ' +
      'promoted_topic_id, promotion_snapshot, discovered_at, updated_at'
    )
    .order('promotion_score', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as any[] ?? []).map((row: any) => {
    // Summarise hard_requirements as a flat pass/fail map
    const req = row.hard_requirements as Record<string, { pass: boolean }> | null;
    const gates = req
      ? Object.fromEntries(
          Object.entries(req).map(([k, v]) => [k, v.pass ? '✓' : '✗'])
        )
      : null;

    // Summarise score breakdown as rounded numbers
    const bd = row.score_breakdown as Record<
      string,
      { score: number; [k: string]: unknown }
    > | null;
    const scores = bd
      ? Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, v.score]))
      : null;

    const allGatesPass = req ? Object.values(req).every((v) => v.pass) : false;
    const eligible = allGatesPass && row.promotion_score >= 0.65;

    return {
      title:         row.title,
      status:        row.status,
      eligible,
      score:         row.promotion_score,
      scores,
      gates,
      entities:      row.entities,
      locales:       row.locales,
      article_count: row.article_count,
      domain_count:  row.domain_count,
      cluster_key:   row.cluster_key,
      promoted_topic_id:  row.promoted_topic_id ?? null,
      promotion_snapshot: row.promotion_snapshot ?? null,
      discovered_at:      row.discovered_at,
      updated_at:         row.updated_at,
    };
  });

  return NextResponse.json({
    total:      rows.length,
    eligible:   rows.filter((r) => r.eligible).length,
    promoted:   rows.filter((r) => r.status === 'auto_promoted').length,
    pending:    rows.filter((r) => r.status === 'pending').length,
    candidates: rows,
  });
}

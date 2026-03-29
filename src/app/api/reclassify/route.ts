import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { classifyArticle } from '@/lib/ingest/classifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 50; // safe ceiling for Supabase URL length

interface ReclassifyResult {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  stanceBreakdown: Record<string, number>;
}

export async function POST(): Promise<NextResponse> {
  // Step 1: Fetch only IDs — small payload, no URL length risk
  const { data: classRows, error: classError } = await supabase
    .from('article_classifications')
    .select('id, article_id')
    .eq('model', 'mock-v1');

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 });
  }

  const rows = classRows ?? [];
  const result: ReclassifyResult = {
    total: rows.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    stanceBreakdown: {},
  };

  if (rows.length === 0) {
    return NextResponse.json({ message: 'Nothing to reclassify', ...result });
  }

  // Step 2: Build article_id → classification_id map
  const classificationByArticleId = new Map<string, string>(
    rows.map((r: any) => [r.article_id, r.id])
  );
  const articleIds = [...classificationByArticleId.keys()];

  // Step 3: Fetch articles in safe batches of BATCH_SIZE
  const articleMap = new Map<string, { title: string; summary: string | null }>();

  for (let i = 0; i < articleIds.length; i += BATCH_SIZE) {
    const batch = articleIds.slice(i, i + BATCH_SIZE);
    const { data: articles, error: articleError } = await supabase
      .from('articles')
      .select('id, title, summary')
      .in('id', batch);

    if (articleError) {
      return NextResponse.json({ error: articleError.message }, { status: 500 });
    }

    for (const a of articles ?? []) {
      articleMap.set((a as any).id, { title: (a as any).title, summary: (a as any).summary });
    }
  }

  // Step 4: Classify and update in batches
  for (let i = 0; i < articleIds.length; i += BATCH_SIZE) {
    const batch = articleIds.slice(i, i + BATCH_SIZE);

    for (const articleId of batch) {
      const classificationId = classificationByArticleId.get(articleId);
      const article = articleMap.get(articleId);

      if (!classificationId || !article) {
        result.skipped++;
        continue;
      }

      const { stance, confidence } = classifyArticle(article.title, article.summary);

      const { error: updateError } = await supabase
        .from('article_classifications')
        .update({ stance, confidence, model: 'heuristic-v1' })
        .eq('id', classificationId);

      if (updateError) {
        console.error('Update error:', updateError.message);
        result.errors++;
      } else {
        result.updated++;
        result.stanceBreakdown[stance] = (result.stanceBreakdown[stance] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json(result);
}

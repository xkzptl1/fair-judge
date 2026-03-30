// ----------------------------------------------------------------
// Conflict-points generation (Phase 2 Evolution)
//
// Takes the articles for a topic and asks the LLM to surface
// 3–5 concise opposing viewpoints — the "where interpretations
// diverge" layer that is the core value proposition of Fair Judge.
//
// Safe by design:
//   - Empty array written on any error (no null, no crash)
//   - Skip if already generated (idempotent by default)
//   - Max 15 articles fed to the LLM to stay within token limits
// ----------------------------------------------------------------

import { supabase } from '@/lib/supabase';
import { callLLM } from '@/lib/discover/llm';

interface ArticleRow {
  title: string;
  summary: string | null;
}

async function generate(
  topicTitle: string,
  articles: ArticleRow[]
): Promise<string[]> {
  if (articles.length === 0) return [];

  const selected = articles
    .filter((a) => a.title.trim().length > 0)
    .slice(0, 15);

  if (selected.length === 0) return [];

  const articleList = selected
    .map((a, i) => {
      const summary = a.summary ? `\n   ${a.summary.slice(0, 120)}` : '';
      return `${i + 1}. ${a.title}${summary}`;
    })
    .join('\n\n');

  const systemPrompt = `あなたはメディア分析の専門家です。
複数の記事タイトルと要約から、同じ話題に関する「解釈の対立点」を3〜5つ抽出してください。

ルール:
- 対立点は「〜か、それとも〜か」という構造で端的に表現してください
- 日本語で出力してください
- 各対立点は15〜40文字程度で簡潔に
- 冗長な説明・重複・体言止めの羅列は不要です
- JSON形式で返してください: { "conflict_points": ["...", "...", "..."] }`;

  const userPrompt = `トピック: ${topicTitle}\n\n記事一覧:\n${articleList}`;

  const raw = await callLLM(systemPrompt, userPrompt);
  const parsed = JSON.parse(raw) as { conflict_points?: unknown };
  const points = parsed.conflict_points;
  if (!Array.isArray(points)) return [];
  return (points as unknown[])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .slice(0, 5);
}

// ----------------------------------------------------------------
// Update a single topic's conflict_points.
// Pass force=true to regenerate even if already set.
// ----------------------------------------------------------------
export async function updateConflictPoints(
  topicId: string,
  { force = false }: { force?: boolean } = {}
): Promise<{ points: string[]; skipped: boolean }> {
  // Fetch topic + existing value
  const topicResult = await supabase
    .from('topics')
    .select('title, conflict_points')
    .eq('id', topicId)
    .single();

  if (topicResult.error || !topicResult.data) {
    return { points: [], skipped: true };
  }

  const existing = (topicResult.data.conflict_points as string[] | null) ?? [];
  if (!force && existing.length > 0) {
    return { points: existing, skipped: true };
  }

  // Fetch articles
  const articlesResult = await supabase
    .from('articles')
    .select('title, summary')
    .eq('topic_id', topicId);

  const articles: ArticleRow[] = (articlesResult.data ?? []).map((a: any) => ({
    title: a.title as string,
    summary: a.summary as string | null,
  }));

  let points: string[] = [];
  try {
    points = await generate(topicResult.data.title, articles);
  } catch (e) {
    console.error(`[conflict-points] LLM error for topic ${topicId}:`, e);
    // Safe fallback — store empty array, not null
    points = [];
  }

  await supabase
    .from('topics')
    .update({ conflict_points: points })
    .eq('id', topicId);

  return { points, skipped: false };
}

// ----------------------------------------------------------------
// Batch: run for all active topics missing conflict_points.
// Cap at maxTopics per run to stay within serverless time limits.
// ----------------------------------------------------------------
export async function batchUpdateConflictPoints(
  { maxTopics = 10, force = false }: { maxTopics?: number; force?: boolean } = {}
): Promise<{ processed: number; skipped: number; errors: number }> {
  const query = supabase
    .from('topics')
    .select('id')
    .eq('is_active', true)
    .limit(maxTopics);

  // Without force, only process topics with empty conflict_points
  // Supabase PostgREST: filter where array = '{}'
  const result = force
    ? await query
    : await query.eq('conflict_points', '{}');

  const rows = (result.data ?? []) as { id: string }[];

  let processed = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    try {
      const outcome = await updateConflictPoints(row.id, { force });
      if (outcome.skipped) skipped++;
      else processed++;
    } catch (e) {
      console.error(`[conflict-points] unexpected error for ${row.id}:`, e);
      errors++;
    }
  }

  return { processed, skipped, errors };
}

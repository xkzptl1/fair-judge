// ----------------------------------------------------------------
// Topic analysis LLM generation (Phase 2 Evolution)
//
// Three fields generated per topic from article corpus:
//   conflict_points   — 3–5 opposing viewpoints (home + detail)
//   causal_structure  — 1–3 step causal chain (detail only)
//   japan_impact      — Japan-specific impact, null if irrelevant (detail only)
//
// Safe by design:
//   - Empty / null written on any LLM error (no crash)
//   - Idempotent: skips topics that already have all three fields set
//   - Max 15 articles fed per call to stay within token limits
// ----------------------------------------------------------------

import { supabase } from '@/lib/supabase';
import { callLLM } from '@/lib/discover/llm';

interface ArticleRow {
  title: string;
  summary: string | null;
}

interface AnalysisOutput {
  conflict_points:  string[];
  causal_structure: string | null;
  japan_impact:     string[] | null;
}

// ----------------------------------------------------------------
// Build shared article context string (reused across prompts)
// ----------------------------------------------------------------
function buildArticleList(articles: ArticleRow[]): string {
  return articles
    .filter((a) => a.title.trim().length > 0)
    .slice(0, 15)
    .map((a, i) => {
      const summary = a.summary ? `\n   ${a.summary.slice(0, 120)}` : '';
      return `${i + 1}. ${a.title}${summary}`;
    })
    .join('\n\n');
}

// ----------------------------------------------------------------
// Single LLM call that returns all three fields at once.
// Combining into one call keeps costs low and maintains coherence.
// ----------------------------------------------------------------
async function generateAnalysis(
  topicTitle: string,
  articles: ArticleRow[]
): Promise<AnalysisOutput> {
  const empty: AnalysisOutput = { conflict_points: [], causal_structure: null, japan_impact: null };
  if (articles.length === 0) return empty;

  const articleList = buildArticleList(articles);
  if (!articleList) return empty;

  const systemPrompt = `あなたはメディア分析の専門家です。
複数の記事を分析し、以下の3つを日本語で生成してください。

1. conflict_points（対立点）: 3〜5つの対立軸
   厳格なルール:
   - 必ず「A vs B」形式（日本語）
   - 各辺は名詞句のみ（最大5語）
   - 文章・「〜か」形式・説明は一切禁止
   - 両辺を同じ抽象度で揃えること
   重点:
   - 政策 vs 政策
   - 原因 vs 原因
   - 解釈 vs 解釈
   良い例: "米制裁 vs 国内インフラ崩壊" / "短期的救済 vs 長期的安定" / "外部支援 vs 国家主権"
   悪い例: "米制裁のせいか、それとも国内問題か" / "Aという意見とBという意見がある"

2. causal_structure（因果構造）: 1〜3ステップの因果連鎖
   - 矢印「→」でつないだ1文
   - 例: "貿易摩擦 → 企業投資の縮小 → 雇用への影響"

3. japan_impact（日本への影響）: 日本への構造的インプリケーション
   厳格なルール:
   - ニュースの要約や元の事象の説明は禁止
   - 「日本も影響を受けるかもしれない」などの曖昧な表現は禁止
   - 同じ構造的リスクが日本にどう当てはまるかに絞ること
   - 3〜5個の箇条書き、各1行・簡潔に
   - 依存関係・政策リスク・構造的類似点を優先すること
   良い例: "エネルギー輸入依存 → 同様の供給ショックリスク" / "老朽インフラ → 日本の潜在的障害リスク"
   悪い例: "日本はこの状況に影響を受けるかもしれない" / "これはキューバで起きていることだが…"
   - 日本と構造的に無関係な場合のみnullを返す

JSON形式で返してください:
{
  "conflict_points": ["A vs B", "A vs B", "..."],
  "causal_structure": "A → B → C",
  "japan_impact": ["箇条書き1", "箇条書き2", "..."] または null
}`;

  const userPrompt = `トピック: ${topicTitle}\n\n記事一覧:\n${articleList}`;

  const raw = await callLLM(systemPrompt, userPrompt);
  const parsed = JSON.parse(raw) as Partial<AnalysisOutput>;

  const conflict_points = Array.isArray(parsed.conflict_points)
    ? (parsed.conflict_points as unknown[])
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 5)
    : [];

  const causal_structure =
    typeof parsed.causal_structure === 'string' && parsed.causal_structure.trim().length > 0
      ? parsed.causal_structure.trim()
      : null;

  const japan_impact = Array.isArray(parsed.japan_impact)
    ? (parsed.japan_impact as unknown[])
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 5)
    : null;

  return { conflict_points, causal_structure, japan_impact };
}

// ----------------------------------------------------------------
// Update a single topic's analysis fields.
// Pass force=true to regenerate even if already set.
// ----------------------------------------------------------------
export async function updateTopicAnalysis(
  topicId: string,
  { force = false }: { force?: boolean } = {}
): Promise<{ skipped: boolean; conflict_points: string[] }> {
  const topicResult = await supabase
    .from('topics')
    .select('title, conflict_points, causal_structure, japan_impact')
    .eq('id', topicId)
    .single();

  if (topicResult.error || !topicResult.data) {
    return { skipped: true, conflict_points: [] };
  }

  const t = topicResult.data as {
    title: string;
    conflict_points: string[] | null;
    causal_structure: string | null;
    japan_impact: string[] | null;
  };

  const alreadyDone =
    (t.conflict_points ?? []).length > 0 &&
    t.causal_structure !== null &&
    t.japan_impact !== null;

  if (!force && alreadyDone) {
    return { skipped: true, conflict_points: t.conflict_points ?? [] };
  }

  const articlesResult = await supabase
    .from('articles')
    .select('title, summary')
    .eq('topic_id', topicId);

  const articles: ArticleRow[] = (articlesResult.data ?? []).map((a: any) => ({
    title:   a.title as string,
    summary: a.summary as string | null,
  }));

  let analysis: AnalysisOutput = { conflict_points: [], causal_structure: null, japan_impact: null };
  try {
    analysis = await generateAnalysis(t.title, articles);
  } catch (e) {
    console.error(`[topic-analysis] LLM error for topic ${topicId}:`, e);
  }

  await supabase
    .from('topics')
    .update({
      conflict_points:  analysis.conflict_points,
      causal_structure: analysis.causal_structure,
      japan_impact:     analysis.japan_impact,
    })
    .eq('id', topicId);

  return { skipped: false, conflict_points: analysis.conflict_points };
}

// Back-compat alias used by the existing API route
export const updateConflictPoints = updateTopicAnalysis;

// ----------------------------------------------------------------
// Batch: process active topics missing any analysis field.
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

  // Without force, only fetch topics where conflict_points is still empty
  const result = force
    ? await query
    : await query.eq('conflict_points', '{}');

  const rows = (result.data ?? []) as { id: string }[];

  let processed = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    try {
      const outcome = await updateTopicAnalysis(row.id, { force });
      if (outcome.skipped) skipped++;
      else processed++;
    } catch (e) {
      console.error(`[topic-analysis] unexpected error for ${row.id}:`, e);
      errors++;
    }
  }

  return { processed, skipped, errors };
}

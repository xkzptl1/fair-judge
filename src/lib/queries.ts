import { supabase } from "./supabase";
import type {
  TopicSummary,
  TopicDetail,
  ArticleWithClassification,
  FactCheck,
  StanceDistribution,
  Stance,
} from "@/types/topic";

type ClassificationRow = { topic_id: string; stance: string };
type FactCheckRow = { topic_id: string };

export async function getTopics(): Promise<TopicSummary[]> {
  const [topicsResult, stanceResult, factCheckResult] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, summary, article_count, source_count, last_updated_at, first_seen_at, category, overseas_ratio")
      .eq("is_active", true)
      .order("last_updated_at", { ascending: false }),

    supabase
      .from("article_classifications")
      .select("topic_id, stance"),

    supabase
      .from("fact_checks")
      .select("topic_id"),
  ]);

  if (topicsResult.error) throw topicsResult.error;

  const classifications = (stanceResult.data ?? []) as ClassificationRow[];
  const factCheckRows = (factCheckResult.data ?? []) as FactCheckRow[];
  const factCheckTopicIds = new Set(factCheckRows.map((r) => r.topic_id));

  // Group stance counts by topic_id
  const stanceMap = new Map<string, StanceDistribution>();
  for (const row of classifications) {
    if (!stanceMap.has(row.topic_id)) {
      stanceMap.set(row.topic_id, { support: 0, challenge: 0, report_only: 0, mixed: 0, unclear: 0 });
    }
    const dist = stanceMap.get(row.topic_id)!;
    dist[row.stance as Stance]++;
  }

  return (topicsResult.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    articleCount: t.article_count,
    sourceCount: t.source_count,
    lastUpdatedAt: t.last_updated_at,
    stanceDistribution: stanceMap.get(t.id) ?? { support: 0, challenge: 0, report_only: 0, mixed: 0, unclear: 0 },
    hasFactCheck: factCheckTopicIds.has(t.id),
    category: t.category ?? 'その他',
    overseasRatio: t.overseas_ratio ?? 0,
    firstSeenAt: t.first_seen_at,
  }));
}

// Raw shapes returned by Supabase join queries (untyped client)
type RawArticle = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  sources: { domain: string; display_name: string | null } | null;
  article_classifications: Array<{ stance: string; reason: string | null; confidence: number | null }>;
};

type RawFactCheck = {
  id: string;
  claim: string;
  verdict: string | null;
  explanation: string | null;
  source_url: string | null;
  fact_checker: string | null;
};

export async function getTopicDetail(id: string): Promise<TopicDetail | null> {
  const [topicResult, articlesResult, factChecksResult] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, summary, main_issues, article_count, source_count, last_updated_at")
      .eq("id", id)
      .single(),

    supabase
      .from("articles")
      .select("id, title, url, summary, sources(domain, display_name), article_classifications(stance, reason, confidence)")
      .eq("topic_id", id),

    supabase
      .from("fact_checks")
      .select("id, claim, verdict, explanation, source_url, fact_checker")
      .eq("topic_id", id),
  ]);

  if (topicResult.error || !topicResult.data) return null;

  const topic = topicResult.data;

  const articles: ArticleWithClassification[] = ((articlesResult.data ?? []) as unknown as RawArticle[])
    .filter((a) => a.article_classifications.length > 0)
    .map((a) => {
      // Take the first classification (one per article in v1)
      const c = a.article_classifications[0];
      return {
        id: a.id,
        title: a.title,
        url: a.url,
        summary: a.summary,
        sourceDomain: a.sources?.domain ?? "",
        sourceDisplayName: a.sources?.display_name ?? null,
        stance: c.stance as Stance,
        reason: c.reason,
        confidence: c.confidence,
      };
    })
    // Highest confidence first within each stance group
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const stanceDistribution: StanceDistribution = { support: 0, challenge: 0, report_only: 0, mixed: 0, unclear: 0 };
  for (const a of articles) stanceDistribution[a.stance]++;

  const factChecks: FactCheck[] = ((factChecksResult.data ?? []) as unknown as RawFactCheck[]).map((f) => ({
    id: f.id,
    claim: f.claim,
    verdict: f.verdict,
    explanation: f.explanation,
    sourceUrl: f.source_url,
    factChecker: f.fact_checker,
  }));

  return {
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    mainIssues: (topic.main_issues as string[] | null) ?? [],
    articleCount: topic.article_count,
    sourceCount: topic.source_count,
    lastUpdatedAt: topic.last_updated_at,
    stanceDistribution,
    articles,
    factChecks,
  };
}

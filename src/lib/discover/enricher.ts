import { supabase } from '@/lib/supabase';
import { DISCOVER_CONFIG } from './config';
import { callLLM, activeProvider } from './llm';
import { CATEGORY_ORDER } from '@/types/topic';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface EnrichmentResult {
  candidateId:   string;
  clusterKey:    string;
  status:        'enriched' | 'duplicate' | 'error';
  refinedTitle?: string;
  error?:        string;
}

interface LLMOutput {
  refined_title: string;
  summary:       string;
  main_issues:   string[];
  category:      string;
}

interface CandidateRow {
  id:               string;
  cluster_key:      string;
  title:            string;
  entities:         string[];
  article_urls:     string[];
  article_titles:   string[];
  locales:          string[];
  domain_count:     number;
  article_count:    number;
  promotion_score:  number;
  hard_requirements: Record<string, { pass: boolean; [k: string]: unknown }>;
}

// ----------------------------------------------------------------
// Article selection — up to N headlines, maximising source diversity
// ----------------------------------------------------------------

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function selectRepresentativeArticles(
  titles: string[],
  urls:   string[],
  count:  number = 5
): Array<{ title: string; domain: string }> {
  if (titles.length === 0) return [];

  const pairs = titles
    .map((title, i) => ({ title, url: urls[i] ?? '', domain: extractDomain(urls[i] ?? '') }))
    .filter((p) => p.title.length > 0);

  // One article per domain first, then fill remaining slots
  const seenDomains = new Set<string>();
  const selected: typeof pairs = [];

  for (const p of pairs) {
    if (selected.length >= count) break;
    if (p.domain && !seenDomains.has(p.domain)) {
      seenDomains.add(p.domain);
      selected.push(p);
    }
  }
  for (const p of pairs) {
    if (selected.length >= count) break;
    if (!selected.includes(p)) selected.push(p);
  }

  return selected.map(({ title, domain }) => ({ title, domain }));
}

// ----------------------------------------------------------------
// No-duplicate gate
// Compare candidate entities against all active topics' titles.
// ----------------------------------------------------------------

interface DuplicateCheckResult {
  pass:           boolean;
  matched_topic?: string;
  overlap?:       number;
  threshold:      number;
}

async function checkNoDuplicate(
  entities:  string[],
  threshold: number
): Promise<DuplicateCheckResult> {
  if (entities.length === 0) return { pass: true, threshold };

  const { data: topics, error } = await supabase
    .from('topics')
    .select('title')
    .eq('is_active', true);

  if (error || !topics || topics.length === 0) {
    return { pass: true, threshold };
  }

  let maxOverlap   = 0;
  let matchedTitle = '';

  for (const topic of topics) {
    const titleLower = topic.title.toLowerCase();
    const matched    = entities.filter((e) => titleLower.includes(e.toLowerCase()));
    const overlap    = matched.length / entities.length;
    if (overlap > maxOverlap) {
      maxOverlap   = overlap;
      matchedTitle = topic.title;
    }
  }

  const rounded = Math.round(maxOverlap * 100) / 100;
  if (maxOverlap > threshold) {
    return { pass: false, matched_topic: matchedTitle, overlap: rounded, threshold };
  }
  return { pass: true, overlap: rounded, threshold };
}

// ----------------------------------------------------------------
// LLM call — provider-agnostic, output parsed to LLMOutput
// ----------------------------------------------------------------

const SYSTEM_PROMPT =
  'あなたは国際ニュースを専門とする日本語編集者です。' +
  '読者が複数の視点からトピックを理解できるよう、簡潔かつ具体的な記述を心がけてください。' +
  '必ず有効なJSONのみで回答してください。';

async function callEnrichmentLLM(candidate: CandidateRow): Promise<LLMOutput> {
  const articles = selectRepresentativeArticles(
    candidate.article_titles,
    candidate.article_urls
  );

  const headlinesSection = articles.length > 0
    ? `代表的な見出し（${articles.length}件）:\n` +
      articles.map((a) => `  - [${a.domain}] ${a.title}`).join('\n')
    : '（見出しデータなし — エンティティと配信状況のみで判断してください）';

  const categoryList = CATEGORY_ORDER.join(' / ');

  const userPrompt = `\
以下のニュースクラスターを分析し、日本語のトピックエントリを作成してください。

【クラスター情報】
現在のドラフトタイトル: ${candidate.title}
主要エンティティ: ${candidate.entities.join(', ')}
配信ロケール: ${candidate.locales.join(', ')}
収集記事数: ${candidate.article_count}件 / ${candidate.domain_count}メディア

${headlinesSection}

【生成してください】
1. refined_title: テンプレートに頼らない、イベント固有の具体的な日本語タイトル（20〜35字程度）
2. summary: 何が起きているか、なぜ重要かを説明する2〜3文の日本語サマリー
3. main_issues: このトピックの核心となる問い・論点を3〜5個（疑問文形式、具体的に）
4. category: 次のいずれか1つを正確に選択 → ${categoryList}

JSONのみで回答してください（マークダウン不要）:
{
  "refined_title": "...",
  "summary": "...",
  "main_issues": ["...", "...", "..."],
  "category": "..."
}`;

  const raw = await callLLM(SYSTEM_PROMPT, userPrompt);

  // Strip accidental markdown fences (Anthropic sometimes adds them)
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  const refined_title = typeof obj.refined_title === 'string' ? obj.refined_title.trim() : candidate.title;
  const summary       = typeof obj.summary       === 'string' ? obj.summary.trim()       : '';
  const main_issues   = Array.isArray(obj.main_issues)
    ? (obj.main_issues as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 5)
    : [];

  // Enforce category against the canonical list; fall back to 'その他'
  const rawCategory = typeof obj.category === 'string' ? obj.category.trim() : '';
  const category    = (CATEGORY_ORDER as readonly string[]).includes(rawCategory)
    ? rawCategory
    : 'その他';

  return { refined_title, summary, main_issues, category };
}

// ----------------------------------------------------------------
// Enrich a single candidate — duplicate gate + LLM + DB write
// ----------------------------------------------------------------

async function enrichCandidate(candidate: CandidateRow): Promise<EnrichmentResult> {
  const threshold = DISCOVER_CONFIG.hardRequirements.maxEntityOverlap;

  // 1. No-duplicate gate (pure DB, no LLM cost)
  const duplicateCheck = await checkNoDuplicate(candidate.entities, threshold);

  if (!duplicateCheck.pass) {
    const updatedHard = {
      ...candidate.hard_requirements,
      no_duplicate: {
        pass:      false,
        note:      `duplicate of existing topic: "${duplicateCheck.matched_topic}"`,
        overlap:   duplicateCheck.overlap,
        threshold,
      },
    };

    await supabase
      .from('candidate_topics')
      .update({
        hard_requirements:  updatedHard,
        promotion_snapshot: {
          duplicate_check_result: duplicateCheck,
          enriched_at:        new Date().toISOString(),
          enrichment_version: '7.0',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id);

    console.log(`[enrich] duplicate: "${candidate.title}" → matches "${duplicateCheck.matched_topic}"`);
    return { candidateId: candidate.id, clusterKey: candidate.cluster_key, status: 'duplicate' };
  }

  // 2. LLM enrichment
  const { provider, model } = activeProvider();
  let llmOutput: LLMOutput;
  try {
    llmOutput = await callEnrichmentLLM(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrich] LLM error for "${candidate.cluster_key}":`, msg);
    return { candidateId: candidate.id, clusterKey: candidate.cluster_key, status: 'error', error: msg };
  }

  // 3. Update hard_requirements.no_duplicate (now confirmed pass) + promotion_snapshot
  const updatedHard = {
    ...candidate.hard_requirements,
    no_duplicate: {
      pass:      true,
      note:      'checked against active topics',
      overlap:   duplicateCheck.overlap ?? 0,
      threshold,
    },
  };

  const snapshot = {
    refined_title:          llmOutput.refined_title,
    summary:                llmOutput.summary,
    main_issues:            llmOutput.main_issues,
    category:               llmOutput.category,
    duplicate_check_result: duplicateCheck,
    enriched_at:            new Date().toISOString(),
    enrichment_version:     '7.0',
    provider,
    model,
    draft_title_before:     candidate.title,
  };

  const { error } = await supabase
    .from('candidate_topics')
    .update({
      hard_requirements:  updatedHard,
      promotion_snapshot: snapshot,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', candidate.id);

  if (error) {
    console.error(`[enrich] DB update error for "${candidate.cluster_key}":`, error.message);
    return { candidateId: candidate.id, clusterKey: candidate.cluster_key, status: 'error', error: error.message };
  }

  console.log(`[enrich] enriched "${candidate.title}" → "${llmOutput.refined_title}" [${provider}/${model}]`);
  return {
    candidateId:  candidate.id,
    clusterKey:   candidate.cluster_key,
    status:       'enriched',
    refinedTitle: llmOutput.refined_title,
  };
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------

export interface EnrichmentRunResult {
  processed: number;
  enriched:  number;
  duplicate: number;
  errors:    number;
  provider:  string;
  model:     string;
  results:   EnrichmentResult[];
}

export async function runEnrichment(): Promise<EnrichmentRunResult> {
  const { provider, model } = activeProvider();

  // Fetch all pending candidates
  const { data, error } = await supabase
    .from('candidate_topics')
    .select(
      'id, cluster_key, title, entities, article_urls, article_titles, ' +
      'locales, domain_count, article_count, promotion_score, hard_requirements'
    )
    .eq('status', 'pending')
    .order('promotion_score', { ascending: false });

  if (error) {
    console.error('[enrich] fetch error:', error.message);
    return { processed: 0, enriched: 0, duplicate: 0, errors: 1, provider, model, results: [] };
  }

  // Filter to eligible: all hard gates pass AND score >= promotion threshold
  const threshold = DISCOVER_CONFIG.promotionThreshold;
  const eligible  = (data as any[] ?? []).filter((row: any) => {
    const req     = row.hard_requirements as Record<string, { pass: boolean }> | null;
    const allPass = req ? Object.values(req).every((v) => v.pass) : false;
    return allPass && (row.promotion_score as number) >= threshold;
  }) as CandidateRow[];

  console.log(`[enrich] ${eligible.length} eligible candidates — provider=${provider} model=${model}`);

  const results: EnrichmentResult[] = [];
  let enriched  = 0;
  let duplicate = 0;
  let errors    = 0;

  for (let i = 0; i < eligible.length; i++) {
    const result = await enrichCandidate(eligible[i]);
    results.push(result);

    if (result.status === 'enriched')  enriched++;
    if (result.status === 'duplicate') duplicate++;
    if (result.status === 'error')     errors++;

    // Polite delay between LLM calls
    if (i < eligible.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[enrich] done — enriched: ${enriched}, duplicate: ${duplicate}, errors: ${errors}`);

  return { processed: eligible.length, enriched, duplicate, errors, provider, model, results };
}

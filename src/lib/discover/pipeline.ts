import { supabase } from '@/lib/supabase';
import { DISCOVER_CONFIG } from './config';
import { clusterArticles, type DiscoveryArticle } from './cluster';
import { scoreCluster, type ScoredCandidate } from './scorer';

// ----------------------------------------------------------------
// Top-story RSS feeds — no keyword, just trending
//
// Tier 0: Google News aggregated (all locales)
// Tier 1: NHK direct RSS — authoritative Japanese public broadcaster;
//         articles appear here before Google News aggregates them.
//         No <source> element in NHK RSS — domain derived from <link>.
// ----------------------------------------------------------------
const TOP_STORY_FEEDS = [
  // ── Tier 0: Google News ────────────────────────────────────────
  { url: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja',  locale: 'ja'    },
  { url: 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en',  locale: 'en-US' },
  { url: 'https://news.google.com/rss?hl=en&gl=GB&ceid=GB:en',  locale: 'en-GB' },
  // ── Tier 1: NHK direct RSS ─────────────────────────────────────
  { url: 'https://www3.nhk.or.jp/rss/news/cat4.xml', locale: 'ja' },  // 政治
  { url: 'https://www3.nhk.or.jp/rss/news/cat5.xml', locale: 'ja' },  // 経済・ビジネス
  { url: 'https://www3.nhk.or.jp/rss/news/cat6.xml', locale: 'ja' },  // 国際
] as const;

// ----------------------------------------------------------------
// RSS fetch + parse — reuses shared retry / rate-limit logic
// (Importing from rss.ts would couple to the ingest keyword API,
// so we do a lightweight direct fetch here.)
// ----------------------------------------------------------------
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  isArray: (name) => name === 'item',
  // Disable entity processing — top-story feeds exceed the default limit of 1000.
  // stripHtml() handles entity decoding (&amp; &lt; etc.) manually.
  processEntities: false,
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

async function fetchFeed(feedUrl: string, locale: string): Promise<DiscoveryArticle[]> {
  console.log(`[discover] fetching ${locale} top stories`);
  try {
    const res = await fetch(feedUrl, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[discover] ${locale} feed HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);
    const items: any[] = parsed?.rss?.channel?.item ?? [];

    return items
      .map((item): DiscoveryArticle | null => {
        const title: string = (item.title ?? '').replace(/ - [^-]+$/, '').trim();
        const url: string   = (item.link ?? '').trim();
        if (!title || !url) return null;

        const sourceEl     = item.source;
        let sourceDomain   = '';
        if (typeof sourceEl === 'object' && sourceEl !== null) {
          sourceDomain = extractDomain(sourceEl['@_url'] ?? '');
        }
        if (!sourceDomain) sourceDomain = extractDomain(url);
        if (!sourceDomain) return null;

        let publishedAt: string;
        try {
          const d = new Date(String(item.pubDate ?? ''));
          publishedAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch {
          publishedAt = new Date().toISOString();
        }

        return { title, url, sourceDomain, publishedAt, locale };
      })
      .filter((x): x is DiscoveryArticle => x !== null);
  } catch (e) {
    console.error(`[discover] ${locale} feed error:`, e);
    return [];
  }
}

// ----------------------------------------------------------------
// Persist candidates (upsert by cluster_key)
//
// Statuses that must never be overwritten by a new discovery run:
//   auto_promoted      — already live in the topics table
//   ready_for_promotion — awaiting operator action
// For these, only scoring fields are refreshed.
// ----------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['auto_promoted', 'ready_for_promotion']);

async function upsertCandidate(
  candidate: ScoredCandidate,
  autoPromote: boolean,
  promotionThreshold: number
): Promise<{ status: 'inserted' | 'updated' | 'auto_promoted' | 'error'; error?: string }> {

  // Check whether this cluster_key already exists with a terminal status.
  const { data: existing } = await supabase
    .from('candidate_topics')
    .select('status')
    .eq('cluster_key', candidate.clusterKey)
    .maybeSingle();

  if (existing && TERMINAL_STATUSES.has(existing.status)) {
    // Refresh only content and scoring — never touch status, promoted_topic_id,
    // promotion_snapshot, or decision_result.
    const { error } = await supabase
      .from('candidate_topics')
      .update({
        title:             candidate.title,
        entities:          candidate.entities,
        article_urls:      candidate.articleUrls,
        article_titles:    candidate.articleTitles,
        locales:           candidate.locales,
        domain_count:      candidate.domainCount,
        article_count:     candidate.articleCount,
        promotion_score:   candidate.promotionScore,
        score_breakdown:   candidate.scoreBreakdown,
        hard_requirements: candidate.hardRequirements,
        updated_at:        new Date().toISOString(),
      })
      .eq('cluster_key', candidate.clusterKey);

    if (error) {
      console.error(`[discover] refresh error for "${candidate.clusterKey}":`, error.message);
      return { status: 'error', error: error.message };
    }
    console.log(
      `[discover] refreshed "${candidate.clusterKey}" ` +
      `(status preserved: ${existing.status}, score: ${candidate.promotionScore})`
    );
    return { status: 'updated' };
  }

  const row = {
    title:             candidate.title,
    cluster_key:       candidate.clusterKey,
    entities:          candidate.entities,
    article_urls:      candidate.articleUrls,
    article_titles:    candidate.articleTitles,
    locales:           candidate.locales,
    domain_count:      candidate.domainCount,
    article_count:     candidate.articleCount,
    promotion_score:   candidate.promotionScore,
    score_breakdown:   candidate.scoreBreakdown,
    hard_requirements: candidate.hardRequirements,
    status:            'pending' as string,
    promoted_at:       null as string | null,
    promoted_topic_id: null as string | null,
    promotion_snapshot: null as object | null,
  };

  // Auto-promote if eligible and enabled
  if (autoPromote && candidate.eligible) {
    // Insert into topics table
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .insert({
        title:          candidate.title,
        summary:        null,              // LLM-generated in Phase 7
        main_issues:    [],
        category:       '国際',           // default for discovered topics
        overseas_ratio: 0.8,              // high — these come from global signals
        article_count:  0,
        source_count:   0,
        is_active:      true,
        origin:         'discovered',
        promoted_at:    new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (topicError || !topic) {
      console.error('[discover] topic insert error:', topicError?.message);
    } else {
      row.status              = 'auto_promoted';
      row.promoted_at         = new Date().toISOString();
      row.promoted_topic_id   = topic.id;
      row.promotion_snapshot  = {
        promotion_score:      candidate.promotionScore,
        threshold_used:       promotionThreshold,
        score_breakdown:      candidate.scoreBreakdown,
        hard_requirements:    candidate.hardRequirements,
        promoted_at:          row.promoted_at,
        auto_promote_config:  { version: '6.5a' },
      };
      console.log(`[discover] auto-promoted "${candidate.title}" (score: ${candidate.promotionScore})`);
    }
  }

  const { error } = await supabase
    .from('candidate_topics')
    .upsert(row, { onConflict: 'cluster_key' });

  if (error) {
    console.error(`[discover] upsert error for "${candidate.clusterKey}":`, error.message);
    return { status: 'error', error: error.message };
  }

  return { status: row.status as 'inserted' | 'updated' | 'auto_promoted' };
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------
export interface DiscoveryResult {
  articlesCollected: number;
  clustersFound:     number;
  candidatesWritten: number;
  autoPromoted:      number;
  eligible:          number;   // passed all gates, but autoPromote was off
  errors:            string[];
  topCandidates:     Array<{
    title: string;
    score: number;
    articleCount: number;
    locales: string[];
    eligible: boolean;
  }>;
}

export async function runDiscovery(): Promise<DiscoveryResult> {
  const cfg    = DISCOVER_CONFIG;
  const errors: string[] = [];

  // 1. Fetch top stories from all locales
  const allArticles: DiscoveryArticle[] = [];
  for (const feed of TOP_STORY_FEEDS) {
    const items = await fetchFeed(feed.url, feed.locale);
    console.log(`[discover] ${feed.locale} → ${items.length} articles`);
    allArticles.push(...items);
    await new Promise((r) => setTimeout(r, 600)); // polite delay
  }

  // 2. Deduplicate by URL across locales
  const seen = new Map<string, DiscoveryArticle>();
  for (const a of allArticles) {
    if (!seen.has(a.url)) seen.set(a.url, a);
  }
  const deduplicated = [...seen.values()];
  console.log(`[discover] ${deduplicated.length} unique articles after dedup`);

  // 3. Cluster
  const clusters = clusterArticles(deduplicated, cfg.discovery.minClusterOverlap);
  const filtered = clusters.filter(
    (c) => c.articles.length >= cfg.discovery.minRawClusterSize
  );
  console.log(`[discover] ${clusters.length} clusters → ${filtered.length} above min size ${cfg.discovery.minRawClusterSize}`);

  // 4. Score
  const scored = filtered.map(scoreCluster);

  // 5. Upsert to candidate_topics
  let candidatesWritten = 0;
  let autoPromoted      = 0;
  let eligible          = 0;

  for (const candidate of scored) {
    if (candidate.eligible) {
      if (cfg.autoPromote) autoPromoted++;
      else eligible++;
    }

    const outcome = await upsertCandidate(
      candidate,
      cfg.autoPromote,
      cfg.promotionThreshold
    );

    if (outcome.status !== 'error') {
      candidatesWritten++;
    } else {
      errors.push(outcome.error ?? 'upsert failed');
    }
  }

  console.log(
    `[discover] done — candidates: ${candidatesWritten}, eligible: ${eligible}, auto_promoted: ${autoPromoted}`
  );

  return {
    articlesCollected: deduplicated.length,
    clustersFound:     filtered.length,
    candidatesWritten,
    autoPromoted,
    eligible,
    errors,
    topCandidates: scored
      .sort((a, b) => b.promotionScore - a.promotionScore)
      .slice(0, 10)
      .map((c) => ({
        title:        c.title,
        score:        c.promotionScore,
        articleCount: c.articleCount,
        locales:      c.locales,
        eligible:     c.eligible,
      })),
  };
}

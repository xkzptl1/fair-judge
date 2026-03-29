import { supabase } from '../supabase';
import { INGEST_TOPICS, type TopicConfig } from './topics';
import { fetchNewsRss, fetchDirectRss, type RssItem } from './rss';
import { classifyArticle } from './classifier';
import { fetchKokkaiSpeeches } from './kokkai';

// ----------------------------------------------------------------
// Tier 1: NHK category feeds used as supplemental sources per topic
// Mapped by discoveryMode so domestic topics get domestic feeds,
// global topics skip NHK (they're unlikely to appear there).
// ----------------------------------------------------------------
const NHK_FEEDS: Record<string, { url: string; display: string }[]> = {
  politics:  [{ url: 'https://www3.nhk.or.jp/rss/news/cat4.xml', display: 'NHK政治' }],
  economy:   [{ url: 'https://www3.nhk.or.jp/rss/news/cat5.xml', display: 'NHK経済' }],
  society:   [{ url: 'https://www3.nhk.or.jp/rss/news/cat2.xml', display: 'NHK社会' }],
  intl:      [{ url: 'https://www3.nhk.or.jp/rss/news/cat6.xml', display: 'NHK国際' }],
};

const CATEGORY_TO_NHK_FEEDS: Record<string, typeof NHK_FEEDS[string]> = {
  '政治':       NHK_FEEDS.politics,
  '安全保障':   [...NHK_FEEDS.politics, ...NHK_FEEDS.intl],
  '経済':       NHK_FEEDS.economy,
  'AI・テック': NHK_FEEDS.economy,
  '社会':       NHK_FEEDS.society,
  '国際':       NHK_FEEDS.intl,
};

export interface TopicResult {
  topic: string;
  topicId: string | null;
  articlesAdded: number;
  articlesSkipped: number;
  errors: string[];
}

// ----------------------------------------------------------------
// Source upsert — domain is UNIQUE, so SELECT-first to avoid error
// ----------------------------------------------------------------
async function upsertSource(domain: string, displayName: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('domain', domain)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from('sources')
    .insert({ domain, display_name: displayName })
    .select('id')
    .maybeSingle();

  if (error) {
    // Race condition: another request may have inserted first
    const { data: retry } = await supabase
      .from('sources')
      .select('id')
      .eq('domain', domain)
      .maybeSingle();
    return retry?.id ?? null;
  }

  return inserted?.id ?? null;
}

// ----------------------------------------------------------------
// Topic get-or-create — uses ON CONFLICT once unique index exists
// ----------------------------------------------------------------
async function getOrCreateTopic(config: TopicConfig): Promise<string | null> {
  // Try upsert via ON CONFLICT — requires unique index on topics(title)
  const { data: upserted, error: upsertError } = await supabase
    .from('topics')
    .upsert(
      {
        title: config.title,
        summary: config.summary,
        main_issues: config.mainIssues,
        category: config.category,
        overseas_ratio: config.overseasRatio,
        article_count: 0,
        source_count: 0,
        is_active: true,
      },
      { onConflict: 'title', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();

  if (!upsertError && upserted) return upserted.id;

  // Fallback: SELECT (handles ignoreDuplicates case where no row is returned)
  const { data: existing } = await supabase
    .from('topics')
    .select('id')
    .eq('title', config.title)
    .maybeSingle();

  return existing?.id ?? null;
}

// ----------------------------------------------------------------
// Recompute and write article_count + source_count on the topic row
// ----------------------------------------------------------------
export async function syncTopicCounts(topicId: string): Promise<void> {
  const { data: rows } = await supabase
    .from('articles')
    .select('source_id')
    .eq('topic_id', topicId);

  const articleCount = (rows ?? []).length;
  const sourceCount = new Set((rows ?? []).map((r: any) => r.source_id)).size;

  await supabase
    .from('topics')
    .update({ article_count: articleCount, source_count: sourceCount })
    .eq('id', topicId);
}

// ----------------------------------------------------------------
// Fetch RSS items according to discoveryMode + Tier 1/2 supplements
// Rate limiting and retry are handled inside fetchNewsRss.
// ----------------------------------------------------------------
async function fetchAllItems(
  config: TopicConfig,
  errors: string[]
): Promise<Map<string, RssItem>> {
  const seen = new Map<string, RssItem>();
  const mode = config.discoveryMode;

  const jaKeywords = mode !== 'global' ? config.keywordsJa : [];
  const enKeywords = mode !== 'domestic' ? config.keywordsEn : [];

  // ── Google News RSS (existing) ──────────────────────────────
  for (const keyword of jaKeywords) {
    try {
      const items = await fetchNewsRss(keyword, 'ja');
      for (const item of items) {
        if (!seen.has(item.url)) seen.set(item.url, item);
      }
    } catch (e) {
      const msg = `RSS ja "${keyword}": ${e}`;
      console.error(`[pipeline] ${msg}`);
      errors.push(msg);
    }
  }

  for (const keyword of enKeywords) {
    try {
      const items = await fetchNewsRss(keyword, 'en');
      for (const item of items) {
        if (!seen.has(item.url)) seen.set(item.url, item);
      }
    } catch (e) {
      const msg = `RSS en "${keyword}": ${e}`;
      console.error(`[pipeline] ${msg}`);
      errors.push(msg);
    }
  }

  // ── Tier 1: NHK direct feeds (domestic + mixed topics only) ──
  if (mode !== 'global') {
    const nhkFeeds = CATEGORY_TO_NHK_FEEDS[config.category] ?? [];
    for (const feed of nhkFeeds) {
      try {
        const items = await fetchDirectRss(feed.url, 'nhk.or.jp', feed.display);
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.url)) { seen.set(item.url, item); added++; }
        }
        if (added > 0) console.log(`[pipeline] NHK "${feed.display}" added ${added} items`);
      } catch (e) {
        console.warn(`[pipeline] NHK feed error (${feed.url}):`, e);
        // Non-fatal — NHK is supplemental
      }
    }
  }

  // ── Tier 2: 国会会議録 (domestic + mixed topics with kokkai keywords) ──
  if (mode !== 'global' && config.keywordsKokkai?.length) {
    for (const keyword of config.keywordsKokkai) {
      try {
        const speeches = await fetchKokkaiSpeeches(keyword, 5);
        let added = 0;
        for (const item of speeches) {
          if (!seen.has(item.url)) { seen.set(item.url, item); added++; }
        }
        if (added > 0) console.log(`[pipeline] Kokkai "${keyword}" added ${added} speeches`);
      } catch (e) {
        console.warn(`[pipeline] Kokkai error for "${keyword}":`, e);
        // Non-fatal — Kokkai is supplemental
      }
    }
  }

  return seen;
}

// ----------------------------------------------------------------
// Ingest one article with heuristic classification
// ----------------------------------------------------------------
export async function ingestArticle(
  item: RssItem,
  topicId: string,
  existingUrls: Set<string>
): Promise<'added' | 'skipped' | 'error'> {
  if (existingUrls.has(item.url)) return 'skipped';

  const sourceId = await upsertSource(item.sourceDomain, item.sourceDisplayName);
  if (!sourceId) return 'error';

  const { data: article, error: articleError } = await supabase
    .from('articles')
    .insert({
      topic_id: topicId,
      source_id: sourceId,
      title: item.title,
      url: item.url,
      summary: item.summary,
      published_at: item.publishedAt,
    })
    .select('id')
    .maybeSingle();

  if (articleError) {
    if (articleError.code === '23505') return 'skipped'; // URL conflict — already exists
    console.error('Article insert error:', articleError.message);
    return 'error';
  }

  if (!article) return 'error';

  // Heuristic classification — replaced by LLM in Phase 7
  const { stance, confidence } = classifyArticle(item.title, item.summary);

  await supabase.from('article_classifications').insert({
    article_id: article.id,
    topic_id: topicId,
    stance,
    reason: null,
    confidence,
    model: 'heuristic-v1',
  });

  existingUrls.add(item.url);
  return 'added';
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------
export async function runIngest(): Promise<TopicResult[]> {
  const results: TopicResult[] = [];

  for (const config of INGEST_TOPICS) {
    const result: TopicResult = {
      topic: config.title,
      topicId: null,
      articlesAdded: 0,
      articlesSkipped: 0,
      errors: [],
    };

    const topicId = await getOrCreateTopic(config);
    if (!topicId) {
      result.errors.push('Failed to get or create topic');
      results.push(result);
      continue;
    }
    result.topicId = topicId;
    console.log(`[pipeline] topic "${config.title}" (${config.discoveryMode}) — fetching RSS`);

    // Fetch according to discoveryMode — errors are collected, not thrown
    const seen = await fetchAllItems(config, result.errors);

    if (seen.size === 0) {
      const msg = `No RSS items returned for any keyword (mode: ${config.discoveryMode})`;
      console.warn(`[pipeline] "${config.title}" — ${msg}`);
      result.errors.push(msg);
      results.push(result);
      continue;
    }
    console.log(`[pipeline] "${config.title}" — ${seen.size} unique items to process`);

    // Load existing article URLs for this topic
    const { data: existingRows } = await supabase
      .from('articles')
      .select('url')
      .eq('topic_id', topicId);
    const existingUrls = new Set((existingRows ?? []).map((r: any) => r.url));

    // Ingest each article
    for (const item of seen.values()) {
      const outcome = await ingestArticle(item, topicId, existingUrls);
      if (outcome === 'added') result.articlesAdded++;
      else if (outcome === 'skipped') result.articlesSkipped++;
      else result.errors.push(`Error on: ${item.url}`);
    }

    // Sync denormalized counts whenever articles were added or topic is new
    await syncTopicCounts(topicId);
    console.log(
      `[pipeline] "${config.title}" done — added: ${result.articlesAdded}, skipped: ${result.articlesSkipped}, errors: ${result.errors.length}`
    );

    results.push(result);
  }

  return results;
}

// ----------------------------------------------------------------
// Ingestion for discovered (pipeline-promoted) topics.
//
// Does NOT modify the config-defined ingest flow.
// Reuses fetchNewsRss, ingestArticle, syncTopicCounts from the
// existing pipeline — no logic is duplicated.
//
// Keyword derivation is isolated in deriveKeywords() so it can be
// improved independently without touching the ingest mechanics.
// ----------------------------------------------------------------

import { supabase } from '../supabase';
import { fetchNewsRss, type RssItem } from './rss';
import { ingestArticle, syncTopicCounts } from './pipeline';

// ----------------------------------------------------------------
// Keyword derivation — isolated for easy replacement
// ----------------------------------------------------------------

// Reverse map: canonical English entity → Japanese form for JA RSS queries.
// Covers the geopolitical entities most likely to appear in discovered topics.
const EN_TO_JA: Record<string, string> = {
  'Iran':        'イラン',
  'Israel':      'イスラエル',
  'Russia':      'ロシア',
  'Ukraine':     'ウクライナ',
  'China':       '中国',
  'US':          '米国',
  'Japan':       '日本',
  'North Korea': '北朝鮮',
  'South Korea': '韓国',
  'Taiwan':      '台湾',
  'Gaza':        'ガザ',
  'Turkey':      'トルコ',
  'Sudan':       'スーダン',
  'Cuba':        'キューバ',
  'India':       'インド',
  'Saudi Arabia': 'サウジアラビア',
};

function isJapanese(s: string): boolean {
  return /[\u3040-\u9FFF\uFF00-\uFFEF]/.test(s);
}

export interface DerivedKeywords {
  keywordsEn: string[];
  keywordsJa: string[];
}

/**
 * Derive RSS search keywords from a normalized entity list.
 *
 * Strategy:
 *   EN — combine top-2 English entities as one query (more specific than
 *        single-entity queries); add a second query with top-1 + 3rd entity.
 *   JA — use any katakana/CJK entities already in the list (direct pass-through)
 *        plus Japanese forms of the top English entities via EN_TO_JA.
 *
 * Max queries: 2 EN + 2 JA = 4 RSS calls per discovered topic.
 */
export function deriveKeywords(entities: string[]): DerivedKeywords {
  const enEntities = entities.filter((e) => !isJapanese(e));
  const jaEntities = entities.filter(isJapanese);

  const keywordsEn: string[] = [];
  const keywordsJa: string[] = [];

  // ── English queries ────────────────────────────────────────────
  if (enEntities.length >= 2) {
    keywordsEn.push(`${enEntities[0]} ${enEntities[1]}`);       // primary
  } else if (enEntities.length === 1) {
    keywordsEn.push(enEntities[0]);
  }
  if (enEntities.length >= 3) {
    keywordsEn.push(`${enEntities[0]} ${enEntities[2]}`);       // secondary angle
  }

  // ── Japanese queries ───────────────────────────────────────────
  // 1. Direct: katakana/CJK entities already present in the list
  if (jaEntities.length >= 2) {
    keywordsJa.push(`${jaEntities[0]} ${jaEntities[1]}`);
  } else if (jaEntities.length === 1) {
    keywordsJa.push(jaEntities[0]);
  }

  // 2. Reverse-mapped: Japanese forms of top EN entities
  const jaForms = enEntities.slice(0, 2).map((e) => EN_TO_JA[e]).filter(Boolean);
  if (jaForms.length >= 2) {
    keywordsJa.push(jaForms.join(' '));
  } else if (jaForms.length === 1 && jaEntities.length === 0) {
    // Only add single-term JA query if we have nothing else for JA
    keywordsJa.push(jaForms[0]);
  }

  return { keywordsEn, keywordsJa };
}

// ----------------------------------------------------------------
// Entity-presence post-filter
// Discards RSS items whose title contains none of the top entities.
// Checks both the normalized English form and its Japanese equivalent.
// ----------------------------------------------------------------
function isRelevant(title: string, topEntities: string[]): boolean {
  const t = title.toLowerCase();
  return topEntities.some((entity) => {
    if (t.includes(entity.toLowerCase())) return true;
    // Also check the Japanese form so JA-locale articles aren't incorrectly discarded
    const ja = EN_TO_JA[entity];
    return ja ? title.includes(ja) : false;
  });
}

// ----------------------------------------------------------------
// Result type
// ----------------------------------------------------------------
export interface DiscoveredIngestResult {
  topicId:    string;
  title:      string | null;
  entities:   string[];
  keywords:   DerivedKeywords;
  fetched:    number;   // unique URLs from all RSS queries
  afterFilter: number;  // remaining after entity-presence check
  added:      number;
  skipped:    number;
  errors:     string[];
}

// ----------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------
export async function ingestDiscoveredTopic(
  topicId: string
): Promise<DiscoveredIngestResult> {
  const empty = (err: string): DiscoveredIngestResult => ({
    topicId,
    title:       null,
    entities:    [],
    keywords:    { keywordsEn: [], keywordsJa: [] },
    fetched:     0,
    afterFilter: 0,
    added:       0,
    skipped:     0,
    errors:      [err],
  });

  // 1. Verify the topic exists and was produced by discovery
  const { data: topic, error: topicErr } = await supabase
    .from('topics')
    .select('id, title')
    .eq('id', topicId)
    .eq('origin', 'discovered')
    .maybeSingle();

  if (topicErr || !topic) {
    return empty('Topic not found or origin is not "discovered"');
  }

  // 2. Load entities from the linked candidate_topics row
  const { data: candidate } = await supabase
    .from('candidate_topics')
    .select('entities')
    .eq('promoted_topic_id', topicId)
    .maybeSingle();

  const entities: string[] = Array.isArray(candidate?.entities)
    ? (candidate.entities as string[])
    : [];

  if (entities.length === 0) {
    console.warn(`[discovered] no entities for topic "${topic.title}" — using title as fallback`);
  }

  // 3. Derive keywords (isolated — replace this function to change strategy)
  const keywords = deriveKeywords(entities.length > 0 ? entities : [topic.title]);
  console.log(`[discovered] "${topic.title}" — keywords:`, keywords);

  // 4. Fetch RSS for all derived keywords, dedup by URL
  const seen = new Map<string, RssItem>();
  const errors: string[] = [];

  for (const keyword of keywords.keywordsEn) {
    try {
      const items = await fetchNewsRss(keyword, 'en');
      for (const item of items) {
        if (!seen.has(item.url)) seen.set(item.url, item);
      }
    } catch (e) {
      const msg = `RSS en "${keyword}": ${e}`;
      console.error(`[discovered] ${msg}`);
      errors.push(msg);
    }
  }

  for (const keyword of keywords.keywordsJa) {
    try {
      const items = await fetchNewsRss(keyword, 'ja');
      for (const item of items) {
        if (!seen.has(item.url)) seen.set(item.url, item);
      }
    } catch (e) {
      const msg = `RSS ja "${keyword}": ${e}`;
      console.error(`[discovered] ${msg}`);
      errors.push(msg);
    }
  }

  const fetched = seen.size;
  console.log(`[discovered] "${topic.title}" — ${fetched} unique items before filter`);

  // 5. Post-filter: keep only articles that mention at least one top entity
  const topEntities = entities.slice(0, 5);
  const relevant = topEntities.length > 0
    ? [...seen.values()].filter((item) => isRelevant(item.title, topEntities))
    : [...seen.values()]; // no entity data — accept all

  const afterFilter = relevant.length;
  console.log(`[discovered] "${topic.title}" — ${afterFilter} items after entity filter`);

  // 6. Load existing article URLs to skip duplicates
  const { data: existingRows } = await supabase
    .from('articles')
    .select('url')
    .eq('topic_id', topicId);
  const existingUrls = new Set((existingRows ?? []).map((r: any) => r.url as string));

  // 7. Ingest each relevant article using the shared pipeline function
  let added = 0;
  let skipped = 0;

  for (const item of relevant) {
    const outcome = await ingestArticle(item, topicId, existingUrls);
    if (outcome === 'added')   added++;
    else if (outcome === 'skipped') skipped++;
    else errors.push(`ingest error: ${item.url}`);
  }

  // 8. Sync denormalized counts on the topic row
  await syncTopicCounts(topicId);

  console.log(
    `[discovered] "${topic.title}" done — fetched: ${fetched}, filtered: ${afterFilter}, added: ${added}, skipped: ${skipped}`
  );

  return {
    topicId,
    title:      topic.title,
    entities,
    keywords,
    fetched,
    afterFilter,
    added,
    skipped,
    errors,
  };
}

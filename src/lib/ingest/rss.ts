import { XMLParser } from 'fast-xml-parser';

export interface RssItem {
  title: string;
  url: string;
  sourceDomain: string;
  sourceDisplayName: string;
  publishedAt: string;
  summary: string | null;
}

// ----------------------------------------------------------------
// TTL cache — keyed by "keyword::locale"
// Resets on server restart. Prevents redundant fetches when the
// ingest trigger is hit multiple times within the TTL window.
// ----------------------------------------------------------------
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  items: RssItem[];
  fetchedAt: number;
}
const rssCache = new Map<string, CacheEntry>();

function cacheGet(key: string): RssItem[] | null {
  const entry = rssCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    rssCache.delete(key);
    return null;
  }
  return entry.items;
}

function cacheSet(key: string, items: RssItem[]): void {
  rssCache.set(key, { items, fetchedAt: Date.now() });
}

// ----------------------------------------------------------------
// Rate limiter — enforces minimum gap between RSS requests
// ----------------------------------------------------------------
const MIN_GAP_MS = 800;
let lastFetchAt = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

// ----------------------------------------------------------------
// Retry with exponential backoff
// ----------------------------------------------------------------
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;

async function fetchWithRetry(url: string, keyword: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await waitForRateLimit();
      const res = await fetch(url, { cache: 'no-store' });

      if (res.ok) return await res.text();

      // Rate-limited or server error — retry
      if (res.status === 429 || res.status >= 500) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[rss] "${keyword}" HTTP ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // 4xx (not 429) — don't retry
      console.warn(`[rss] "${keyword}" HTTP ${res.status} — skipping`);
      return null;
    } catch (e) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`[rss] "${keyword}" network error (attempt ${attempt + 1}):`, e);
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error(`[rss] "${keyword}" failed after ${MAX_RETRIES + 1} attempts`);
  return null;
}

// ----------------------------------------------------------------
// XML parser (singleton)
// ----------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  isArray: (name) => name === 'item',
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ----------------------------------------------------------------
// Locale config
// ----------------------------------------------------------------
const RSS_LOCALE = {
  ja: 'hl=ja&gl=JP&ceid=JP:ja',
  en: 'hl=en&gl=US&ceid=US:en',
} as const;

export type RssLocale = keyof typeof RSS_LOCALE;

// ----------------------------------------------------------------
// Main export — fetch + cache + retry
// ----------------------------------------------------------------
export async function fetchNewsRss(
  keyword: string,
  locale: RssLocale = 'ja'
): Promise<RssItem[]> {
  const cacheKey = `${keyword}::${locale}`;

  // Cache hit
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`[rss] cache hit "${keyword}" (${locale}) — ${cached.length} items`);
    return cached;
  }

  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&${RSS_LOCALE[locale]}`;
  console.log(`[rss] fetching "${keyword}" (${locale})`);

  const xml = await fetchWithRetry(feedUrl, keyword);
  if (!xml) {
    console.warn(`[rss] "${keyword}" (${locale}) returned no data — 0 items`);
    return [];
  }

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    console.warn(`[rss] XML parse error for "${keyword}":`, e);
    return [];
  }

  const items: any[] = parsed?.rss?.channel?.item ?? [];

  const result = items
    .map((item): RssItem | null => {
      const rawTitle: string = typeof item.title === 'string' ? item.title : '';
      const title = rawTitle.replace(/ - [^-]+$/, '').trim();
      if (!title) return null;

      const url: string = typeof item.link === 'string' ? item.link.trim() : '';
      if (!url) return null;

      const sourceEl = item.source;
      let sourceDomain = '';
      let sourceDisplayName = '';

      if (sourceEl !== undefined && sourceEl !== null) {
        if (typeof sourceEl === 'object') {
          const sourceUrl: string = sourceEl['@_url'] ?? '';
          sourceDisplayName = String(sourceEl['#text'] ?? '').trim();
          sourceDomain = extractDomain(sourceUrl);
        } else {
          sourceDisplayName = String(sourceEl).trim();
        }
      }

      if (!sourceDomain) sourceDomain = extractDomain(url);
      if (!sourceDisplayName) sourceDisplayName = sourceDomain;
      if (!sourceDomain) return null;

      let publishedAt: string;
      try {
        publishedAt = new Date(String(item.pubDate ?? '')).toISOString();
        if (isNaN(new Date(publishedAt).getTime())) throw new Error();
      } catch {
        publishedAt = new Date().toISOString();
      }

      const rawDesc: string = typeof item.description === 'string' ? item.description : '';
      const summary = rawDesc ? stripHtml(rawDesc).slice(0, 400) || null : null;

      return { title, url, sourceDomain, sourceDisplayName, publishedAt, summary };
    })
    .filter((item): item is RssItem => item !== null);

  console.log(`[rss] "${keyword}" (${locale}) — ${result.length} items fetched`);
  cacheSet(cacheKey, result);
  return result;
}

// Expose cache TTL for logging
export const RSS_CACHE_TTL_MIN = CACHE_TTL_MS / 60_000;

// ----------------------------------------------------------------
// Direct RSS fetch — for feeds that don't go through Google News.
// Used by Tier 1 sources (NHK, newspapers) for topic ingestion.
// Unlike fetchNewsRss, the feed URL is used directly and the caller
// must supply the fallback source domain (e.g. 'nhk.or.jp').
// ----------------------------------------------------------------
export async function fetchDirectRss(
  feedUrl: string,
  fallbackDomain: string,
  fallbackDisplayName: string
): Promise<RssItem[]> {
  const cacheKey = `direct::${feedUrl}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`[rss] cache hit direct "${feedUrl}" — ${cached.length} items`);
    return cached;
  }

  console.log(`[rss] fetching direct feed "${feedUrl}"`);
  const xml = await fetchWithRetry(feedUrl, feedUrl);
  if (!xml) {
    console.warn(`[rss] direct feed "${feedUrl}" returned no data`);
    return [];
  }

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    console.warn(`[rss] XML parse error for direct feed "${feedUrl}":`, e);
    return [];
  }

  const items: any[] = parsed?.rss?.channel?.item ?? [];

  const result = items
    .map((item): RssItem | null => {
      const rawTitle: string = typeof item.title === 'string' ? item.title : '';
      const title = stripHtml(rawTitle).trim();
      if (!title) return null;

      const url: string = typeof item.link === 'string' ? item.link.trim() : '';
      if (!url) return null;

      const sourceDomain = extractDomain(url) || fallbackDomain;
      const sourceDisplayName = fallbackDisplayName;
      if (!sourceDomain) return null;

      let publishedAt: string;
      try {
        publishedAt = new Date(String(item.pubDate ?? '')).toISOString();
        if (isNaN(new Date(publishedAt).getTime())) throw new Error();
      } catch {
        publishedAt = new Date().toISOString();
      }

      const rawDesc: string = typeof item.description === 'string' ? item.description : '';
      const summary = rawDesc ? stripHtml(rawDesc).slice(0, 400) || null : null;

      return { title, url, sourceDomain, sourceDisplayName, publishedAt, summary };
    })
    .filter((item): item is RssItem => item !== null);

  console.log(`[rss] direct feed "${feedUrl}" — ${result.length} items`);
  cacheSet(cacheKey, result);
  return result;
}

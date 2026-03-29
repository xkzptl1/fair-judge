// ----------------------------------------------------------------
// Tier 2 data source: 国会会議録API (National Diet Library)
//
// Fetches parliamentary speech records for a given keyword.
// Free to use, no authentication required.
//
// API docs: https://kokkai.ndl.go.jp/api.html
//
// Each speech is treated as an article with:
//   - source_domain: kokkai.ndl.go.jp
//   - title:         "<発言者> — <会議名> (<date>)"
//   - summary:       First 400 chars of speech text
//   - url:           speechURL (unique per speech)
//
// This gives the stance classifier real deliberation text, which
// is higher-signal than news headlines for domestic policy topics.
// ----------------------------------------------------------------

import type { RssItem } from './rss';

const KOKKAI_API = 'https://kokkai.ndl.go.jp/api/speech';
const SOURCE_DOMAIN = 'kokkai.ndl.go.jp';
const SOURCE_DISPLAY = '国会会議録';

// Only look back this many days to avoid stale proceedings
const MAX_DAYS_AGO = 180;

interface KokkaiSpeech {
  speechID:        string;
  nameOfHouse:     string;   // 衆議院 / 参議院
  nameOfMeeting:   string;   // 委員会名 etc.
  issue:           string;   // 第N号
  date:            string;   // YYYY-MM-DD
  speaker:         string;   // 発言者氏名
  speakerGroup:    string;   // 会派
  speakerPosition: string;   // 役職 (大臣 etc.)
  speech:          string;   // 発言本文
  speechURL:       string;   // NDL permalink
}

interface KokkaiResponse {
  numberOfRecords: string;
  numberOfReturn:  string;
  searchResult:    KokkaiSpeech[];
}

// ----------------------------------------------------------------
// Fetch Diet speeches for a keyword, converted to RssItem shape
// so they can be passed directly to ingestArticle().
// ----------------------------------------------------------------
export async function fetchKokkaiSpeeches(
  keyword: string,
  maxRecords = 5
): Promise<RssItem[]> {
  const fromDate = new Date(Date.now() - MAX_DAYS_AGO * 86_400_000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const url =
    `${KOKKAI_API}` +
    `?any=${encodeURIComponent(keyword)}` +
    `&from=${fromDate}` +
    `&maximumRecords=${maxRecords}` +
    `&recordPacking=json`;

  console.log(`[kokkai] fetching "${keyword}" (max ${maxRecords})`);

  let data: KokkaiResponse;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[kokkai] HTTP ${res.status} for "${keyword}"`);
      return [];
    }
    data = await res.json() as KokkaiResponse;
  } catch (e) {
    console.error(`[kokkai] fetch error for "${keyword}":`, e);
    return [];
  }

  const speeches = data.searchResult ?? [];
  console.log(`[kokkai] "${keyword}" — ${speeches.length} speeches (total: ${data.numberOfRecords})`);

  return speeches
    .map((s): RssItem | null => {
      if (!s.speechURL || !s.speech) return null;

      // Build a descriptive title: "鈴木一郎 — 参議院予算委員会 (2026-01-14)"
      const speakerLabel = [s.speaker, s.speakerPosition].filter(Boolean).join('（') + (s.speakerPosition ? '）' : '');
      const title = `${speakerLabel} — ${s.nameOfHouse}${s.nameOfMeeting} (${s.date})`;

      // Summary: first 400 chars of the speech, stripped of whitespace noise
      const summary = s.speech.replace(/\s+/g, ' ').trim().slice(0, 400) || null;

      let publishedAt: string;
      try {
        publishedAt = new Date(s.date).toISOString();
      } catch {
        publishedAt = new Date().toISOString();
      }

      return {
        title,
        url:               s.speechURL,
        sourceDomain:      SOURCE_DOMAIN,
        sourceDisplayName: SOURCE_DISPLAY,
        publishedAt,
        summary,
      };
    })
    .filter((item): item is RssItem => item !== null);
}

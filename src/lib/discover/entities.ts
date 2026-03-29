// ----------------------------------------------------------------
// Entity extraction — no ML, no external API
//
// Strategy (in order):
//   1. Known entity dictionary (countries, orgs, tech, key topics)
//   2. Capitalized proper noun sequences from English text
//   3. ALL-CAPS abbreviations (3–5 chars)
//   4. Katakana sequences from Japanese (≥ 3 chars = likely foreign proper noun)
//
// Phase 6.5b additions:
//   5. Entity normalization  — map JA geopolitical terms → EN canonical so
//      cross-locale clusters share the same entity tokens
//   6. Person-name disambiguation — suppress single-word entities that only
//      appear as a first name followed by a surname (e.g. "Israel Adesanya")
// ----------------------------------------------------------------

const KNOWN_ENTITIES: string[] = [
  // Countries (English)
  'United States', 'US', 'USA', 'China', 'Japan', 'Russia', 'Ukraine',
  'Germany', 'France', 'UK', 'Britain', 'Israel', 'Gaza', 'Iran',
  'North Korea', 'South Korea', 'Taiwan', 'India', 'Brazil', 'Cuba',
  'Sudan', 'Turkey', 'Saudi Arabia', 'Mexico', 'Canada', 'Australia',
  'Pakistan', 'Bangladesh', 'Ethiopia', 'Nigeria', 'Indonesia',

  // Countries (Japanese)
  '日本', '米国', '中国', 'ロシア', 'ウクライナ', 'ドイツ', 'フランス',
  'イギリス', 'イスラエル', 'ガザ', 'イラン', '北朝鮮', '韓国', '台湾',
  'インド', 'キューバ', 'スーダン', 'トルコ', 'サウジアラビア',

  // International organizations
  'NATO', 'UN', 'WHO', 'IMF', 'WTO', 'OPEC', 'EU', 'G7', 'G20',
  'World Bank', 'IAEA', 'UNHCR', '国連', '欧州連合',

  // Central banks / financial
  'Federal Reserve', 'Fed', 'ECB', 'BOJ', '日銀', 'FDIC',

  // Tech companies
  'OpenAI', 'Google', 'Apple', 'Microsoft', 'Meta', 'Amazon', 'Tesla',
  'Nvidia', 'Samsung', 'TSMC', 'Intel', 'Anthropic', 'xAI', 'DeepMind',
  'Huawei', 'ByteDance', 'TikTok', 'Alibaba', 'Baidu', 'SoftBank',
  'ソフトバンク',

  // Key thematic terms (high-signal for clustering)
  'AI', '人工知能', '生成AI', 'semiconductor', '半導体', 'tariff', '関税',
  'sanctions', '制裁', 'election', '選挙', 'inflation', 'インフレ',
  'nuclear', '原子力', 'climate', '気候', 'Gaza war', 'ceasefire', '停戦',
  'famine', '飢餓', 'coup', 'earthquake', '地震', 'tsunami', '津波',
];

// ----------------------------------------------------------------
// Phase 6.5b — Entity normalization map
// Maps alternative/Japanese forms to canonical English names so that
// articles across locales share identical entity tokens after extraction.
// ----------------------------------------------------------------
const ENTITY_NORMALIZATION_MAP: Record<string, string> = {
  // Countries: Japanese → canonical English
  '日本': 'Japan',
  '米国': 'US',
  '中国': 'China',
  'ロシア': 'Russia',
  'ウクライナ': 'Ukraine',
  'ドイツ': 'Germany',
  'フランス': 'France',
  'イギリス': 'UK',
  'イスラエル': 'Israel',
  'ガザ': 'Gaza',
  'イラン': 'Iran',
  '北朝鮮': 'North Korea',
  '韓国': 'South Korea',
  '台湾': 'Taiwan',
  'インド': 'India',
  'キューバ': 'Cuba',
  'スーダン': 'Sudan',
  'トルコ': 'Turkey',
  'サウジアラビア': 'Saudi Arabia',
  // English aliases → canonical
  'United States': 'US',
  'USA': 'US',
  'Britain': 'UK',
  // Organizations
  '国連': 'UN',
  '欧州連合': 'EU',
  '日銀': 'BOJ',
  // Tech
  'ソフトバンク': 'SoftBank',
  // Thematic: Japanese → English canonical
  '人工知能': 'AI',
  '生成AI': 'AI',
  '半導体': 'semiconductor',
  '関税': 'tariff',
  '制裁': 'sanctions',
  '選挙': 'election',
  'インフレ': 'inflation',
  '原子力': 'nuclear',
  '気候': 'climate',
  '停戦': 'ceasefire',
  '飢餓': 'famine',
  '地震': 'earthquake',
  '津波': 'tsunami',
};

// ----------------------------------------------------------------
// Phase 6.5b — Entity type sets
// Exported so scorer.ts can generate context-aware topic titles.
// ----------------------------------------------------------------
export const COUNTRY_ENTITIES = new Set([
  'US', 'China', 'Russia', 'Ukraine', 'Israel', 'Iran', 'Japan', 'UK',
  'Germany', 'France', 'North Korea', 'South Korea', 'Taiwan', 'India',
  'Brazil', 'Cuba', 'Sudan', 'Turkey', 'Saudi Arabia', 'Mexico', 'Canada',
  'Australia', 'Pakistan', 'Gaza', 'Bangladesh', 'Ethiopia', 'Nigeria',
  'Indonesia',
]);

export const TECH_ENTITIES = new Set([
  'AI', 'semiconductor', 'OpenAI', 'Google', 'Apple', 'Microsoft', 'Meta',
  'Amazon', 'Tesla', 'Nvidia', 'Samsung', 'TSMC', 'Intel', 'Anthropic',
  'xAI', 'DeepMind', 'Huawei', 'ByteDance', 'TikTok', 'Alibaba', 'Baidu',
  'SoftBank',
]);

export const CONFLICT_ENTITIES = new Set([
  'Gaza', 'ceasefire', 'sanctions', 'nuclear', 'famine', 'coup',
  'tariff', 'election',
]);

// ----------------------------------------------------------------
// Phase 6.5b — Person-name disambiguation
// Heuristic: a single-word entity (e.g. "Israel") that appears in the
// title ONLY as a first name followed by a surname-like word is likely
// a person's name, not a geopolitical entity.
// ----------------------------------------------------------------

// Words that commonly follow country names in geopolitical context.
// If one of these follows the entity, it's NOT a person's surname.
const GEO_POLITICAL_FOLLOWERS = new Set([
  'Defense', 'Forces', 'Military', 'Government', 'Prime', 'President',
  'Minister', 'Parliament', 'Congress', 'Senate', 'Central', 'National',
  'Federal', 'Army', 'Navy', 'Police', 'Court', 'Ministry', 'Leader',
  'Official', 'Embassy', 'Relations', 'Troops', 'Nuclear', 'Sanctions',
  'Deal', 'Talks', 'Conflict', 'Crisis', 'War', 'Peace', 'Trade',
]);

function looksLikePersonFirstName(entity: string, title: string): boolean {
  // Only check single-word entities — multi-word phrases are never first names
  if (entity.includes(' ')) return false;

  // Look for "[Entity] [CapitalisedWord]" where the second word looks like a surname
  const surnamePattern = new RegExp(`\\b${escapeRegex(entity)}\\s+([A-Z][a-z]{2,})\\b`);
  const surnameMatch = surnamePattern.exec(title);
  if (!surnameMatch) return false;

  const potentialSurname = surnameMatch[1];

  // If the next word is a known geo-political context word, not a surname
  if (GEO_POLITICAL_FOLLOWERS.has(potentialSurname)) return false;

  // If the two-word combo is itself a known entity, it's not a person name
  const combined = `${entity} ${potentialSurname}`;
  if (KNOWN_ENTITIES.some((e) => e.toLowerCase() === combined.toLowerCase())) return false;

  // Check if entity also appears standalone (not followed by a capitalized surname).
  // Remove the person-name match first, then look for remaining occurrences.
  const withoutPersonName = title.replace(surnamePattern, '');
  const standalonePattern = new RegExp(`\\b${escapeRegex(entity)}\\b`, 'i');
  if (standalonePattern.test(withoutPersonName)) return false;

  // All occurrences are in person-name context → treat as person, not geopolitical entity
  return true;
}

// Escape special regex chars
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractEntities(title: string): string[] {
  const raw = new Set<string>();

  // 1. Known entity dictionary
  for (const entity of KNOWN_ENTITIES) {
    const pattern = new RegExp(`(?:^|\\s|\\b)${escapeRegex(entity)}(?:\\s|\\b|$)`, 'i');
    if (pattern.test(title)) {
      raw.add(entity);
    }
  }

  // 2. Capitalized multi-word proper noun sequences in English (2+ words)
  const properNouns = title.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g) ?? [];
  for (const noun of properNouns) {
    const alreadyCovered = [...raw].some(
      (e) => e.toLowerCase() === noun.toLowerCase()
    );
    if (!alreadyCovered) raw.add(noun);
  }

  // 3. ALL-CAPS abbreviations (3–5 chars, not already in set)
  const acronyms = title.match(/\b[A-Z]{3,5}\b/g) ?? [];
  for (const acr of acronyms) {
    if (!raw.has(acr)) raw.add(acr);
  }

  // 4. Katakana sequences ≥ 3 chars (foreign proper nouns in Japanese text)
  const katakana = title.match(/[\u30A0-\u30FF]{3,}/g) ?? [];
  for (const k of katakana) {
    if (!raw.has(k)) raw.add(k);
  }

  // ── Phase 6.5b: disambiguation + normalization ─────────────────

  // 5. Remove entities that appear only as a person's first name
  const disambiguated = [...raw].filter(
    (entity) => !looksLikePersonFirstName(entity, title)
  );

  // 6. Normalize to canonical English forms and deduplicate
  const normalized = new Set<string>();
  for (const entity of disambiguated) {
    const canonical = ENTITY_NORMALIZATION_MAP[entity] ?? entity;
    normalized.add(canonical);
  }

  return [...normalized];
}

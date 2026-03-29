import type { Cluster } from './cluster';
import { DISCOVER_CONFIG } from './config';
import { COUNTRY_ENTITIES, TECH_ENTITIES, CONFLICT_ENTITIES } from './entities';

// ----------------------------------------------------------------
// Types — stored verbatim in candidate_topics JSONB columns
// ----------------------------------------------------------------

export interface HardRequirements {
  min_articles:  { pass: boolean; value: number; threshold: number };
  min_domains:   { pass: boolean; value: number; threshold: number };
  freshness:     { pass: boolean; oldest_hours: number; threshold: number };
  no_duplicate:  { pass: boolean; note: string };
}

export interface ScoreBreakdown {
  cross_locale:      { score: number; locale_count: number; target: number };
  source_diversity:  { score: number; domain_count: number; target: number };
  article_volume:    { score: number; article_count: number; target: number };
  cluster_coherence: { score: number; coherence_ratio: number };
}

export interface ScoredCandidate {
  clusterKey:        string;
  title:             string;
  entities:          string[];
  articleUrls:       string[];
  articleTitles:     string[];   // parallel to articleUrls; used by Phase 7 enricher
  locales:           string[];
  domainCount:       number;
  articleCount:      number;
  promotionScore:    number;
  scoreBreakdown:    ScoreBreakdown;
  hardRequirements:  HardRequirements;
  hardPass:          boolean;
  eligible:          boolean;  // hardPass AND score >= threshold
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

// ----------------------------------------------------------------
// Phase 6.5b — Context-aware candidate title generation
// Uses entity type classification to pick a natural Japanese template.
// All entities are already normalized to canonical English by this point.
// ----------------------------------------------------------------
function generateCandidateTitle(entities: string[]): string {
  if (entities.length === 0) return 'グローバルニュース動向';

  const countries  = entities.filter((e) => COUNTRY_ENTITIES.has(e));
  const techItems  = entities.filter((e) => TECH_ENTITIES.has(e));
  const conflicts  = entities.filter((e) => CONFLICT_ENTITIES.has(e));

  // Two or more countries + a conflict/diplomatic signal
  if (countries.length >= 2 && conflicts.length > 0) {
    return `${countries[0]}・${countries[1]}をめぐる緊張と外交`;
  }

  // Two or more countries, no explicit conflict signal
  if (countries.length >= 2) {
    return `${countries[0]}・${countries[1]}間の外交動向`;
  }

  // Single country + tech signal
  if (countries.length === 1 && techItems.length > 0) {
    return `${countries[0]}のAI・テクノロジー政策動向`;
  }

  // Single country + conflict/geopolitical signal
  if (countries.length === 1 && conflicts.length > 0) {
    return `${countries[0]}をめぐる国際情勢`;
  }

  // Pure tech cluster (no country context)
  if (techItems.length >= 2) {
    return `${techItems[0]}・${techItems[1]}をめぐるテクノロジー動向`;
  }
  if (techItems.length === 1) {
    return `${techItems[0]}をめぐる最新動向`;
  }

  // Single country, no other signals
  if (countries.length === 1) {
    return `${countries[0]}をめぐる最新動向`;
  }

  // Fallback: join top two entities
  const top = entities.slice(0, 2);
  return top.length > 1
    ? `${top.join('・')}に関する動向`
    : `${top[0]}をめぐる最新動向`;
}

// ----------------------------------------------------------------
// Score a single cluster
// ----------------------------------------------------------------
export function scoreCluster(cluster: Cluster): ScoredCandidate {
  const cfg = DISCOVER_CONFIG;
  const now  = Date.now();

  // ── Hard requirements ──────────────────────────────────────────

  const oldestHours = cluster.articles.reduce((max, a) => {
    const h = (now - new Date(a.publishedAt).getTime()) / 3_600_000;
    return Math.max(max, isNaN(h) ? 0 : h);
  }, 0);

  const hardRequirements: HardRequirements = {
    min_articles: {
      pass:      cluster.articles.length >= cfg.hardRequirements.minArticles,
      value:     cluster.articles.length,
      threshold: cfg.hardRequirements.minArticles,
    },
    min_domains: {
      pass:      cluster.domains.length >= cfg.hardRequirements.minDomains,
      value:     cluster.domains.length,
      threshold: cfg.hardRequirements.minDomains,
    },
    freshness: {
      pass:         oldestHours <= cfg.hardRequirements.maxAgeHours,
      oldest_hours: Math.round(oldestHours),
      threshold:    cfg.hardRequirements.maxAgeHours,
    },
    // Duplicate check is deferred to the enrichment step (Phase 7+).
    // Enricher overwrites this gate with the actual result.
    no_duplicate: {
      pass: true,
      note: 'pending — checked during enrichment',
    },
  };

  const hardPass = Object.values(hardRequirements).every((r) => r.pass);

  // ── Scoring signals ────────────────────────────────────────────

  const { scoring } = cfg;

  const localeScore = clamp01(
    cluster.locales.length / scoring.crossLocale.targetLocales
  ) * scoring.crossLocale.weight;

  const domainScore = clamp01(
    cluster.domains.length / scoring.sourceDiversity.targetDomains
  ) * scoring.sourceDiversity.weight;

  const volumeScore = clamp01(
    cluster.articles.length / scoring.articleVolume.targetArticles
  ) * scoring.articleVolume.weight;

  // Coherence: fraction of articles that contain the top entity
  const topEntity = cluster.entities[0] ?? '';
  const coherenceRatio = topEntity
    ? cluster.articles.filter((a) =>
        a.title.toLowerCase().includes(topEntity.toLowerCase())
      ).length / cluster.articles.length
    : 0;
  const coherenceScore = coherenceRatio * scoring.clusterCoherence.weight;

  const promotionScore = round2(localeScore + domainScore + volumeScore + coherenceScore);

  const scoreBreakdown: ScoreBreakdown = {
    cross_locale:      { score: round2(localeScore),    locale_count: cluster.locales.length,  target: scoring.crossLocale.targetLocales },
    source_diversity:  { score: round2(domainScore),    domain_count: cluster.domains.length,  target: scoring.sourceDiversity.targetDomains },
    article_volume:    { score: round2(volumeScore),    article_count: cluster.articles.length, target: scoring.articleVolume.targetArticles },
    cluster_coherence: { score: round2(coherenceScore), coherence_ratio: round2(coherenceRatio) },
  };

  // ── Draft title ────────────────────────────────────────────────
  // Phase 6.5b: context-aware templates based on entity types.
  // Replaced by LLM-generated titles in Phase 7.
  const title = generateCandidateTitle(cluster.entities);

  return {
    clusterKey:       cluster.clusterKey,
    title,
    entities:         cluster.entities,
    articleUrls:      cluster.articles.map((a) => a.url),
    articleTitles:    cluster.articles.map((a) => a.title),
    locales:          cluster.locales,
    domainCount:      cluster.domains.length,
    articleCount:     cluster.articles.length,
    promotionScore,
    scoreBreakdown,
    hardRequirements,
    hardPass,
    eligible:         hardPass && promotionScore >= cfg.promotionThreshold,
  };
}

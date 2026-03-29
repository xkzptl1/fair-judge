-- ============================================================
-- Phase 6.5a: Candidate Topics (Discovery Layer)
-- ============================================================
-- candidate_topics is an observation/staging table.
-- Rows here are never shown in the UI directly.
-- Promotion to `topics` happens either automatically (Phase 6.5b)
-- or stays pending for inspection (Phase 6.5a).
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_topics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  title            TEXT        NOT NULL,         -- draft title, auto-generated from entities
  cluster_key      TEXT        NOT NULL UNIQUE,   -- stable hash of top entities — enables upsert

  -- Discovery signals (raw)
  entities         TEXT[]      NOT NULL DEFAULT '{}',   -- ordered by frequency within cluster
  article_urls     TEXT[]      NOT NULL DEFAULT '{}',   -- all source URLs that formed this cluster
  locales          TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. ['ja', 'en-US', 'en-GB']
  domain_count     INT         NOT NULL DEFAULT 0,
  article_count    INT         NOT NULL DEFAULT 0,

  -- Scoring (stored for auditability)
  promotion_score  REAL        NOT NULL DEFAULT 0,      -- 0.0–1.0
  score_breakdown  JSONB,                               -- per-signal score details
  -- Example:
  -- {
  --   "cross_locale":     { "score": 0.35, "locale_count": 3, "target": 3 },
  --   "source_diversity": { "score": 0.22, "domain_count": 7, "target": 8 },
  --   "article_volume":   { "score": 0.16, "article_count": 12, "target": 15 },
  --   "cluster_coherence":{ "score": 0.08, "coherence_ratio": 0.75 }
  -- }

  hard_requirements JSONB,                             -- each gate with pass/fail + value + threshold
  -- Example:
  -- {
  --   "min_articles": { "pass": true,  "value": 12, "threshold": 5 },
  --   "min_domains":  { "pass": true,  "value": 7,  "threshold": 3 },
  --   "freshness":    { "pass": true,  "oldest_hours": 18, "threshold": 72 },
  --   "no_duplicate": { "pass": true,  "note": "..." }
  -- }

  -- Status
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'auto_promoted', 'rejected')),

  -- Promotion record (populated only when status = 'auto_promoted')
  promoted_at      TIMESTAMPTZ,
  promoted_topic_id UUID       REFERENCES topics(id) ON DELETE SET NULL,
  promotion_snapshot JSONB,
  -- Example:
  -- {
  --   "promotion_score": 0.71,
  --   "threshold_used": 0.65,
  --   "score_breakdown": { ... },
  --   "hard_requirements": { ... },
  --   "promoted_at": "2026-03-29T10:00:00Z",
  --   "auto_promote_config": { "version": "6.5a" }
  -- }

  discovered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for observation queries
CREATE INDEX IF NOT EXISTS idx_candidates_status         ON candidate_topics(status);
CREATE INDEX IF NOT EXISTS idx_candidates_score          ON candidate_topics(promotion_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_discovered     ON candidate_topics(discovered_at DESC);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_candidate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_set_updated_at
  BEFORE UPDATE ON candidate_topics
  FOR EACH ROW
  EXECUTE FUNCTION set_candidate_updated_at();

-- Add origin column to topics to distinguish config vs. discovered rows
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'config'
  CHECK (origin IN ('config', 'discovered'));

-- ============================================================
-- Multi-Perspective News Explorer — MVP Database Schema
-- ============================================================
-- Design principles:
--   • Topics are the primary entity. Everything else is relative to a topic.
--   • Stance classification is stored separately from articles to allow
--     re-classification without mutating article rows.
--   • Fact checks are always linked to topics, never to stance groups.
--   • Ambiguity (mixed / unclear) is a valid and first-class stance value.
--   • No user / auth / social tables in v1.
-- ============================================================

-- Enable UUID generation (required in Supabase / PostgreSQL 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ------------------------------------------------------------
-- topics
-- The root entity. Every screen starts here.
-- ------------------------------------------------------------
CREATE TABLE topics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  summary          TEXT,                        -- AI-generated 2-3 sentence overview
  main_issues      TEXT[],                      -- AI-extracted bullet points (key arguments)
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Denormalized counts for fast topic-card rendering (kept in sync via trigger)
  article_count    INT         NOT NULL DEFAULT 0,
  source_count     INT         NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  category         TEXT        NOT NULL DEFAULT 'その他'
                   CHECK (category IN (
                     'AI・テック', '政治', '経済', '社会',
                     '国際', '健康・医療', '環境', 'その他'
                   )),
  overseas_ratio   REAL        NOT NULL DEFAULT 0
                   CHECK (overseas_ratio >= 0 AND overseas_ratio <= 1)
);

-- Auto-update last_updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER topics_set_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- sources
-- Normalized outlet registry. One row per publication domain.
-- ------------------------------------------------------------
CREATE TABLE sources (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       TEXT        NOT NULL UNIQUE,     -- e.g. "nytimes.com"
  display_name TEXT,                            -- e.g. "The New York Times"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- articles
-- Metadata only — no full body content stored.
-- Always linked to exactly one topic (the primary grouping).
-- ------------------------------------------------------------
CREATE TABLE articles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id     UUID        NOT NULL REFERENCES topics(id)  ON DELETE CASCADE,
  source_id    UUID        NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  title        TEXT        NOT NULL,
  url          TEXT        NOT NULL UNIQUE,     -- original source URL, always preserved
  summary      TEXT,                            -- AI-generated excerpt or short summary
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_articles_topic_id  ON articles(topic_id);
CREATE INDEX idx_articles_source_id ON articles(source_id);


-- ------------------------------------------------------------
-- article_classifications
-- Stance of an article *relative to its topic*.
-- Kept separate from articles so classification can be updated
-- or re-run without altering article metadata.
--
-- Stance values (from classification.md):
--   support      — reinforces the topic claim
--   challenge    — questions or opposes the claim
--   report_only  — factual reporting without a clear stance
--   mixed        — contains both supporting and opposing elements
--   unclear      — insufficient signal; ambiguity preserved
-- ------------------------------------------------------------
CREATE TABLE article_classifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID        NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  topic_id      UUID        NOT NULL REFERENCES topics(id)  ON DELETE CASCADE,
  stance        TEXT        NOT NULL CHECK (
                              stance IN ('support', 'challenge', 'report_only', 'mixed', 'unclear')
                            ),
  reason        TEXT,                           -- 1-sentence explanation of the classification
  confidence    REAL        CHECK (confidence >= 0 AND confidence <= 1),  -- 0.0–1.0
  model         TEXT,                           -- LLM model ID that produced this result
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: all classifications for a topic (stance distribution queries)
CREATE INDEX idx_classifications_topic_stance ON article_classifications(topic_id, stance);
-- Secondary lookup: classification(s) for a specific article
CREATE INDEX idx_classifications_article_id  ON article_classifications(article_id);


-- ------------------------------------------------------------
-- fact_checks
-- Linked to topics only. Never mixed with stance groupings.
-- Populated via Google Fact Check API or manual curation.
-- ------------------------------------------------------------
CREATE TABLE fact_checks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id     UUID        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  claim        TEXT        NOT NULL,            -- the specific claim being fact-checked
  verdict      TEXT,                            -- e.g. "False", "Misleading", "Mostly True"
  explanation  TEXT,                            -- brief explanation from the fact-checker
  source_url   TEXT,                            -- link to the published fact-check
  fact_checker TEXT,                            -- outlet name, e.g. "PolitiFact"
  checked_at   TIMESTAMPTZ,                     -- when the fact-check was originally published
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fact_checks_topic_id ON fact_checks(topic_id);

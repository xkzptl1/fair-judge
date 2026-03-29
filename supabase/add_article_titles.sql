-- Phase 7: store article headlines on candidate_topics so the enricher
-- can include them in the LLM prompt without re-fetching RSS feeds.
ALTER TABLE candidate_topics
  ADD COLUMN IF NOT EXISTS article_titles TEXT[] NOT NULL DEFAULT '{}';

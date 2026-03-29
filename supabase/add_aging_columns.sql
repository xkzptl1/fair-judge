-- ============================================================
-- Phase 11: Topic Aging — add aging columns to topics,
--           fix candidate_topics status constraint
-- ============================================================

-- 1. last_article_at: updated via trigger whenever an article
--    is inserted for this topic. Used as the primary staleness signal.
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS last_article_at TIMESTAMPTZ DEFAULT NULL;

-- 2. promoted_at: set once when the topic row is first created.
--    Used as a hard-cap age signal (7-day ceiling).
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill existing rows: use first_seen_at as promotion time proxy.
UPDATE topics
  SET promoted_at = first_seen_at
  WHERE promoted_at IS NULL;

-- 3. Trigger: keep last_article_at current on every article INSERT.
--    Uses GREATEST() so a backdated article never regresses the value.
CREATE OR REPLACE FUNCTION update_topic_last_article_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE topics
    SET last_article_at = GREATEST(last_article_at, NEW.published_at)
    WHERE id = NEW.topic_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_update_last_article_at ON articles;
CREATE TRIGGER articles_update_last_article_at
  AFTER INSERT ON articles
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_last_article_at();

-- 4. Expand candidate_topics.status to include ready_for_promotion.
--    The evaluator sets this status when the decision engine returns
--    decision='promote'. Without this, the update is rejected by the
--    CHECK constraint.
DO $$
BEGIN
  ALTER TABLE candidate_topics
    DROP CONSTRAINT candidate_topics_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE candidate_topics
  ADD CONSTRAINT candidate_topics_status_check
  CHECK (status IN ('pending', 'auto_promoted', 'rejected', 'ready_for_promotion'));

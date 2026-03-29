-- Migration: add stance_distribution to topics
-- Run once in Supabase SQL Editor.
--
-- Purpose:
--   Precomputed stance counts so the list page reads one column
--   instead of joining all article_classifications at query time.
--   Written by syncTopicCounts() after every ingest run.
--   NULL means "no classifications yet" → UI shows データ収集中.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS stance_distribution JSONB DEFAULT NULL;

-- Backfill existing topics from current article_classifications data.
-- Safe to re-run (UPDATE is idempotent).
UPDATE topics t
SET stance_distribution = sub.dist
FROM (
  SELECT
    topic_id,
    jsonb_build_object(
      'support',     COUNT(*) FILTER (WHERE stance = 'support'),
      'challenge',   COUNT(*) FILTER (WHERE stance = 'challenge'),
      'report_only', COUNT(*) FILTER (WHERE stance = 'report_only'),
      'mixed',       COUNT(*) FILTER (WHERE stance = 'mixed'),
      'unclear',     COUNT(*) FILTER (WHERE stance = 'unclear')
    ) AS dist
  FROM article_classifications
  GROUP BY topic_id
) sub
WHERE t.id = sub.topic_id;

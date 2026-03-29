-- Phase 10: add decision_result column to candidate_topics
-- Stores the full output of the decision engine per candidate.
-- Safe to run multiple times.

ALTER TABLE candidate_topics
  ADD COLUMN IF NOT EXISTS decision_result JSONB DEFAULT NULL;

-- Also allow the new status value 'ready_for_promotion'.
-- If status is a plain TEXT column (not an enum), no change needed.
-- If it is an enum, run:
--   ALTER TYPE candidate_status ADD VALUE IF NOT EXISTS 'ready_for_promotion';
-- Check current type:
--   SELECT column_name, udt_name FROM information_schema.columns
--   WHERE table_name = 'candidate_topics' AND column_name = 'status';

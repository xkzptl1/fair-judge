-- Migration: add overseas_ratio column to topics
-- Run this in the Supabase SQL editor.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS overseas_ratio REAL NOT NULL DEFAULT 0
  CHECK (overseas_ratio >= 0 AND overseas_ratio <= 1);

-- Backfill seed topics with representative values
UPDATE topics SET overseas_ratio = 0.65 WHERE id = '22222222-0000-0000-0000-000000000001'; -- AI規制
UPDATE topics SET overseas_ratio = 0.10 WHERE id = '22222222-0000-0000-0000-000000000002'; -- 少子化対策
UPDATE topics SET overseas_ratio = 0.60 WHERE id = '22222222-0000-0000-0000-000000000003'; -- 日米関税

-- Set first_seen_at so badge testing works
UPDATE topics SET first_seen_at = NOW() - INTERVAL '20 hours' WHERE id = '22222222-0000-0000-0000-000000000002'; -- 新着

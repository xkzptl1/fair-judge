-- Migration: add category column to topics
-- Run this in the Supabase SQL editor against the existing database.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'その他'
  CHECK (category IN (
    'AI・テック', '政治', '経済', '社会',
    '国際', '健康・医療', '環境', 'その他'
  ));

-- Backfill seed topics (only needed if seed.sql was already applied)
UPDATE topics SET category = 'AI・テック' WHERE id = '22222222-0000-0000-0000-000000000001';
UPDATE topics SET category = '政治'       WHERE id = '22222222-0000-0000-0000-000000000002';
UPDATE topics SET category = '経済'       WHERE id = '22222222-0000-0000-0000-000000000003';

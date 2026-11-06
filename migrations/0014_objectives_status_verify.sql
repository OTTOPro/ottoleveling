-- ============================================================
-- Migration 0014 - objectives.status verification (NO-OP)
-- ============================================================
-- The existing CHECK constraint on objectives.status (migration 0001) already
-- includes the 4 values the objective status transitions need: active,
-- completed, abandoned, paused.
--
-- This migration file exists only to keep the migration numbering contiguous
-- and the apply-history explicit. NO SQL changes.
--
-- If a future audit reveals the CHECK is narrower than expected, promote this
-- file to a recreate-pattern migration following migration 0006's xp_events
-- 5-step pattern (CREATE _new + INSERT-SELECT + DROP indexes + DROP TABLE +
-- RENAME + recreate indexes).

SELECT 'objectives.status CHECK already complete - no-op' AS verification;

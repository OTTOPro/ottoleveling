-- ============================================================
-- Migration 0010 - auto_complete_rule + completions.source
-- ============================================================
-- Auto-complete templates. Two additive columns:
--
--   quest_templates.auto_complete_rule (TEXT, NULL)
--     JSON-encoded AutoCompleteRule. NULL = no auto-complete. Validated by
--     Zod on POST/PATCH /api/templates (apps/api/src/schemas/auto-complete.ts).
--     Defensive parse in lib/auto-complete/evaluate.ts logs + skips on malformed.
--
--   completions.source (TEXT NOT NULL DEFAULT 'manual')
--     'manual' (recordCompletion path) | 'auto' (autoCompleteQuest path).
--     Existing rows backfill via the DEFAULT clause (D1/SQLite materializes
--     DEFAULTs for existing rows on ADD COLUMN - no explicit UPDATE required).
--
-- NOTE on the CHECK constraint on completions.source: SQLite's ALTER TABLE
-- ADD COLUMN does NOT support adding a CHECK constraint inline. Two options:
--   (A) Skip the SQL-level CHECK - rely on the Zod guard on the read path
--       (apps/api/src/schemas/auto-complete.ts) + the autoCompleteQuest helper
--       being the ONLY writer of source='auto'.
--   (B) Use the 5-step strict recreate pattern from migration 0006's xp_events
--       (CREATE _new + INSERT-SELECT + DROP old indexes + DROP TABLE + RENAME).
-- We CHOSE option A for migration 0010. Rationale: completions is the most
-- write-heavy table in the schema (one row per quest interaction); the recreate
-- has nontrivial cost + risk for a CHECK that's defensible at the application
-- layer (source values come from internal code paths only, never user input).
-- If a future audit reveals drift, we can promote to option B via 0011.

ALTER TABLE quest_templates ADD COLUMN auto_complete_rule TEXT;

ALTER TABLE completions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- ============================================================
-- Migration 0012 - soft-delete columns on quest_templates + objectives
-- ============================================================
-- Two additive nullable columns:
--
--   quest_templates.deleted_at (DATETIME, NULL)
--   objectives.deleted_at      (DATETIME, NULL)
--
-- NULL = active (default for existing rows + new rows).
-- Non-NULL = soft-deleted at the timestamp.
--
-- All read queries on these tables MUST filter `WHERE deleted_at IS NULL`
-- by default. Trash views (`?show=trash`) explicitly filter the inverse.
-- Restore via `UPDATE ... SET deleted_at = NULL`.

ALTER TABLE quest_templates ADD COLUMN deleted_at DATETIME;
ALTER TABLE objectives      ADD COLUMN deleted_at DATETIME;

-- ============================================================
-- Migration 0007 - quest_arcs.completed_at amendment
-- ============================================================
-- Migration 0006 did not create the completed_at column on quest_arcs. Lifecycle helpers (completeArc / failArc / abandonArc) set
-- this timestamp; D1 needs the column to persist it. Additive ALTER -
-- SQLite ADD COLUMN supports NULLable columns without table recreation.

ALTER TABLE quest_arcs ADD COLUMN completed_at DATETIME;

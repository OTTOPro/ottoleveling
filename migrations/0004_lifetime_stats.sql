-- ============================================================
-- Migration 0004 - lifetime_stats (per-pillar lifetime memory)
-- ============================================================
-- One row per pillar. Materialized at the end of every successful daily
-- generation (after quests + state + cache are persisted) via
-- recomputeLifetimeStats(). A manual POST /api/admin/recompute-lifetime
-- endpoint runs the same function on demand for backfill or force-recompute.
--
-- Skipped quests (completions.status = 'skipped') are NOT counted in
-- total_completed OR total_failed - only 'completed' / 'failed' rows.
--
-- longest_streak is computed via consecutive-day walk over all completed
-- quests, identical to the algorithm in d1-reads-bilan.longestSuccessStreakInWindow
-- but spanning full history rather than a bounded window.

CREATE TABLE lifetime_stats (
  pillar_id        TEXT PRIMARY KEY REFERENCES pillars(id),
  total_xp         INTEGER  NOT NULL DEFAULT 0,
  total_completed  INTEGER  NOT NULL DEFAULT 0,
  total_failed     INTEGER  NOT NULL DEFAULT 0,
  longest_streak   INTEGER  NOT NULL DEFAULT 0,
  highest_level    INTEGER  NOT NULL DEFAULT 0,
  first_quest_at   DATETIME,
  last_updated_at  DATETIME
);

-- Pre-seed one zero row per pillar so the SELECT path always returns 4 rows
-- and the formatter never has a missing-row failure mode.
INSERT INTO lifetime_stats (pillar_id) VALUES ('body');
INSERT INTO lifetime_stats (pillar_id) VALUES ('mind');
INSERT INTO lifetime_stats (pillar_id) VALUES ('finance');
INSERT INTO lifetime_stats (pillar_id) VALUES ('projects');

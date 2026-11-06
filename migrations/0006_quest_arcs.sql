-- ============================================================
-- Migration 0006 - quest_arcs (multi-day quest arcs)
-- ============================================================
-- New table quest_arcs + ALTER quests to add arc_id + arc_step columns +
-- RECREATE xp_events to extend the source_type CHECK constraint with
-- 'arc_completion'. The recreate uses the strict 5-step SQLite pattern:
-- create xp_events_new, INSERT-SELECT, drop old
-- index, drop old table, rename new to old, recreate index on the
-- renamed table.

-- ----------- quest_arcs table (new) -----------
CREATE TABLE quest_arcs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id         TEXT NOT NULL REFERENCES pillars(id),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  total_steps       INTEGER NOT NULL CHECK (total_steps BETWEEN 3 AND 30),
  completed_steps   INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','failed','abandoned')),
  started_at        DATETIME NOT NULL DEFAULT (datetime('now')),
  expected_end      DATETIME,
  total_xp_reward   INTEGER NOT NULL,
  metadata          TEXT
);

CREATE INDEX idx_quest_arcs_status ON quest_arcs(status, pillar_id);
CREATE INDEX idx_quest_arcs_pillar ON quest_arcs(pillar_id);

-- ----------- ALTER quests to add arc columns -----------
ALTER TABLE quests ADD COLUMN arc_id INTEGER REFERENCES quest_arcs(id);
ALTER TABLE quests ADD COLUMN arc_step INTEGER;

CREATE INDEX idx_quests_arc ON quests(arc_id) WHERE arc_id IS NOT NULL;

-- ----------- RECREATE xp_events with extended CHECK list -----------
-- Standard SQLite pattern: new table, copy, drop old index, drop old table,
-- rename, recreate index. The existing xp_events index is idx_xp_events_pillar_date
-- (verified via migration 0001).

CREATE TABLE xp_events_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id   TEXT NOT NULL REFERENCES pillars(id),
  amount      INTEGER NOT NULL,
  source_type TEXT NOT NULL
              CHECK (source_type IN ('quest_completed','quest_failed','streak_bonus','penalty','manual_adjustment','arc_completion')),
  source_id   INTEGER,
  description TEXT NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO xp_events_new (id, pillar_id, amount, source_type, source_id, description, occurred_at)
  SELECT id, pillar_id, amount, source_type, source_id, description, occurred_at FROM xp_events;

DROP INDEX IF EXISTS idx_xp_events_pillar_date;
DROP TABLE xp_events;
ALTER TABLE xp_events_new RENAME TO xp_events;
CREATE INDEX idx_xp_events_pillar_date ON xp_events(pillar_id, occurred_at);

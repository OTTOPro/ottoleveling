-- 0016 - active_projects table
-- Separate from objectives. Projects = outputs (apps, businesses).
-- Objectives = personal goals (programmes, habits).
-- Used to populate {ACTIVE_PROJECTS} placeholder in quest generation prompt.

CREATE TABLE active_projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT,
  pillar       TEXT NOT NULL CHECK (pillar IN ('body','mind','finance','projects')),
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','paused','archived')),
  priority     INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  start_date   DATETIME NOT NULL DEFAULT (datetime('now')),
  notes        TEXT,
  deleted_at   DATETIME,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_status ON active_projects(status, deleted_at);
CREATE INDEX idx_projects_pillar ON active_projects(pillar);

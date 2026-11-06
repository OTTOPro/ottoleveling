-- ============================================================
-- Migration 0001 - OttoLeveling initial schema
-- ============================================================

-- PILLARS - static reference
CREATE TABLE pillars (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  icon        TEXT NOT NULL,
  description TEXT
);

-- OBJECTIVES - SMART objectives (variable deadlines)
CREATE TABLE objectives (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id     TEXT NOT NULL REFERENCES pillars(id),
  title         TEXT NOT NULL,
  description   TEXT,
  target_date   DATE NOT NULL,
  target_metric TEXT,
  target_value  REAL,
  current_value REAL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','abandoned','paused')),
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  completed_at  DATETIME,
  metadata      TEXT
);
CREATE INDEX idx_objectives_pillar ON objectives(pillar_id, status);
CREATE INDEX idx_objectives_target ON objectives(target_date, status);

-- QUEST_TEMPLATES - recurring templates with progression
CREATE TABLE quest_templates (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id           TEXT NOT NULL REFERENCES pillars(id),
  title               TEXT NOT NULL,
  description         TEXT,
  base_metric         TEXT NOT NULL,
  current_value       REAL NOT NULL,
  starting_value      REAL NOT NULL,
  progression_rule    TEXT NOT NULL,
  schedule            TEXT NOT NULL
                      CHECK (schedule IN ('daily','weekdays','weekly','custom')),
  schedule_config     TEXT,
  base_xp             INTEGER NOT NULL,
  difficulty          TEXT NOT NULL DEFAULT 'medium',
  active              INTEGER NOT NULL DEFAULT 1,
  created_by          TEXT NOT NULL DEFAULT 'manual'
                      CHECK (created_by IN ('manual','system')),
  last_progressed_at  DATETIME,
  created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
  metadata            TEXT
);
CREATE INDEX idx_templates_active ON quest_templates(active, pillar_id);

-- QUESTS - generated (system) or manual quests
CREATE TABLE quests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id     TEXT NOT NULL REFERENCES pillars(id),
  title         TEXT NOT NULL,
  description   TEXT,
  xp_value      INTEGER NOT NULL,
  difficulty    TEXT NOT NULL DEFAULT 'medium'
                CHECK (difficulty IN ('trivial','easy','medium','hard','epic')),
  source        TEXT NOT NULL
                CHECK (source IN ('system','manual')),
  objective_id  INTEGER REFERENCES objectives(id),
  template_id   INTEGER REFERENCES quest_templates(id),
  scheduled_for DATE NOT NULL,
  generation_id TEXT,
  metadata      TEXT,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quests_scheduled ON quests(scheduled_for);
CREATE INDEX idx_quests_pillar ON quests(pillar_id);
CREATE INDEX idx_quests_generation ON quests(generation_id);

-- COMPLETIONS - 1-to-1 with quest
CREATE TABLE completions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id     INTEGER NOT NULL UNIQUE REFERENCES quests(id),
  status       TEXT NOT NULL
               CHECK (status IN ('completed','failed','skipped')),
  xp_awarded   INTEGER NOT NULL,
  notes        TEXT,
  completed_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_completions_status ON completions(status, completed_at);

-- XP_EVENTS - transaction log (source of truth)
CREATE TABLE xp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id   TEXT NOT NULL REFERENCES pillars(id),
  amount      INTEGER NOT NULL,
  source_type TEXT NOT NULL
              CHECK (source_type IN ('quest_completed','quest_failed','streak_bonus','penalty','manual_adjustment')),
  source_id   INTEGER,
  description TEXT NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_xp_events_pillar_date ON xp_events(pillar_id, occurred_at);

-- FOCUS_PERIODS - history
CREATE TABLE focus_periods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar_id  TEXT NOT NULL REFERENCES pillars(id),
  horizon    TEXT NOT NULL
             CHECK (horizon IN ('weekly','monthly','sprint')),
  started_at DATETIME NOT NULL,
  ended_at   DATETIME,
  intensity  TEXT DEFAULT 'normal'
             CHECK (intensity IN ('normal','high'))
);
CREATE INDEX idx_focus_active ON focus_periods(ended_at) WHERE ended_at IS NULL;

-- DAILY_CHECKINS - evening input
CREATE TABLE daily_checkins (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         DATE NOT NULL UNIQUE,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  mood         TEXT,
  notes        TEXT,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- BILANS - generated reports
CREATE TABLE bilans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type  TEXT NOT NULL CHECK (period_type IN ('weekly','monthly','yearly')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  stats        TEXT NOT NULL,
  narrative    TEXT NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(period_type, period_start)
);
CREATE INDEX idx_bilans_period ON bilans(period_type, period_start DESC);

-- PENALTY_RULES - penalty config by difficulty
CREATE TABLE penalty_rules (
  difficulty       TEXT PRIMARY KEY,
  fail_penalty_pct REAL NOT NULL,
  skip_penalty_pct REAL NOT NULL
);

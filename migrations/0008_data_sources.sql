-- ============================================================
-- Migration 0008 - data_sources / data_source_tokens / daily_metrics
-- ============================================================
-- Google Health data source foundation. Three new tables:
--   data_sources         - one row per (provider) with connection status
--   data_source_tokens   - encrypted access/refresh tokens (1:1 with data_sources)
--   daily_metrics        - per-metric daily data points (one row per (date, provider, metric))
--
-- Token storage encrypts at application layer via Web Crypto AES-GCM-256
-- so a D1 dump never exposes usable tokens. Metrics are stored pre-aggregated
-- per metric. Sync targets "yesterday" UTC daily at 05:30.

CREATE TABLE data_sources (
  provider          TEXT PRIMARY KEY,                              -- 'google_health', future: 'spotify'
  status            TEXT NOT NULL DEFAULT 'disconnected'
                    CHECK (status IN ('disconnected','connected','reauth_required','error')),
  last_sync_at      DATETIME,
  last_sync_status  TEXT
                    CHECK (last_sync_status IN ('success','partial','failed') OR last_sync_status IS NULL),
  error_message     TEXT,
  created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE data_source_tokens (
  provider                 TEXT PRIMARY KEY REFERENCES data_sources(provider),
  access_token_encrypted   TEXT NOT NULL,                          -- base64(iv):base64(ciphertext)
  refresh_token_encrypted  TEXT NOT NULL,
  expires_at               DATETIME NOT NULL,                      -- access_token expiry
  updated_at               DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE daily_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,                                       -- YYYY-MM-DD UTC
  pillar_id   TEXT REFERENCES pillars(id),                         -- NULL for cross-pillar metrics
  provider    TEXT NOT NULL,                                       -- 'google_health' etc.
  metric      TEXT NOT NULL,                                       -- 'steps' | 'sleep_minutes' | ...
  value       REAL NOT NULL,
  metadata    TEXT,                                                -- JSON, capped ~1KB
  recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, provider, metric)
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX idx_daily_metrics_pillar_date ON daily_metrics(pillar_id, date);
CREATE INDEX idx_daily_metrics_provider_date ON daily_metrics(provider, date);

-- Pre-seed data_sources row for google_health so the UI can render the
-- disconnected card without requiring OAuth completion first.
INSERT INTO data_sources (provider, status) VALUES ('google_health', 'disconnected');

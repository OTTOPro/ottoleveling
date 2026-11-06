-- 0017 - DLQ inspection tables
-- Cloudflare Queues handle the actual DLQ routing (configured in
-- apps/queue-consumer/wrangler.toml). These tables mirror DLQ contents
-- for the /system/admin/orchestration dashboard inspection + retry UI.
-- Populated by the consumer when a message exhausts retries.

CREATE TABLE llm_jobs_dlq (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_body    TEXT NOT NULL,         -- JSON.stringify of original LlmJobMessage
  error_message   TEXT NOT NULL,
  attempts        INTEGER NOT NULL,
  failed_at       DATETIME NOT NULL DEFAULT (datetime('now')),
  original_queue  TEXT NOT NULL DEFAULT 'ottoleveling-llm-jobs'
);
CREATE INDEX idx_llm_dlq_failed_at ON llm_jobs_dlq(failed_at DESC);

CREATE TABLE events_dlq (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_body    TEXT NOT NULL,
  error_message   TEXT NOT NULL,
  attempts        INTEGER NOT NULL,
  failed_at       DATETIME NOT NULL DEFAULT (datetime('now')),
  original_queue  TEXT NOT NULL DEFAULT 'ottoleveling-events'
);
CREATE INDEX idx_events_dlq_failed_at ON events_dlq(failed_at DESC);

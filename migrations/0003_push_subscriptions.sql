-- ============================================================
-- Migration 0003 - push_subscriptions for PWA push notifications
-- ============================================================
-- One row per browser/device subscription. UNIQUE(endpoint) enables upsert
-- on re-subscribe. failure_count auto-deletes broken endpoints after > 5
-- non-410 errors (see SystemAgent.sendPush). 410 Gone deletes immediately.

CREATE TABLE push_subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint      TEXT    NOT NULL UNIQUE,
  p256dh        TEXT    NOT NULL,
  auth          TEXT    NOT NULL,
  user_agent    TEXT,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  last_used_at  DATETIME,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_push_subs_endpoint ON push_subscriptions(endpoint);

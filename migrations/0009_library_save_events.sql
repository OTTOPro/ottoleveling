-- ============================================================
-- Migration 0009 - library_save_events + pre-seed spotify data_sources row
-- ============================================================
-- Spotify integration. One new table:
--   library_save_events - per-entry + per-day rows tracking podcast-episode AND
--   audiobook SAVES (library additions), NOT listening time. Spotify's
--   /me/player/recently-played returns only music tracks (track.type ===
--   'track'); podcast episodes and audiobook chapters never appear there, so
--   the integration diffs the saved library instead. The resulting signal is
--   "did the user save this entry to their library?" - engagement INTENT.
--   The "saved ≠ listened" disclaimer is repeated wherever this data surfaces
--   (snapshot format, strictness rule PODCAST_LISTENING_SEMANTICS,
--   DataSourceCard subtitle).
--
-- Also pre-seeds the
-- data_sources row for 'spotify' (status='disconnected') so the /system UI
-- can render the disconnected card without requiring OAuth completion first.

CREATE TABLE library_save_events (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  date                        TEXT NOT NULL,                       -- YYYY-MM-DD UTC (day the save was first detected by sync)
  show_or_book_title          TEXT NOT NULL,                       -- show name (episode_save) OR book title (audiobook_save)
  show_or_book_author         TEXT,                                -- artist / author / host (nullable)
  show_or_book_spotify_uri    TEXT,                                -- e.g., spotify:show:abc123, spotify:episode:xyz, spotify:audiobook:def
  listening_type              TEXT NOT NULL CHECK (listening_type IN ('episode_save', 'audiobook_save')),
  created_at                  DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, show_or_book_spotify_uri, listening_type)
);

CREATE INDEX idx_library_save_events_date ON library_save_events(date);

-- Pre-seed data_sources row for spotify so the UI can render the
-- disconnected card without requiring OAuth completion first.
INSERT INTO data_sources (provider, status) VALUES ('spotify', 'disconnected');

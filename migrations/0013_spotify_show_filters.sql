-- ============================================================
-- Migration 0013 - spotify_show_filters
-- ============================================================
-- Per-show opt-out for mind-pillar learning credit.
--
-- Default: include = TRUE (all newly-discovered shows count). User opts a show
-- OUT via the /sources/spotify UI. Filter applies FORWARD ONLY - past
-- library_save_events stay intact, past prompts and bilans are immutable.
--
-- Auto-discovery: spotify_sync alarm upserts every distinct show URI surfaced
-- in /me/shows + /me/episodes. Idempotent via PK on show_spotify_uri (the
-- upsert path preserves include_in_mind_learning if the row already exists -
-- only show_name is refreshed in case Spotify's metadata changed).

CREATE TABLE spotify_show_filters (
  show_spotify_uri         TEXT PRIMARY KEY,
  show_name                TEXT NOT NULL,
  include_in_mind_learning INTEGER NOT NULL DEFAULT 1,                      -- 1 = include, 0 = exclude
  contributes_to_pillar    TEXT NOT NULL DEFAULT 'mind'
                           CHECK (contributes_to_pillar IN ('body','mind','finance','projects')),  -- currently always 'mind'; reserved for per-show pillar mapping
  user_updated_at          DATETIME NOT NULL DEFAULT (datetime('now')),
  discovered_at            DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_spotify_show_filters_include ON spotify_show_filters(include_in_mind_learning);

import type { PillarId } from '../../do/state';

export type ProviderName = 'google_health' | 'spotify';

export type SyncStatus = 'success' | 'partial' | 'failed';

export type ConnectionStatus = 'disconnected' | 'connected' | 'reauth_required' | 'error';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601
  scope?: string;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD UTC
  pillar_id: PillarId | null;
  provider: ProviderName;
  metric: string; // e.g., 'steps', 'sleep_minutes'
  value: number;
  metadata?: Record<string, unknown> | null;
}

export interface DataSourceRow {
  provider: ProviderName;
  status: ConnectionStatus;
  last_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  error_message: string | null;
  created_at: string;
}

export interface DataSourceTokenRow {
  provider: ProviderName;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  updated_at: string;
}

export interface DailyMetricRow {
  id: number;
  date: string;
  pillar_id: PillarId | null;
  provider: ProviderName;
  metric: string;
  value: number;
  metadata: string | null;
  recorded_at: string;
}

/**
 * 7-day summary per metric, fed to formatObjectiveMetricsSnapshot.
 * `trend` compares last-3-days avg vs prior-4-days avg
 * with ±5% deadband. For 'resting_hr' the semantic is inverted at format time
 * (UI/prompt annotation: ↓ improving / ↑ worsening).
 */
export interface MetricSummary {
  metric: string;
  avg: number;
  latest: number;
  trend: 'up' | 'down' | 'flat';
  unit?: string;
}

// ============================================================================
// Spotify-specific types
// ============================================================================

/** Spotify OAuth token response shape (https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Spotify recently-played item shape. Spotify's /me/player/recently-played
 * returns only music tracks (track.type === 'track'); podcast episodes and
 * audiobook chapters never appear there, so the integration diffs the saved
 * library instead. The shape here is therefore narrowed to music-only - used
 * solely for music_minutes aggregation (a transversal, pillar-less signal).
 */
export interface SpotifyRecentlyPlayedItem {
  played_at: string; // ISO 8601
  track: {
    type: 'track';
    duration_ms: number;
    name: string;
    uri: string;
    artists?: Array<{ name: string; uri: string }>;
  };
  context?: { type: string; uri: string };
}

/** Spotify saved-show (podcast) library item - from `/me/shows`. */
export interface SpotifySavedShow {
  added_at: string; // ISO 8601
  show: {
    uri: string;
    name: string;
    publisher?: string;
    total_episodes?: number;
  };
}

/** Spotify saved-episode (podcast episode) library item - from `/me/episodes`. */
export interface SpotifySavedEpisode {
  added_at: string; // ISO 8601
  episode: {
    uri: string;
    name: string;
    show?: { uri: string; name: string; publisher?: string };
  };
}

/** Spotify saved-audiobook library item - from `/me/audiobooks`. */
export interface SpotifySavedAudiobook {
  added_at?: string; // ISO 8601 (may be absent on some entries)
  uri: string;
  name: string;
  authors?: Array<{ name: string }>;
  total_chapters?: number;
}

/** Row from the library_save_events D1 table. */
export interface LibrarySaveEventRow {
  id: number;
  date: string;
  show_or_book_title: string;
  show_or_book_author: string | null;
  show_or_book_spotify_uri: string | null;
  listening_type: 'episode_save' | 'audiobook_save';
  created_at: string;
}

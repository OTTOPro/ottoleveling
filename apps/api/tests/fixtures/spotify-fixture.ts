// Canonical Spotify fixtures for unit tests. The primary path is library-state
// diffing, NOT recently-played normalization: Spotify's /me/player/recently-played
// returns only music tracks; podcast episodes and audiobook chapters never appear
// there, so the integration diffs the saved library instead.
//
// Fixtures below cover:
//   - LIBRARY_STATE_YESTERDAY_FIXTURE - what /me/shows + /me/episodes + /me/audiobooks
//     looked like at the previous sync
//   - LIBRARY_STATE_TODAY_FIXTURE - current state with new entries added
//   - MUSIC_ONLY_RECENTLY_PLAYED_FIXTURE - recently-played (music only, since episodes
//     never appear) for the music_minutes transversal signal
//   - TOKEN_FIXTURE / REFRESH_RESPONSE_FIXTURE - OAuth shapes

import type {
  SpotifyRecentlyPlayedItem,
  SpotifySavedShow,
  SpotifySavedEpisode,
  SpotifySavedAudiobook,
} from '../../src/lib/data-sources/types';

// --- Library state snapshots - yesterday vs today (drives the library-diff) ---
//
// Yesterday: 1 show (Avery Lane), 1 saved episode (Hale), 1 audiobook (A Short History of Tools).
// Today: above + 1 NEW saved show (DOAC) + 2 NEW saved episodes + 1 NEW audiobook.
// Expected library diff for today's date:
//   - library_saves_episodes = 2 (new episode saves) + show-level NEW = treated as
//     the count of newly-added saved-episode entries (the show-save adds 1 too only
//     if we count shows; the canonical implementation in Step 4 below treats
//     show saves AND episode saves under the same listening_type='episode_save' tag
//     because both signal new podcast-engagement intent)
//   - library_saves_audiobooks = 1
// Per-entry metadata captures both URIs + titles.

export const LIBRARY_STATE_YESTERDAY_FIXTURE: {
  shows: { items: SpotifySavedShow[] };
  episodes: { items: SpotifySavedEpisode[] };
  audiobooks: { items: SpotifySavedAudiobook[] };
} = {
  shows: {
    items: [
      {
        added_at: '2026-05-20T10:00:00Z',
        show: { uri: 'spotify:show:longconv', name: 'Long Conversations', publisher: 'Avery Lane' },
      },
    ],
  },
  episodes: {
    items: [
      {
        added_at: '2026-05-22T08:00:00Z',
        episode: {
          uri: 'spotify:episode:habitssleep',
          name: 'Better Sleep Basics',
          show: { uri: 'spotify:show:habitslab', name: 'Habits Lab', publisher: 'Robin Hale' },
        },
      },
    ],
  },
  audiobooks: {
    items: [
      {
        added_at: '2026-05-15T14:00:00Z',
        uri: 'spotify:audiobook:toolshistory',
        name: 'A Short History of Tools',
        authors: [{ name: 'Morgan Ellis' }],
        total_chapters: 20,
      },
    ],
  },
};

export const LIBRARY_STATE_TODAY_FIXTURE: {
  shows: { items: SpotifySavedShow[] };
  episodes: { items: SpotifySavedEpisode[] };
  audiobooks: { items: SpotifySavedAudiobook[] };
} = {
  shows: {
    items: [
      // Pre-existing
      ...LIBRARY_STATE_YESTERDAY_FIXTURE.shows.items,
      // NEW today
      {
        added_at: '2026-05-29T09:00:00Z',
        show: { uri: 'spotify:show:dawn', name: 'Founders at Dawn', publisher: 'Sam Ortega' },
      },
    ],
  },
  episodes: {
    items: [
      // Pre-existing
      ...LIBRARY_STATE_YESTERDAY_FIXTURE.episodes.items,
      // NEW today (two)
      {
        added_at: '2026-05-29T10:30:00Z',
        episode: {
          uri: 'spotify:episode:dawn-discipline',
          name: 'The Science of Discipline',
          show: { uri: 'spotify:show:dawn', name: 'Founders at Dawn', publisher: 'Sam Ortega' },
        },
      },
      {
        added_at: '2026-05-29T12:00:00Z',
        episode: {
          uri: 'spotify:episode:longconv-ideas',
          name: 'The How Ideas Spread',
          show: {
            uri: 'spotify:show:longconv',
            name: 'Long Conversations',
            publisher: 'Avery Lane',
          },
        },
      },
    ],
  },
  audiobooks: {
    items: [
      // Pre-existing
      ...LIBRARY_STATE_YESTERDAY_FIXTURE.audiobooks.items,
      // NEW today
      {
        added_at: '2026-05-29T11:00:00Z',
        uri: 'spotify:audiobook:dragonbook',
        name: 'Compilers: Principles, Techniques, and Tools',
        authors: [{ name: 'Alfred V. Aho' }, { name: 'Monica S. Lam' }],
        total_chapters: 12,
      },
    ],
  },
};

// Empty library - first-ever sync edge case
export const LIBRARY_STATE_EMPTY_FIXTURE = {
  shows: { items: [] as SpotifySavedShow[] },
  episodes: { items: [] as SpotifySavedEpisode[] },
  audiobooks: { items: [] as SpotifySavedAudiobook[] },
};

// --- Music-only recently-played (episodes never appear in recently-played) ---
// Used to test that music_minutes still aggregates correctly as the transversal signal.

export const MUSIC_ONLY_RECENTLY_PLAYED_FIXTURE: { items: SpotifyRecentlyPlayedItem[] } = {
  items: [
    {
      played_at: '2026-05-29T14:00:00Z',
      track: {
        type: 'track',
        duration_ms: 240_000, // 4 min
        name: 'A Song',
        uri: 'spotify:track:musicabc',
        artists: [{ name: 'Some Artist', uri: 'spotify:artist:artistxyz' }],
      },
    },
    {
      played_at: '2026-05-29T19:30:00Z',
      track: {
        type: 'track',
        duration_ms: 360_000, // 6 min
        name: 'Another Song',
        uri: 'spotify:track:musicdef',
        artists: [{ name: 'Another Artist', uri: 'spotify:artist:artistxyz2' }],
      },
    },
  ],
};

// Empty recently-played
export const EMPTY_RECENTLY_PLAYED_FIXTURE: { items: SpotifyRecentlyPlayedItem[] } = { items: [] };

// --- OAuth fixtures ---

export const TOKEN_FIXTURE = {
  access_token: 'BQA-test-access-token',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  refresh_token: 'AQB-test-refresh-token',
  scope: 'user-read-recently-played user-library-read user-read-playback-state',
};

export const REFRESH_RESPONSE_FIXTURE = {
  access_token: 'BQA-refreshed-access-token',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  scope: 'user-read-recently-played user-library-read user-read-playback-state',
  // Note: Spotify refresh responses sometimes DO include a new refresh_token; sometimes don't.
};

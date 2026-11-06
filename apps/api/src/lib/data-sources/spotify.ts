import type { DataSourceProvider } from './provider';
import type {
  DailyMetric,
  ProviderName,
  SpotifyRecentlyPlayedItem,
  SpotifySavedShow,
  SpotifySavedEpisode,
  SpotifySavedAudiobook,
  SpotifyTokenResponse,
  TokenSet,
} from './types';
import { upsertShowFilter } from './spotify-show-filters';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

// OAuth scopes - space-separated in the authorize URL.
// user-library-read is load-bearing: it powers /me/shows /me/episodes /me/audiobooks,
// which are the primary signal source (see syncDaily).
const SCOPES = 'user-read-recently-played user-library-read user-read-playback-state';

interface SpotifyProviderArgs {
  clientId: string;
  clientSecret: string;
  fetcher: typeof fetch;
  db?: D1Database; // Library-diff requires reading yesterday's snapshot from library_save_events
}

interface RecentlyPlayedResponse {
  items?: SpotifyRecentlyPlayedItem[];
}

interface SavedShowsResponse {
  items?: SpotifySavedShow[];
}
interface SavedEpisodesResp {
  items?: SpotifySavedEpisode[];
}
interface SavedAudiobooksResp {
  items?: SpotifySavedAudiobook[];
}

/** Per-entry metadata captured for an emitted library_save metric. */
interface LibrarySaveMetaItem {
  show_or_book_spotify_uri: string;
  show_or_book_title: string;
  show_or_book_author: string | null;
  listening_type: 'episode_save' | 'audiobook_save';
}

export class SpotifyProvider implements DataSourceProvider {
  readonly name: ProviderName = 'spotify';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetcher: typeof fetch;
  private readonly db: D1Database | undefined;

  constructor(args: SpotifyProviderArgs) {
    this.clientId = args.clientId;
    this.clientSecret = args.clientSecret;
    this.fetcher = args.fetcher;
    this.db = args.db;
  }

  authorize(args: { redirectUri: string; state: string; codeChallenge: string }): {
    authUrl: string;
  } {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: args.redirectUri,
      scope: SCOPES,
      state: args.state,
      code_challenge: args.codeChallenge,
      code_challenge_method: 'S256',
      show_dialog: 'true', // Force consent screen (parallel to Google's prompt=consent)
    });
    return { authUrl: `${AUTHORIZE_URL}?${params.toString()}` };
  }

  async handleCallback(args: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code_verifier: args.codeVerifier,
    });
    const res = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as SpotifyTokenResponse;
    if (!json.refresh_token) {
      throw new Error(
        'Spotify token exchange returned no refresh_token (PKCE flow should include it)',
      );
    }
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scope: json.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as SpotifyTokenResponse;
    return {
      // Spotify refresh responses MAY omit refresh_token - reuse the old one in that case
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scope: json.scope,
    };
  }

  async syncDaily(args: { date: string; accessToken: string }): Promise<DailyMetric[]> {
    const { date, accessToken } = args;
    const out: DailyMetric[] = [];

    // ----- 1. Library-state fetch (3 paginated lists) -----
    // This is the PRIMARY signal source. Spotify's /me/player/recently-played
    // returns only music tracks (track.type === 'track'); podcast episodes and
    // audiobook chapters never appear there, so the integration diffs the saved
    // library instead. recently-played is still fetched, but ONLY for music_minutes.
    //
    // UTC caveat: we attribute saves to UTC days, matching Google Health convention.
    // For a user in a UTC-4 timezone in summer, this means "today's saves" =
    // approximately 20:00 yesterday to 20:00 today, local time. Acceptable
    // trade-off for cross-provider consistency. If user-visible confusion arises,
    // revisit with proper TZ handling (would require user_settings.timezone column).
    // CRITICAL: re-throw UNAUTHORIZED from any endpoint so syncDataSource's
    // refresh-and-retry logic kicks in. Catching to null here would mask the
    // expired access_token + silently return 0 metrics.
    // For any OTHER error (4xx/5xx/network), log + return null so the sync degrades
    // gracefully across endpoints rather than aborting the whole call.
    const handleEndpointErr =
      (label: string) =>
      (e: unknown): null => {
        if (e instanceof Error && e.message === 'UNAUTHORIZED') throw e;
        console.warn(`[Spotify] ${label} caught:`, e instanceof Error ? e.message : String(e));
        return null;
      };
    const [shows, episodes, audiobooks, recent] = await Promise.all([
      this.getJson<SavedShowsResponse>(`${API_BASE}/me/shows?limit=50`, accessToken).catch(
        handleEndpointErr('/me/shows'),
      ),
      this.getJson<SavedEpisodesResp>(`${API_BASE}/me/episodes?limit=50`, accessToken).catch(
        handleEndpointErr('/me/episodes'),
      ),
      this.getJson<SavedAudiobooksResp>(`${API_BASE}/me/audiobooks?limit=50`, accessToken).catch(
        handleEndpointErr('/me/audiobooks'),
      ),
      this.getJson<RecentlyPlayedResponse>(
        `${API_BASE}/me/player/recently-played?limit=50`,
        accessToken,
      ).catch(handleEndpointErr('/me/player/recently-played')),
    ]);

    // ----- 2. Build today's library snapshot - flatten 3 sources into LibrarySaveMetaItem[] -----
    // CRITICAL: Spotify's /me/audiobooks (and occasionally /me/shows /me/episodes) can return
    // `null` entries inside `.items[]` for unavailable / region-restricted / deleted content.
    // Filter nulls + missing URIs defensively BEFORE mapping (observed in real responses).
    // Without the filter, the .uri access throws.
    const showItems = (shows?.items ?? []).filter(
      (s): s is NonNullable<typeof s> => s != null && s.show?.uri != null,
    );
    const episodeItems = (episodes?.items ?? []).filter(
      (e): e is NonNullable<typeof e> => e != null && e.episode?.uri != null,
    );
    const audiobookItems = (audiobooks?.items ?? []).filter(
      (a): a is NonNullable<typeof a> => a != null && a.uri != null,
    );

    const todayEpisodeSaves: LibrarySaveMetaItem[] = [
      ...showItems.map<LibrarySaveMetaItem>((s) => ({
        show_or_book_spotify_uri: s.show.uri,
        show_or_book_title: s.show.name,
        show_or_book_author: s.show.publisher ?? null,
        listening_type: 'episode_save',
      })),
      ...episodeItems.map<LibrarySaveMetaItem>((e) => ({
        show_or_book_spotify_uri: e.episode.uri,
        show_or_book_title: e.episode.show?.name ?? e.episode.name,
        show_or_book_author: e.episode.show?.publisher ?? null,
        listening_type: 'episode_save',
      })),
    ];
    const todayAudiobookSaves: LibrarySaveMetaItem[] = audiobookItems.map((a) => ({
      show_or_book_spotify_uri: a.uri,
      show_or_book_title: a.name,
      show_or_book_author: a.authors?.[0]?.name ?? null,
      listening_type: 'audiobook_save',
    }));

    // ----- 2b. Auto-discover shows into spotify_show_filters -----
    // Idempotent via PK on show_spotify_uri. Default include=true - user opts out via
    // /sources/spotify UI. Only podcast shows are auto-discovered (NOT audiobooks -
    // the filter is podcast-specific).
    if (this.db != null) {
      for (const s of showItems) {
        if (!s.show?.uri || !s.show?.name) continue;
        try {
          await upsertShowFilter(this.db, {
            show_spotify_uri: s.show.uri,
            show_name: s.show.name,
          });
        } catch (err) {
          console.warn('[Spotify] upsertShowFilter failed for show', s.show.uri, err);
        }
      }
      // Episode-attached shows (user saved an episode without saving the parent show).
      for (const e of episodeItems) {
        const show = e.episode?.show;
        if (!show?.uri || !show?.name) continue;
        try {
          await upsertShowFilter(this.db, {
            show_spotify_uri: show.uri,
            show_name: show.name,
          });
        } catch (err) {
          console.warn('[Spotify] upsertShowFilter (from episode) failed for', show.uri, err);
        }
      }
    }

    // ----- 3. Load yesterday's library snapshot from D1 (any prior dates count as "previously seen") -----
    // Trade-off: we ask "was this URI ever recorded as a save before today?" rather than
    // strictly diffing day N vs day N-1. This makes the algorithm robust to missed syncs
    // (if a day was skipped, today's diff still correctly identifies NEW entries).
    let priorKeys = new Set<string>();
    if (this.db != null) {
      const { results: priorRows } = await this.db
        .prepare(
          `SELECT show_or_book_spotify_uri, listening_type
             FROM library_save_events
            WHERE date < ?`,
        )
        .bind(date)
        .all<{
          show_or_book_spotify_uri: string | null;
          listening_type: 'episode_save' | 'audiobook_save';
        }>();
      priorKeys = new Set(
        priorRows
          .filter((r) => r.show_or_book_spotify_uri != null)
          .map((r) => `${r.listening_type}::${r.show_or_book_spotify_uri}`),
      );
    }

    // ----- 4. Diff: entries today whose `${type}::${uri}` is NOT in priorKeys are NEW saves -----
    const newEpisodeSaves = todayEpisodeSaves.filter(
      (it) => !priorKeys.has(`episode_save::${it.show_or_book_spotify_uri}`),
    );
    const newAudiobookSaves = todayAudiobookSaves.filter(
      (it) => !priorKeys.has(`audiobook_save::${it.show_or_book_spotify_uri}`),
    );

    // ----- 5. Emit library_saves_episodes (with per-entry metadata for [ READING ] UI) -----
    if (newEpisodeSaves.length > 0) {
      out.push({
        date,
        pillar_id: 'mind',
        provider: 'spotify',
        metric: 'library_saves_episodes',
        value: newEpisodeSaves.length,
        metadata: { items: newEpisodeSaves },
      });
    }

    // ----- 6. Emit library_saves_audiobooks (with per-entry metadata) -----
    if (newAudiobookSaves.length > 0) {
      out.push({
        date,
        pillar_id: 'mind',
        provider: 'spotify',
        metric: 'library_saves_audiobooks',
        value: newAudiobookSaves.length,
        metadata: { items: newAudiobookSaves },
      });
    }

    // ----- 7. Music minutes from recently-played (transversal, pillar_id = null) -----
    const items = (recent?.items ?? []).filter((i) => i.played_at.slice(0, 10) === date);
    let musicMs = 0;
    for (const item of items) {
      if (item.track.type === 'track') musicMs += item.track.duration_ms;
    }
    const musicMin = Math.round(musicMs / 60_000);
    if (musicMin > 0) {
      out.push({
        date,
        pillar_id: null,
        provider: 'spotify',
        metric: 'music_minutes',
        value: musicMin,
      });
    }

    return out;
  }

  private async getJson<T>(url: string, accessToken: string): Promise<T | null> {
    const res = await this.fetcher(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('UNAUTHORIZED');
      console.warn(`[SpotifyProvider] GET ${url} returned ${res.status} - skipping`);
      return null;
    }
    return (await res.json()) as T;
  }
}

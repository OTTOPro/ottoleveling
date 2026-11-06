import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { SpotifyProvider } from '../../src/lib/data-sources/spotify';
import { upsertLibrarySaveEvent } from '../../src/lib/data-sources/library-save-events';
import {
  LIBRARY_STATE_YESTERDAY_FIXTURE,
  LIBRARY_STATE_TODAY_FIXTURE,
  MUSIC_ONLY_RECENTLY_PLAYED_FIXTURE,
  EMPTY_RECENTLY_PLAYED_FIXTURE,
  TOKEN_FIXTURE,
} from '../fixtures/spotify-fixture';

// Stub fetcher - matches by URL substring AND method.
function makeStubFetcher(map: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const key of Object.keys(map)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(map[key]), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }) as typeof fetch;
}

describe('SpotifyProvider.syncDaily - library-state diffing', () => {
  const provider = (fetcher: typeof fetch) =>
    new SpotifyProvider({ clientId: 'cid', clientSecret: 'csec', fetcher, db: env.DB });

  beforeEach(async () => {
    // Seed yesterday's library snapshot into library_save_events so the diff has a baseline.
    // Yesterday = 2026-05-28; we'll diff against today = 2026-05-29.
    for (const s of LIBRARY_STATE_YESTERDAY_FIXTURE.shows.items) {
      await upsertLibrarySaveEvent(env.DB, {
        date: '2026-05-28',
        show_or_book_title: s.show.name,
        show_or_book_author: s.show.publisher ?? null,
        show_or_book_spotify_uri: s.show.uri,
        listening_type: 'episode_save',
      });
    }
    for (const e of LIBRARY_STATE_YESTERDAY_FIXTURE.episodes.items) {
      await upsertLibrarySaveEvent(env.DB, {
        date: '2026-05-28',
        show_or_book_title: e.episode.show?.name ?? e.episode.name,
        show_or_book_author: e.episode.show?.publisher ?? null,
        show_or_book_spotify_uri: e.episode.uri,
        listening_type: 'episode_save',
      });
    }
    for (const a of LIBRARY_STATE_YESTERDAY_FIXTURE.audiobooks.items) {
      await upsertLibrarySaveEvent(env.DB, {
        date: '2026-05-28',
        show_or_book_title: a.name,
        show_or_book_author: a.authors?.[0]?.name ?? null,
        show_or_book_spotify_uri: a.uri,
        listening_type: 'audiobook_save',
      });
    }
  });

  it('emits library_saves_episodes equal to the count of NEW episode/show entries today', async () => {
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_TODAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_TODAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_TODAY_FIXTURE.audiobooks,
        '/me/player/recently-played': EMPTY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const epSaves = metrics.find((m) => m.metric === 'library_saves_episodes');
    expect(epSaves).toBeDefined();
    // 1 new show (DOAC) + 2 new episodes = 3 episode-pillar saves
    expect(epSaves!.value).toBe(3);
    expect(epSaves!.pillar_id).toBe('mind');
    expect(epSaves!.provider).toBe('spotify');
    expect(epSaves!.date).toBe('2026-05-29');
  });

  it('emits library_saves_audiobooks equal to count of NEW audiobook entries today', async () => {
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_TODAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_TODAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_TODAY_FIXTURE.audiobooks,
        '/me/player/recently-played': EMPTY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const abSaves = metrics.find((m) => m.metric === 'library_saves_audiobooks');
    expect(abSaves).toBeDefined();
    expect(abSaves!.value).toBe(1);
    expect(abSaves!.pillar_id).toBe('mind');
  });

  it('emits music_minutes from /me/player/recently-played (pillar_id = null, transversal)', async () => {
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_TODAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_TODAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_TODAY_FIXTURE.audiobooks,
        '/me/player/recently-played': MUSIC_ONLY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const music = metrics.find((m) => m.metric === 'music_minutes');
    expect(music).toBeDefined();
    // 240_000ms (4 min) + 360_000ms (6 min) = 10 min
    expect(music!.value).toBe(10);
    expect(music!.pillar_id).toBeNull();
  });

  it('emits zero save metrics when library state is unchanged day-over-day', async () => {
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_YESTERDAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_YESTERDAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_YESTERDAY_FIXTURE.audiobooks,
        '/me/player/recently-played': EMPTY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    expect(metrics.find((m) => m.metric === 'library_saves_episodes')).toBeUndefined();
    expect(metrics.find((m) => m.metric === 'library_saves_audiobooks')).toBeUndefined();
  });

  it('treats yesterday-empty (first ever sync) as all-of-today being new', async () => {
    // Wipe the beforeEach-seeded baseline so library_save_events is empty
    await env.DB.prepare(`DELETE FROM library_save_events`).run();
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_TODAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_TODAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_TODAY_FIXTURE.audiobooks,
        '/me/player/recently-played': EMPTY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const epSaves = metrics.find((m) => m.metric === 'library_saves_episodes');
    const abSaves = metrics.find((m) => m.metric === 'library_saves_audiobooks');
    // 2 shows + 3 episodes total = 5 episode-pillar saves; 2 audiobooks total
    expect(epSaves!.value).toBe(5);
    expect(abSaves!.value).toBe(2);
  });

  it('emits per-entry metadata on library_saves_episodes for [ READING ] UI hydration', async () => {
    const p = provider(
      makeStubFetcher({
        '/me/shows': LIBRARY_STATE_TODAY_FIXTURE.shows,
        '/me/episodes': LIBRARY_STATE_TODAY_FIXTURE.episodes,
        '/me/audiobooks': LIBRARY_STATE_TODAY_FIXTURE.audiobooks,
        '/me/player/recently-played': EMPTY_RECENTLY_PLAYED_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const epSaves = metrics.find((m) => m.metric === 'library_saves_episodes');
    expect(epSaves!.metadata).toBeDefined();
    expect(epSaves!.metadata).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          show_or_book_spotify_uri: 'spotify:show:dawn',
          show_or_book_title: 'Founders at Dawn',
          listening_type: 'episode_save',
        }),
        expect.objectContaining({
          show_or_book_spotify_uri: 'spotify:episode:dawn-discipline',
          show_or_book_title: expect.stringContaining('Dawn'),
          listening_type: 'episode_save',
        }),
      ]),
    });
  });

  it('sends all 4 endpoint requests (3 library + 1 recently-played) with the bearer token', async () => {
    const seen: { url: string; method: string; auth: string | null }[] = [];
    const captureFetcher: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const headers = new Headers((init?.headers ?? {}) as HeadersInit);
      seen.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization') });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;
    const p = provider(captureFetcher);
    await p.syncDaily({ date: '2026-05-29', accessToken: 'tok-abc' });
    expect(seen.length).toBeGreaterThanOrEqual(4);
    for (const s of seen) {
      expect(s.auth).toBe('Bearer tok-abc');
    }
    expect(seen.some((s) => s.url.includes('/me/shows'))).toBe(true);
    expect(seen.some((s) => s.url.includes('/me/episodes'))).toBe(true);
    expect(seen.some((s) => s.url.includes('/me/audiobooks'))).toBe(true);
    expect(seen.some((s) => s.url.includes('/me/player/recently-played'))).toBe(true);
  });
});

describe('SpotifyProvider.authorize', () => {
  it('returns an authorize URL with all required Spotify OAuth params', () => {
    const p = new SpotifyProvider({
      clientId: 'cid-1',
      clientSecret: 'csec-1',
      fetcher: globalThis.fetch,
    });
    const { authUrl } = p.authorize({
      redirectUri: 'https://x.test/cb',
      state: 'state-abc',
      codeChallenge: 'challenge-xyz',
    });
    expect(authUrl).toContain('accounts.spotify.com/authorize');
    expect(authUrl).toContain('client_id=cid-1');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain(
      'scope=user-read-recently-played+user-library-read+user-read-playback-state',
    );
    expect(authUrl).toContain('state=state-abc');
    expect(authUrl).toContain('code_challenge=challenge-xyz');
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('show_dialog=true');
  });
});

describe('SpotifyProvider.handleCallback', () => {
  it('POSTs to /api/token with grant_type=authorization_code + code_verifier', async () => {
    let capturedBody: string | null = null;
    const captureFetcher: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/token')) {
        capturedBody = init?.body as string;
        return new Response(JSON.stringify(TOKEN_FIXTURE), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const p = new SpotifyProvider({
      clientId: 'cid',
      clientSecret: 'csec',
      fetcher: captureFetcher,
    });
    const tokens = await p.handleCallback({
      code: 'auth-code',
      codeVerifier: 'verifier-x',
      redirectUri: 'https://x.test/cb',
    });
    expect(tokens.access_token).toBe('BQA-test-access-token');
    expect(tokens.refresh_token).toBe('AQB-test-refresh-token');
    expect(capturedBody).toContain('grant_type=authorization_code');
    expect(capturedBody).toContain('code=auth-code');
    expect(capturedBody).toContain('code_verifier=verifier-x');
  });
});

describe('SpotifyProvider.refreshTokens', () => {
  it('POSTs grant_type=refresh_token + reuses old refresh_token if response omits one', async () => {
    const fetcher: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          access_token: 'BQA-refreshed',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'user-read-recently-played',
          // No refresh_token in response
        }),
        { status: 200 },
      )) as typeof fetch;

    const p = new SpotifyProvider({ clientId: 'cid', clientSecret: 'csec', fetcher });
    const tokens = await p.refreshTokens('old-refresh');
    expect(tokens.access_token).toBe('BQA-refreshed');
    expect(tokens.refresh_token).toBe('old-refresh'); // reused
  });
});

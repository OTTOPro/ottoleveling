/**
 * Integration test for spotify_sync auto-discovery.
 *
 * Seeds a SpotifyProvider with stub fetch returning 2 new shows; runs syncDaily;
 * asserts both rows land in spotify_show_filters with include=1.
 * Re-runs with the same shows to verify idempotency (no duplicates; show_name updated).
 */
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { SpotifyProvider } from '../../src/lib/data-sources/spotify';

/** Build a minimal stub Response for the given JSON payload. */
function stubResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Stub fetcher that returns preset responses by URL substring match. */
function makeStubFetch(
  responses: Array<{ urlPart: string; data: unknown; status?: number }>,
): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const r of responses) {
      if (url.includes(r.urlPart)) return stubResp(r.data, r.status);
    }
    // Default: 200 empty
    return stubResp({});
  };
}

const SHOW_ALPHA = {
  show: {
    uri: 'spotify:show:alpha',
    name: 'Alpha Podcast',
    publisher: 'Alpha Media',
    id: 'alpha',
  },
};
const SHOW_BETA = {
  show: {
    uri: 'spotify:show:beta',
    name: 'Beta Podcast',
    publisher: 'Beta Media',
    id: 'beta',
  },
};

describe('spotify_sync - auto-discovers shows into spotify_show_filters', () => {
  it('upserts both shows with include=1 on first sync', async () => {
    const provider = new SpotifyProvider({
      clientId: 'test',
      clientSecret: 'test',
      fetcher: makeStubFetch([
        { urlPart: '/me/shows', data: { items: [SHOW_ALPHA, SHOW_BETA] } },
        { urlPart: '/me/episodes', data: { items: [] } },
        { urlPart: '/me/audiobooks', data: { items: [] } },
        { urlPart: '/me/player/recently-played', data: { items: [] } },
      ]) as typeof fetch,
      db: env.DB,
    });

    await provider.syncDaily({ date: '2026-06-01', accessToken: 'tok' });

    const { results } = await env.DB.prepare(
      `SELECT show_spotify_uri, show_name, include_in_mind_learning FROM spotify_show_filters ORDER BY show_spotify_uri`,
    ).all<{ show_spotify_uri: string; show_name: string; include_in_mind_learning: number }>();

    expect(results).toHaveLength(2);
    const uris = results.map((r) => r.show_spotify_uri);
    expect(uris).toContain('spotify:show:alpha');
    expect(uris).toContain('spotify:show:beta');
    for (const r of results) {
      expect(r.include_in_mind_learning).toBe(1);
    }
  });

  it('re-sync does not duplicate rows + refreshes show_name', async () => {
    // Seed the first sync to establish the rows.
    const p1 = new SpotifyProvider({
      clientId: 'test',
      clientSecret: 'test',
      fetcher: makeStubFetch([
        { urlPart: '/me/shows', data: { items: [SHOW_ALPHA] } },
        { urlPart: '/me/episodes', data: { items: [] } },
        { urlPart: '/me/audiobooks', data: { items: [] } },
        { urlPart: '/me/player/recently-played', data: { items: [] } },
      ]) as typeof fetch,
      db: env.DB,
    });
    await p1.syncDaily({ date: '2026-06-01', accessToken: 'tok' });

    // User opts out of alpha.
    await env.DB.prepare(
      `UPDATE spotify_show_filters SET include_in_mind_learning = 0 WHERE show_spotify_uri = 'spotify:show:alpha'`,
    ).run();

    // Re-sync with updated show name.
    const SHOW_ALPHA_RENAMED = {
      show: { ...SHOW_ALPHA.show, name: 'Alpha Podcast - Renamed' },
    };
    const p2 = new SpotifyProvider({
      clientId: 'test',
      clientSecret: 'test',
      fetcher: makeStubFetch([
        { urlPart: '/me/shows', data: { items: [SHOW_ALPHA_RENAMED] } },
        { urlPart: '/me/episodes', data: { items: [] } },
        { urlPart: '/me/audiobooks', data: { items: [] } },
        { urlPart: '/me/player/recently-played', data: { items: [] } },
      ]) as typeof fetch,
      db: env.DB,
    });
    await p2.syncDaily({ date: '2026-06-02', accessToken: 'tok' });

    // Still exactly 1 row for alpha (no duplicate).
    const { results } = await env.DB.prepare(
      `SELECT show_name, include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = 'spotify:show:alpha'`,
    ).all<{ show_name: string; include_in_mind_learning: number }>();
    expect(results).toHaveLength(1);
    // show_name refreshed.
    expect(results[0]?.show_name).toBe('Alpha Podcast - Renamed');
    // include_in_mind_learning preserved at 0 (user's opt-out respected).
    expect(results[0]?.include_in_mind_learning).toBe(0);
  });

  it('audiobooks are NOT auto-discovered into spotify_show_filters', async () => {
    const provider = new SpotifyProvider({
      clientId: 'test',
      clientSecret: 'test',
      fetcher: makeStubFetch([
        { urlPart: '/me/shows', data: { items: [] } },
        { urlPart: '/me/episodes', data: { items: [] } },
        {
          urlPart: '/me/audiobooks',
          data: {
            items: [
              {
                uri: 'spotify:audiobook:xyz',
                name: 'Some Audiobook',
                authors: [{ name: 'Author' }],
              },
            ],
          },
        },
        { urlPart: '/me/player/recently-played', data: { items: [] } },
      ]) as typeof fetch,
      db: env.DB,
    });

    await provider.syncDaily({ date: '2026-06-01', accessToken: 'tok' });

    const { results } = await env.DB.prepare(
      `SELECT show_spotify_uri FROM spotify_show_filters`,
    ).all<{ show_spotify_uri: string }>();
    // Audiobook URI should NOT appear in show_filters
    expect(results.find((r) => r.show_spotify_uri === 'spotify:audiobook:xyz')).toBeUndefined();
  });
});

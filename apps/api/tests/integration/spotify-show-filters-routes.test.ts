/**
 * Integration tests for /api/sources/spotify/filters routes.
 * Tests GET (list) + PATCH (toggle) including 404 and the pillar-lock 400.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers ?? {});
  headers.set('x-dev-token', TOKEN);
  if (init.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('/api/sources/spotify/filters - routes', () => {
  beforeEach(async () => {
    // Seed 2 test rows directly in D1.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO spotify_show_filters (show_spotify_uri, show_name, include_in_mind_learning, contributes_to_pillar, user_updated_at, discovered_at)
         VALUES ('spotify:show:alpha', 'Alpha Show', 1, 'mind', '2026-06-01', '2026-06-01')`,
      ),
      env.DB.prepare(
        `INSERT INTO spotify_show_filters (show_spotify_uri, show_name, include_in_mind_learning, contributes_to_pillar, user_updated_at, discovered_at)
         VALUES ('spotify:show:beta', 'Beta Show', 1, 'mind', '2026-06-01', '2026-06-01')`,
      ),
    ]);
  });

  // ── GET /api/sources/spotify/filters ──────────────────────────────────────

  it('GET returns 200 with filters array', async () => {
    const res = await SELF.fetch(authed('/api/sources/spotify/filters'));
    expect(res.status).toBe(200);
    const body = await res.json<{ filters: Array<{ show_spotify_uri: string }> }>();
    expect(Array.isArray(body.filters)).toBe(true);
    const uris = body.filters.map((f) => f.show_spotify_uri);
    expect(uris).toContain('spotify:show:alpha');
    expect(uris).toContain('spotify:show:beta');
  });

  it('GET includes include_in_mind_learning as boolean', async () => {
    const res = await SELF.fetch(authed('/api/sources/spotify/filters'));
    expect(res.status).toBe(200);
    const body = await res.json<{ filters: Array<{ include_in_mind_learning: unknown }> }>();
    for (const f of body.filters) {
      expect(typeof f.include_in_mind_learning).toBe('boolean');
    }
  });

  // ── PATCH /api/sources/spotify/filters/:uri ───────────────────────────────

  it('PATCH toggles include_in_mind_learning to false', async () => {
    const uri = encodeURIComponent('spotify:show:alpha');
    const res = await SELF.fetch(
      authed(`/api/sources/spotify/filters/${uri}`, {
        method: 'PATCH',
        body: JSON.stringify({ include_in_mind_learning: false }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; filter: { include_in_mind_learning: boolean } }>();
    expect(body.ok).toBe(true);
    expect(body.filter.include_in_mind_learning).toBe(false);

    // Verify in D1
    const row = await env.DB.prepare(
      `SELECT include_in_mind_learning FROM spotify_show_filters WHERE show_spotify_uri = ?`,
    )
      .bind('spotify:show:alpha')
      .first<{ include_in_mind_learning: number }>();
    expect(row?.include_in_mind_learning).toBe(0);
  });

  it('PATCH returns 404 for unknown URI', async () => {
    const uri = encodeURIComponent('spotify:show:doesnotexist');
    const res = await SELF.fetch(
      authed(`/api/sources/spotify/filters/${uri}`, {
        method: 'PATCH',
        body: JSON.stringify({ include_in_mind_learning: true }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('PATCH with non-mind contributes_to_pillar returns 400 (pillar locked to mind)', async () => {
    const uri = encodeURIComponent('spotify:show:alpha');
    const res = await SELF.fetch(
      authed(`/api/sources/spotify/filters/${uri}`, {
        method: 'PATCH',
        body: JSON.stringify({ contributes_to_pillar: 'body' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('pillar_editing_locked');
  });

  it('PATCH with contributes_to_pillar=mind (same as default) is allowed', async () => {
    const uri = encodeURIComponent('spotify:show:alpha');
    const res = await SELF.fetch(
      authed(`/api/sources/spotify/filters/${uri}`, {
        method: 'PATCH',
        body: JSON.stringify({ include_in_mind_learning: true, contributes_to_pillar: 'mind' }),
      }),
    );
    expect(res.status).toBe(200);
  });
});

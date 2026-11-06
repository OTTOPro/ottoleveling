import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { encrypt } from '../../src/lib/data-sources/encryption';

const HEADERS = { 'x-dev-token': 'integration-test-token-deadbeef' };

describe('GET /api/data-sources/status - both providers visible', () => {
  it('returns both google_health and spotify rows', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/status', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data_sources: Array<{ provider: string; status: string }>;
    };
    expect(body.data_sources).toHaveLength(2);
    expect(body.data_sources.map((d) => d.provider).sort()).toEqual(['google_health', 'spotify']);
  });
});

describe('GET /api/data-sources/spotify/authorize', () => {
  it('302 redirects to Spotify with a valid OAuth URL', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/spotify/authorize', {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('accounts.spotify.com/authorize');
    expect(location).toContain('client_id=');
    expect(location).toContain('scope=');
    expect(location).toContain('code_challenge=');
    expect(location).toContain('code_challenge_method=S256');
  });

  it('sets an HttpOnly oauth_cv_spotify cookie scoped to the callback path', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/spotify/authorize', {
      redirect: 'manual',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('oauth_cv_spotify=');
    expect(cookie).toContain('Path=/api/data-sources/spotify/callback');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('GET /api/data-sources/spotify/callback', () => {
  it('400 on missing code or state', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/spotify/callback');
    expect(res.status).toBe(400);
  });

  it('400 on invalid state', async () => {
    const res = await SELF.fetch(
      'https://x.test/api/data-sources/spotify/callback?code=x&state=garbage',
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/data-sources/spotify/sync', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/spotify/sync', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('returns not_connected when no tokens persisted', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/spotify/sync', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sync_status: string; error_message?: string };
    expect(body.sync_status).toBe('failed');
    expect(body.error_message).toBe('not_connected');
  });
});

describe('DELETE /api/data-sources/spotify', () => {
  it('hard-deletes tokens and flips status to disconnected', async () => {
    const encEnv = env as unknown as { ENCRYPTION_KEY: string };
    const access = await encrypt('stub-spotify-access', encEnv, 'spotify');
    const refresh = await encrypt('stub-spotify-refresh', encEnv, 'spotify');
    await env.DB.prepare(
      `INSERT INTO data_source_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
       VALUES ('spotify', ?, ?, datetime('now', '+1 hour'))`,
    )
      .bind(access, refresh)
      .run();
    await env.DB.prepare(
      `UPDATE data_sources SET status = 'connected' WHERE provider = 'spotify'`,
    ).run();

    const res = await SELF.fetch('https://x.test/api/data-sources/spotify', {
      method: 'DELETE',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);

    const tokens = await env.DB.prepare(
      `SELECT * FROM data_source_tokens WHERE provider = 'spotify'`,
    ).first();
    expect(tokens).toBeNull();
    const ds = await env.DB.prepare(
      `SELECT status FROM data_sources WHERE provider = 'spotify'`,
    ).first<{
      status: string;
    }>();
    expect(ds?.status).toBe('disconnected');
  });
});

describe('Unknown provider rejection', () => {
  it('400 on /api/data-sources/unknown/authorize', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/unknown/authorize');
    expect(res.status).toBe(400);
  });

  it('400 on /api/data-sources/unknown/sync', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/unknown/sync', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(400);
  });
});

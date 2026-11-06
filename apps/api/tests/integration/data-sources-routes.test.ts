import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { encrypt } from '../../src/lib/data-sources/encryption';

const HEADERS = { 'x-dev-token': 'integration-test-token-deadbeef' };

describe('GET /api/data-sources/status', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/status');
    expect(res.status).toBe(403);
  });

  it('returns the pre-seeded google_health and spotify rows', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/status', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data_sources: Array<{ provider: string; status: string }>;
    };
    expect(body.data_sources).toHaveLength(2);
    expect(body.data_sources.map((d) => d.provider).sort()).toEqual(['google_health', 'spotify']);
    expect(body.data_sources.every((d) => d.status === 'disconnected')).toBe(true);
  });
});

describe('GET /api/data-sources/:provider/authorize', () => {
  it('rejects unknown provider with 400', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/unknown/authorize');
    expect(res.status).toBe(400);
  });

  it('302 redirects to Google with a valid OAuth URL', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health/authorize', {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('client_id=');
    expect(location).toContain('access_type=offline');
    expect(location).toContain('prompt=consent');
    expect(location).toContain('code_challenge=');
    expect(location).toContain('code_challenge_method=S256');
  });

  it('sets an HttpOnly oauth_cv cookie', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health/authorize', {
      redirect: 'manual',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('oauth_cv_google_health=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('GET /api/data-sources/:provider/callback', () => {
  it('400 on missing code or state', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health/callback');
    expect(res.status).toBe(400);
  });

  it('400 on invalid state', async () => {
    const res = await SELF.fetch(
      'https://x.test/api/data-sources/google_health/callback?code=x&state=garbage',
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/data-sources/:provider/sync', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health/sync', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('returns not_connected when no tokens persisted', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health/sync', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sync_status: string; error_message?: string };
    expect(body.sync_status).toBe('failed');
    expect(body.error_message).toBe('not_connected');
  });
});

describe('DELETE /api/data-sources/:provider', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/data-sources/google_health', {
      method: 'DELETE',
    });
    expect(res.status).toBe(403);
  });

  it('hard-deletes tokens and flips status to disconnected', async () => {
    // ENCRYPTION_KEY is injected via vitest.config.ts miniflare bindings but is
    // not part of the wrangler-generated Env type - cast to the narrow shape
    // encrypt() expects (mirrors data-sources-sync-alarm.test.ts).
    const encEnv = env as unknown as { ENCRYPTION_KEY: string };
    const access = await encrypt('stub-access', encEnv, 'google_health');
    const refresh = await encrypt('stub-refresh', encEnv, 'google_health');
    await env.DB.prepare(
      `INSERT INTO data_source_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
       VALUES ('google_health', ?, ?, datetime('now', '+1 hour'))`,
    )
      .bind(access, refresh)
      .run();
    await env.DB.prepare(
      `UPDATE data_sources SET status = 'connected' WHERE provider = 'google_health'`,
    ).run();

    const res = await SELF.fetch('https://x.test/api/data-sources/google_health', {
      method: 'DELETE',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);

    const tokens = await env.DB.prepare(
      `SELECT * FROM data_source_tokens WHERE provider = 'google_health'`,
    ).first();
    expect(tokens).toBeNull();
    const ds = await env.DB.prepare(
      `SELECT status FROM data_sources WHERE provider = 'google_health'`,
    ).first<{ status: string }>();
    expect(ds?.status).toBe('disconnected');
  });
});

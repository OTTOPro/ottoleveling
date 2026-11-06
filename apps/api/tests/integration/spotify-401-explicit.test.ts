import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { encrypt } from '../../src/lib/data-sources/encryption';

/**
 * Explicit regression tests for the Spotify 401
 * refresh+retry flow. Two cases:
 *   A. 401 on first sync → refresh succeeds → second sync attempt succeeds → metrics persist
 *   B. 401 on first sync → refresh fails → data_sources.status='reauth_required'
 *
 * These guard against future regressions where the catch(() => null) wrappers
 * (or any similar swallow-all-errors helper) could once again hide 401s and
 * silently return 0 metrics with status='partial'.
 *
 * Implementation note: syncDataSource calls getDataSourceProvider(name, env)
 * which defaults to globalThis.fetch. We intercept globalThis.fetch inside the
 * runInDurableObject callback (which runs in the DO's Workers isolate), restored
 * in afterEach for test isolation.
 */

let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  originalFetch = globalThis.fetch;

  // Pre-seed encrypted tokens for spotify provider
  const access = await encrypt(
    'stub-access',
    env as unknown as { ENCRYPTION_KEY: string },
    'spotify',
  );
  const refresh = await encrypt(
    'stub-refresh',
    env as unknown as { ENCRYPTION_KEY: string },
    'spotify',
  );
  await env.DB.prepare(`DELETE FROM data_source_tokens WHERE provider = 'spotify'`).run();
  await env.DB.prepare(
    `INSERT INTO data_source_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
     VALUES ('spotify', ?, ?, datetime('now', '-1 hour'))`,
  )
    .bind(access, refresh)
    .run();
  await env.DB.prepare(
    `UPDATE data_sources SET status = 'connected' WHERE provider = 'spotify'`,
  ).run();
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

describe('Spotify 401 - explicit refresh-and-retry regression tests', () => {
  it('Case A: 401 on first sync → refresh succeeds → second sync attempt succeeds', async () => {
    let callCount = 0;
    let refreshCallCount = 0;

    const mockFetchA = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      // Spotify token refresh endpoint
      if (url.includes('accounts.spotify.com') && url.includes('/api/token')) {
        refreshCallCount++;
        return new Response(
          JSON.stringify({
            access_token: 'refreshed-access-token',
            refresh_token: 'refreshed-refresh-token',
            expires_in: 3600,
            scope: 'user-library-read',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      // Spotify API endpoints
      if (
        url.includes('/me/shows') ||
        url.includes('/me/episodes') ||
        url.includes('/me/audiobooks') ||
        url.includes('/me/player/recently-played')
      ) {
        callCount++;
        // First round of 4 endpoints → 401 (expired token)
        if (callCount <= 4) {
          return new Response('Unauthorized', { status: 401 });
        }
        // Second round (after refresh) → 200 with empty library
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Fallback for unexpected URLs
      return new Response('Not found', { status: 404 });
    };
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      mockFetchA as unknown as typeof fetch;

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    const result = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          syncDataSource: (
            n: string,
            d?: string,
          ) => Promise<{ metrics_persisted: number; sync_status: string; error_message?: string }>;
        }
      ).syncDataSource('spotify', '2026-05-31');
    });

    // The refresh path fired exactly once
    expect(refreshCallCount).toBe(1);
    // 4 endpoints called before refresh + 4 endpoints called after = 8 total
    expect(callCount).toBe(8);
    // Sync succeeded (empty library = partial, not failed)
    expect(['success', 'partial']).toContain(result.sync_status);
    // Tokens updated to the refreshed values (expires_at should now be future)
    const tokenRow = await env.DB.prepare(
      `SELECT expires_at FROM data_source_tokens WHERE provider = 'spotify'`,
    ).first<{ expires_at: string }>();
    expect(tokenRow).not.toBeNull();
    // The updated token row should have a future expiry (not the -1 hour we seeded)
    const expiresAt = new Date(tokenRow!.expires_at).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('Case B: 401 on first sync → refresh fails → status=reauth_required', async () => {
    let refreshCallCount = 0;

    const mockFetchB = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      // Spotify token refresh fails
      if (url.includes('accounts.spotify.com') && url.includes('/api/token')) {
        refreshCallCount++;
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      // All Spotify API endpoints → 401
      if (
        url.includes('/me/shows') ||
        url.includes('/me/episodes') ||
        url.includes('/me/audiobooks') ||
        url.includes('/me/player/recently-played')
      ) {
        return new Response('Unauthorized', { status: 401 });
      }

      return new Response('Not found', { status: 404 });
    };
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      mockFetchB as unknown as typeof fetch;

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    const result = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          syncDataSource: (
            n: string,
            d?: string,
          ) => Promise<{ metrics_persisted: number; sync_status: string; error_message?: string }>;
        }
      ).syncDataSource('spotify', '2026-05-31');
    });

    // Refresh was attempted exactly once
    expect(refreshCallCount).toBe(1);
    // Sync must report failure with the reauth error message
    expect(result.sync_status).toBe('failed');
    expect(result.error_message).toMatch(/reauth_required/i);
    // data_sources.status must be flipped to reauth_required
    const dsRow = await env.DB.prepare(
      `SELECT status, last_sync_status FROM data_sources WHERE provider = 'spotify'`,
    ).first<{ status: string; last_sync_status: string }>();
    expect(dsRow!.status).toBe('reauth_required');
    expect(dsRow!.last_sync_status).toBe('failed');
    // No new daily_metrics rows for spotify on the test date
    const metricsCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM daily_metrics WHERE provider = 'spotify' AND date = '2026-05-31'`,
    ).first<{ n: number }>();
    expect(metricsCount!.n).toBe(0);
  });
});

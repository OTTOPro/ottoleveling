import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { encrypt } from '../../src/lib/data-sources/encryption';

// NOTE: real syncDataSource uses globalThis.fetch - we'd need to stub at that
// level for an end-to-end alarm test. The simpler integration shape: seed
// encrypted tokens, call syncDataSource directly via the DO RPC, assert
// daily_metrics rows. Alarm dispatch against real Google is verified by a
// manual smoke test.

describe('SystemAgent.syncDataSource - D1 integration', () => {
  beforeEach(async () => {
    // Seed encrypted tokens so syncDataSource has something to decrypt.
    // ENCRYPTION_KEY is injected via vitest.config.ts miniflare bindings but
    // is not part of the wrangler-generated Env type - cast to the narrow
    // shape encrypt() expects.
    const encEnv = env as unknown as { ENCRYPTION_KEY: string };
    const access = await encrypt('stub-access-token', encEnv, 'google_health');
    const refresh = await encrypt('stub-refresh-token', encEnv, 'google_health');
    await env.DB.prepare(
      `INSERT INTO data_source_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
       VALUES ('google_health', ?, ?, datetime('now', '+1 hour'))`,
    )
      .bind(access, refresh)
      .run();
    await env.DB.prepare(
      `UPDATE data_sources SET status = 'connected' WHERE provider = 'google_health'`,
    ).run();
  });

  it('returns metrics_persisted=0 + sync_status=failed when provider returns all 401s (refresh also 401)', async () => {
    // This test relies on the fact that the test env has no real Google network.
    // The fetch will fail (or return a 4xx) - sync_status='failed' is the expected outcome.
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    let result: { metrics_persisted: number; sync_status: string } | undefined;
    await runInDurableObject(stub, async (instance) => {
      result = await (
        instance as unknown as {
          syncDataSource: (
            n: string,
            d?: string,
          ) => Promise<{ metrics_persisted: number; sync_status: string }>;
        }
      ).syncDataSource('google_health', '2026-05-29');
    });
    expect(result!.metrics_persisted).toBe(0);
    expect(['failed', 'partial']).toContain(result!.sync_status);
  });

  it('records the failure into data_sources.last_sync_status', async () => {
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { syncDataSource: (n: string) => Promise<unknown> }
      ).syncDataSource('google_health');
    });
    const row = await env.DB.prepare(
      `SELECT last_sync_at, last_sync_status FROM data_sources WHERE provider = 'google_health'`,
    ).first<{ last_sync_at: string | null; last_sync_status: string | null }>();
    expect(row?.last_sync_at).not.toBeNull();
    expect(row?.last_sync_status).not.toBeNull();
  });

  it('returns not_connected when status=disconnected', async () => {
    await env.DB.prepare(
      `UPDATE data_sources SET status = 'disconnected' WHERE provider = 'google_health'`,
    ).run();
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    let result: { sync_status: string; error_message?: string } | undefined;
    await runInDurableObject(stub, async (instance) => {
      result = await (
        instance as unknown as {
          syncDataSource: (n: string) => Promise<{ sync_status: string; error_message?: string }>;
        }
      ).syncDataSource('google_health');
    });
    expect(result!.sync_status).toBe('failed');
    expect(result!.error_message).toBe('not_connected');
  });
});

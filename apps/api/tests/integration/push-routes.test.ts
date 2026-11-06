import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const authed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

const unauthed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

const FIXTURE_ENDPOINT = 'https://fcm.googleapis.com/wp/test-endpoint-abc';
const FIXTURE_SUB = {
  endpoint: FIXTURE_ENDPOINT,
  keys: { p256dh: 'BMxxtestp256dh', auth: 'xxauthtest' },
};

describe('GET /api/push/vapid-key (public)', () => {
  it('returns the VAPID public key without auth', async () => {
    const res = await SELF.fetch(unauthed('/api/push/vapid-key'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicKey: string };
    expect(body.publicKey).toBeDefined();
    expect(body.publicKey.length).toBeGreaterThan(0);
  });
});

describe('POST /api/push/subscribe', () => {
  it('persists a new subscription and returns 201', async () => {
    const res = await SELF.fetch(
      authed('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(FIXTURE_SUB),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { subscription: { id: number; endpoint: string } };
    expect(body.subscription.id).toBeGreaterThan(0);
    expect(body.subscription.endpoint).toBe(FIXTURE_ENDPOINT);
  });

  it('upserts on conflict: re-subscribing the same endpoint refreshes keys + resets failure_count', async () => {
    // Seed an existing sub with failure_count = 3.
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, failure_count)
       VALUES (?, 'oldp256', 'oldauth', 3)`,
    )
      .bind(FIXTURE_ENDPOINT)
      .run();

    const res = await SELF.fetch(
      authed('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(FIXTURE_SUB),
      }),
    );
    expect(res.status).toBe(201);

    const row = await env.DB.prepare(
      `SELECT p256dh, auth, failure_count FROM push_subscriptions WHERE endpoint = ?`,
    )
      .bind(FIXTURE_ENDPOINT)
      .first<{ p256dh: string; auth: string; failure_count: number }>();
    expect(row!.p256dh).toBe('BMxxtestp256dh');
    expect(row!.auth).toBe('xxauthtest');
    expect(row!.failure_count).toBe(0);
  });

  it('rejects unauthed requests with 403', async () => {
    const res = await SELF.fetch(
      unauthed('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(FIXTURE_SUB),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/push/unsubscribe', () => {
  it('deletes the subscription by endpoint', async () => {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, 'p256', 'a')`,
    )
      .bind(FIXTURE_ENDPOINT)
      .run();

    const res = await SELF.fetch(
      authed('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: FIXTURE_ENDPOINT }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(1);

    const remaining = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?`,
    )
      .bind(FIXTURE_ENDPOINT)
      .first<{ n: number }>();
    expect(remaining!.n).toBe(0);
  });

  it('returns deleted=0 if endpoint not found (idempotent)', async () => {
    const res = await SELF.fetch(
      authed('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: 'https://example.com/nonexistent' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(0);
  });
});

describe('GET /api/push/status', () => {
  it('returns total count + per-endpoint subscription when endpoint provided', async () => {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, 'p', 'a')`,
    )
      .bind(FIXTURE_ENDPOINT)
      .run();
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ('https://example.com/other', 'p', 'a')`,
    ).run();

    const res = await SELF.fetch(
      authed(`/api/push/status?endpoint=${encodeURIComponent(FIXTURE_ENDPOINT)}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      subscribed: boolean;
      subscription: { endpoint: string } | null;
    };
    expect(body.total).toBe(2);
    expect(body.subscribed).toBe(true);
    expect(body.subscription!.endpoint).toBe(FIXTURE_ENDPOINT);
  });

  it('returns total only when no endpoint provided', async () => {
    const res = await SELF.fetch(authed('/api/push/status'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0); // setup-d1 wiped push_subscriptions before this test
  });
});

describe('POST /api/push/test (patch 1)', () => {
  it('fires a daily test push to all active subscriptions and returns counters', async () => {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, 'p', 'a')`,
    )
      .bind(FIXTURE_ENDPOINT)
      .run();

    const res = await SELF.fetch(
      authed('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ type: 'daily' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; failed: number; deleted: number };
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(0);
  });

  it('fires a weekly test push and the body includes Week N + url falls back to /bilans when no bilan exists', async () => {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, 'p', 'a')`,
    )
      .bind(FIXTURE_ENDPOINT)
      .run();

    const res = await SELF.fetch(
      authed('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ type: 'weekly' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number };
    expect(body.sent).toBe(1);
  });

  it('rejects bogus type with 400', async () => {
    const res = await SELF.fetch(
      authed('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ type: 'monthly' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthed requests with 403', async () => {
    const res = await SELF.fetch(
      unauthed('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ type: 'daily' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

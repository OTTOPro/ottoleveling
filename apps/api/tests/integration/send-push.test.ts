import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockPushSender } from '../../src/lib/push-sender';

const getAgent = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

async function seedSub(endpoint: string, failureCount = 0): Promise<number> {
  const r = await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, failure_count)
     VALUES (?, 'BMtest', 'authtest', ?) RETURNING id`,
  )
    .bind(endpoint, failureCount)
    .first<{ id: number }>();
  if (!r) throw new Error('seed failed');
  return r.id;
}

describe('SystemAgent.sendPush', () => {
  it('sends to all subscriptions and returns counters', async () => {
    await seedSub('https://example.com/a');
    await seedSub('https://example.com/b');

    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.deleted).toBe(0);
    expect(MockPushSender.recordedCalls.length).toBe(2);

    const payloads = MockPushSender.recordedCalls.map((c) => JSON.parse(c.payload));
    expect(payloads[0].type).toBe('daily_assigned');
    expect(payloads[0].url).toBe('/');
  });

  it('deletes subscription on 410 Gone', async () => {
    await seedSub('https://example.com/dead');
    MockPushSender.setNextResult({ ok: false, status: 410, gone: true, reason: 'Gone' });

    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });

    expect(result.deleted).toBe(1);
    const remaining = await env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).first<{
      n: number;
    }>();
    expect(remaining!.n).toBe(0);
  });

  it('increments failure_count on non-410 error', async () => {
    const id = await seedSub('https://example.com/transient', 2);
    MockPushSender.setNextResult({
      ok: false,
      status: 503,
      gone: false,
      reason: 'Service Unavailable',
    });

    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });

    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(0);

    const row = await env.DB.prepare(`SELECT failure_count FROM push_subscriptions WHERE id = ?`)
      .bind(id)
      .first<{ failure_count: number }>();
    expect(row!.failure_count).toBe(3);
  });

  it('auto-deletes subscription after > 5 failures', async () => {
    const id = await seedSub('https://example.com/burned', 5);
    MockPushSender.setNextResult({
      ok: false,
      status: 500,
      gone: false,
      reason: 'Internal Server Error',
    });

    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });

    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(1);

    const remaining = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM push_subscriptions WHERE id = ?`,
    )
      .bind(id)
      .first<{ n: number }>();
    expect(remaining!.n).toBe(0);
  });

  it('returns zero counters when no subscriptions exist', async () => {
    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });
    expect(result).toEqual({ sent: 0, failed: 0, deleted: 0 });
    expect(MockPushSender.recordedCalls.length).toBe(0);
  });

  it('one failed subscription does not block others', async () => {
    await seedSub('https://example.com/a');
    await seedSub('https://example.com/b');
    // First call fails 410, second succeeds (default).
    MockPushSender.setNextResult({ ok: false, status: 410, gone: true, reason: 'Gone' });

    const agent = getAgent();
    const result = await agent.sendPush({
      type: 'daily_assigned',
      title: '[ THE SYSTEM ]',
      body: 'Test.',
      url: '/',
    });

    expect(result.sent).toBe(1);
    expect(result.deleted).toBe(1);
  });
});

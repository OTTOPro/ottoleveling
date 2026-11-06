import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { getAgent } from '../lib/agent';
import {
  SubscribePushBodySchema,
  UnsubscribePushBodySchema,
  PushStatusQuerySchema,
  TestPushBodySchema,
} from '../schemas/push';

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  failure_count: number;
}

/**
 * PUBLIC router - mounted BEFORE the dev-token middleware. Only the
 * vapid-key endpoint is here; subscribe/unsubscribe/status/test are on the
 * AUTHENTICATED router below.
 */
export const pushPublicRouter = new Hono<{ Bindings: Bindings }>();

pushPublicRouter.get('/vapid-key', (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

/**
 * AUTHENTICATED router - mounted AFTER dev-token middleware.
 */
export const pushAuthRouter = new Hono<{ Bindings: Bindings }>();

pushAuthRouter.post('/subscribe', zValidator('json', SubscribePushBodySchema), async (c) => {
  const body = c.req.valid('json');
  const userAgent = c.req.header('user-agent') ?? null;

  // UPSERT on endpoint. If the user re-subscribes from the same device, keep
  // the row but refresh keys + user_agent + reset failure_count.
  const row = await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         failure_count = 0
       RETURNING *`,
  )
    .bind(body.endpoint, body.keys.p256dh, body.keys.auth, userAgent)
    .first<PushSubscriptionRow>();

  if (!row) return c.json({ error: 'insert_failed' }, 500);
  return c.json(
    { subscription: { id: row.id, endpoint: row.endpoint, created_at: row.created_at } },
    201,
  );
});

pushAuthRouter.post('/unsubscribe', zValidator('json', UnsubscribePushBodySchema), async (c) => {
  const body = c.req.valid('json');
  const result = await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`)
    .bind(body.endpoint)
    .run();
  return c.json({ deleted: result.meta?.changes ?? 0 });
});

pushAuthRouter.get('/status', zValidator('query', PushStatusQuerySchema), async (c) => {
  const { endpoint } = c.req.valid('query');

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).first<{
    n: number;
  }>();
  const total = totalRow?.n ?? 0;

  if (endpoint) {
    const sub = await c.env.DB.prepare(
      `SELECT id, endpoint, created_at, last_used_at FROM push_subscriptions WHERE endpoint = ?`,
    )
      .bind(endpoint)
      .first<{ id: number; endpoint: string; created_at: string; last_used_at: string | null }>();
    return c.json({ total, subscribed: !!sub, subscription: sub ?? null });
  }

  return c.json({ total });
});

/**
 * POST /api/push/test - fires a test notification to all
 * current subscriptions using the same payload builders the alarm handlers
 * use. No LLM call, no D1 quest mutation. Returns the same counters
 * as sendPush. Lets the user verify their device subscription works without
 * waiting for 06:00 UTC daily_generation or Sunday 20:00 weekly_bilan.
 */
pushAuthRouter.post('/test', zValidator('json', TestPushBodySchema), async (c) => {
  const { type } = c.req.valid('json');
  const agent = getAgent(c.env);
  const result = await agent.sendPushTest(type);
  return c.json(result);
});

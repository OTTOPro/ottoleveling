import { z } from 'zod';

/**
 * Mirrors PushSubscription.toJSON() output from the browser:
 *   { endpoint, expirationTime?, keys: { p256dh, auth } }
 *
 * We flatten keys for storage. user_agent is added server-side from the
 * request header, not the body.
 */
export const SubscribePushBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(64),
  }),
  // expirationTime is in the spec but we ignore it (always null in practice).
});

export const UnsubscribePushBodySchema = z.object({
  endpoint: z.string().url(),
});

export const PushStatusQuerySchema = z.object({
  endpoint: z.string().url().optional(),
});

/**
 * POST /api/push/test body. Per user patch 1: lets the frontend fire a
 * single push to all current subscriptions without waiting for an alarm
 * or burning Groq quota.
 */
export const TestPushBodySchema = z.object({
  type: z.enum(['daily', 'weekly']),
});

export type SubscribePushBody = z.infer<typeof SubscribePushBodySchema>;
export type UnsubscribePushBody = z.infer<typeof UnsubscribePushBodySchema>;
export type TestPushBody = z.infer<typeof TestPushBodySchema>;

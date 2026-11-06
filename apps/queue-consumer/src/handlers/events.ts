/**
 * Events queue handler.
 *
 * Processes messages from ottoleveling-events:
 * - auto_complete_check: re-evaluates auto-complete rules for the given date
 * - spotify_sync: triggers Spotify library + history sync
 * - google_health_sync: triggers Google Health metric sync
 *
 * All 3 types dispatch to the SystemAgent Durable Object via cross-worker RPC.
 * The underlying logic stays in the DO - this worker is a thin proxy.
 *
 * Retry semantics: msg.attempts >= 3 → DLQ INSERT + ack. Otherwise msg.retry().
 */
import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../index';
import type { EventMessage } from './types';
import { getAgentStub } from '../lib/agent';
import { emitAnalytics, persistEventsDlq } from '../lib/analytics';

export async function handleEventsBatch(
  batch: MessageBatch<EventMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const start = Date.now();
    try {
      const body = msg.body;
      const stub = getAgentStub(env);

      if (body.type === 'auto_complete_check') {
        await (
          stub as unknown as { processAutoCompleteFromQueue: (date: string) => Promise<void> }
        ).processAutoCompleteFromQueue(body.date);
      } else if (body.type === 'spotify_sync') {
        await (
          stub as unknown as { syncSpotifyFromQueue: (reason: string) => Promise<void> }
        ).syncSpotifyFromQueue(body.reason);
      } else if (body.type === 'google_health_sync') {
        await (
          stub as unknown as { syncGoogleHealthFromQueue: (reason: string) => Promise<void> }
        ).syncGoogleHealthFromQueue(body.reason);
      } else {
        console.warn(`[events] unknown message type:`, body);
      }

      emitAnalytics(env, 'events', body.type, 'success', Date.now() - start, msg.attempts);
      msg.ack();
    } catch (err) {
      console.error(`[events] error processing message:`, err);
      const msgType = (msg.body as EventMessage | null)?.type ?? 'unknown';
      emitAnalytics(
        env,
        'events',
        msgType,
        msg.attempts >= 3 ? 'dlq' : 'retry',
        Date.now() - start,
        msg.attempts,
      );
      if (msg.attempts >= 3) {
        await persistEventsDlq(env, msg.body, msg.attempts, err);
        msg.ack();
      } else {
        msg.retry();
      }
    }
  }
}

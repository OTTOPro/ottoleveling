/**
 * Daily quest generation dispatch.
 *
 * The consumer is a thin RPC-proxy worker. All generation logic stays in
 * the SystemAgent Durable Object (apps/api). This module:
 * 1. Sets KV generation_status:{date} = 'pending' (frontend skeleton trigger)
 * 2. Calls DO stub.generateDailyFromQueue(date)
 * 3. Sets KV status = 'ready' on success, 'failed' on error
 *
 * The 'pending' flag is written BEFORE the DO call so the frontend skeleton
 * renders immediately when the user polls /api/quests/today after the 06:00
 * UTC alarm fires.
 */
import type { Env } from '../index';
import { getAgentStub } from './agent';

const STATUS_TTL = 86400; // 24h - aligns with the UTC day cycle

export async function generateDailyQuests(env: Env, date: string): Promise<void> {
  // Set 'pending' flag BEFORE the DO call so polling frontend sees it immediately.
  await env.KV.put(`generation_status:${date}`, 'pending', { expirationTtl: STATUS_TTL });

  const stub = getAgentStub(env);
  try {
    await (
      stub as unknown as { generateDailyFromQueue: (date: string) => Promise<void> }
    ).generateDailyFromQueue(date);
    await env.KV.put(`generation_status:${date}`, 'ready', { expirationTtl: STATUS_TTL });
  } catch (err) {
    await env.KV.put(`generation_status:${date}`, 'failed', { expirationTtl: STATUS_TTL });
    throw err; // re-throw so the caller can handle retry / DLQ
  }
}

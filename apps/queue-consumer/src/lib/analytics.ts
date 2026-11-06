/**
 * Analytics Engine emission + DLQ persistence helpers.
 *
 * emitAnalytics: writes a data point to the ANALYTICS dataset. Wrapped in
 * try/catch - analytics failure must NEVER fail the queue handler.
 *
 * persistLlmDlq / persistEventsDlq: mirror DLQ messages into D1 for the
 * /system/admin/orchestration dashboard (inspection + retry UI).
 */
import type { Env } from '../index';

export function emitAnalytics(
  env: Env,
  queue_name: string,
  message_type: string,
  outcome: 'success' | 'retry' | 'dlq',
  duration_ms: number,
  attempt: number,
): void {
  try {
    env.ANALYTICS?.writeDataPoint({
      blobs: [queue_name, message_type, outcome],
      doubles: [duration_ms, attempt],
      indexes: [queue_name],
    });
  } catch {
    // Analytics failure is non-fatal - swallow silently.
  }
}

export async function persistLlmDlq(
  env: Env,
  body: unknown,
  attempts: number,
  error: unknown,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO llm_jobs_dlq (message_body, error_message, attempts) VALUES (?, ?, ?)`,
    )
      .bind(JSON.stringify(body), String(error), attempts)
      .run();
  } catch (persistErr) {
    console.error('[llm-jobs] persistLlmDlq failed:', persistErr);
  }
}

export async function persistEventsDlq(
  env: Env,
  body: unknown,
  attempts: number,
  error: unknown,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO events_dlq (message_body, error_message, attempts) VALUES (?, ?, ?)`,
    )
      .bind(JSON.stringify(body), String(error), attempts)
      .run();
  } catch (persistErr) {
    console.error('[events] persistEventsDlq failed:', persistErr);
  }
}

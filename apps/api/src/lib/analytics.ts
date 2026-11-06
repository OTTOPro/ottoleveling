/**
 * Unified Analytics Engine emission adapter.
 *
 * Centralizes the 3 event shapes used across DO, workflows, and queue consumer:
 *   - queue_produce: emitted when a job is enqueued (in DO/Worker)
 *   - queue_consume: emitted when a consumer processes a message (in queue-consumer)
 *   - workflow_step: emitted on workflow step transitions
 *
 * `emit` is a fire-and-forget helper. Errors are swallowed (non-fatal) so that
 * observability failures never block the primary business logic path.
 *
 * When `analytics` is undefined (local dev / test environments that don't bind
 * the Analytics Engine), the function is a no-op. No crash, no noise.
 */

import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';

export type AnalyticsEvent =
  | { kind: 'queue_produce'; queue_name: string; message_type: string }
  | {
      kind: 'queue_consume';
      queue_name: string;
      message_type: string;
      outcome: 'success' | 'retry' | 'dlq';
      duration_ms: number;
      attempt: number;
    }
  | {
      kind: 'workflow_step';
      workflow_name: string;
      step_name: string;
      status: 'success' | 'failed';
      duration_ms: number;
    };

/**
 * Emit a single observability event to Cloudflare Analytics Engine.
 *
 * @param analytics - The Analytics Engine binding from the Worker environment.
 *   Pass `undefined` in tests or local dev to make this a no-op.
 * @param event - The structured event to emit.
 */
export function emit(analytics: AnalyticsEngineDataset | undefined, event: AnalyticsEvent): void {
  if (!analytics) return;
  try {
    switch (event.kind) {
      case 'queue_produce':
        analytics.writeDataPoint({
          blobs: [event.queue_name, event.message_type, 'produce'],
          indexes: [event.queue_name],
        });
        break;

      case 'queue_consume':
        analytics.writeDataPoint({
          blobs: [event.queue_name, event.message_type, event.outcome],
          doubles: [event.duration_ms, event.attempt],
          indexes: [event.queue_name],
        });
        break;

      case 'workflow_step':
        analytics.writeDataPoint({
          blobs: [event.workflow_name, event.step_name, event.status],
          doubles: [event.duration_ms],
          indexes: [event.workflow_name],
        });
        break;
    }
  } catch (e) {
    // Non-fatal: observability failures must never block primary logic.
    console.error('[analytics] emit failed (non-fatal):', e);
  }
}

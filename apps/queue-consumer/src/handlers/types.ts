/**
 * Message type definitions for the 2 queues.
 *
 * Vendored copy of apps/api/src/lib/queue-types.ts to avoid cross-workspace
 * TypeScript imports in the consumer bundle. Keep in sync with the source.
 */

export type LlmJobMessage =
  | { type: 'generate_daily'; date: string }
  | { type: 'generate_bilan_evening'; date: string }
  | { type: 'generate_bilan_weekly'; week_start: string };

export type EventMessage =
  | { type: 'auto_complete_check'; date: string }
  | { type: 'spotify_sync'; reason: 'scheduled' | 'manual' | 'legacy-alarm' }
  | { type: 'google_health_sync'; reason: 'scheduled' | 'manual' | 'legacy-alarm' };

/**
 * Discriminated union message types for the 2 queues.
 *
 * LlmJobMessage  → ottoleveling-llm-jobs  (Groq, low-throughput / high-latency)
 * EventMessage   → ottoleveling-events    (auto-complete + syncs, high-throughput)
 *
 * Vendored into apps/queue-consumer/src/handlers/types.ts to avoid
 * cross-workspace TS imports in the consumer bundle.
 */

export type LlmJobMessage =
  | { type: 'generate_daily'; date: string }
  | { type: 'generate_bilan_evening'; date: string }
  | { type: 'generate_bilan_weekly'; week_start: string };

export type EventMessage =
  | { type: 'auto_complete_check'; date: string }
  | { type: 'spotify_sync'; reason: 'scheduled' | 'manual' | 'legacy-alarm' }
  | { type: 'google_health_sync'; reason: 'scheduled' | 'manual' | 'legacy-alarm' };

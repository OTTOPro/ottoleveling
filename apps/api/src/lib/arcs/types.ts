import type { PillarId } from '../../do/state';

export type ArcStatus = 'active' | 'completed' | 'failed' | 'abandoned';

/**
 * Row shape mirroring the quest_arcs D1 table (after migration 0006 + 0007).
 * Used by lifecycle helpers + D1 reads + API responses. metadata is the raw
 * JSON string from D1 (callers parse on read).
 */
export interface ArcRow {
  id: number;
  pillar_id: PillarId;
  title: string;
  description: string;
  total_steps: number;
  completed_steps: number;
  status: ArcStatus;
  started_at: string;
  expected_end: string | null;
  completed_at: string | null;
  total_xp_reward: number;
  metadata: string | null;
}

/**
 * Shape of the optional `proposed_arc` field on a generation response.
 * Validated against the Zod schema in apps/api/src/schemas/llm-response.ts.
 * step_criteria, when present, MUST have length == total_steps.
 */
export interface ProposedArc {
  pillar_id: PillarId;
  title: string;
  description: string;
  total_steps: number;
  expected_days: number;
  total_xp_reward: number;
  step_criteria?: string[];
}

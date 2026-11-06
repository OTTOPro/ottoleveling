import type { ArcRow, ProposedArc } from './types';

const DAY_MS = 86_400_000;

/**
 * Pure helper - produces a NEW ArcRow representing a freshly-started arc from
 * a proposal. Does NOT write to D1; caller persists via INSERT.
 *
 * Clamps total_steps and expected_days at the caller-provided caps (the
 * generation path uses 30 / 30). The returned `id` is 0 - D1 assigns the real id on
 * INSERT and the caller re-reads the row.
 */
export function startArc(
  proposal: ProposedArc,
  startedAtIso: string,
  maxStepsCap: number,
  maxDaysCap: number,
): ArcRow {
  const total_steps = Math.min(proposal.total_steps, maxStepsCap);
  const expected_days = Math.min(proposal.expected_days, maxDaysCap);
  const expected_end = new Date(
    new Date(startedAtIso).getTime() + expected_days * DAY_MS,
  ).toISOString();
  const metadata = proposal.step_criteria
    ? JSON.stringify({ step_criteria: proposal.step_criteria })
    : null;
  return {
    id: 0,
    pillar_id: proposal.pillar_id,
    title: proposal.title,
    description: proposal.description,
    total_steps,
    completed_steps: 0,
    status: 'active',
    started_at: startedAtIso,
    expected_end,
    completed_at: null,
    total_xp_reward: proposal.total_xp_reward,
    metadata,
  };
}

/**
 * Pure helper - increments completed_steps by 1. Status stays 'active' even
 * when completed_steps reaches total_steps; the caller must call completeArc()
 * separately to flip the status.
 */
export function progressArc(arc: ArcRow): ArcRow {
  return {
    ...arc,
    completed_steps: arc.completed_steps + 1,
  };
}

/**
 * Pure helper - flips status to 'completed' and sets completed_at. Caller
 * should also INSERT the bonus xp_event in the same batch.
 */
export function completeArc(arc: ArcRow, completedAtIso: string): ArcRow {
  return {
    ...arc,
    status: 'completed',
    completed_at: completedAtIso,
  };
}

/**
 * Pure helper - flips status to 'failed' and sets completed_at. Called from
 * checkExpiredArcs when expected_end < today AND completed_steps < total_steps.
 */
export function failArc(arc: ArcRow, failedAtIso: string): ArcRow {
  return {
    ...arc,
    status: 'failed',
    completed_at: failedAtIso,
  };
}

/**
 * Pure helper - flips status to 'abandoned'. Idempotent: re-abandoning
 * an already-abandoned arc preserves the original completed_at timestamp.
 */
export function abandonArc(arc: ArcRow, abandonedAtIso: string): ArcRow {
  if (arc.status === 'abandoned') return arc;
  return {
    ...arc,
    status: 'abandoned',
    completed_at: abandonedAtIso,
  };
}

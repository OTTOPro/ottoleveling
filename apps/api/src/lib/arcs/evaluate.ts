import type { ArcRow, ProposedArc } from './types';

/**
 * Concurrency limits. Single source of truth.
 */
export const MAX_ACTIVE_PER_PILLAR = 2;
export const MAX_ACTIVE_TOTAL = 5;

export type EvaluateNewProposalResult =
  | { ok: true }
  | { ok: false; reason: 'per_pillar_cap_reached' | 'total_cap_reached' };

/**
 * Pure concurrency check. Rows with status != 'active' don't consume capacity.
 */
export function evaluateNewProposal(
  proposal: ProposedArc,
  activeArcs: ArcRow[],
): EvaluateNewProposalResult {
  const active = activeArcs.filter((a) => a.status === 'active');
  if (active.length >= MAX_ACTIVE_TOTAL) {
    return { ok: false, reason: 'total_cap_reached' };
  }
  const onPillar = active.filter((a) => a.pillar_id === proposal.pillar_id).length;
  if (onPillar >= MAX_ACTIVE_PER_PILLAR) {
    return { ok: false, reason: 'per_pillar_cap_reached' };
  }
  return { ok: true };
}

/**
 * Reads all status='active' arc rows from D1 in id order.
 */
export async function getActiveArcs(db: D1Database): Promise<ArcRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, pillar_id, title, description, total_steps, completed_steps,
              status, started_at, expected_end, completed_at, total_xp_reward, metadata
       FROM quest_arcs
       WHERE status = 'active'
       ORDER BY id`,
    )
    .all<ArcRow>();
  return results;
}

/**
 * Auto-fail sweep (time-based only). Marks any arc where
 *   status='active' AND expected_end < todayIso AND completed_steps < total_steps
 * as 'failed' with completed_at=now.
 *
 * Safety guard: arcs with completed_steps >= total_steps are NEVER auto-failed
 * (handles race where a final step landed at 23:59 of expected_end day).
 */
export async function checkExpiredArcs(
  db: D1Database,
  todayIso: string,
): Promise<{ failed: number; failed_arc_ids: number[] }> {
  const { results: expired } = await db
    .prepare(
      `SELECT id FROM quest_arcs
       WHERE status = 'active'
         AND expected_end IS NOT NULL
         AND expected_end < ?
         AND completed_steps < total_steps
       ORDER BY id`,
    )
    .bind(todayIso)
    .all<{ id: number }>();

  if (expired.length === 0) return { failed: 0, failed_arc_ids: [] };

  const now = new Date().toISOString();
  const stmts = expired.map((r) =>
    db
      .prepare(`UPDATE quest_arcs SET status = 'failed', completed_at = ? WHERE id = ?`)
      .bind(now, r.id),
  );
  await db.batch(stmts);

  return { failed: expired.length, failed_arc_ids: expired.map((r) => r.id) };
}

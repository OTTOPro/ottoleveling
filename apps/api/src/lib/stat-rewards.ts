/**
 * lib/stat-rewards.ts
 *
 * D1 helpers for the stat_rewards table:
 *  - insertStatRewards: atomic batch INSERT for LLM-emitted rewards (7 types)
 *  - maybeAwardFocus: DEPRECATED (see JSDoc below)
 *  - getStatDistribution: GROUP BY aggregate for the /stats Radar
 *
 * FOCUS semantics:
 *   FOCUS is awarded exclusively by SystemAgent.workflowCloseDay() which runs
 *   as the 'close' step of DailyCycleWorkflow at 23:59 UTC daily.
 *   maybeAwardFocus is retained as a deprecated export for emergency use only.
 */
import type { D1Database } from '@cloudflare/workers-types';

export type StatType = 'END' | 'STR' | 'FLEX' | 'INT' | 'WIS' | 'CAP' | 'CRAFT' | 'FOCUS';

export interface StatReward {
  type: StatType;
  value: number;
}

/**
 * Inserts LLM-emitted stat rewards atomically when a completion lands.
 * Only the 7 LLM types (END/STR/FLEX/INT/WIS/CAP/CRAFT) - FOCUS is handled
 * separately by maybeAwardFocus.
 *
 * No-op when rewards array is empty.
 */
export async function insertStatRewards(
  db: D1Database,
  completionId: number,
  rewards: StatReward[],
  awardedAt: string,
): Promise<void> {
  if (rewards.length === 0) return;
  const batch = rewards.map((r) =>
    db
      .prepare(
        `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(completionId, r.type, r.value, awardedAt),
  );
  await db.batch(batch);
}

/**
 * @deprecated FOCUS is awarded by DailyCycleWorkflow's close step.
 *
 * workflowCloseDay() (in apps/api/src/index.ts SystemAgent) is the sole
 * production FOCUS award path. This function is not called from
 * recordCompletion.
 *
 * Retained as an exported symbol for potential manual workflow-restart scenarios
 * (e.g., if a workflow instance needs to be manually closed with FOCUS check).
 * Do NOT re-introduce calls to this from recordCompletion - there must be a
 * single, workflow-driven FOCUS award path.
 *
 * Awards FOCUS +1 to a completion if:
 *  1. No FOCUS row exists for today yet (idempotent guard).
 *  2. Today's 'completed' completions touch >= 3 distinct pillars.
 *
 * Returns true if FOCUS was awarded, false otherwise.
 */
export async function maybeAwardFocus(
  db: D1Database,
  triggeringCompletionId: number,
  today: string,
  awardedAt: string,
): Promise<boolean> {
  // Already awarded today? (idempotent guard)
  const existing = await db
    .prepare(`SELECT 1 FROM stat_rewards WHERE stat_type = 'FOCUS' AND date(awarded_at) = ?`)
    .bind(today)
    .first<{ '1': number }>();
  if (existing) return false;

  // Count distinct pillars with at least one 'completed' completion today
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT q.pillar_id) as distinct_pillars
       FROM completions c
       JOIN quests q ON c.quest_id = q.id
       WHERE c.status = 'completed'
         AND date(c.completed_at) = ?`,
    )
    .bind(today)
    .first<{ distinct_pillars: number }>();

  if (!row || row.distinct_pillars < 3) return false;

  await db
    .prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at)
       VALUES (?, 'FOCUS', 1, ?)`,
    )
    .bind(triggeringCompletionId, awardedAt)
    .run();

  return true;
}

/**
 * GROUP BY aggregate for the /stats Radar.
 * Returns only types that have at least one reward row.
 * Caller should fill in missing types with total=0 for the full 8-axis radar.
 */
export async function getStatDistribution(
  db: D1Database,
): Promise<Array<{ type: StatType; total: number }>> {
  const r = await db
    .prepare(
      `SELECT stat_type as type, SUM(stat_value) as total
       FROM stat_rewards
       GROUP BY stat_type
       ORDER BY stat_type`,
    )
    .all<{ type: StatType; total: number }>();
  return r.results ?? [];
}

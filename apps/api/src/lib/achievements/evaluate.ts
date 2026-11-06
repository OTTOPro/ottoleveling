import { levelFromXp } from '../xp';
import type { SystemAgentState, PillarId } from '../../do/state';
import {
  type AchievementRow,
  type UnlockedAchievement,
  type ClosestAchievement,
  parseTriggerConfig,
} from './types';
import {
  CLOSEST_PREVIEW_COUNT,
  CLOSEST_TO_THRESHOLD_FRACTION,
  RECENT_UNLOCKS_MAX_LINES,
  RECENT_UNLOCKS_WINDOW_DAYS,
} from './thresholds';

/**
 * Fires after recordCompletion. Reads LIVE D1 aggregates (xp_events,
 * completions JOIN quests) + the just-updated DO state.streaks - NOT
 * lifetime_stats (which is materialized daily and would lag by 24h).
 *
 * For each LOCKED achievement, evaluates the trigger condition against the
 * live data + state. If the condition is met, runs:
 *   UPDATE achievements SET unlocked_at = datetime('now')
 *   WHERE id = ? AND unlocked_at IS NULL
 * The WHERE-guard is the idempotency mechanism. Returns the newly unlocked
 * rows. Caller is responsible for appending to state.recentUnlocks +
 * persisting state.
 *
 * Wrapped in try/catch at the caller - a parse failure on a corrupt
 * trigger_config does NOT void the parent operation.
 */
export async function evaluateOnCompletion(
  db: D1Database,
  _pillarId: PillarId,
  state: SystemAgentState,
): Promise<UnlockedAchievement[]> {
  const { results: locked } = await db
    .prepare(
      `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
       FROM achievements WHERE unlocked_at IS NULL`,
    )
    .all<AchievementRow>();

  const unlocked: UnlockedAchievement[] = [];
  for (const row of locked) {
    // bilan_streak triggers do NOT fire on completion path - skip silently.
    if (row.trigger_type === 'bilan_streak') continue;

    let met: boolean;
    try {
      const cfg = parseTriggerConfig(row.trigger_type, row.trigger_config);
      met = await evaluateTriggerCondition(db, state, cfg);
    } catch (err) {
      console.error(`[evaluateOnCompletion] parse/eval failed for ${row.id}:`, err);
      continue;
    }
    if (!met) continue;

    const result = await db
      .prepare(
        `UPDATE achievements SET unlocked_at = datetime('now') WHERE id = ? AND unlocked_at IS NULL`,
      )
      .bind(row.id)
      .run();
    if (result.meta.changes === 1) {
      const fresh = await db
        .prepare(
          `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
           FROM achievements WHERE id = ?`,
        )
        .bind(row.id)
        .first<AchievementRow>();
      if (fresh && fresh.unlocked_at) unlocked.push(fresh as UnlockedAchievement);
    }
  }
  return unlocked;
}

/**
 * Fires after generateBilan row INSERT. Evaluates bilan_streak triggers
 * against the most recent N bilans of matching period_type.
 */
export async function evaluateOnBilan(
  db: D1Database,
  _bilanResult: {
    id: number;
    period_type: 'weekly' | 'monthly' | 'yearly';
    stats: Record<string, unknown>;
  },
  state: SystemAgentState,
): Promise<UnlockedAchievement[]> {
  const { results: locked } = await db
    .prepare(
      `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
       FROM achievements WHERE unlocked_at IS NULL`,
    )
    .all<AchievementRow>();

  const unlocked: UnlockedAchievement[] = [];
  for (const row of locked) {
    // Only bilan_streak + composite triggers run on bilan path; others run on completion.
    // (composite re-runs here too because bilan generation may move all-pillar levels via
    // accumulated state.)
    if (row.trigger_type !== 'bilan_streak' && row.trigger_type !== 'composite') continue;

    let met: boolean;
    try {
      const cfg = parseTriggerConfig(row.trigger_type, row.trigger_config);
      met = await evaluateTriggerCondition(db, state, cfg);
    } catch (err) {
      console.error(`[evaluateOnBilan] parse/eval failed for ${row.id}:`, err);
      continue;
    }
    if (!met) continue;

    const result = await db
      .prepare(
        `UPDATE achievements SET unlocked_at = datetime('now') WHERE id = ? AND unlocked_at IS NULL`,
      )
      .bind(row.id)
      .run();
    if (result.meta.changes === 1) {
      const fresh = await db
        .prepare(
          `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
           FROM achievements WHERE id = ?`,
        )
        .bind(row.id)
        .first<AchievementRow>();
      if (fresh && fresh.unlocked_at) unlocked.push(fresh as UnlockedAchievement);
    }
  }
  return unlocked;
}

async function evaluateTriggerCondition(
  db: D1Database,
  state: SystemAgentState,
  cfg: ReturnType<typeof parseTriggerConfig>,
): Promise<boolean> {
  switch (cfg.type) {
    case 'streak': {
      const longest = state.streaks[cfg.pillar].longest;
      return longest >= cfg.threshold;
    }
    case 'xp_threshold': {
      const row = await db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE pillar_id = ?`)
        .bind(cfg.pillar)
        .first<{ xp: number }>();
      return (row?.xp ?? 0) >= cfg.threshold;
    }
    case 'xp_threshold_total': {
      const row = await db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events`)
        .first<{ xp: number }>();
      return (row?.xp ?? 0) >= cfg.threshold;
    }
    case 'completion_count': {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM completions c JOIN quests q ON c.quest_id = q.id
           WHERE q.pillar_id = ? AND c.status = 'completed'`,
        )
        .bind(cfg.pillar)
        .first<{ n: number }>();
      return (row?.n ?? 0) >= cfg.threshold;
    }
    case 'completion_count_total': {
      const row = await db
        .prepare(`SELECT COUNT(*) AS n FROM completions WHERE status = 'completed'`)
        .first<{ n: number }>();
      return (row?.n ?? 0) >= cfg.threshold;
    }
    case 'composite': {
      const { results } = await db
        .prepare(
          `SELECT pillar_id, COALESCE(SUM(amount), 0) AS xp FROM xp_events GROUP BY pillar_id`,
        )
        .all<{ pillar_id: PillarId; xp: number }>();
      const xpByPillar: Record<string, number> = {};
      for (const r of results) xpByPillar[r.pillar_id] = r.xp;
      for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
        const lvl = levelFromXp(Math.max(0, xpByPillar[p] ?? 0));
        if (lvl < cfg.all_pillars_level_at_least) return false;
      }
      return true;
    }
    case 'bilan_streak': {
      const { results } = await db
        .prepare(
          `SELECT stats FROM bilans WHERE period_type = ?
           ORDER BY period_start DESC LIMIT ?`,
        )
        .bind(cfg.period_type, cfg.threshold)
        .all<{ stats: string }>();
      if (results.length < cfg.threshold) return false;
      for (const r of results) {
        try {
          const parsed = JSON.parse(r.stats) as { completion_rate?: number };
          if ((parsed.completion_rate ?? 0) < cfg.min_completion_rate) return false;
        } catch {
          return false;
        }
      }
      return true;
    }
    case 'perfect_day': {
      const row = await db
        .prepare(
          `SELECT 1 FROM (
             SELECT scheduled_for,
                    COUNT(*) AS assigned,
                    SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) AS completed
             FROM quests q
             LEFT JOIN completions c ON c.quest_id = q.id
             GROUP BY scheduled_for
             HAVING assigned >= ? AND completed = assigned
             LIMIT 1
           )`,
        )
        .bind(cfg.min_assigned)
        .first<{ '1': number }>();
      return row != null;
    }
    case 'consecutive_active_days': {
      // Walk distinct scheduled_for dates with at least 1 completion (cross-pillar).
      // Find the longest consecutive-day run via 86_400_000ms arithmetic.
      const { results } = await db
        .prepare(
          `SELECT DISTINCT q.scheduled_for AS d
           FROM quests q
           INNER JOIN completions c ON c.quest_id = q.id AND c.status = 'completed'
           ORDER BY q.scheduled_for`,
        )
        .all<{ d: string }>();
      if (results.length === 0) return false;
      let longest = 1;
      let current = 1;
      for (let i = 1; i < results.length; i++) {
        const prev = new Date(results[i - 1]!.d + 'T00:00:00Z').getTime();
        const cur = new Date(results[i]!.d + 'T00:00:00Z').getTime();
        if (cur - prev === 86_400_000) {
          current++;
          longest = Math.max(longest, current);
        } else {
          current = 1;
        }
      }
      return longest >= cfg.threshold;
    }
  }
}

/**
 * Reads unlocked achievements within the last `days` window, sorted by
 * unlocked_at DESC, capped at RECENT_UNLOCKS_MAX_LINES.
 */
export async function getRecentAchievements(
  db: D1Database,
  today: string,
  days: number = RECENT_UNLOCKS_WINDOW_DAYS,
): Promise<AchievementRow[]> {
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 19).replace('T', ' ');
  const { results } = await db
    .prepare(
      `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
       FROM achievements
       WHERE unlocked_at IS NOT NULL AND unlocked_at >= ?
       ORDER BY unlocked_at DESC LIMIT ?`,
    )
    .bind(cutoffIso, RECENT_UNLOCKS_MAX_LINES)
    .all<AchievementRow>();
  return results;
}

/**
 * Reads locked achievements whose current progress is within
 * CLOSEST_TO_THRESHOLD_FRACTION (0.9 default) of their threshold. Capped at
 * CLOSEST_PREVIEW_COUNT. Sorted by fraction DESC (closest first).
 */
export async function getClosestToThreshold(
  db: D1Database,
  state: SystemAgentState,
): Promise<ClosestAchievement[]> {
  const { results: locked } = await db
    .prepare(
      `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config
       FROM achievements WHERE unlocked_at IS NULL`,
    )
    .all<AchievementRow>();

  const candidates: ClosestAchievement[] = [];
  for (const row of locked) {
    if (row.trigger_type === 'composite' || row.trigger_type === 'bilan_streak') continue;
    let progress: number;
    let threshold: number;
    try {
      const cfg = parseTriggerConfig(row.trigger_type, row.trigger_config);
      threshold = 'threshold' in cfg ? cfg.threshold : 0;
      switch (cfg.type) {
        case 'streak':
          progress = state.streaks[cfg.pillar].longest;
          break;
        case 'xp_threshold': {
          const r = await db
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE pillar_id = ?`)
            .bind(cfg.pillar)
            .first<{ xp: number }>();
          progress = r?.xp ?? 0;
          break;
        }
        case 'xp_threshold_total': {
          const r = await db
            .prepare(`SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events`)
            .first<{ xp: number }>();
          progress = r?.xp ?? 0;
          break;
        }
        case 'completion_count': {
          const r = await db
            .prepare(
              `SELECT COUNT(*) AS n FROM completions c JOIN quests q ON c.quest_id = q.id
               WHERE q.pillar_id = ? AND c.status = 'completed'`,
            )
            .bind(cfg.pillar)
            .first<{ n: number }>();
          progress = r?.n ?? 0;
          break;
        }
        case 'completion_count_total': {
          const r = await db
            .prepare(`SELECT COUNT(*) AS n FROM completions WHERE status = 'completed'`)
            .first<{ n: number }>();
          progress = r?.n ?? 0;
          break;
        }
        default:
          continue;
      }
    } catch {
      continue;
    }
    if (threshold <= 0) continue;
    const fraction = progress / threshold;
    if (fraction >= CLOSEST_TO_THRESHOLD_FRACTION && fraction < 1) {
      candidates.push({ id: row.id, name: row.name, progress, threshold, fraction });
    }
  }
  candidates.sort((a, b) => b.fraction - a.fraction);
  return candidates.slice(0, CLOSEST_PREVIEW_COUNT);
}

/**
 * Renders the {RECENT_ACHIEVEMENTS} placeholder. Two sections - "Unlocked in
 * last 30 days" (cap 5) + "Closest to unlock" (cap 3, only fraction ≥ 0.9).
 * Empty state: "None yet." Each line ≤ 80 chars.
 */
export function formatRecentAchievementsSnapshot(
  recent: AchievementRow[],
  closest: ClosestAchievement[],
): string {
  if (recent.length === 0 && closest.length === 0) return 'None yet.';
  const lines: string[] = [];
  if (recent.length > 0) {
    lines.push('Unlocked in last 30 days:');
    for (const r of recent) {
      const date = r.unlocked_at ? r.unlocked_at.slice(0, 10) : '-';
      lines.push(`- [${date}] ${r.name}: ${r.description}`.slice(0, 80));
    }
  }
  if (closest.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Closest to unlock:');
    for (const c of closest) {
      const pct = Math.round(c.fraction * 100);
      lines.push(`- ${c.name}: ${c.progress}/${c.threshold} (${pct}%)`.slice(0, 80));
    }
  }
  return lines.join('\n');
}

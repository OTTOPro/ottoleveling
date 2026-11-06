/**
 * stats-analytics.ts - SELECT-only D1 helpers for the /api/stats analytics endpoints.
 *
 * All queries are read-only; no mutations. No migrations needed (queries operate on
 * existing tables: completions, xp_events, achievements, lifetime_stats).
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface HeatmapCell {
  day: string;
  count: number;
}

export interface XpSeriesPoint {
  day: string;
  xp: number;
}

export interface AnalyticsAchievementRow {
  id: string;
  name: string;
  pillar_id: string | null;
  unlocked_at: string;
}

export interface LifetimeTotals {
  total_xp: number;
  total_quests: number;
  active_days: number;
  hunter_since: string | null;
}

/**
 * Daily completion counts (status='success') over the last `days` days, anchored on `today`.
 * Returns rows ONLY for days with at least 1 success. Frontend fills gaps with 0.
 *
 * NOTE: completions.status values are 'completed' | 'failed' | 'skipped' (per D1 schema).
 * The "success" semantic is status='completed'.
 */
export async function getDailyCompletionCounts(
  db: D1Database,
  today: string,
  days: number,
): Promise<HeatmapCell[]> {
  const result = await db
    .prepare(
      `SELECT date(completed_at) as day, COUNT(*) as count
       FROM completions
       WHERE status = 'completed'
         AND completed_at >= datetime(?, '-' || ? || ' days')
         AND completed_at < datetime(?, '+1 day')
       GROUP BY date(completed_at)
       ORDER BY day ASC`,
    )
    .bind(today, String(days), today)
    .all<{ day: string; count: number }>();
  return (result.results ?? []).map((r) => ({ day: r.day, count: r.count }));
}

/**
 * Daily XP sum (across all xp_events source types) over the last `days` days.
 */
export async function getDailyXpSeries(
  db: D1Database,
  today: string,
  days: number,
): Promise<XpSeriesPoint[]> {
  const result = await db
    .prepare(
      `SELECT date(occurred_at) as day, SUM(amount) as xp
       FROM xp_events
       WHERE occurred_at >= datetime(?, '-' || ? || ' days')
         AND occurred_at < datetime(?, '+1 day')
       GROUP BY date(occurred_at)
       ORDER BY day ASC`,
    )
    .bind(today, String(days), today)
    .all<{ day: string; xp: number }>();
  return (result.results ?? []).map((r) => ({ day: r.day, xp: r.xp }));
}

/**
 * Recent unlocked achievements (last `days` days), capped at 10.
 */
export async function getRecentAchievementsForStats(
  db: D1Database,
  days: number,
): Promise<AnalyticsAchievementRow[]> {
  const result = await db
    .prepare(
      `SELECT id, name, pillar_id, unlocked_at
       FROM achievements
       WHERE unlocked_at IS NOT NULL
         AND unlocked_at >= datetime('now', '-' || ? || ' days')
       ORDER BY unlocked_at DESC
       LIMIT 10`,
    )
    .bind(String(days))
    .all<AnalyticsAchievementRow>();
  return result.results ?? [];
}

/**
 * Lifetime totals across all pillars.
 */
export async function getLifetimeTotals(db: D1Database): Promise<LifetimeTotals> {
  const [xpRow, questsRow, daysRow, sinceRow] = await Promise.all([
    db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM xp_events`)
      .first<{ total: number }>(),
    db
      .prepare(`SELECT COUNT(*) as total FROM completions WHERE status = 'completed'`)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT date(completed_at)) as days FROM completions WHERE status = 'completed'`,
      )
      .first<{ days: number }>(),
    db
      .prepare(
        `SELECT MIN(first_quest_at) as since FROM lifetime_stats WHERE first_quest_at IS NOT NULL`,
      )
      .first<{ since: string | null }>(),
  ]);

  return {
    total_xp: xpRow?.total ?? 0,
    total_quests: questsRow?.total ?? 0,
    active_days: daysRow?.days ?? 0,
    hunter_since: sinceRow?.since ?? null,
  };
}

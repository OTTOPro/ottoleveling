/**
 * stats-analytics.ts - Hono sub-router for analytics endpoints.
 * Mounted at /api/stats (alongside the existing statsRouter for /pillars and /composite).
 * Hono matches more-specific routes first so existing paths are unaffected.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../index';
import * as analytics from '../lib/stats-analytics';
import { getStatDistribution, type StatType } from '../lib/stat-rewards';

export const statsAnalyticsRouter = new Hono<{ Bindings: Bindings }>();

const RangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * GET /api/stats/heatmap[?days=N]
 * Returns daily completion counts (status='completed') over the last N days (default 90).
 */
statsAnalyticsRouter.get('/heatmap', async (c) => {
  const parsed = RangeSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid days param' }, 400);
  const days = parsed.data.days ?? 90;
  const today = new Date().toISOString().slice(0, 10);
  const cells = await analytics.getDailyCompletionCounts(c.env.DB, today, days);
  return c.json({ cells, days, today });
});

/**
 * GET /api/stats/xp-series[?days=N]
 * Returns daily XP sums over the last N days (default 30).
 */
statsAnalyticsRouter.get('/xp-series', async (c) => {
  const parsed = RangeSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid days param' }, 400);
  const days = parsed.data.days ?? 30;
  const today = new Date().toISOString().slice(0, 10);
  const series = await analytics.getDailyXpSeries(c.env.DB, today, days);
  return c.json({ series, days, today });
});

/**
 * GET /api/stats/recent-achievements[?days=N]
 * Returns recently unlocked achievements (default 30 days), capped at 10.
 */
statsAnalyticsRouter.get('/recent-achievements', async (c) => {
  const parsed = RangeSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid days param' }, 400);
  const days = parsed.data.days ?? 30;
  const achievements = await analytics.getRecentAchievementsForStats(c.env.DB, days);
  return c.json({ achievements, days });
});

/**
 * GET /api/stats/lifetime
 * Returns lifetime totals: total_xp, total_quests, active_days, hunter_since.
 */
statsAnalyticsRouter.get('/lifetime', async (c) => {
  const totals = await analytics.getLifetimeTotals(c.env.DB);
  return c.json(totals);
});

/**
 * GET /api/stats/distribution
 *
 * Returns the cumulative SUM(stat_value) for all 8 Solo Leveling stat types.
 * Always returns all 8 entries (total=0 for types with no rows yet) so the
 * frontend can render the full radar polygon without gaps.
 */
statsAnalyticsRouter.get('/distribution', async (c) => {
  const rows = await getStatDistribution(c.env.DB);
  const allTypes: StatType[] = ['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT', 'FOCUS'];
  const lookup = new Map(rows.map((r) => [r.type, r.total]));
  const distribution = allTypes.map((t) => ({ type: t, total: lookup.get(t) ?? 0 }));
  return c.json({ distribution });
});

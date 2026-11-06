/**
 * statsAnalytics.svelte.ts - Singleton state store for /stats analytics data.
 * Fetches 5 endpoints in parallel: heatmap / xp-series / recent-achievements / lifetime / distribution.
 *
 * Includes the stat distribution for the radar.
 */
import {
  getStatsHeatmap,
  getStatsXpSeries,
  getStatsRecentAchievements,
  getStatsLifetime,
  getStatsDistribution,
} from '$lib/api/client';
import type {
  RecentAchievement,
  LifetimeTotalsResponse,
  HeatmapResponse,
  XpSeriesResponse,
  StatDistributionEntry,
} from '$lib/api/client';

class StatsAnalyticsState {
  heatmap = $state<HeatmapResponse | null>(null);
  xpSeries = $state<XpSeriesResponse | null>(null);
  recentAchievements = $state<RecentAchievement[]>([]);
  lifetime = $state<LifetimeTotalsResponse | null>(null);
  /** Stat distribution for the Radar chart. All 8 types always present. */
  distribution = $state<StatDistributionEntry[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(days = 30): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [heatmap, xpSeries, achResp, lifetime, distResp] = await Promise.all([
        getStatsHeatmap(Math.max(days, 90)), // heatmap always 90 days min
        getStatsXpSeries(days),
        getStatsRecentAchievements(days),
        getStatsLifetime(),
        getStatsDistribution(), // window-independent (all-time aggregate)
      ]);
      this.heatmap = heatmap;
      this.xpSeries = xpSeries;
      this.recentAchievements = achResp.achievements;
      this.lifetime = lifetime;
      this.distribution = distResp.distribution;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Compute weekly XP sum for the most recent 7 days from the xp series.
   */
  get thisWeekXp(): number {
    if (!this.xpSeries) return 0;
    const today = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local temporary used only to compute a cutoff string; never needs to be reactive
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 6);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return this.xpSeries.series
      .filter((p) => p.day >= cutoffStr && p.day <= today)
      .reduce((s, p) => s + p.xp, 0);
  }

  /**
   * Heatmap cells as a filled 91-cell array (13w × 7d).
   * Gaps are filled with 0.
   */
  get heatmapGrid(): number[] {
    if (!this.heatmap) return Array(91).fill(0);
    const map = new Map(this.heatmap.cells.map((c) => [c.day, c.count]));
    const grid: number[] = [];
    const today = new Date(this.heatmap.today + 'T00:00:00Z');
    for (let i = 90; i >= 0; i--) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local temporary used only to compute a date key; never needs to be reactive
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      grid.push(map.get(key) ?? 0);
    }
    return grid;
  }
}

export const statsAnalyticsState = new StatsAnalyticsState();

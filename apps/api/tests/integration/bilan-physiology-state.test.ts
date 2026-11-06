/**
 * getBilanStats physiology_state aggregate.
 *
 * Tests that the new physiologyState field in BilanStatsInput is correctly
 * computed from daily_metrics rows seeded in the period window.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getBilanStats } from '../../src/lib/d1-reads-bilan';

const PERIOD_START = '2026-05-18';
const PERIOD_END = '2026-05-24';

async function seedMetric(
  date: string,
  metric: 'hrv_rmssd' | 'sleep_minutes',
  value: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id) VALUES (?, 'google_health', ?, ?, 'body')`,
  )
    .bind(date, metric, value)
    .run();
}

describe('getBilanStats - physiologyState aggregate', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM daily_metrics`).run();
  });

  it('all physiology fields are null when no daily_metrics rows exist in window', async () => {
    const stats = await getBilanStats(env.DB, PERIOD_START, PERIOD_END);
    expect(stats.physiologyState.hrv_baseline_avg).toBeNull();
    expect(stats.physiologyState.hrv_period_avg).toBeNull();
    expect(stats.physiologyState.hrv_delta_pct).toBeNull();
    expect(stats.physiologyState.sleep_period_avg_min).toBeNull();
    expect(stats.physiologyState.worst_sleep_night_min).toBeNull();
  });

  it('hrv_period_avg + hrv_baseline_avg computed correctly when HRV rows seeded', async () => {
    // Seed 7 days of HRV @ 50ms in the period
    for (let i = 0; i < 7; i++) {
      const d = new Date(PERIOD_START + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      await seedMetric(d.toISOString().slice(0, 10), 'hrv_rmssd', 50);
    }
    const stats = await getBilanStats(env.DB, PERIOD_START, PERIOD_END);
    expect(stats.physiologyState.hrv_period_avg).toBeCloseTo(50, 1);
    expect(stats.physiologyState.hrv_baseline_avg).toBeCloseTo(50, 1);
    // Both aliases point to the same value
    expect(stats.physiologyState.hrv_period_avg).toBe(stats.physiologyState.hrv_baseline_avg);
  });

  it('sleep_period_avg_min + worst_sleep_night_min computed from seeded sleep rows', async () => {
    // Seed 3 nights: 480, 420, 300 → avg = 400, worst = 300
    await seedMetric('2026-05-18', 'sleep_minutes', 480);
    await seedMetric('2026-05-19', 'sleep_minutes', 420);
    await seedMetric('2026-05-20', 'sleep_minutes', 300);
    const stats = await getBilanStats(env.DB, PERIOD_START, PERIOD_END);
    expect(stats.physiologyState.sleep_period_avg_min).toBeCloseTo(400, 1);
    expect(stats.physiologyState.worst_sleep_night_min).toBe(300);
  });
});

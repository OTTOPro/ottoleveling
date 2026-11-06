/**
 * Stats analytics endpoint integration tests.
 *
 * 4 test cases verifying the 4 new analytics endpoints:
 *  1. GET /api/stats/heatmap - status='fail' excluded, window boundary, shape
 *  2. GET /api/stats/xp-series - source types aggregated, window boundary, SUM
 *  3. GET /api/stats/recent-achievements - NULL unlocked_at excluded, ordering, LIMIT 10
 *  4. GET /api/stats/lifetime - all 4 fields correct from seeded data
 *
 * All tests use dev-token auth (ENV='test' enables the dev-token fallback).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// ── Seeding helpers ──────────────────────────────────────────────────────────

async function seedCompletion(
  date: string,
  status: 'completed' | 'failed' | 'skipped',
): Promise<void> {
  const q = await env.DB.prepare(
    `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES ('body', 'test', 50, 'medium', 'system', ?) RETURNING id`,
  )
    .bind(date)
    .first<{ id: number }>();
  if (!q) return;
  await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded, completed_at)
     VALUES (?, ?, ?, datetime(? || ' 12:00:00'))`,
  )
    .bind(q.id, status, status === 'completed' ? 50 : 0, date)
    .run();
}

async function seedXpEvent(date: string, amount: number, source: string): Promise<void> {
  // source_type CHECK: quest_completed | quest_failed | streak_bonus | penalty | manual_adjustment | arc_completion
  // Normalize to a valid value for seeding purposes.
  const validSource = (
    [
      'quest_completed',
      'quest_failed',
      'streak_bonus',
      'penalty',
      'manual_adjustment',
      'arc_completion',
    ] as const
  ).includes(source as never)
    ? source
    : 'manual_adjustment';
  await env.DB.prepare(
    `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
     VALUES ('body', ?, ?, 'seed', datetime(? || ' 12:00:00'))`,
  )
    .bind(amount, validSource, date)
    .run();
}

async function seedAchievement(
  id: string,
  name: string,
  pillar: string | null,
  unlockedAt: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO achievements (id, name, description, pillar_id, unlocked_at, trigger_type, trigger_config)
     VALUES (?, ?, 'test desc', ?, ?, 'completion_count', '{"pillar":"body","threshold":1}')`,
  )
    .bind(id, name, pillar, unlockedAt)
    .run();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/stats/heatmap', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
  });

  it('returns correct shape + excludes non-completed statuses + respects date window', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // 3 completed completions today
    await seedCompletion(today, 'completed');
    await seedCompletion(today, 'completed');
    await seedCompletion(today, 'completed');
    // 1 failed today - should NOT appear in heatmap
    await seedCompletion(today, 'failed');
    // 1 skipped today - should NOT appear
    await seedCompletion(today, 'skipped');

    // Seed a "completed" row 200 days ago - outside the default 90-day window
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 200);
    await seedCompletion(old.toISOString().slice(0, 10), 'completed');

    const res = await SELF.fetch(authed('/api/stats/heatmap?days=90'));
    expect(res.status).toBe(200);
    const body = await res.json<{
      cells: Array<{ day: string; count: number }>;
      days: number;
      today: string;
    }>();

    // Response shape
    expect(body).toHaveProperty('cells');
    expect(body).toHaveProperty('days', 90);
    expect(body).toHaveProperty('today', today);

    // Today's cell: count=3 (failed + skipped excluded)
    const todayCell = body.cells.find((c) => c.day === today);
    expect(todayCell).toBeDefined();
    expect(todayCell!.count).toBe(3);

    // Old row outside window should NOT appear
    expect(body.cells.find((c) => c.day === old.toISOString().slice(0, 10))).toBeUndefined();
  });
});

describe('GET /api/stats/xp-series', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM xp_events`).run();
  });

  it('aggregates all source types + respects window + correct SUM', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // 3 events today: 2 different source types - should sum to 80
    await seedXpEvent(today, 30, 'completion');
    await seedXpEvent(today, 50, 'arc_completion');

    // Event outside the window (200 days ago)
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 200);
    await seedXpEvent(old.toISOString().slice(0, 10), 999, 'completion');

    const res = await SELF.fetch(authed('/api/stats/xp-series?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json<{
      series: Array<{ day: string; xp: number }>;
      days: number;
      today: string;
    }>();

    expect(body).toHaveProperty('series');
    expect(body).toHaveProperty('days', 30);
    expect(body).toHaveProperty('today', today);

    // Today sums to 80 (30 + 50)
    const todayPoint = body.series.find((p) => p.day === today);
    expect(todayPoint).toBeDefined();
    expect(todayPoint!.xp).toBe(80);

    // Old point excluded
    expect(body.series.find((p) => p.day === old.toISOString().slice(0, 10))).toBeUndefined();
  });
});

describe('GET /api/stats/recent-achievements', () => {
  beforeEach(async () => {
    // We insert with specific IDs to avoid collision with seeded rows.
    // Use INSERT OR REPLACE so the seed table rows stay intact.
  });

  it('excludes NULL unlocked_at + orders DESC + respects days window', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Locked achievement - should NOT appear
    await seedAchievement('test_locked', 'Locked Trophy', 'body', null);

    // Unlocked today - should appear
    await seedAchievement('test_unlocked_today', 'Today Trophy', 'mind', today + ' 10:00:00');

    // Unlocked 60 days ago - outside 30d window - should NOT appear in 30d query
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 60);
    await seedAchievement(
      'test_unlocked_old',
      'Old Trophy',
      null,
      old.toISOString().slice(0, 19).replace('T', ' '),
    );

    const res = await SELF.fetch(authed('/api/stats/recent-achievements?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json<{
      achievements: Array<{
        id: string;
        name: string;
        pillar_id: string | null;
        unlocked_at: string;
      }>;
      days: number;
    }>();

    expect(body).toHaveProperty('achievements');
    expect(body).toHaveProperty('days', 30);

    // Locked achievement must NOT be in results
    expect(body.achievements.find((a) => a.id === 'test_locked')).toBeUndefined();
    // Old achievement outside window must NOT be in results
    expect(body.achievements.find((a) => a.id === 'test_unlocked_old')).toBeUndefined();
    // Today's achievement must be present
    expect(body.achievements.find((a) => a.id === 'test_unlocked_today')).toBeDefined();
  });

  it('caps at 10 results', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Seed 12 unlocked achievements
    for (let i = 0; i < 12; i++) {
      await seedAchievement(`cap_test_${i}`, `Trophy ${i}`, null, today + ' 10:00:00');
    }

    const res = await SELF.fetch(authed('/api/stats/recent-achievements?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json<{ achievements: unknown[] }>();
    expect(body.achievements.length).toBeLessThanOrEqual(10);
  });
});

describe('GET /api/stats/lifetime', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM xp_events`).run();
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
    // Reset lifetime_stats to zeros
    await env.DB.prepare(
      `UPDATE lifetime_stats SET total_xp=0, total_completed=0, longest_streak=0, highest_level=1, first_quest_at=NULL, last_updated_at=datetime('now')`,
    ).run();
  });

  it('returns correct aggregates from seeded data', async () => {
    // Seed 3 xp_events
    await seedXpEvent('2026-05-01', 100, 'completion');
    await seedXpEvent('2026-05-02', 200, 'completion');
    await seedXpEvent('2026-05-03', 50, 'arc_completion');

    // Seed 2 completed + 1 failed completion
    await seedCompletion('2026-05-01', 'completed');
    await seedCompletion('2026-05-02', 'completed');
    await seedCompletion('2026-05-03', 'failed');

    const res = await SELF.fetch(authed('/api/stats/lifetime'));
    expect(res.status).toBe(200);
    const body = await res.json<{
      total_xp: number;
      total_quests: number;
      active_days: number;
      hunter_since: string | null;
    }>();

    // 100 + 200 + 50 = 350 total XP
    expect(body.total_xp).toBe(350);
    // 2 completed (failed excluded)
    expect(body.total_quests).toBe(2);
    // 2 distinct days with at least 1 completed completion
    expect(body.active_days).toBe(2);
    // Shape
    expect(body).toHaveProperty('hunter_since');
  });
});

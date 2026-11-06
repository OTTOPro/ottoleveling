/**
 * GET /api/stats/distribution integration tests.
 * Verifies: all-8-types response, GROUP BY sums, FOCUS included.
 */
import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const HEADERS = { 'x-dev-token': 'integration-test-token-deadbeef' };

async function seedCompletion(questId: number, status = 'completed'): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, ?, 50) RETURNING id`,
  )
    .bind(questId, status)
    .first<{ id: number }>();
  if (!row) throw new Error('completion insert failed');
  return row.id;
}

async function seedQuest(id: number, pillarId = 'body'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES (?, ?, 'Q', 50, 'medium', 'system', '2026-06-01')`,
  )
    .bind(id, pillarId)
    .run();
}

describe('GET /api/stats/distribution', () => {
  it('empty stat_rewards table → response has 8 entries all with total=0', async () => {
    const res = await SELF.fetch('https://x.test/api/stats/distribution', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { distribution: Array<{ type: string; total: number }> };
    expect(body.distribution).toHaveLength(8);
    const allZero = body.distribution.every((d) => d.total === 0);
    expect(allZero).toBe(true);
    const types = body.distribution.map((d) => d.type).sort();
    expect(types).toEqual(['CAP', 'CRAFT', 'END', 'FLEX', 'FOCUS', 'INT', 'STR', 'WIS']);
  });

  it('mixed data: sums aggregate correctly, remaining types stay 0', async () => {
    await seedQuest(8001);
    await seedQuest(8002);
    await seedQuest(8003);
    const c1 = await seedCompletion(8001);
    const c2 = await seedCompletion(8002);
    const c3 = await seedCompletion(8003);

    const AWARDED = '2026-06-01T08:00:00Z';
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'END', 2, ?)`,
    )
      .bind(c1, AWARDED)
      .run();
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'END', 1, ?)`,
    )
      .bind(c2, AWARDED)
      .run();
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'INT', 3, ?)`,
    )
      .bind(c3, AWARDED)
      .run();

    const res = await SELF.fetch('https://x.test/api/stats/distribution', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { distribution: Array<{ type: string; total: number }> };
    expect(body.distribution).toHaveLength(8);

    const endEntry = body.distribution.find((d) => d.type === 'END')!;
    expect(endEntry.total).toBe(3); // 2 + 1

    const intEntry = body.distribution.find((d) => d.type === 'INT')!;
    expect(intEntry.total).toBe(3);

    // All other 6 types should be 0
    const others = body.distribution.filter((d) => d.type !== 'END' && d.type !== 'INT');
    expect(others.every((d) => d.total === 0)).toBe(true);
  });

  it('FOCUS rows appear in distribution with correct sum', async () => {
    // Seed 3 quests + completions for day 1
    await seedQuest(8010, 'body');
    await seedQuest(8011, 'mind');
    await seedQuest(8012, 'finance');
    const c1 = await seedCompletion(8010);
    await seedCompletion(8011);

    // Seed 2 separate quests for day 2 FOCUS
    await seedQuest(8013, 'projects');
    const c3 = await seedCompletion(8013);

    const AWARDED1 = '2026-06-01T08:00:00Z';
    const AWARDED2 = '2026-05-31T08:00:00Z';
    // Two FOCUS rows on different completions
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'FOCUS', 1, ?)`,
    )
      .bind(c1, AWARDED1)
      .run();
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'FOCUS', 1, ?)`,
    )
      .bind(c3, AWARDED2)
      .run();

    const res = await SELF.fetch('https://x.test/api/stats/distribution', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { distribution: Array<{ type: string; total: number }> };

    const focusEntry = body.distribution.find((d) => d.type === 'FOCUS')!;
    expect(focusEntry.total).toBe(2);
  });
});

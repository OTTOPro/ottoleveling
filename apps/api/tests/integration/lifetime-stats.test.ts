import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { recomputeLifetimeStats, getLifetimeStats } from '../../src/lib/lifetime-stats';

/**
 * Seed multi-month fixture: 4 body-pillar completed days in a row (Jan
 * 5/6/7/8), 1 body fail (Jan 9), 1 body skipped (Jan 10), 1 standalone body
 * completion (Jan 15), and a separate mind-pillar completion (Feb 1).
 * Asserts deterministic totals + longest streak (4 for body) + first_quest_at
 * (2026-01-05 for body, 2026-02-01 for mind) + skips-not-counted semantics.
 */
async function seedFixture(): Promise<void> {
  const insertQuest = async (id: number, pillar: string, date: string) => {
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (?, ?, ?, 50, 'medium', 'system', ?)`,
    )
      .bind(id, pillar, `q${id}`, date)
      .run();
  };
  const insertCompletion = async (
    questId: number,
    status: 'completed' | 'failed' | 'skipped',
    xp: number,
  ) => {
    await env.DB.prepare(`INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, ?, ?)`)
      .bind(questId, status, xp)
      .run();
  };
  const insertXpEvent = async (
    pillar: string,
    amount: number,
    sourceType: string,
    occurredAt: string,
  ) => {
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES (?, ?, ?, 'seeded', ?)`,
    )
      .bind(pillar, amount, sourceType, occurredAt)
      .run();
  };

  // body: 4 consecutive completed days + 1 fail + 1 skipped + 1 standalone gap
  await insertQuest(1, 'body', '2026-01-05');
  await insertCompletion(1, 'completed', 50);
  await insertXpEvent('body', 50, 'quest_completed', '2026-01-05T08:00:00Z');
  await insertQuest(2, 'body', '2026-01-06');
  await insertCompletion(2, 'completed', 50);
  await insertXpEvent('body', 50, 'quest_completed', '2026-01-06T08:00:00Z');
  await insertQuest(3, 'body', '2026-01-07');
  await insertCompletion(3, 'completed', 50);
  await insertXpEvent('body', 50, 'quest_completed', '2026-01-07T08:00:00Z');
  await insertQuest(4, 'body', '2026-01-08');
  await insertCompletion(4, 'completed', 50);
  await insertXpEvent('body', 50, 'quest_completed', '2026-01-08T08:00:00Z');
  await insertQuest(5, 'body', '2026-01-09');
  await insertCompletion(5, 'failed', 0);
  await insertQuest(6, 'body', '2026-01-10');
  await insertCompletion(6, 'skipped', 0);
  await insertQuest(7, 'body', '2026-01-15');
  await insertCompletion(7, 'completed', 50);
  await insertXpEvent('body', 50, 'quest_completed', '2026-01-15T08:00:00Z');

  // mind: 1 completed in Feb (later first_quest_at)
  await insertQuest(8, 'mind', '2026-02-01');
  await insertCompletion(8, 'completed', 50);
  await insertXpEvent('mind', 50, 'quest_completed', '2026-02-01T08:00:00Z');
}

describe('recomputeLifetimeStats', () => {
  it('seeds 4 zero rows post-migration, recompute deterministically derives correct values', async () => {
    await seedFixture();
    const after = await recomputeLifetimeStats(env.DB);
    const body = after.find((r) => r.pillar_id === 'body')!;
    const mind = after.find((r) => r.pillar_id === 'mind')!;
    const finance = after.find((r) => r.pillar_id === 'finance')!;
    const projects = after.find((r) => r.pillar_id === 'projects')!;

    // body: 5 completed (1-4 + 7), 1 failed (5), skipped (6) NOT counted
    expect(body.total_completed).toBe(5);
    expect(body.total_failed).toBe(1);
    expect(body.total_xp).toBe(250); // 5 × 50
    expect(body.longest_streak).toBe(4); // 1/5,1/6,1/7,1/8
    expect(body.first_quest_at).toBe('2026-01-05');
    expect(body.highest_level).toBe(1); // sqrt(250/100) = 1.58 → 1

    // mind: just 1 completed
    expect(mind.total_completed).toBe(1);
    expect(mind.total_failed).toBe(0);
    expect(mind.total_xp).toBe(50);
    expect(mind.longest_streak).toBe(1);
    expect(mind.first_quest_at).toBe('2026-02-01');
    expect(mind.highest_level).toBe(0);

    // finance + projects: zero rows preserved
    expect(finance.total_completed).toBe(0);
    expect(finance.first_quest_at).toBeNull();
    expect(projects.total_completed).toBe(0);
    expect(projects.first_quest_at).toBeNull();
  });

  it('is idempotent: double-call produces identical row state (modulo last_updated_at)', async () => {
    await seedFixture();
    const first = await recomputeLifetimeStats(env.DB);
    const second = await recomputeLifetimeStats(env.DB);
    for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
      const a = first.find((r) => r.pillar_id === p)!;
      const b = second.find((r) => r.pillar_id === p)!;
      expect(b.total_xp).toBe(a.total_xp);
      expect(b.total_completed).toBe(a.total_completed);
      expect(b.total_failed).toBe(a.total_failed);
      expect(b.longest_streak).toBe(a.longest_streak);
      expect(b.highest_level).toBe(a.highest_level);
      expect(b.first_quest_at).toBe(a.first_quest_at);
    }
  });

  it('works correctly on empty data (post-reset case): 4 zero rows', async () => {
    const after = await recomputeLifetimeStats(env.DB);
    expect(after).toHaveLength(4);
    for (const r of after) {
      expect(r.total_xp).toBe(0);
      expect(r.total_completed).toBe(0);
      expect(r.total_failed).toBe(0);
      expect(r.longest_streak).toBe(0);
      expect(r.highest_level).toBe(0);
      expect(r.first_quest_at).toBeNull();
    }
  });

  it('getLifetimeStats reads the 4 pre-seeded zero rows directly without recompute', async () => {
    const rows = await getLifetimeStats(env.DB);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.pillar_id).sort()).toEqual(['body', 'finance', 'mind', 'projects']);
  });
});

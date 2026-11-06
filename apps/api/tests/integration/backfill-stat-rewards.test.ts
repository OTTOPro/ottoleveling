/**
 * POST /api/admin/backfill-stat-rewards integration tests.
 * Covers: idempotency (running twice no duplicates), dry_run (no INSERT).
 */
import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';

const HEADERS = {
  'x-dev-token': 'integration-test-token-deadbeef',
  'content-type': 'application/json',
};

// Seed helper: insert a quest + completion, return completion id
async function seedCompletedQuest(opts: {
  questId: number;
  pillarId?: string;
  completedAt?: string;
}): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES (?, ?, 'Core stability circuit (dead bugs)', 50, 'medium', 'system', '2026-05-01')`,
  )
    .bind(opts.questId, opts.pillarId ?? 'body')
    .run();
  const row = await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded, completed_at) VALUES (?, 'completed', 50, ?) RETURNING id`,
  )
    .bind(opts.questId, opts.completedAt ?? '2026-05-01T08:00:00Z')
    .first<{ id: number }>();
  if (!row) throw new Error('completion insert failed');
  return row.id;
}

describe('POST /api/admin/backfill-stat-rewards', () => {
  it('backfill is idempotent - running twice does not duplicate rewards', async () => {
    // Seed 3 historical completions
    await seedCompletedQuest({
      questId: 7001,
      pillarId: 'body',
      completedAt: '2026-05-01T08:00:00Z',
    });
    await seedCompletedQuest({
      questId: 7002,
      pillarId: 'mind',
      completedAt: '2026-05-02T08:00:00Z',
    });
    await seedCompletedQuest({
      questId: 7003,
      pillarId: 'finance',
      completedAt: '2026-05-03T08:00:00Z',
    });

    // LLM fixture: 3 entries (will be returned for both calls; second call won't reach LLM)
    const fixture1 = JSON.stringify([
      {
        completion_id: await env.DB.prepare(`SELECT id FROM completions WHERE quest_id = 7001`)
          .first<{ id: number }>()
          .then((r) => r!.id),
        stats: [{ type: 'END', value: 1 }],
      },
      {
        completion_id: await env.DB.prepare(`SELECT id FROM completions WHERE quest_id = 7002`)
          .first<{ id: number }>()
          .then((r) => r!.id),
        stats: [{ type: 'INT', value: 2 }],
      },
      {
        completion_id: await env.DB.prepare(`SELECT id FROM completions WHERE quest_id = 7003`)
          .first<{ id: number }>()
          .then((r) => r!.id),
        stats: [{ type: 'CAP', value: 1 }],
      },
    ]);
    MockProvider.setFixture(fixture1);

    const r1 = await SELF.fetch('https://x.test/api/admin/backfill-stat-rewards', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ batch_size: 20 }),
    });
    expect(r1.status).toBe(200);
    const body1 = (await r1.json()) as { processed: number; has_more: boolean };
    expect(body1.processed).toBe(3);
    expect(body1.has_more).toBe(false);

    const countAfterFirst = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type != 'FOCUS'`,
    ).first<{ n: number }>();
    expect(countAfterFirst?.n).toBe(3);

    // Second call - already backfilled → no rows in batch → no LLM call, 0 processed
    // MockProvider has no fixture for a second call, but it won't be called since 0 rows match
    MockProvider.reset(); // clear fixture so any accidental LLM call would throw

    const r2 = await SELF.fetch('https://x.test/api/admin/backfill-stat-rewards', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ batch_size: 20 }),
    });
    expect(r2.status).toBe(200);
    const body2 = (await r2.json()) as { processed: number; has_more: boolean; message?: string };
    expect(body2.processed).toBe(0);
    expect(body2.has_more).toBe(false);

    // Total rewards unchanged
    const countAfterSecond = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type != 'FOCUS'`,
    ).first<{ n: number }>();
    expect(countAfterSecond?.n).toBe(3);
  });

  it('dry_run=true does not INSERT any stat_rewards', async () => {
    await seedCompletedQuest({
      questId: 7010,
      pillarId: 'projects',
      completedAt: '2026-05-10T08:00:00Z',
    });
    const cid = await env.DB.prepare(`SELECT id FROM completions WHERE quest_id = 7010`)
      .first<{ id: number }>()
      .then((r) => r!.id);

    MockProvider.setFixture(
      JSON.stringify([{ completion_id: cid, stats: [{ type: 'CRAFT', value: 2 }] }]),
    );

    const r = await SELF.fetch('https://x.test/api/admin/backfill-stat-rewards', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ batch_size: 20, dry_run: true }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { processed: number; dry_run: boolean; preview: unknown };
    expect(body.dry_run).toBe(true);
    expect(body.processed).toBe(0);

    // No rows should have been inserted
    const count = await env.DB.prepare(`SELECT COUNT(*) as n FROM stat_rewards`).first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });
});

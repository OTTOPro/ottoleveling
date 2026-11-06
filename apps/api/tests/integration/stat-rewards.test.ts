/**
 * stat_rewards integration tests.
 * Covers: schema verification, insertStatRewards, maybeAwardFocus, and
 * SystemAgent.recordCompletion extension (stats from quest metadata + FOCUS).
 */
import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { insertStatRewards, maybeAwardFocus } from '../../src/lib/stat-rewards';

const TODAY = '2026-06-01';
const AWARDED_AT = `${TODAY}T08:00:00.000Z`;

// Helper: seed a quest row, returns its id.
async function seedQuest(opts: {
  id?: number;
  pillarId?: string;
  scheduledFor?: string;
  metadata?: string | null;
}): Promise<number> {
  const id = opts.id ?? Math.floor(Math.random() * 900000 + 100000);
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for, metadata)
     VALUES (?, ?, 'Test Quest', 50, 'medium', 'system', ?, ?)`,
  )
    .bind(id, opts.pillarId ?? 'body', opts.scheduledFor ?? TODAY, opts.metadata ?? null)
    .run();
  return id;
}

// Helper: seed a completion for a quest, returns the completion id.
async function seedCompletion(
  questId: number,
  status = 'completed',
  completedAt = AWARDED_AT,
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded, completed_at)
     VALUES (?, ?, 50, ?) RETURNING id`,
  )
    .bind(questId, status, completedAt)
    .first<{ id: number }>();
  if (!row) throw new Error('completion insert failed');
  return row.id;
}

describe('stat_rewards schema', () => {
  it('stat_rewards table exists with 8-type CHECK constraint', async () => {
    // Valid INSERT should work
    const q1 = await seedQuest({ id: 9001 });
    const c1 = await seedCompletion(q1);
    await env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, 'END', 1, ?)`,
    )
      .bind(c1, AWARDED_AT)
      .run();

    const row = await env.DB.prepare(
      `SELECT stat_type, stat_value FROM stat_rewards WHERE completion_id = ?`,
    )
      .bind(c1)
      .first<{ stat_type: string; stat_value: number }>();
    expect(row?.stat_type).toBe('END');
    expect(row?.stat_value).toBe(1);
  });

  it('all 8 stat_type values (including FOCUS) are valid', async () => {
    const q = await seedQuest({ id: 9002 });
    const c = await seedCompletion(q);
    const types = ['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT', 'FOCUS'];
    for (const t of types) {
      await expect(
        env.DB.prepare(
          `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at) VALUES (?, ?, 1, ?)`,
        )
          .bind(c, t, AWARDED_AT)
          .run(),
      ).resolves.not.toThrow();
    }
    const { results } = await env.DB.prepare(
      `SELECT stat_type FROM stat_rewards WHERE completion_id = ? ORDER BY stat_type`,
    )
      .bind(c)
      .all<{ stat_type: string }>();
    expect(results.map((r) => r.stat_type).sort()).toEqual(types.sort());
  });

  it('stat_rewards table has 3 indexes', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='stat_rewards' AND name LIKE 'idx_%'`,
    ).all<{ name: string }>();
    expect(results.length).toBe(3);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual([
      'idx_stat_rewards_awarded',
      'idx_stat_rewards_completion',
      'idx_stat_rewards_type',
    ]);
  });
});

describe('insertStatRewards', () => {
  it('inserts 3 rewards atomically', async () => {
    const q = await seedQuest({ id: 9010 });
    const c = await seedCompletion(q);
    await insertStatRewards(
      env.DB,
      c,
      [
        { type: 'END', value: 1 },
        { type: 'STR', value: 2 },
        { type: 'FLEX', value: 3 },
      ],
      AWARDED_AT,
    );
    const { results } = await env.DB.prepare(
      `SELECT stat_type, stat_value FROM stat_rewards WHERE completion_id = ? ORDER BY stat_type`,
    )
      .bind(c)
      .all<{ stat_type: string; stat_value: number }>();
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.stat_type === 'END')?.stat_value).toBe(1);
    expect(results.find((r) => r.stat_type === 'STR')?.stat_value).toBe(2);
    expect(results.find((r) => r.stat_type === 'FLEX')?.stat_value).toBe(3);
  });

  it('no-op with empty array', async () => {
    const q = await seedQuest({ id: 9011 });
    const c = await seedCompletion(q);
    await insertStatRewards(env.DB, c, [], AWARDED_AT);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE completion_id = ?`,
    )
      .bind(c)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

describe('maybeAwardFocus', () => {
  it('1 pillar today → returns false, no INSERT', async () => {
    const q = await seedQuest({ id: 9020, pillarId: 'body' });
    const c = await seedCompletion(q);
    const result = await maybeAwardFocus(env.DB, c, TODAY, AWARDED_AT);
    expect(result).toBe(false);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type = 'FOCUS'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('2 pillars today → returns false', async () => {
    const q1 = await seedQuest({ id: 9030, pillarId: 'body' });
    await seedCompletion(q1);
    const q2 = await seedQuest({ id: 9031, pillarId: 'mind' });
    const c2 = await seedCompletion(q2);
    const result = await maybeAwardFocus(env.DB, c2, TODAY, AWARDED_AT);
    expect(result).toBe(false);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type = 'FOCUS'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('3 pillars today, first trigger → returns true, 1 INSERT', async () => {
    const q1 = await seedQuest({ id: 9040, pillarId: 'body' });
    const c1 = await seedCompletion(q1);
    const q2 = await seedQuest({ id: 9041, pillarId: 'mind' });
    await seedCompletion(q2);
    const q3 = await seedQuest({ id: 9042, pillarId: 'finance' });
    const c3 = await seedCompletion(q3);
    const result = await maybeAwardFocus(env.DB, c3, TODAY, AWARDED_AT);
    expect(result).toBe(true);
    const row = await env.DB.prepare(
      `SELECT stat_type, stat_value, completion_id FROM stat_rewards WHERE stat_type = 'FOCUS'`,
    ).first<{ stat_type: string; stat_value: number; completion_id: number }>();
    expect(row?.stat_type).toBe('FOCUS');
    expect(row?.stat_value).toBe(1);
    expect(row?.completion_id).toBe(c3);
    // Idempotency: second call same day → false, no second INSERT
    const result2 = await maybeAwardFocus(env.DB, c1, TODAY, AWARDED_AT);
    expect(result2).toBe(false);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type = 'FOCUS'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('3 pillars yesterday + 3 today → 2 FOCUS rows (one per day)', async () => {
    const YESTERDAY = '2026-05-31';
    const YESTERDAY_AT = `${YESTERDAY}T08:00:00.000Z`;
    // Yesterday completions
    const yq1 = await seedQuest({ id: 9050, pillarId: 'body', scheduledFor: YESTERDAY });
    await seedCompletion(yq1, 'completed', YESTERDAY_AT);
    const yq2 = await seedQuest({ id: 9051, pillarId: 'mind', scheduledFor: YESTERDAY });
    await seedCompletion(yq2, 'completed', YESTERDAY_AT);
    const yq3 = await seedQuest({ id: 9052, pillarId: 'finance', scheduledFor: YESTERDAY });
    const yc3 = await seedCompletion(yq3, 'completed', YESTERDAY_AT);
    // Today completions
    const tq1 = await seedQuest({ id: 9053, pillarId: 'body' });
    await seedCompletion(tq1, 'completed', AWARDED_AT);
    const tq2 = await seedQuest({ id: 9054, pillarId: 'mind' });
    await seedCompletion(tq2, 'completed', AWARDED_AT);
    const tq3 = await seedQuest({ id: 9055, pillarId: 'projects' });
    const tc3 = await seedCompletion(tq3, 'completed', AWARDED_AT);

    const r1 = await maybeAwardFocus(env.DB, yc3, YESTERDAY, YESTERDAY_AT);
    expect(r1).toBe(true);
    const r2 = await maybeAwardFocus(env.DB, tc3, TODAY, AWARDED_AT);
    expect(r2).toBe(true);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type = 'FOCUS'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(2);
  });
});

describe('SystemAgent.recordCompletion with stat rewards', () => {
  it('quest with metadata._stats inserts stat_rewards rows on complete', async () => {
    const statsJson = JSON.stringify({
      _stats: [
        { type: 'INT', value: 2 },
        { type: 'WIS', value: 1 },
      ],
    });
    const q = await seedQuest({ id: 9060, pillarId: 'mind', metadata: statsJson });

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(q, 'complete', null);
    });

    const { results } = await env.DB.prepare(
      `SELECT stat_type, stat_value FROM stat_rewards WHERE stat_type != 'FOCUS' ORDER BY stat_type`,
    ).all<{ stat_type: string; stat_value: number }>();
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.find((r) => r.stat_type === 'INT')?.stat_value).toBe(2);
    expect(results.find((r) => r.stat_type === 'WIS')?.stat_value).toBe(1);
  });

  it('quest with NO metadata._stats produces no stat_rewards INSERTs (graceful)', async () => {
    const q = await seedQuest({ id: 9070, pillarId: 'body', metadata: null });

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(q, 'complete', null);
    });

    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type != 'FOCUS'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('failed/skipped status does NOT produce stat_rewards INSERTs', async () => {
    const statsJson = JSON.stringify({ _stats: [{ type: 'END', value: 1 }] });
    const q1 = await seedQuest({ id: 9080, pillarId: 'body', metadata: statsJson });
    const q2 = await seedQuest({ id: 9081, pillarId: 'body', metadata: statsJson });

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
      };
      await agent.recordCompletion(q1, 'fail', null);
      await agent.recordCompletion(q2, 'skip', null);
    });

    const count = await env.DB.prepare(`SELECT COUNT(*) as n FROM stat_rewards`).first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });
});

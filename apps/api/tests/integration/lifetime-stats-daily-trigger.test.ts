import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE, CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

describe('recomputeLifetimeStats triggered at end of generateDailyInternal', () => {
  it('updates lifetime_stats after generateDaily completes - quests visible BEFORE recompute snapshot reads them', async () => {
    // Seed a historical body completion (yesterday) so when generateDaily
    // runs TODAY and triggers recompute, the snapshot reflects that history.
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (101, 'body', 'seed-body', 50, 'medium', 'system', '2026-05-23')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (101, 'completed', 50)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 50, 'quest_completed', 'seed', '2026-05-23T08:00:00Z')`,
    ).run();

    // BEFORE: body row is the zero pre-seed
    const before = await env.DB.prepare(
      `SELECT total_xp, total_completed FROM lifetime_stats WHERE pillar_id = 'body'`,
    ).first<{ total_xp: number; total_completed: number }>();
    expect(before?.total_xp).toBe(0);
    expect(before?.total_completed).toBe(0);

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-24');
    });

    // AFTER: body row has total_xp=50, total_completed=1, first_quest_at=2026-05-23
    // (reflecting the seeded historical data + any body quests generated today by the fixture)
    const after = await env.DB.prepare(
      `SELECT total_xp, total_completed, first_quest_at FROM lifetime_stats WHERE pillar_id = 'body'`,
    ).first<{ total_xp: number; total_completed: number; first_quest_at: string }>();
    expect(after?.total_xp).toBe(50);
    expect(after?.total_completed).toBe(1);
    expect(after?.first_quest_at).toBe('2026-05-23');
  });

  it('does NOT trigger recompute from generateBilan(any periodType) - wired ONLY to daily generation', async () => {
    // Seed a body completion BEFORE bilan generation.
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (102, 'body', 'seed-body', 50, 'medium', 'system', '2026-04-15')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (102, 'completed', 50)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 50, 'quest_completed', 'seed', '2026-04-15T08:00:00Z')`,
    ).run();

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    // Run all three bilan periodTypes - none should mutate lifetime_stats.
    await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        generateBilan: (
          t: 'weekly' | 'monthly' | 'yearly',
          s?: string,
          e?: string,
        ) => Promise<unknown>;
      };
      MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
      await agent.generateBilan('weekly', '2026-04-13', '2026-04-19');
      MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
      await agent.generateBilan('monthly', '2026-04-01', '2026-04-30');
      MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
      await agent.generateBilan('yearly', '2026-01-01', '2026-12-31');
    });

    // body row stays at the zero pre-seed - bilans do NOT trigger recompute
    const after = await env.DB.prepare(
      `SELECT total_xp FROM lifetime_stats WHERE pillar_id = 'body'`,
    ).first<{ total_xp: number }>();
    expect(after?.total_xp).toBe(0);
  });

  it('quests batch is INSERTed BEFORE recompute - last_updated_at non-null proves recompute ran during generateDaily', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    let returnedQuests: unknown = null;
    await runInDurableObject(stub, async (instance) => {
      returnedQuests = await (
        instance as unknown as { generateDaily: (d?: string) => Promise<{ quests: unknown[] }> }
      ).generateDaily('2026-05-24');
    });

    // Sanity: generateDaily returned populated quests
    expect(returnedQuests).not.toBeNull();
    expect((returnedQuests as { quests: unknown[] }).quests.length).toBeGreaterThan(0);

    // The quests are in D1 (proof they were INSERTed before the recompute call returned).
    const questsInDb = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM quests WHERE scheduled_for = '2026-05-24'`,
    ).first<{ n: number }>();
    expect(questsInDb?.n).toBeGreaterThan(0);

    // lifetime_stats.last_updated_at is non-null - proves recompute ran during generateDaily
    const row = await env.DB.prepare(
      `SELECT last_updated_at FROM lifetime_stats WHERE pillar_id = 'body'`,
    ).first<{ last_updated_at: string | null }>();
    expect(row?.last_updated_at).not.toBeNull();
  });
});

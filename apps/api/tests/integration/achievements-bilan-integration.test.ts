import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

type GenerateBilanFn = (
  periodType: 'weekly' | 'monthly' | 'yearly',
  periodStartOverride?: string,
  periodEndOverride?: string,
) => Promise<{ id: number }>;

/**
 * Build a full BilanStatsInput-shaped JSON string suitable for INSERT INTO bilans.
 * Must include all required fields the consumers (getPreviousBilan, evaluator)
 * read - completion_rate (bilan_streak trigger), byPillar / streaks
 * (pillarPatternDataFromStats), and the rest of BilanStatsInput.
 */
function bilanStatsJson(completionRate: number): string {
  const pillarStats = {
    xp: 50,
    completed: 8,
    failed: 1,
    skipped: 1,
    assigned: 10,
    rate: completionRate,
  };
  const streakRow = { current: 1, longest_in_period: 1 };
  return JSON.stringify({
    // Top-level completion_rate mirrors the production storage shape (see
    // generateBilan's statsForStorage). Required by bilan_streak evaluator.
    completion_rate: completionRate,
    global: {
      total_xp: 200,
      total_quests: 40,
      completed: Math.round(40 * completionRate),
      failed: 4,
      skipped: 4,
      completion_rate: completionRate,
    },
    byPillar: {
      body: pillarStats,
      mind: pillarStats,
      finance: pillarStats,
      projects: pillarStats,
    },
    streaks: {
      body: streakRow,
      mind: streakRow,
      finance: streakRow,
      projects: streakRow,
    },
    objectivesProgress: [],
    templatesProgress: [],
    checkinsSummary: { count: 0, avgEnergy: null, avgMood: null },
  });
}

describe('generateBilan → evaluateOnBilan integration', () => {
  // setup-d1.ts does NOT wipe bilans - bring our own per-test wipe.
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM bilans').run();
  });

  it('fires transversal_self_reflective_4 after the 4th consecutive weekly bilan with completion_rate >= 0.7', async () => {
    const stats = bilanStatsJson(0.8);
    await env.DB.prepare(
      `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative) VALUES
       ('weekly', '2026-04-06', '2026-04-12', ?, 'a'),
       ('weekly', '2026-04-13', '2026-04-19', ?, 'b'),
       ('weekly', '2026-04-20', '2026-04-26', ?, 'c')`,
    )
      .bind(stats, stats, stats)
      .run();

    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { generateBilan: GenerateBilanFn }).generateBilan(
        'weekly',
        '2026-04-27',
        '2026-05-03',
      );
    });

    const row = await env.DB.prepare(
      `SELECT unlocked_at FROM achievements WHERE id = 'transversal_self_reflective_4'`,
    ).first<{ unlocked_at: string | null }>();
    expect(row?.unlocked_at).not.toBeNull();
  });

  it('does NOT fire on the 3rd bilan (one short of threshold)', async () => {
    const stats = bilanStatsJson(0.8);
    await env.DB.prepare(
      `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative) VALUES
       ('weekly', '2026-04-13', '2026-04-19', ?, 'a'),
       ('weekly', '2026-04-20', '2026-04-26', ?, 'b')`,
    )
      .bind(stats, stats)
      .run();

    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { generateBilan: GenerateBilanFn }).generateBilan(
        'weekly',
        '2026-04-27',
        '2026-05-03',
      );
    });

    const row = await env.DB.prepare(
      `SELECT unlocked_at FROM achievements WHERE id = 'transversal_self_reflective_4'`,
    ).first<{ unlocked_at: string | null }>();
    expect(row?.unlocked_at).toBeNull();
  });

  it('a corrupted trigger_config does NOT void the bilan', async () => {
    await env.DB.prepare(
      `UPDATE achievements SET trigger_config = 'not-json' WHERE id = 'transversal_self_reflective_4'`,
    ).run();
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    let result: { id: number } | undefined;
    await runInDurableObject(stub, async (instance) => {
      result = await (instance as unknown as { generateBilan: GenerateBilanFn }).generateBilan(
        'weekly',
        '2026-04-27',
        '2026-05-03',
      );
    });
    expect(result?.id).toBeGreaterThan(0);
  });
});

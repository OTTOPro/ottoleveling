import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

function getAgent() {
  return env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
}

async function seedQuest(
  pillar: 'body' | 'mind' | 'finance' | 'projects',
  date: string,
  status: 'completed' | 'failed' | 'skipped' | null,
): Promise<number> {
  const r = await env.DB.prepare(
    `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (?, 'q', 50, 'medium', 'system', ?) RETURNING id`,
  )
    .bind(pillar, date)
    .first<{ id: number }>();
  if (!r) throw new Error('seed failed');
  if (status) {
    await env.DB.prepare(`INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, ?, 50)`)
      .bind(r.id, status)
      .run();
    if (status === 'completed') {
      await env.DB.prepare(
        `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES (?, 50, 'quest_completed', 'test')`,
      )
        .bind(pillar)
        .run();
    }
  }
  return r.id;
}

describe('SystemAgent.generateBilan - happy path', () => {
  it('generates a weekly bilan from MockProvider and persists it', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);

    // Seed 3 quests in the target week (Mon 2026-05-18 → Sun 2026-05-24).
    await seedQuest('body', '2026-05-20', 'completed');
    await seedQuest('mind', '2026-05-22', 'completed');
    await seedQuest('finance', '2026-05-23', 'failed');

    const agent = getAgent();
    const result = await agent.generateBilan('weekly', '2026-05-18', '2026-05-24');

    expect(result.id).toBeGreaterThan(0);
    expect(result.period_type).toBe('weekly');
    expect(result.period_start).toBe('2026-05-18');
    expect(result.period_end).toBe('2026-05-24');
    expect(result.source).toBe('llm');
    expect(result.narrative).toContain('Period state');
    expect(MockProvider.callCount).toBe(1);

    // Row persisted.
    const row = await env.DB.prepare(`SELECT * FROM bilans WHERE id = ?`)
      .bind(result.id)
      .first<{ stats: string; narrative: string }>();
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.stats).global.total_xp).toBeGreaterThanOrEqual(0);

    // State.patterns may or may not be empty depending on data, but the
    // generation MUST have written something (or at least overwritten with []).
    const state = await agent.getState();
    expect(Array.isArray(state.patterns)).toBe(true);
  });

  it('rendered bilan prompt contains ## Performance vs physiology section', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    MockProvider.reset();
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);

    // Seed quests in a DIFFERENT week to avoid the idempotency cache from the prior test.
    await seedQuest('body', '2026-05-11', 'completed');
    await seedQuest('mind', '2026-05-13', 'completed');

    const agent = getAgent();
    await agent.generateBilan('weekly', '2026-05-11', '2026-05-17');

    // Verify the system prompt sent to MockProvider contained the section header.
    const systemMsg = MockProvider.lastMessages?.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    // The rendered prompt must contain the Performance vs physiology section
    // (from either the no-data branch or a real-data branch).
    expect(systemMsg!.content).toContain('## Performance vs physiology');
    // The raw placeholder must NOT appear (must be substituted).
    expect(systemMsg!.content).not.toContain('{PERFORMANCE_VS_PHYSIOLOGY}');
  });
});

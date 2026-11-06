import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

/**
 * Integration tests confirming {YESTERDAY_SUMMARY} is
 * substituted into the system prompt before it reaches the LLM.
 */
describe('YESTERDAY_SUMMARY in daily generation prompt', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
    await env.DB.prepare(`DELETE FROM daily_checkins`).run();
  });

  it('renders {YESTERDAY_SUMMARY} placeholder fully substituted (no raw brace pair)', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-31');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    // Placeholder must be substituted - raw {YESTERDAY_SUMMARY} must NOT appear
    expect(systemMsg.content).not.toContain('{YESTERDAY_SUMMARY}');
    // The rendered value starts with YESTERDAY
    expect(systemMsg.content).toContain('YESTERDAY (');
  });

  it('renders per-pillar completed/assigned counts when quests existed yesterday', async () => {
    // Seed yesterday's quests (today=2026-05-31 → yesterday=2026-05-30)
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (1, 'body', 'test-q1', 50, 'medium', 'system', '2026-05-30')`,
      ),
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (2, 'mind', 'test-q2', 30, 'medium', 'system', '2026-05-30')`,
      ),
      env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (1, 'completed', 50)`,
      ),
    ]);
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-31');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    // Body had 1 completed / 1 assigned; Mind had 0/1
    expect(systemMsg.content).toMatch(/body\s+1\/1/i);
    expect(systemMsg.content).toMatch(/mind\s+0\/1/i);
  });

  it('renders Streaks: line with streak status', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-31');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('Streaks:');
    expect(systemMsg.content).toMatch(/body-streak \d+d (maintained|BROKEN)/);
  });
});

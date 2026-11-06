import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { recomputeLifetimeStats } from '../../src/lib/lifetime-stats';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('LIFETIME_SNAPSHOT in daily generation prompt', () => {
  it('renders the snapshot string into the system prompt passed to the LLM', async () => {
    // Seed one completed body quest so lifetime_stats reflects non-zero data.
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (100, 'body', 'seed-body', 50, 'medium', 'system', '2026-01-05')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (100, 'completed', 50)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 50, 'quest_completed', 'seed', '2026-01-05T08:00:00Z')`,
    ).run();

    await recomputeLifetimeStats(env.DB);

    MockProvider.setFixture(CANONICAL_FIXTURE);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-24');
    });

    expect(MockProvider.lastMessages).not.toBeNull();
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Lifetime memory');
    expect(systemMsg.content).toContain('body:');
    expect(systemMsg.content).toContain('xp 50');
    expect(systemMsg.content).toContain('first 2026-01-05');
    // The other 3 pillars get zero rows still:
    expect(systemMsg.content).toContain('mind:');
    expect(systemMsg.content).toContain('finance:');
    expect(systemMsg.content).toContain('projects:');
    // Guard: no verbose labels leaked back in
    expect(systemMsg.content).not.toContain('total_xp ');
    expect(systemMsg.content).not.toContain('longest_streak ');
  });
});

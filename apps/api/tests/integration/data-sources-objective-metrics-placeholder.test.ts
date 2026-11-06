import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('OBJECTIVE_METRICS in daily generation prompt', () => {
  it('renders "No objective metrics connected." when no daily_metrics seeded', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-30');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Objective metrics');
    expect(systemMsg.content).toContain('No objective metrics connected.');
  });

  it('renders per-pillar metric summaries when daily_metrics has rows', async () => {
    // Seed 7 days of step data for body
    for (let i = 0; i < 7; i++) {
      const date = new Date('2026-05-23T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + i);
      await env.DB.prepare(
        `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value) VALUES (?, 'body', 'google_health', 'steps', ?)`,
      )
        .bind(date.toISOString().slice(0, 10), 8000 + i * 200)
        .run();
    }
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-30');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('- body (last 7d):');
    expect(systemMsg.content).toContain('steps');
  });
});

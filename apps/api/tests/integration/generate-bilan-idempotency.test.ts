import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

const getAgent = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

describe('SystemAgent.generateBilan - idempotency', () => {
  it('second call returns existing row, LLM called only once', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    const agent = getAgent();

    const first = await agent.generateBilan('weekly', '2026-05-18', '2026-05-24');
    expect(first.source).toBe('llm');
    expect(MockProvider.callCount).toBe(1);

    const second = await agent.generateBilan('weekly', '2026-05-18', '2026-05-24');
    expect(second.source).toBe('cached');
    expect(second.id).toBe(first.id);
    expect(MockProvider.callCount).toBe(1); // no additional call

    // Only one row in bilans.
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM bilans WHERE period_type='weekly' AND period_start='2026-05-18'`,
    ).first<{ n: number }>();
    expect(count!.n).toBe(1);
  });
});

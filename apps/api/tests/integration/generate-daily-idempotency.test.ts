import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('generateDaily idempotency', () => {
  it('second call on same date returns existing batch, LLM called exactly once', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const agent = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    const first = await agent.generateDaily('2026-05-24');
    expect(first.source).toBe('llm');
    expect(MockProvider.callCount).toBe(1);

    const second = await agent.generateDaily('2026-05-24');
    expect(second.source).toBe('cached');
    expect(second.generation_id).toBe(first.generation_id);
    expect(second.quests.length).toBe(first.quests.length);
    expect(MockProvider.callCount).toBe(1); // still 1
  });
});

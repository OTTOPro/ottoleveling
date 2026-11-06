import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('CURRENT_TITLES in daily generation prompt', () => {
  it('renders the titles snapshot into the system prompt at zero levels', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-24');
    });

    expect(MockProvider.lastMessages).not.toBeNull();
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Current titles and ranks');
    expect(systemMsg.content).toContain('body:');
    expect(systemMsg.content).toContain('Initiate'); // body @ level 0 → Initiate
    expect(systemMsg.content).toContain('E-Rank');
    expect(systemMsg.content).toContain('composite:');
    expect(systemMsg.content).toContain('Unranked'); // composite @ sum=0 → E-Rank Unranked
    expect(systemMsg.content).toContain('sum 0');
  });

  it('renders Hunter (B-Rank) per-pillar AND Path-Walker (D-Rank) composite when body reaches level 12', async () => {
    // Level 12 requires xp = 12^2 * 100 = 14400. Sum across pillars = 12 → D-Rank composite.
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 14400, 'quest_completed', 'seed', '2026-04-15T08:00:00Z')`,
    ).run();
    MockProvider.setFixture(CANONICAL_FIXTURE);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-24');
    });

    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toContain('## Current titles and ranks');
    expect(systemMsg.content).toContain('Hunter (B-Rank, level 12)'); // body specialization preserved
    expect(systemMsg.content).toContain('composite: Path-Walker (D-Rank, sum 12'); // composite stays modest - discipline-not-specialization
  });
});

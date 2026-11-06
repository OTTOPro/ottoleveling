import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('regenerateDaily semantics', () => {
  it('preserves completed quests, deletes uncompleted, generates new batch', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const agent = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    const first = await agent.generateDaily('2026-05-24');
    expect(first.quests.length).toBe(5);

    // Complete the first quest.
    const firstQuest = first.quests[0]!;
    await agent.recordCompletion(firstQuest.id, 'complete', null, '2026-05-24');

    // Regenerate.
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const second = await agent.regenerateDaily('2026-05-24');
    expect(second.source).toBe('llm');
    expect(second.generation_id).not.toBe(first.generation_id);

    // The completed quest from the first batch should still exist in D1.
    const stillThere = await env.DB.prepare('SELECT id FROM quests WHERE id = ?')
      .bind(firstQuest.id)
      .first();
    expect(stillThere).not.toBeNull();

    // The OTHER 4 quests from the first batch (uncompleted) should be GONE.
    for (const q of first.quests.slice(1)) {
      const gone = await env.DB.prepare('SELECT id FROM quests WHERE id = ?').bind(q.id).first();
      expect(gone).toBeNull();
    }

    // The new batch quests exist with the new generation_id.
    expect(second.quests.length).toBe(5);
    for (const q of second.quests) {
      expect(q.generation_id).toBe(second.generation_id);
    }
  });
});

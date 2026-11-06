import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { MALFORMED_FIXTURE } from '../fixtures/llm-fixture';

describe('generateDaily fallback on malformed LLM response', () => {
  it('inserts 4 medically-inert observational quests, one per pillar', async () => {
    MockProvider.setFixture(MALFORMED_FIXTURE);
    const agent = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    const result = await agent.generateDaily('2026-05-24');
    expect(result.source).toBe('fallback');
    expect(result.quests.length).toBe(4);
    expect(result.reasoning.toLowerCase()).toContain('fallback');

    // One quest per pillar.
    const pillars = result.quests.map((q) => q.pillar_id).sort();
    expect(pillars).toEqual(['body', 'finance', 'mind', 'projects']);

    // Each quest is easy/25 XP.
    for (const q of result.quests) {
      expect(q.difficulty).toBe('easy');
      expect(q.xp_value).toBe(25);
    }

    // Assert fallback via metadata, NOT title prefix.
    // The metadata is stored as a JSON string in D1 - parse it.
    for (const q of result.quests) {
      const meta = q.metadata ? (JSON.parse(q.metadata) as Record<string, unknown>) : null;
      expect(meta?.fallback).toBe(true);
    }

    // ANTI-REGRESSION (mandatory user patch): the body fallback title MUST NOT
    // contain any exercise keywords. Body fallback must be observational only.
    const bodyQuest = result.quests.find((q) => q.pillar_id === 'body');
    expect(bodyQuest).toBeDefined();
    const bodyTitle = bodyQuest!.title.toLowerCase();
    const forbiddenKeywords = [
      'push-up',
      'pushup',
      'squat',
      'jump',
      'plyo',
      'sprint',
      'run ',
      'running',
    ];
    for (const kw of forbiddenKeywords) {
      expect(bodyTitle).not.toContain(kw);
    }

    // Specific exact match for the canonical observational body fallback.
    expect(bodyQuest!.title).toBe('Log how your body feels today');
  });
});

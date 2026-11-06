import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('POST /api/quests/generate', () => {
  it("generates today's quests from the canonical fixture", async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);

    const res = await SELF.fetch(authed('/api/quests/generate', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      generation_id: string;
      quests: Array<{ pillar_id: string; source: string; generation_id: string }>;
      reasoning: string;
      source: 'llm' | 'cached' | 'fallback';
    };

    expect(body.source).toBe('llm');
    expect(body.generation_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.quests.length).toBe(5);
    expect(body.quests.every((q) => q.source === 'system')).toBe(true);
    expect(body.quests.every((q) => q.generation_id === body.generation_id)).toBe(true);
    expect(body.reasoning).toContain('body');
    expect(MockProvider.callCount).toBe(1);
  });

  it('populates KV cache after generation', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    await SELF.fetch(authed('/api/quests/generate', { method: 'POST', body: '{}' }));

    const today = new Date().toISOString().slice(0, 10);
    const cached = await env.KV.get(`today:${today}`);
    // generateDaily INVALIDATES the cache (delete), it doesn't populate it.
    // The cache populates on the NEXT GET /api/quests/today call.
    // So immediately after generate, the cache should still be empty.
    expect(cached).toBeNull();

    // Now hit /today to trigger the cache populate.
    await SELF.fetch(authed('/api/quests/today'));
    const cachedAfterRead = await env.KV.get(`today:${today}`);
    expect(cachedAfterRead).not.toBeNull();
    const parsed = JSON.parse(cachedAfterRead!) as { quests: unknown[] };
    expect(Array.isArray(parsed.quests)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const authed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe('GET /api/quests/today', () => {
  it('cache miss → reads D1, populates KV', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
         VALUES ('body', 'seed today', 50, 'medium', 'manual', ?)`,
    )
      .bind(today)
      .run();

    expect(await env.KV.get(`today:${today}`)).toBeNull();

    const res = await SELF.fetch(authed('/api/quests/today'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      quests: Array<{ title: string }>;
      reasoning: string | null;
      completions: unknown[];
    };
    expect(body.quests.some((q) => q.title === 'seed today')).toBe(true);
    expect(Array.isArray(body.completions)).toBe(true);

    expect(await env.KV.get(`today:${today}`)).not.toBeNull();
  });

  it('cache hit → returns cached without re-querying D1', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fake = { quests: [{ id: 999, title: 'from-cache' }], reasoning: null, completions: [] };
    await env.KV.put(`today:${today}`, JSON.stringify(fake));

    const res = await SELF.fetch(authed('/api/quests/today'));
    const body = (await res.json()) as { quests: Array<{ id: number; title: string }> };
    expect(body.quests).toHaveLength(1);
    expect(body.quests[0]?.title).toBe('from-cache');
  });

  it('returns completion rows alongside quests when present', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Insert a quest for today directly.
    const quest = await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
         VALUES ('body', 'with completion', 50, 'medium', 'manual', ?) RETURNING id`,
    )
      .bind(today)
      .first<{ id: number }>();
    if (!quest) throw new Error('quest insert failed');

    // Complete it via the DO so xp_event + completion are wired correctly.
    const agent = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await agent.recordCompletion(quest.id, 'complete', null, today);

    // Wipe KV cache (recordCompletion invalidates, but defensively).
    await env.KV.delete(`today:${today}`);

    const res = await SELF.fetch(authed('/api/quests/today'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      quests: Array<{ id: number; title: string }>;
      completions: Array<{ quest_id: number; status: string; xp_awarded: number }>;
    };

    expect(body.quests.some((q) => q.id === quest.id)).toBe(true);
    expect(body.completions.length).toBeGreaterThanOrEqual(1);
    const compForQuest = body.completions.find((c) => c.quest_id === quest.id);
    expect(compForQuest).toBeDefined();
    expect(compForQuest!.status).toBe('completed');
    expect(compForQuest!.xp_awarded).toBe(50);
  });

  it('mutation (manual quest) invalidates the cache', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.KV.put(`today:${today}`, JSON.stringify({ quests: [], reasoning: null }));

    await SELF.fetch(
      authed('/api/quests/manual', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'mutation should invalidate',
          difficulty: 'easy',
          xp_value: 25,
        }),
      }),
    );

    expect(await env.KV.get(`today:${today}`)).toBeNull();
  });
});

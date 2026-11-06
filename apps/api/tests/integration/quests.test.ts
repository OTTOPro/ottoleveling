import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

async function createQuest(extra: Record<string, unknown> = {}) {
  const res = await SELF.fetch(
    authed('/api/quests/manual', {
      method: 'POST',
      body: JSON.stringify({
        pillar_id: 'body',
        title: 'Push-ups',
        difficulty: 'medium',
        xp_value: 50,
        ...extra,
      }),
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as {
    quest: {
      id: number;
      xp_value: number;
      difficulty: string;
      pillar_id: string;
      source: string;
      scheduled_for: string;
    };
  };
}

describe('POST /api/quests/manual', () => {
  it('creates a quest with source=manual and defaults scheduled_for to today', async () => {
    const { quest } = await createQuest();
    expect(quest).toMatchObject({
      pillar_id: 'body',
      title: 'Push-ups',
      difficulty: 'medium',
      xp_value: 50,
      source: 'manual',
    });
    expect(quest.scheduled_for).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects xp_value > 1000', async () => {
    const res = await SELF.fetch(
      authed('/api/quests/manual', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'body',
          title: 'overflow',
          difficulty: 'epic',
          xp_value: 9999,
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/quests/:id/complete', () => {
  it('records completion and inserts xp_event with positive amount', async () => {
    const { quest } = await createQuest();
    const res = await SELF.fetch(
      authed(`/api/quests/${quest.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { completion: { status: string; xp_awarded: number } };
    expect(body.completion.status).toBe('completed');
    expect(body.completion.xp_awarded).toBe(50);

    const xp = await env.DB.prepare('SELECT amount, source_type FROM xp_events WHERE source_id = ?')
      .bind(quest.id)
      .all<{ amount: number; source_type: string }>();
    expect(xp.results.length).toBe(1);
    const first = xp.results[0];
    expect(first?.amount).toBe(50);
    expect(first?.source_type).toBe('quest_completed');
  });

  it('rejects double-complete (UNIQUE on completions.quest_id) with 409', async () => {
    const { quest } = await createQuest();
    await SELF.fetch(authed(`/api/quests/${quest.id}/complete`, { method: 'POST', body: '{}' }));
    const res2 = await SELF.fetch(
      authed(`/api/quests/${quest.id}/complete`, { method: 'POST', body: '{}' }),
    );
    expect(res2.status).toBe(409);
  });

  it('returns 404 for unknown quest id', async () => {
    const res = await SELF.fetch(
      authed('/api/quests/99999/complete', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/quests/:id/fail', () => {
  it('records failure with -25 XP (medium fail penalty on xp=50)', async () => {
    const { quest } = await createQuest(); // medium, xp=50 → fail = round(50*0.5) = 25 → -25
    const res = await SELF.fetch(
      authed(`/api/quests/${quest.id}/fail`, { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { completion: { xp_awarded: number; status: string } };
    expect(body.completion.status).toBe('failed');
    expect(body.completion.xp_awarded).toBe(-25);
  });
});

describe('POST /api/quests/:id/skip', () => {
  it('records skip with -13 XP (medium skip penalty on xp=50, rounds 12.5 → 13)', async () => {
    const { quest } = await createQuest(); // medium, xp=50 → skip = round(50*0.25) = round(12.5) = 13 → -13
    const res = await SELF.fetch(
      authed(`/api/quests/${quest.id}/skip`, { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { completion: { xp_awarded: number; status: string } };
    expect(body.completion.status).toBe('skipped');
    expect(body.completion.xp_awarded).toBe(-13);
  });
});

import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authedRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('GET /api/objectives', () => {
  it('returns empty list when no objectives exist', async () => {
    const res = await SELF.fetch(authedRequest('/api/objectives'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objectives: [] });
  });

  it('rejects requests without x-dev-token', async () => {
    const res = await SELF.fetch(new Request('http://localhost/api/objectives'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/objectives', () => {
  it('creates an objective and returns it with id', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'body',
          title: 'Test push-up baseline',
          target_date: '2026-08-01',
          target_metric: 'reps',
          target_value: 50,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      objective: { id: number; pillar_id: string; title: string; status: string };
    };
    expect(body.objective).toMatchObject({
      pillar_id: 'body',
      title: 'Test push-up baseline',
      status: 'active',
    });
    expect(typeof body.objective.id).toBe('number');
  });

  it('rejects invalid pillar_id with 400', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'bogus',
          title: 'x',
          target_date: '2026-01-01',
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed target_date with 400', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'x',
          target_date: '2026/01/01',
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/objectives ?pillar_id=', () => {
  it('filters by pillar', async () => {
    // Seed two objectives across pillars.
    await SELF.fetch(
      authedRequest('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'body',
          title: 'Body obj',
          target_date: '2026-08-01',
        }),
      }),
    );
    await SELF.fetch(
      authedRequest('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'Mind obj',
          target_date: '2026-08-01',
        }),
      }),
    );
    const res = await SELF.fetch(authedRequest('/api/objectives?pillar_id=mind'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { objectives: Array<{ pillar_id: string }> };
    expect(body.objectives).toHaveLength(1);
    const first = body.objectives[0];
    expect(first?.pillar_id).toBe('mind');
  });
});

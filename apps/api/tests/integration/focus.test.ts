import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('GET /api/focus', () => {
  it('returns null when no focus has been set', async () => {
    const res = await SELF.fetch(authed('/api/focus'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ focus: null });
  });

  it('rejects without auth', async () => {
    const res = await SELF.fetch(new Request('http://localhost/api/focus'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/focus', () => {
  it('sets focus, returns it, writes a focus_periods D1 row', async () => {
    const res = await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'body', horizon: 'weekly' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      focus: { pillarId: string; horizon: string; startedAt: string };
    };
    expect(body.focus.pillarId).toBe('body');
    expect(body.focus.horizon).toBe('weekly');
    expect(body.focus.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const rows = await env.DB.prepare(
      `SELECT pillar_id, horizon, ended_at FROM focus_periods WHERE ended_at IS NULL`,
    ).all<{ pillar_id: string; horizon: string; ended_at: string | null }>();
    expect(rows.results.length).toBe(1);
    const first = rows.results[0];
    expect(first?.pillar_id).toBe('body');
    expect(first?.horizon).toBe('weekly');
    expect(first?.ended_at).toBeNull();
  });

  it('GET reflects the most recent POST', async () => {
    await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'mind', horizon: 'monthly' }),
      }),
    );
    const res = await SELF.fetch(authed('/api/focus'));
    const body = (await res.json()) as { focus: { pillarId: string; horizon: string } | null };
    expect(body.focus).not.toBeNull();
    expect(body.focus?.pillarId).toBe('mind');
    expect(body.focus?.horizon).toBe('monthly');
  });

  it('changing focus closes the prior open period', async () => {
    await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'body', horizon: 'weekly' }),
      }),
    );
    await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'finance', horizon: 'sprint' }),
      }),
    );

    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM focus_periods WHERE ended_at IS NULL`,
    ).first<{ n: number }>();
    expect(open?.n).toBe(1);

    const closed = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM focus_periods WHERE ended_at IS NOT NULL`,
    ).first<{ n: number }>();
    expect(closed?.n).toBe(1);
  });

  it('rejects invalid pillar with 400', async () => {
    const res = await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'bogus', horizon: 'weekly' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid horizon with 400', async () => {
    const res = await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'body', horizon: 'eternal' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

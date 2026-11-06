import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const authed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe('GET /api/templates', () => {
  it('returns the 7 seeded active templates', async () => {
    const res = await SELF.fetch(authed('/api/templates?active=true'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: Array<{ active: number; pillar_id: string }> };
    // Use toBeGreaterThanOrEqual to be robust against other tests in this file
    // deactivating templates (DELETE test runs in the same suite).
    expect(body.templates.length).toBeGreaterThanOrEqual(6);
    expect(body.templates.every((t) => t.active === 1)).toBe(true);
  });
});

describe('POST /api/templates', () => {
  it('creates a template and returns it with id', async () => {
    const res = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'Test template',
          base_metric: 'pages read',
          starting_value: 10,
          schedule: 'daily',
          base_xp: 30,
          difficulty: 'easy',
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      template: { id: number; pillar_id: string; current_value: number; starting_value: number };
    };
    expect(body.template.pillar_id).toBe('mind');
    expect(body.template.current_value).toBe(10);
    expect(body.template.starting_value).toBe(10);
  });

  it('rejects invalid pillar with 400', async () => {
    const res = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'bogus',
          title: 'x',
          base_metric: 'x',
          starting_value: 1,
          schedule: 'daily',
          base_xp: 30,
          difficulty: 'easy',
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/templates/:id', () => {
  it('updates current_value', async () => {
    const seed = await env.DB.prepare('SELECT id FROM quest_templates ORDER BY id LIMIT 1').first<{
      id: number;
    }>();
    if (!seed) throw new Error('no seeded templates');

    const res = await SELF.fetch(
      authed(`/api/templates/${seed.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ current_value: 42 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { template: { current_value: number } };
    expect(body.template.current_value).toBe(42);
  });

  it('returns 404 for unknown template id', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/99999`, {
        method: 'PATCH',
        body: JSON.stringify({ current_value: 1 }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/templates/:id (soft-delete)', () => {
  it('soft-deletes: sets deleted_at and returns {ok: true}', async () => {
    const seed = await env.DB.prepare('SELECT id FROM quest_templates ORDER BY id LIMIT 1').first<{
      id: number;
    }>();
    if (!seed) throw new Error('no seeded templates');

    const res = await SELF.fetch(authed(`/api/templates/${seed.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify deleted_at is set in D1
    const row = await env.DB.prepare('SELECT deleted_at FROM quest_templates WHERE id = ?')
      .bind(seed.id)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).not.toBeNull();
  });
});

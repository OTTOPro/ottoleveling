import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const HEADERS = { 'x-dev-token': TOKEN };

async function seedArc(opts: { id?: number; status?: string; pillar?: string } = {}) {
  const id = opts.id ?? 1;
  await env.DB.prepare(
    `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
     VALUES (?, ?, 'T', 'D', 7, 0, ?, '2026-05-28T08:00:00Z', '2026-06-04T08:00:00Z', 500)`,
  )
    .bind(id, opts.pillar ?? 'body', opts.status ?? 'active')
    .run();
}

describe('GET /api/arcs', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs');
    expect(res.status).toBe(403);
  });

  it('returns empty arcs array when none seeded', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { arcs: unknown[] };
    expect(body.arcs).toEqual([]);
  });

  it('returns all arcs when ?status not provided', async () => {
    await seedArc({ id: 1, status: 'active' });
    await seedArc({ id: 2, status: 'completed' });
    await seedArc({ id: 3, status: 'failed' });
    const res = await SELF.fetch('https://x.test/api/arcs', { headers: HEADERS });
    const body = (await res.json()) as { arcs: unknown[] };
    expect(body.arcs).toHaveLength(3);
  });

  it('filters by ?status=active', async () => {
    await seedArc({ id: 1, status: 'active' });
    await seedArc({ id: 2, status: 'completed' });
    const res = await SELF.fetch('https://x.test/api/arcs?status=active', { headers: HEADERS });
    const body = (await res.json()) as { arcs: Array<{ id: number; status: string }> };
    expect(body.arcs).toHaveLength(1);
    expect(body.arcs[0]!.status).toBe('active');
  });

  it('returns 400 on invalid status', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs?status=garbage', { headers: HEADERS });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/arcs/:id/abandon', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs/1/abandon', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when arc does not exist', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs/999/abandon', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id', async () => {
    const res = await SELF.fetch('https://x.test/api/arcs/abc/abandon', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(400);
  });

  it('flips status to abandoned + sets completed_at on first call', async () => {
    await seedArc({ id: 1, status: 'active' });
    const res = await SELF.fetch('https://x.test/api/arcs/1/abandon', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      arc: { id: number; status: string; completed_at: string | null };
    };
    expect(body.arc.status).toBe('abandoned');
    expect(body.arc.completed_at).not.toBeNull();
  });

  it('is idempotent on already-abandoned arcs', async () => {
    await seedArc({ id: 1, status: 'abandoned' });
    const res = await SELF.fetch('https://x.test/api/arcs/1/abandon', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { arc: { status: string } };
    expect(body.arc.status).toBe('abandoned');
  });
});

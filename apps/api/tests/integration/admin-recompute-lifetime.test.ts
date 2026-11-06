import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const HEADERS = {
  'x-dev-token': 'integration-test-token-deadbeef',
  'content-type': 'application/json',
};

describe('POST /api/admin/recompute-lifetime', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/admin/recompute-lifetime', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('returns 200 + the 4 recomputed rows + recomputed_at', async () => {
    // Seed two body completions
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (200, 'body', 'a', 50, 'medium', 'system', '2026-01-05'),
              (201, 'body', 'b', 50, 'medium', 'system', '2026-01-06')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (200, 'completed', 50), (201, 'completed', 50)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 50, 'quest_completed', 's', '2026-01-05T08:00:00Z'),
              ('body', 50, 'quest_completed', 's', '2026-01-06T08:00:00Z')`,
    ).run();

    const res = await SELF.fetch('https://x.test/api/admin/recompute-lifetime', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      rows: Array<{
        pillar_id: string;
        total_xp: number;
        total_completed: number;
        longest_streak: number;
        first_quest_at: string | null;
      }>;
      recomputed_at: string;
    };
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(4);
    const body_row = body.rows.find((r) => r.pillar_id === 'body')!;
    expect(body_row.total_xp).toBe(100);
    expect(body_row.total_completed).toBe(2);
    expect(body_row.longest_streak).toBe(2);
    expect(body_row.first_quest_at).toBe('2026-01-05');
    expect(typeof body.recomputed_at).toBe('string');
  });

  it('is idempotent: double-call returns same row state', async () => {
    const a = await SELF.fetch('https://x.test/api/admin/recompute-lifetime', {
      method: 'POST',
      headers: HEADERS,
    });
    const b = await SELF.fetch('https://x.test/api/admin/recompute-lifetime', {
      method: 'POST',
      headers: HEADERS,
    });
    const aJson = (await a.json()) as { rows: Array<{ pillar_id: string; total_xp: number }> };
    const bJson = (await b.json()) as { rows: Array<{ pillar_id: string; total_xp: number }> };
    expect(aJson.rows.map((r) => [r.pillar_id, r.total_xp]).sort()).toEqual(
      bJson.rows.map((r) => [r.pillar_id, r.total_xp]).sort(),
    );
  });
});

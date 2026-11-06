import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const HEADERS = {
  'x-dev-token': 'integration-test-token-deadbeef',
  'content-type': 'application/json',
};

describe('GET /api/achievements', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/achievements');
    expect(res.status).toBe(403);
  });

  it('returns 200 with all 23 seeded achievements (locked + unlocked)', async () => {
    const res = await SELF.fetch('https://x.test/api/achievements', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      achievements: Array<{ id: string; unlocked_at: string | null }>;
    };
    expect(body.achievements).toHaveLength(23);
  });

  it('?unlocked=true returns only unlocked rows', async () => {
    await env.DB.prepare(
      `UPDATE achievements SET unlocked_at = '2026-05-10 12:00:00' WHERE id = 'body_first_step'`,
    ).run();
    const res = await SELF.fetch('https://x.test/api/achievements?unlocked=true', {
      headers: HEADERS,
    });
    const body = (await res.json()) as { achievements: Array<{ id: string }> };
    expect(body.achievements).toHaveLength(1);
    expect(body.achievements[0]?.id).toBe('body_first_step');
  });

  it('?unlocked=false returns the 22 locked rows (23 seeded - 1 unlocked = 22)', async () => {
    await env.DB.prepare(
      `UPDATE achievements SET unlocked_at = '2026-05-10 12:00:00' WHERE id = 'body_first_step'`,
    ).run();
    const res = await SELF.fetch('https://x.test/api/achievements?unlocked=false', {
      headers: HEADERS,
    });
    const body = (await res.json()) as { achievements: Array<{ id: string }> };
    expect(body.achievements).toHaveLength(22);
    expect(body.achievements.map((a) => a.id)).not.toContain('body_first_step');
  });

  it('rejects invalid ?unlocked= value with 400', async () => {
    const res = await SELF.fetch('https://x.test/api/achievements?unlocked=maybe', {
      headers: HEADERS,
    });
    expect(res.status).toBe(400);
  });
});

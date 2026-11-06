import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const HEADERS = { 'x-dev-token': TOKEN };

describe('GET /api/stats/composite', () => {
  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/stats/composite');
    expect(res.status).toBe(403);
  });

  it('returns Unranked (E-Rank) when all pillars at level 0', async () => {
    const res = await SELF.fetch('https://x.test/api/stats/composite', { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; rank: string };
    expect(body.rank).toBe('E');
    expect(body.title).toBe('Unranked');
  });

  it('single pillar at level 15 (A-Rank in isolation) yields sum=15 → D-Rank Path-Walker composite', async () => {
    // Level 15 requires xp = 15^2 * 100 = 22500. The pillar IS A-Rank per
    // rankFromLevel(15), but the COMPOSITE uses SUM (=15) → falls in D bracket (9-20).
    // Demonstrates the discipline-not-specialization semantic of the sum-based composite.
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description)
       VALUES ('body', 22500, 'quest_completed', 'seed')`,
    ).run();
    const res = await SELF.fetch('https://x.test/api/stats/composite', { headers: HEADERS });
    const body = (await res.json()) as { title: string; rank: string };
    expect(body.rank).toBe('D');
    expect(body.title).toBe('Path-Walker');
  });

  it('composite uses SUM (cross-pillar discipline), not MAX', async () => {
    // Mind level 12 alone (= B-Rank in isolation), body/finance/projects at 0.
    // 12^2 * 100 = 14400. SUM = 12 → D-Rank composite (NOT B that MAX would give).
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description)
       VALUES ('mind', 14400, 'quest_completed', 'seed')`,
    ).run();
    const res = await SELF.fetch('https://x.test/api/stats/composite', { headers: HEADERS });
    const body = (await res.json()) as { title: string; rank: string };
    expect(body.rank).toBe('D');
    expect(body.title).toBe('Path-Walker');
  });

  it('balanced 5,5,5,5 → sum 20 → D-Rank Path-Walker (boundary just under C)', async () => {
    // Level 5 requires xp = 25 * 100 = 2500 per pillar.
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES
         ('body', 2500, 'quest_completed', 'seed'),
         ('mind', 2500, 'quest_completed', 'seed'),
         ('finance', 2500, 'quest_completed', 'seed'),
         ('projects', 2500, 'quest_completed', 'seed')`,
    ).run();
    const res = await SELF.fetch('https://x.test/api/stats/composite', { headers: HEADERS });
    const body = (await res.json()) as { title: string; rank: string };
    expect(body.rank).toBe('D');
    expect(body.title).toBe('Path-Walker');
  });
});

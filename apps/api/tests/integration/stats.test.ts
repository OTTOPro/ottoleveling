import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('GET /api/stats/pillars', () => {
  it('returns 4 pillars with xp=0 / level=0 when no events', async () => {
    const res = await SELF.fetch(authed('/api/stats/pillars'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pillars: Array<{
        id: string;
        xp: number;
        level: number;
        xp_to_next: number;
        name: string;
        color: string;
        title: string;
        rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
      }>;
    };
    expect(body.pillars).toHaveLength(4);
    const ids = body.pillars.map((p) => p.id).sort();
    expect(ids).toEqual(['body', 'finance', 'mind', 'projects']);
    for (const p of body.pillars) {
      expect(p.xp).toBe(0);
      expect(p.level).toBe(0);
      expect(p.xp_to_next).toBe(100);
      expect(p.rank).toBe('E');
      // Title is per-pillar at level 0 - body=Initiate, mind=Novice, finance=Initiate, projects=Apprentice
      expect(['Initiate', 'Novice', 'Apprentice']).toContain(p.title);
    }
  });

  it('aggregates positive xp_events', async () => {
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES ('body', 250, 'quest_completed', 'seed')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES ('body', 150, 'quest_completed', 'seed')`,
    ).run();
    const res = await SELF.fetch(authed('/api/stats/pillars'));
    const body = (await res.json()) as {
      pillars: Array<{
        id: string;
        xp: number;
        level: number;
        xp_to_next: number;
        title: string;
        rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
      }>;
    };
    const bodyPillar = body.pillars.find((p) => p.id === 'body');
    expect(bodyPillar).toBeDefined();
    expect(bodyPillar!.xp).toBe(400);
    expect(bodyPillar!.level).toBe(2); // sqrt(400/100) = 2
    expect(bodyPillar!.xp_to_next).toBe(900); // (2+1)^2 * 100
    expect(bodyPillar!.rank).toBe('E'); // level 2 → still E (bracket is 0-2)
    expect(bodyPillar!.title).toBe('Initiate');
  });

  it('handles negative xp_events (penalties)', async () => {
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES ('mind', 200, 'quest_completed', 'seed')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES ('mind', -50, 'penalty', 'seed')`,
    ).run();
    const res = await SELF.fetch(authed('/api/stats/pillars'));
    const body = (await res.json()) as {
      pillars: Array<{ id: string; xp: number; level: number }>;
    };
    const mind = body.pillars.find((p) => p.id === 'mind');
    expect(mind!.xp).toBe(150);
    expect(mind!.level).toBe(1);
  });

  it('clamps negative aggregate to zero for level calculation', async () => {
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description) VALUES ('finance', -100, 'penalty', 'seed')`,
    ).run();
    const res = await SELF.fetch(authed('/api/stats/pillars'));
    const body = (await res.json()) as {
      pillars: Array<{ id: string; xp: number; level: number }>;
    };
    const finance = body.pillars.find((p) => p.id === 'finance');
    expect(finance!.xp).toBe(-100);
    expect(finance!.level).toBe(0); // clamped
  });
});

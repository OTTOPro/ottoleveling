import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';
const authed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe('POST /api/checkins', () => {
  it('creates a checkin with defaults', async () => {
    // Clean up checkins table (not in setup-d1.ts wipe list)
    await env.DB.prepare(`DELETE FROM daily_checkins`).run();

    const res = await SELF.fetch(
      authed('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ energy_level: 7, mood: 'focused', notes: 'good session' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      checkin: { energy_level: number; mood: string; notes: string };
    };
    expect(body.checkin.energy_level).toBe(7);
    expect(body.checkin.mood).toBe('focused');
  });

  it('upserts on conflict for the same date', async () => {
    await env.DB.prepare(`DELETE FROM daily_checkins`).run();

    await SELF.fetch(
      authed('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-05-24', energy_level: 5, mood: 'tired' }),
      }),
    );
    const r2 = await SELF.fetch(
      authed('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-05-24', energy_level: 8, mood: 'energized' }),
      }),
    );
    expect(r2.status).toBe(201);

    const rows = await env.DB.prepare(`SELECT * FROM daily_checkins WHERE date='2026-05-24'`).all<{
      energy_level: number;
      mood: string;
    }>();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0]!.energy_level).toBe(8);
    expect(rows.results[0]!.mood).toBe('energized');
  });

  it('rejects energy_level out of range', async () => {
    const res = await SELF.fetch(
      authed('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ energy_level: 11 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/checkins/recent', () => {
  it('returns last 7 days', async () => {
    await env.DB.prepare(`DELETE FROM daily_checkins`).run();
    await env.DB.prepare(
      `INSERT INTO daily_checkins (date, energy_level) VALUES ('2020-01-01', 5)`,
    ).run(); // outside window

    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(`INSERT INTO daily_checkins (date, energy_level) VALUES (?, 8)`)
      .bind(today)
      .run();

    const res = await SELF.fetch(authed('/api/checkins/recent'));
    const body = (await res.json()) as { checkins: Array<{ date: string }> };
    expect(body.checkins.some((c) => c.date === today)).toBe(true);
    expect(body.checkins.some((c) => c.date === '2020-01-01')).toBe(false);
  });
});

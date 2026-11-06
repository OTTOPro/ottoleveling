import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

const TOKEN = 'integration-test-token-deadbeef';
const authed = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
};

describe('GET /api/bilans', () => {
  it('returns empty list initially', async () => {
    const res = await SELF.fetch(authed('/api/bilans'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bilans: unknown[] };
    expect(body.bilans).toEqual([]);
  });

  it('returns bilans after generation', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    await SELF.fetch(
      authed('/api/bilans/generate', {
        method: 'POST',
        body: JSON.stringify({
          period_type: 'weekly',
          period_start: '2026-05-18',
          period_end: '2026-05-24',
        }),
      }),
    );

    const res = await SELF.fetch(authed('/api/bilans'));
    const body = (await res.json()) as { bilans: Array<{ period_type: string }> };
    expect(body.bilans.length).toBe(1);
    expect(body.bilans[0]!.period_type).toBe('weekly');
  });

  it('filters by period_type', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    await SELF.fetch(
      authed('/api/bilans/generate', {
        method: 'POST',
        body: JSON.stringify({
          period_type: 'weekly',
          period_start: '2026-05-18',
          period_end: '2026-05-24',
        }),
      }),
    );

    const res = await SELF.fetch(authed('/api/bilans?period_type=monthly'));
    const body = (await res.json()) as { bilans: unknown[] };
    expect(body.bilans).toEqual([]);
  });
});

describe('GET /api/bilans/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await SELF.fetch(authed('/api/bilans/99999'));
    expect(res.status).toBe(404);
  });

  it('returns bilan with parsed stats object', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    const gen = await SELF.fetch(
      authed('/api/bilans/generate', {
        method: 'POST',
        body: JSON.stringify({
          period_type: 'weekly',
          period_start: '2026-05-18',
          period_end: '2026-05-24',
        }),
      }),
    );
    const genBody = (await gen.json()) as { bilan: { id: number } };

    const res = await SELF.fetch(authed(`/api/bilans/${genBody.bilan.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bilan: { stats: { global: { total_xp: number } } } };
    expect(typeof body.bilan.stats).toBe('object');
    expect(typeof body.bilan.stats.global.total_xp).toBe('number');
  });
});

describe('POST /api/bilans/generate', () => {
  it('rejects bogus period_type', async () => {
    const res = await SELF.fetch(
      authed('/api/bilans/generate', {
        method: 'POST',
        body: JSON.stringify({ period_type: 'daily' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

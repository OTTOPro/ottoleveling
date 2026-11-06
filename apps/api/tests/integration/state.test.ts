import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe('GET /api/state', () => {
  it('returns a snapshot with the expected shape', async () => {
    const res = await SELF.fetch(authed('/api/state'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      state: {
        currentFocus: unknown;
        streaks: Record<
          string,
          { current: number; longest: number; lastSuccessDate: string | null }
        >;
        scheduledEvents: unknown[];
        context: { activePillars: string[] };
      };
    };
    expect(body.state.currentFocus).toBeNull();
    expect(body.state.streaks.body?.current).toBe(0);
    expect(body.state.streaks.mind?.current).toBe(0);
    expect(body.state.streaks.finance?.current).toBe(0);
    expect(body.state.streaks.projects?.current).toBe(0);
    expect(Array.isArray(body.state.scheduledEvents)).toBe(true);
    expect(body.state.context.activePillars).toEqual(['body', 'mind', 'finance', 'projects']);
  });

  it('snapshot reflects focus mutation + seeds scheduled events on first setFocus', async () => {
    await SELF.fetch(
      authed('/api/focus', {
        method: 'POST',
        body: JSON.stringify({ pillar_id: 'mind', horizon: 'weekly' }),
      }),
    );

    const res = await SELF.fetch(authed('/api/state'));
    const body = (await res.json()) as {
      state: {
        currentFocus: { pillarId: string; horizon: string } | null;
        scheduledEvents: Array<{ type: string; scheduledFor: string }>;
      };
    };

    expect(body.state.currentFocus?.pillarId).toBe('mind');
    expect(body.state.currentFocus?.horizon).toBe('weekly');
    // seedInitialEvents seeds 5 events (daily_cycle_spawn replaces
    // daily_generation + google_health_sync + spotify_sync; bilans + progression retained).
    expect(body.state.scheduledEvents.length).toBe(5);
    const types = body.state.scheduledEvents.map((e) => e.type).sort();
    expect(types).toEqual([
      'daily_cycle_spawn',
      'monthly_bilan',
      'template_progression_check',
      'weekly_bilan',
      'yearly_bilan',
    ]);
  });

  it('snapshot reflects streak mutations via RPC', async () => {
    const quest = await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
         VALUES ('finance', 'test', 50, 'medium', 'manual', '2026-05-24') RETURNING id`,
    ).first<{ id: number }>();
    if (!quest) throw new Error('quest insert failed');

    const agent = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await agent.recordCompletion(quest.id, 'complete', null, '2026-05-10');

    const res = await SELF.fetch(authed('/api/state'));
    const body = (await res.json()) as {
      state: { streaks: Record<string, { current: number; lastSuccessDate: string | null }> };
    };
    expect(body.state.streaks.finance?.current).toBe(1);
    expect(body.state.streaks.finance?.lastSuccessDate).toBe('2026-05-10');
  });

  it('rejects without auth', async () => {
    const res = await SELF.fetch(new Request('http://localhost/api/state'));
    expect(res.status).toBe(403);
  });
});

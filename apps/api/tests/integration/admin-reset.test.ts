import { describe, it, expect } from 'vitest';
import { env, SELF, runInDurableObject } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const stubFn = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

// ---------------------------------------------------------------------------
// Helpers - seed transactional data into every table so we can verify reset.
// ---------------------------------------------------------------------------

async function seedTransactionalData(): Promise<void> {
  // 1 quest + 1 completion + 1 xp_event.
  await env.DB.prepare(
    `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES ('body', 'Reset-test quest', 50, 'easy', 'manual', '2026-05-25')`,
  ).run();
  const qrow = await env.DB.prepare(
    `SELECT id FROM quests WHERE title = 'Reset-test quest'`,
  ).first<{ id: number }>();
  const questId = qrow!.id;

  await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 50)`,
  )
    .bind(questId)
    .run();
  await env.DB.prepare(
    `INSERT INTO xp_events (pillar_id, amount, source_type, source_id, description)
       VALUES ('body', 50, 'quest_completed', ?, 'Reset-test xp')`,
  )
    .bind(questId)
    .run();

  // 1 focus_period.
  await env.DB.prepare(
    `INSERT INTO focus_periods (pillar_id, horizon, started_at)
     VALUES ('body', 'weekly', '2026-05-24T12:00:00Z')`,
  ).run();

  // 1 daily_checkin.
  await env.DB.prepare(
    `INSERT INTO daily_checkins (date, energy_level, mood, notes)
     VALUES ('2026-05-24', 7, 'focused', 'seed')`,
  ).run();

  // 1 bilan.
  await env.DB.prepare(
    `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative)
     VALUES ('weekly', '2026-05-18', '2026-05-24', '{}', 'seed bilan narrative')`,
  ).run();
}

async function seedPreservedReferenceData(): Promise<void> {
  // push_subscriptions are not seeded by migration - add one so we can verify
  // it survives the reset. pillars / penalty_rules / objectives are already
  // seeded by migration 0002.
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES ('https://fcm.googleapis.com/wp/reset-test', 'p256-seed', 'auth-seed')`,
  ).run();
}

async function seedKvTodayCache(): Promise<void> {
  await env.KV.put('today:2026-05-25', JSON.stringify({ quests: [], reasoning: 'seed' }), {
    expirationTtl: 3600,
  });
  await env.KV.put('today:2026-05-24', JSON.stringify({ quests: [], reasoning: 'seed' }), {
    expirationTtl: 3600,
  });
}

interface SeededAgentState {
  context: { userBio: string; activePillars: string[] };
  currentFocus: { pillarId: string; horizon: string; startedAt: string } | null;
  patterns: Array<{ type: string; description: string; confidence: number; detectedAt: string }>;
  streaks: Record<string, { current: number; longest: number; lastSuccessDate: string | null }>;
  counters: { llmCallsToday: number; llmCallsTodayResetAt: string };
  scheduledEvents: Array<{ id: string; type: string; scheduledFor: string }>;
}

async function seedDoState(): Promise<void> {
  const stub = stubFn();
  const seededState: SeededAgentState = {
    context: { userBio: 'seeded', activePillars: ['body', 'mind', 'finance', 'projects'] },
    currentFocus: { pillarId: 'body', horizon: 'weekly', startedAt: '2026-05-24T12:00:00Z' },
    patterns: [
      {
        type: 'consistency_high',
        description: 'seed',
        confidence: 0.9,
        detectedAt: '2026-05-24T12:00:00Z',
      },
    ],
    streaks: {
      body: { current: 5, longest: 7, lastSuccessDate: '2026-05-24' },
      mind: { current: 2, longest: 2, lastSuccessDate: '2026-05-24' },
      finance: { current: 0, longest: 1, lastSuccessDate: null },
      projects: { current: 3, longest: 3, lastSuccessDate: '2026-05-24' },
    },
    counters: { llmCallsToday: 7, llmCallsTodayResetAt: '2026-05-25T00:00:00Z' },
    scheduledEvents: [
      { id: 'evt_seed_1', type: 'daily_generation', scheduledFor: '2030-01-01T06:00:00Z' },
    ],
  };
  await runInDurableObject(stub, async (_inst, ctx) => {
    await ctx.storage.put('state', seededState);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/reset - auth', () => {
  it('rejects without auth → 403', async () => {
    const res = await SELF.fetch(
      new Request('http://localhost/api/admin/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/reset - confirm requirement', () => {
  it('returns 400 with exact error message on empty body', async () => {
    const res = await SELF.fetch(
      authed('/api/admin/reset', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Pass {confirm: true} to confirm reset');
  });

  it('returns 400 with exact error message on confirm:false', async () => {
    const res = await SELF.fetch(
      authed('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: false }) }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Pass {confirm: true} to confirm reset');
  });

  it('returns 400 with exact error message on missing body (invalid JSON)', async () => {
    const res = await SELF.fetch(authed('/api/admin/reset', { method: 'POST', body: 'not-json' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Pass {confirm: true} to confirm reset');
  });
});

describe('POST /api/admin/reset - happy path', () => {
  it('wipes transactional D1 tables, KV today cache, DO state; preserves reference + push_subscriptions', async () => {
    await seedTransactionalData();
    await seedPreservedReferenceData();
    await seedKvTodayCache();
    await seedDoState();

    // Sanity checks: data is actually there before reset.
    const preQuests = await env.DB.prepare('SELECT COUNT(*) AS n FROM quests').first<{
      n: number;
    }>();
    expect(preQuests!.n).toBe(1);

    const res = await SELF.fetch(
      authed('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      reset_at: string;
      preserved: string[];
      cleared: {
        xp_events: number;
        completions: number;
        quests: number;
        focus_periods: number;
        daily_checkins: number;
        bilans: number;
        do_storage: string;
        kv_today_cache: number;
      };
      templates_reset: string;
    };

    // Response shape.
    expect(body.ok).toBe(true);
    expect(body.reset_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.cleared.do_storage).toBe('deleted');
    expect(body.cleared.quests).toBeGreaterThanOrEqual(1);
    expect(body.cleared.completions).toBeGreaterThanOrEqual(1);
    expect(body.cleared.xp_events).toBeGreaterThanOrEqual(1);
    expect(body.cleared.focus_periods).toBeGreaterThanOrEqual(1);
    expect(body.cleared.daily_checkins).toBeGreaterThanOrEqual(1);
    expect(body.cleared.bilans).toBeGreaterThanOrEqual(1);
    expect(body.cleared.kv_today_cache).toBe(2);

    // Transactional tables empty after reset.
    for (const tbl of [
      'quests',
      'completions',
      'xp_events',
      'focus_periods',
      'daily_checkins',
      'bilans',
    ] as const) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).first<{ n: number }>();
      expect(row!.n, `${tbl} not empty after reset`).toBe(0);
    }

    // KV today:* keys gone.
    const kvList = await env.KV.list({ prefix: 'today:' });
    expect(kvList.keys.length).toBe(0);

    // DO state freshness: 5 scheduled events are seeded
    // (daily_cycle_spawn replaces daily_generation + google_health_sync + spotify_sync).
    const stub = stubFn();
    const state = await runInDurableObject(stub, async (_inst, ctx) => {
      return await ctx.storage.get<SeededAgentState>('state');
    });
    expect(state).not.toBeNull();
    expect(state!.currentFocus).toBeNull();
    expect(state!.patterns).toEqual([]);
    expect(state!.scheduledEvents.length).toBe(5);
    expect(state!.counters.llmCallsToday).toBe(0);
    for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
      expect(state!.streaks[p]!.current).toBe(0);
      expect(state!.streaks[p]!.longest).toBe(0);
      expect(state!.streaks[p]!.lastSuccessDate).toBeNull();
    }
  });
});

describe('POST /api/admin/reset - preserved tables', () => {
  it('keeps pillars / penalty_rules / objectives / push_subscriptions rows intact', async () => {
    await seedPreservedReferenceData();

    // Capture counts BEFORE reset.
    const pillarsBefore = await env.DB.prepare('SELECT COUNT(*) AS n FROM pillars').first<{
      n: number;
    }>();
    const penaltyBefore = await env.DB.prepare('SELECT COUNT(*) AS n FROM penalty_rules').first<{
      n: number;
    }>();
    const objectivesBefore = await env.DB.prepare('SELECT COUNT(*) AS n FROM objectives').first<{
      n: number;
    }>();
    const pushBefore = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{
      n: number;
    }>();

    expect(pillarsBefore!.n).toBe(4);
    expect(penaltyBefore!.n).toBe(5);
    // `objectives` is wiped per-test by tests/setup-d1.ts beforeEach hook
    // (the test suite doesn't re-seed; we only verify the table is preserved
    // by the reset endpoint - not that the seeded rows survive across tests).
    expect(pushBefore!.n).toBe(1);

    const res = await SELF.fetch(
      authed('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preserved: string[] };

    // Preserved array - order is pillars / penalty_rules / objectives / push_subscriptions.
    expect(body.preserved).toEqual([
      `pillars (${pillarsBefore!.n})`,
      `penalty_rules (${penaltyBefore!.n})`,
      `objectives (${objectivesBefore!.n})`,
      `push_subscriptions (${pushBefore!.n})`,
    ]);

    // Counts after match counts before.
    const pillarsAfter = await env.DB.prepare('SELECT COUNT(*) AS n FROM pillars').first<{
      n: number;
    }>();
    const penaltyAfter = await env.DB.prepare('SELECT COUNT(*) AS n FROM penalty_rules').first<{
      n: number;
    }>();
    const objectivesAfter = await env.DB.prepare('SELECT COUNT(*) AS n FROM objectives').first<{
      n: number;
    }>();
    const pushAfter = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{
      n: number;
    }>();
    expect(pillarsAfter!.n).toBe(pillarsBefore!.n);
    expect(penaltyAfter!.n).toBe(penaltyBefore!.n);
    expect(objectivesAfter!.n).toBe(objectivesBefore!.n);
    expect(pushAfter!.n).toBe(pushBefore!.n);

    // Specifically: the seeded push_subscription endpoint still exists.
    const row = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE endpoint = ?`)
      .bind('https://fcm.googleapis.com/wp/reset-test')
      .first<{ endpoint: string }>();
    expect(row?.endpoint).toBe('https://fcm.googleapis.com/wp/reset-test');
  });
});

describe('POST /api/admin/reset - templates reset', () => {
  it('resets current_value to starting_value and clears last_progressed_at', async () => {
    // Bump a template's current_value above starting_value + set last_progressed_at.
    const tmpl = await env.DB.prepare(
      `SELECT id, starting_value FROM quest_templates WHERE pillar_id = 'body' AND active = 1 LIMIT 1`,
    ).first<{ id: number; starting_value: number }>();
    expect(tmpl).not.toBeNull();
    const bumpedValue = tmpl!.starting_value + 25;

    await env.DB.prepare(
      `UPDATE quest_templates
         SET current_value = ?, last_progressed_at = '2026-05-24T12:00:00Z'
         WHERE id = ?`,
    )
      .bind(bumpedValue, tmpl!.id)
      .run();

    // Sanity check: the bump took effect.
    const pre = await env.DB.prepare(
      `SELECT current_value, last_progressed_at FROM quest_templates WHERE id = ?`,
    )
      .bind(tmpl!.id)
      .first<{ current_value: number; last_progressed_at: string | null }>();
    expect(pre!.current_value).toBe(bumpedValue);
    expect(pre!.last_progressed_at).toBe('2026-05-24T12:00:00Z');

    const res = await SELF.fetch(
      authed('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates_reset: string };
    expect(body.templates_reset).toMatch(/^current_value -> starting_value for \d+ templates$/);

    const post = await env.DB.prepare(
      `SELECT current_value, starting_value, last_progressed_at FROM quest_templates WHERE id = ?`,
    )
      .bind(tmpl!.id)
      .first<{
        current_value: number;
        starting_value: number;
        last_progressed_at: string | null;
      }>();
    expect(post!.current_value).toBe(post!.starting_value);
    expect(post!.last_progressed_at).toBeNull();
  });
});

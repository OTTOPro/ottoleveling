import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

async function postJSON(path: string, body: unknown): Promise<Response> {
  return SELF.fetch(authed(path, { method: 'POST', body: JSON.stringify(body) }));
}

describe('Core E2E', () => {
  it('success path: create objective → 3 quests on 3 pillars → complete → stats reflect XP', async () => {
    // 1. Create objective on body pillar.
    const objRes = await postJSON('/api/objectives', {
      pillar_id: 'body',
      title: 'Foundation week',
      target_date: '2026-07-01',
    });
    expect(objRes.status).toBe(201);
    const objJson = (await objRes.json()) as { objective: { id: number } };
    const objectiveId = objJson.objective.id;

    // 2. Create 3 quests across 3 pillars, linked to the objective.
    const created: Array<{ pillar: 'body' | 'mind' | 'finance'; id: number }> = [];
    for (const pillar of ['body', 'mind', 'finance'] as const) {
      const r = await postJSON('/api/quests/manual', {
        pillar_id: pillar,
        title: `${pillar} foundation`,
        difficulty: 'medium',
        xp_value: 100,
        objective_id: objectiveId,
      });
      expect(r.status).toBe(201);
      const qJson = (await r.json()) as { quest: { id: number } };
      created.push({ pillar, id: qJson.quest.id });
    }

    // 3. Complete all 3.
    for (const { id } of created) {
      const r = await postJSON(`/api/quests/${id}/complete`, {});
      expect(r.status).toBe(200);
    }

    // 4. Stats should show 100 XP on body, mind, finance; 0 on projects.
    const statsRes = await SELF.fetch(authed('/api/stats/pillars'));
    expect(statsRes.status).toBe(200);
    const statsJson = (await statsRes.json()) as {
      pillars: Array<{ id: string; xp: number; level: number }>;
    };
    const byId: Record<string, { id: string; xp: number; level: number }> = {};
    for (const p of statsJson.pillars) byId[p.id] = p;

    expect(byId.body?.xp).toBe(100);
    expect(byId.mind?.xp).toBe(100);
    expect(byId.finance?.xp).toBe(100);
    expect(byId.projects?.xp).toBe(0);
    // sqrt(100/100) = 1
    expect(byId.body?.level).toBe(1);
    expect(byId.mind?.level).toBe(1);
    expect(byId.finance?.level).toBe(1);
    expect(byId.projects?.level).toBe(0);
  });

  it('failure path: fail + skip apply correct negative penalties per penalty_rules', async () => {
    // hard fail on xp=100 → round(100 * 0.65) = 65 → -65
    const failRes = await postJSON('/api/quests/manual', {
      pillar_id: 'mind',
      title: 'fail-me',
      difficulty: 'hard',
      xp_value: 100,
    });
    expect(failRes.status).toBe(201);
    const failQuest = ((await failRes.json()) as { quest: { id: number } }).quest;

    // epic skip on xp=100 → round(100 * 0.50) = 50 → -50
    const skipRes = await postJSON('/api/quests/manual', {
      pillar_id: 'mind',
      title: 'skip-me',
      difficulty: 'epic',
      xp_value: 100,
    });
    expect(skipRes.status).toBe(201);
    const skipQuest = ((await skipRes.json()) as { quest: { id: number } }).quest;

    const failOutcome = await postJSON(`/api/quests/${failQuest.id}/fail`, {});
    expect(failOutcome.status).toBe(200);
    const failBody = (await failOutcome.json()) as {
      completion: { xp_awarded: number; status: string };
    };
    expect(failBody.completion.status).toBe('failed');
    expect(failBody.completion.xp_awarded).toBe(-65);

    const skipOutcome = await postJSON(`/api/quests/${skipQuest.id}/skip`, {});
    expect(skipOutcome.status).toBe(200);
    const skipBody = (await skipOutcome.json()) as {
      completion: { xp_awarded: number; status: string };
    };
    expect(skipBody.completion.status).toBe('skipped');
    expect(skipBody.completion.xp_awarded).toBe(-50);

    // /api/stats/pillars: mind should be -65 + -50 = -115. Level clamped to 0.
    const statsRes = await SELF.fetch(authed('/api/stats/pillars'));
    expect(statsRes.status).toBe(200);
    const { pillars } = (await statsRes.json()) as {
      pillars: Array<{ id: string; xp: number; level: number }>;
    };
    const mind = pillars.find((p) => p.id === 'mind');
    expect(mind).toBeDefined();
    expect(mind!.xp).toBe(-115);
    expect(mind!.level).toBe(0); // clamped via Math.max(0, xp) before levelFromXp
  });
});

/**
 * Templates CRUD lifecycle integration tests.
 *
 * Tests the full soft-delete / restore / permanent-delete contract,
 * extended PATCH, trash view, FK preservation, and completion-count helper.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers ?? {});
  headers.set('x-dev-token', TOKEN);
  if (init.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full lifecycle: create → list → PATCH → soft-delete → trash → restore → edit
// ─────────────────────────────────────────────────────────────────────────────
describe('Templates CRUD - full lifecycle', () => {
  let templateId: number;

  it('creates a template with all required fields', async () => {
    const res = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'body',
          title: 'Lifecycle test template',
          base_metric: 'reps',
          starting_value: 10,
          schedule: 'daily',
          base_xp: 20,
          difficulty: 'easy',
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ template: { id: number } }>();
    templateId = body.template.id;
    expect(templateId).toBeGreaterThan(0);
  });

  it('newly created template appears in active list (deleted_at IS NULL)', async () => {
    const res = await SELF.fetch(authed('/api/templates'));
    expect(res.status).toBe(200);
    const body = await res.json<{ templates: Array<{ id: number; deleted_at: string | null }> }>();
    const t = body.templates.find((x) => x.id === templateId);
    expect(t).toBeDefined();
    expect(t?.deleted_at).toBeNull();
  });

  it('PATCH updates all editable fields including auto_complete_rule', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Renamed lifecycle template',
          description: 'New description',
          base_xp: 35,
          difficulty: 'medium',
          auto_complete_rule: {
            type: 'metric_threshold',
            metric: 'steps',
            source: 'google_health',
            threshold: 8000,
          },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      `SELECT title, description, base_xp, difficulty, auto_complete_rule FROM quest_templates WHERE id = ?`,
    )
      .bind(templateId)
      .first<{
        title: string;
        description: string;
        base_xp: number;
        difficulty: string;
        auto_complete_rule: string;
      }>();
    expect(row?.title).toBe('Renamed lifecycle template');
    expect(row?.description).toBe('New description');
    expect(row?.base_xp).toBe(35);
    expect(row?.difficulty).toBe('medium');
    expect(JSON.parse(row!.auto_complete_rule).threshold).toBe(8000);
  });

  it('PATCH can also update pillar_id and base_metric (extended fields)', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pillar_id: 'mind', base_metric: 'pages' }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      `SELECT pillar_id, base_metric FROM quest_templates WHERE id = ?`,
    )
      .bind(templateId)
      .first<{ pillar_id: string; base_metric: string }>();
    expect(row?.pillar_id).toBe('mind');
    expect(row?.base_metric).toBe('pages');
  });

  it('soft-deletes via DELETE (sets deleted_at)', async () => {
    const res = await SELF.fetch(authed(`/api/templates/${templateId}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT deleted_at FROM quest_templates WHERE id = ?`)
      .bind(templateId)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).not.toBeNull();
  });

  it('soft-deleted template is hidden from default active list', async () => {
    const res = await SELF.fetch(authed('/api/templates'));
    expect(res.status).toBe(200);
    const body = await res.json<{ templates: Array<{ id: number }> }>();
    expect(body.templates.find((x) => x.id === templateId)).toBeUndefined();
  });

  it('soft-deleted template appears in trash view (?show=trash)', async () => {
    const res = await SELF.fetch(authed('/api/templates?show=trash'));
    expect(res.status).toBe(200);
    const body = await res.json<{ templates: Array<{ id: number }> }>();
    expect(body.templates.find((x) => x.id === templateId)).toBeDefined();
  });

  it('PATCH on soft-deleted template returns 404 (must restore first)', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Should fail' }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('restore via POST /:id/restore clears deleted_at', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${templateId}/restore`, { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT deleted_at FROM quest_templates WHERE id = ?`)
      .bind(templateId)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeNull();
  });

  it('restored template is editable again (PATCH succeeds)', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'After restore' }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('idempotent re-delete: second DELETE returns ok with idempotent flag', async () => {
    // First delete
    const r1 = await SELF.fetch(authed(`/api/templates/${templateId}`, { method: 'DELETE' }));
    expect(r1.status).toBe(200);

    // Second delete - already soft-deleted
    const r2 = await SELF.fetch(authed(`/api/templates/${templateId}`, { method: 'DELETE' }));
    expect(r2.status).toBe(200);
    const body2 = await r2.json<{ ok: boolean; idempotent?: boolean }>();
    expect(body2.ok).toBe(true);
    expect(body2.idempotent).toBe(true);
  });

  it('idempotent restore: second restore on active row returns ok with idempotent flag', async () => {
    // Restore the soft-deleted template first
    await SELF.fetch(authed(`/api/templates/${templateId}/restore`, { method: 'POST' }));
    // Second restore on already-active template
    const r2 = await SELF.fetch(authed(`/api/templates/${templateId}/restore`, { method: 'POST' }));
    expect(r2.status).toBe(200);
    const body = await r2.json<{ ok: boolean; idempotent?: boolean }>();
    expect(body.ok).toBe(true);
    expect(body.idempotent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FK preservation: completions on a quest using a soft-deleted template remain
// ─────────────────────────────────────────────────────────────────────────────
describe('Templates CRUD - FK preservation', () => {
  it('completions on a quest linked to a soft-deleted template still readable', async () => {
    // Create template
    const tRes = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'finance',
          title: 'FK test template',
          base_metric: 'dollars',
          starting_value: 100,
          schedule: 'daily',
          base_xp: 10,
          difficulty: 'trivial',
        }),
      }),
    );
    expect(tRes.status).toBe(201);
    const { template } = await tRes.json<{ template: { id: number } }>();
    const tid = template.id;

    // Seed a quest + completion directly in D1
    await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES ('finance', 'FK quest', 10, 'system', ?, '2026-06-01')`,
    )
      .bind(tid)
      .run();
    const qRow = await env.DB.prepare(`SELECT last_insert_rowid() AS id`).first<{ id: number }>();
    const qid = qRow!.id;
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 10)`,
    )
      .bind(qid)
      .run();

    // Soft-delete the template
    const dRes = await SELF.fetch(authed(`/api/templates/${tid}`, { method: 'DELETE' }));
    expect(dRes.status).toBe(200);

    // Completion still readable (FK chain preserved)
    const comp = await env.DB.prepare(`SELECT id FROM completions WHERE quest_id = ?`)
      .bind(qid)
      .first();
    expect(comp).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Completion-count helper
// ─────────────────────────────────────────────────────────────────────────────
describe('Templates CRUD - completion-count endpoint', () => {
  let tid: number;

  beforeEach(async () => {
    const res = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'projects',
          title: 'Count test template',
          base_metric: 'commits',
          starting_value: 1,
          schedule: 'daily',
          base_xp: 15,
          difficulty: 'easy',
        }),
      }),
    );
    expect(res.status).toBe(201);
    tid = (await res.json<{ template: { id: number } }>()).template.id;
  });

  it('returns 0 for a fresh template with no completions', async () => {
    const res = await SELF.fetch(authed(`/api/templates/${tid}/completion-count`));
    expect(res.status).toBe(200);
    const body = await res.json<{ count: number }>();
    expect(body.count).toBe(0);
  });

  it('returns correct count after seeding quests + completions', async () => {
    // Seed 2 quests + 1 completion each
    for (let i = 0; i < 2; i++) {
      await env.DB.prepare(
        `INSERT INTO quests (pillar_id, title, xp_value, source, template_id, scheduled_for)
         VALUES ('projects', 'Quest ${i}', 15, 'system', ?, '2026-06-0${i + 1}')`,
      )
        .bind(tid)
        .run();
      const qRow = await env.DB.prepare(`SELECT last_insert_rowid() AS id`).first<{ id: number }>();
      await env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 15)`,
      )
        .bind(qRow!.id)
        .run();
    }

    const res = await SELF.fetch(authed(`/api/templates/${tid}/completion-count`));
    expect(res.status).toBe(200);
    const body = await res.json<{ count: number }>();
    expect(body.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permanent delete (hard purge from trash)
// ─────────────────────────────────────────────────────────────────────────────
describe('Templates CRUD - permanent delete (purge)', () => {
  let tid: number;

  beforeEach(async () => {
    const res = await SELF.fetch(
      authed('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'Purge test template',
          base_metric: 'pages',
          starting_value: 5,
          schedule: 'weekly',
          base_xp: 25,
          difficulty: 'hard',
        }),
      }),
    );
    expect(res.status).toBe(201);
    tid = (await res.json<{ template: { id: number } }>()).template.id;
  });

  it('permanent-delete on active row (not in trash) returns 400', async () => {
    const res = await SELF.fetch(
      authed(`/api/templates/${tid}?permanent=true`, { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('must_be_in_trash_first');
  });

  it('permanent-delete after soft-delete sets title=[supprimé] + metadata.purged=true', async () => {
    // Soft-delete first
    await SELF.fetch(authed(`/api/templates/${tid}`, { method: 'DELETE' }));

    // Hard purge
    const res = await SELF.fetch(
      authed(`/api/templates/${tid}?permanent=true`, { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; purged: boolean }>();
    expect(body.ok).toBe(true);
    expect(body.purged).toBe(true);

    // Verify row state
    const row = await env.DB.prepare(`SELECT title, metadata FROM quest_templates WHERE id = ?`)
      .bind(tid)
      .first<{ title: string; metadata: string }>();
    expect(row?.title).toBe('[supprimé]');
    const meta = JSON.parse(row!.metadata) as { purged?: unknown };
    expect(meta.purged).toBe(true);
  });

  it('purged row not visible in active list or trash; queryable via GET /:id?include_trash=1', async () => {
    // Soft-delete + purge
    await SELF.fetch(authed(`/api/templates/${tid}`, { method: 'DELETE' }));
    await SELF.fetch(authed(`/api/templates/${tid}?permanent=true`, { method: 'DELETE' }));

    // Not in active list
    const listRes = await SELF.fetch(authed('/api/templates'));
    const listBody = await listRes.json<{ templates: Array<{ id: number }> }>();
    expect(listBody.templates.find((x) => x.id === tid)).toBeUndefined();

    // Not in trash (purged rows filtered out)
    const trashRes = await SELF.fetch(authed('/api/templates?show=trash'));
    const trashBody = await trashRes.json<{ templates: Array<{ id: number }> }>();
    expect(trashBody.templates.find((x) => x.id === tid)).toBeUndefined();

    // Still fetchable with ?include_trash=1
    const singleRes = await SELF.fetch(authed(`/api/templates/${tid}?include_trash=1`));
    expect(singleRes.status).toBe(200);
    const singleBody = await singleRes.json<{ template: { id: number; title: string } }>();
    expect(singleBody.template.id).toBe(tid);
    expect(singleBody.template.title).toBe('[supprimé]');
  });
});

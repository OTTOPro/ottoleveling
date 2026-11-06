/**
 * Objectives CRUD lifecycle integration tests.
 *
 * Tests the full soft-delete / restore / permanent-delete contract,
 * extended PATCH (including free status transitions),
 * trash view, and FK preservation.
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
// Runs as a SINGLE test to avoid beforeEach wiping the objectives table
// between each step (objectives are transactional, not seeded reference data).
// ─────────────────────────────────────────────────────────────────────────────
describe('Objectives CRUD - full lifecycle', () => {
  it('covers full create → patch → soft-delete → restore → hard-purge lifecycle', async () => {
    // --- Step 1: Create ---
    const createRes = await SELF.fetch(
      authed('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'body',
          title: 'Lifecycle test objective',
          target_date: '2027-01-01',
          description: 'Test description',
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json<{ objective: { id: number } }>();
    const objectiveId = createBody.objective.id;
    expect(objectiveId).toBeGreaterThan(0);

    // --- Step 2: Appears in active list (deleted_at IS NULL filter) ---
    const listRes = await SELF.fetch(authed('/api/objectives'));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json<{
      objectives: Array<{ id: number; deleted_at: string | null }>;
    }>();
    const o = listBody.objectives.find((x) => x.id === objectiveId);
    expect(o).toBeDefined();
    expect(o?.deleted_at).toBeNull();

    // --- Step 3: PATCH updates all editable fields including status ---
    const patchRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Renamed lifecycle objective',
          description: 'Updated description',
          status: 'paused',
          target_date: '2027-06-01',
        }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const row = await env.DB.prepare(
      `SELECT title, description, status, target_date FROM objectives WHERE id = ?`,
    )
      .bind(objectiveId)
      .first<{ title: string; description: string; status: string; target_date: string }>();
    expect(row?.title).toBe('Renamed lifecycle objective');
    expect(row?.description).toBe('Updated description');
    expect(row?.status).toBe('paused');
    expect(row?.target_date).toBe('2027-06-01');

    // --- Step 4: PATCH can update pillar_id ---
    const patchPillarRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pillar_id: 'mind' }),
      }),
    );
    expect(patchPillarRes.status).toBe(200);
    const pillarRow = await env.DB.prepare(`SELECT pillar_id FROM objectives WHERE id = ?`)
      .bind(objectiveId)
      .first<{ pillar_id: string }>();
    expect(pillarRow?.pillar_id).toBe('mind');

    // --- Step 5: Soft-delete via DELETE ---
    const deleteRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}`, { method: 'DELETE' }),
    );
    expect(deleteRes.status).toBe(200);
    const deletedRow = await env.DB.prepare(`SELECT deleted_at FROM objectives WHERE id = ?`)
      .bind(objectiveId)
      .first<{ deleted_at: string | null }>();
    expect(deletedRow?.deleted_at).not.toBeNull();

    // --- Step 6: Hidden from default active list ---
    const listAfterDelete = await SELF.fetch(authed('/api/objectives'));
    expect(listAfterDelete.status).toBe(200);
    const listAfterBody = await listAfterDelete.json<{ objectives: Array<{ id: number }> }>();
    expect(listAfterBody.objectives.find((x) => x.id === objectiveId)).toBeUndefined();

    // --- Step 7: Appears in trash view (?show=trash) ---
    const trashRes = await SELF.fetch(authed('/api/objectives?show=trash'));
    expect(trashRes.status).toBe(200);
    const trashBody = await trashRes.json<{ objectives: Array<{ id: number }> }>();
    expect(trashBody.objectives.find((x) => x.id === objectiveId)).toBeDefined();

    // --- Step 8: PATCH on soft-deleted returns 404 ---
    const patchOnDeleted = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Should fail' }),
      }),
    );
    expect(patchOnDeleted.status).toBe(404);

    // --- Step 9: Restore ---
    const restoreRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}/restore`, { method: 'POST' }),
    );
    expect(restoreRes.status).toBe(200);
    const restoredRow = await env.DB.prepare(`SELECT deleted_at FROM objectives WHERE id = ?`)
      .bind(objectiveId)
      .first<{ deleted_at: string | null }>();
    expect(restoredRow?.deleted_at).toBeNull();

    // --- Step 10: Editable again after restore ---
    const patchAfterRestore = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'After restore' }),
      }),
    );
    expect(patchAfterRestore.status).toBe(200);

    // --- Step 11: Idempotent re-delete ---
    const r1 = await SELF.fetch(authed(`/api/objectives/${objectiveId}`, { method: 'DELETE' }));
    expect(r1.status).toBe(200);
    const r2 = await SELF.fetch(authed(`/api/objectives/${objectiveId}`, { method: 'DELETE' }));
    expect(r2.status).toBe(200);
    const r2Body = await r2.json<{ ok: boolean; idempotent?: boolean }>();
    expect(r2Body.ok).toBe(true);
    expect(r2Body.idempotent).toBe(true);

    // --- Step 12: Permanent delete rejects non-trashed (restore first) ---
    const restoreForPurge = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}/restore`, { method: 'POST' }),
    );
    expect(restoreForPurge.status).toBe(200);
    const purgeRejectRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}?permanent=true`, { method: 'DELETE' }),
    );
    expect(purgeRejectRes.status).toBe(400);
    const purgeRejectBody = await purgeRejectRes.json<{ error: string }>();
    expect(purgeRejectBody.error).toBe('must_be_in_trash_first');

    // --- Step 13: Soft-delete then hard-purge ---
    await SELF.fetch(authed(`/api/objectives/${objectiveId}`, { method: 'DELETE' }));
    const purgeRes = await SELF.fetch(
      authed(`/api/objectives/${objectiveId}?permanent=true`, { method: 'DELETE' }),
    );
    expect(purgeRes.status).toBe(200);
    const purgeBody = await purgeRes.json<{ ok: boolean; purged: boolean }>();
    expect(purgeBody.ok).toBe(true);
    expect(purgeBody.purged).toBe(true);

    // Row still exists (FK preservation) but title is '[supprimé]'
    const purgedRow = await env.DB.prepare(`SELECT title, metadata FROM objectives WHERE id = ?`)
      .bind(objectiveId)
      .first<{ title: string; metadata: string | null }>();
    expect(purgedRow?.title).toBe('[supprimé]');
    const meta = JSON.parse(purgedRow!.metadata ?? '{}') as { purged?: boolean };
    expect(meta.purged).toBe(true);

    // --- Step 14: Purged does NOT appear in trash ---
    const trashAfterPurge = await SELF.fetch(authed('/api/objectives?show=trash'));
    expect(trashAfterPurge.status).toBe(200);
    const trashAfterBody = await trashAfterPurge.json<{ objectives: Array<{ id: number }> }>();
    expect(trashAfterBody.objectives.find((x) => x.id === objectiveId)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions (free: any status to any status)
// ─────────────────────────────────────────────────────────────────────────────
describe('Objectives - status transitions (free)', () => {
  let id: number;

  beforeEach(async () => {
    const res = await SELF.fetch(
      authed('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'projects',
          title: 'Status transition test objective',
          target_date: '2027-12-31',
        }),
      }),
    );
    const body = await res.json<{ objective: { id: number } }>();
    id = body.objective.id;
  });

  it('active → paused → completed → abandoned → active (full reversal)', async () => {
    const transitions: Array<'active' | 'paused' | 'completed' | 'abandoned'> = [
      'paused',
      'completed',
      'abandoned',
      'active',
    ];
    for (const status of transitions) {
      const res = await SELF.fetch(
        authed(`/api/objectives/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ objective: { status: string } }>();
      expect(body.objective.status).toBe(status);
    }
  });

  it('completed → active reversal is permitted (free transitions)', async () => {
    const r1 = await SELF.fetch(
      authed(`/api/objectives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      }),
    );
    expect(r1.status).toBe(200);

    const r2 = await SELF.fetch(
      authed(`/api/objectives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      }),
    );
    expect(r2.status).toBe(200);
    const body = await r2.json<{ objective: { status: string } }>();
    expect(body.objective.status).toBe('active');
  });

  it('abandoned → active reversal is permitted (free transitions)', async () => {
    const r1 = await SELF.fetch(
      authed(`/api/objectives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abandoned' }),
      }),
    );
    expect(r1.status).toBe(200);

    const r2 = await SELF.fetch(
      authed(`/api/objectives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      }),
    );
    expect(r2.status).toBe(200);
    const body = await r2.json<{ objective: { status: string } }>();
    expect(body.objective.status).toBe('active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FK preservation - quests referencing an objective survive hard purge
// ─────────────────────────────────────────────────────────────────────────────
describe('Objectives - FK preservation on permanent delete', () => {
  it('purging an objective keeps associated quest rows intact', async () => {
    // Create an objective
    const objRes = await SELF.fetch(
      authed('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'finance',
          title: 'FK preservation test',
          target_date: '2027-06-01',
        }),
      }),
    );
    const { objective } = await objRes.json<{ objective: { id: number } }>();

    // Insert a quest that references this objective directly in D1
    await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, objective_id, scheduled_for)
       VALUES ('finance', 'Quest linked to objective', 10, 'easy', 'manual', ?, '2026-01-01')`,
    )
      .bind(objective.id)
      .run();

    // Soft-delete then hard-purge the objective
    await SELF.fetch(authed(`/api/objectives/${objective.id}`, { method: 'DELETE' }));
    const purgeRes = await SELF.fetch(
      authed(`/api/objectives/${objective.id}?permanent=true`, { method: 'DELETE' }),
    );
    expect(purgeRes.status).toBe(200);

    // The quest row still exists (no cascade delete)
    const questRow = await env.DB.prepare(
      `SELECT id, objective_id FROM quests WHERE objective_id = ?`,
    )
      .bind(objective.id)
      .first<{ id: number; objective_id: number }>();
    expect(questRow).toBeDefined();
    expect(questRow?.objective_id).toBe(objective.id);

    // The objective row still exists (title scrubbed, FK intact)
    const objRow = await env.DB.prepare(`SELECT title FROM objectives WHERE id = ?`)
      .bind(objective.id)
      .first<{ title: string }>();
    expect(objRow?.title).toBe('[supprimé]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleted_at IS NULL filter in getActiveObjectives (d1-reads)
// ─────────────────────────────────────────────────────────────────────────────
describe('Objectives - GET / excludes soft-deleted rows', () => {
  it('soft-deleted objective is NOT returned in default active list', async () => {
    // Create + soft-delete
    const createRes = await SELF.fetch(
      authed('/api/objectives', {
        method: 'POST',
        body: JSON.stringify({
          pillar_id: 'mind',
          title: 'Soft-delete exclusion test',
          target_date: '2027-09-01',
        }),
      }),
    );
    const { objective } = await createRes.json<{ objective: { id: number } }>();
    await SELF.fetch(authed(`/api/objectives/${objective.id}`, { method: 'DELETE' }));

    const listRes = await SELF.fetch(authed('/api/objectives'));
    const body = await listRes.json<{ objectives: Array<{ id: number }> }>();
    expect(body.objectives.find((o) => o.id === objective.id)).toBeUndefined();
  });
});

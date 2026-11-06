import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings } from '../index';
import type { ObjectiveRow } from '../lib/d1';
import { CreateObjectiveSchema, UpdateObjectiveSchema } from '../schemas/objectives';

export const objectivesRouter = new Hono<{ Bindings: Bindings }>();

const ObjectiveIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const ListQuery = z.object({
  pillar_id: z.enum(['body', 'mind', 'finance', 'projects']).optional(),
  status: z.enum(['active', 'completed', 'abandoned', 'paused']).optional(),
  show: z.enum(['trash']).optional(),
});

// GET /api/objectives
// ?show=trash → soft-deleted rows (excluding purged); default → active (deleted_at IS NULL)
// Legacy ?pillar_id and ?status filters apply only on the active set.
objectivesRouter.get('/', zValidator('query', ListQuery), async (c) => {
  const { pillar_id, status, show } = c.req.valid('query');
  const showTrash = show === 'trash';

  let sql: string;
  if (showTrash) {
    // Trash: soft-deleted rows, excluding purged ones.
    sql = `SELECT * FROM objectives WHERE deleted_at IS NOT NULL AND (metadata IS NULL OR COALESCE(json_extract(metadata, '$.purged'), 0) != 1) ORDER BY pillar_id, id`;
  } else {
    const clauses: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (pillar_id) {
      clauses.push('pillar_id = ?');
      params.push(pillar_id);
    }
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    sql = `SELECT * FROM objectives ${where} ORDER BY target_date ASC`;
    const stmt = c.env.DB.prepare(sql).bind(...params);
    const { results } = await stmt.all<ObjectiveRow>();
    return c.json({ objectives: results });
  }

  const { results } = await c.env.DB.prepare(sql).all<ObjectiveRow>();
  return c.json({ objectives: results });
});

// POST /api/objectives - create
// Auto-spawns an ObjectiveMilestoneWorkflow instance if the
// new objective has a target_date and status='active' (default).
// phases_count extracted from metadata.phases_count (integer 1-12) or defaults to 4.
objectivesRouter.post('/', zValidator('json', CreateObjectiveSchema), async (c) => {
  const body = c.req.valid('json');
  const metadataStr = body.metadata ? JSON.stringify(body.metadata) : null;
  const result = await c.env.DB.prepare(
    `INSERT INTO objectives
      (pillar_id, title, description, target_date, target_metric, target_value, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  )
    .bind(
      body.pillar_id,
      body.title,
      body.description ?? null,
      body.target_date,
      body.target_metric ?? null,
      body.target_value ?? null,
      metadataStr,
    )
    .first<ObjectiveRow>();
  if (!result) {
    return c.json({ error: 'insert_failed' }, 500);
  }

  // Spawn objective-milestone workflow for active objectives
  // with a target_date. Non-fatal: spawn failure does NOT block the create response.
  if (result.target_date && (result.status ?? 'active') === 'active') {
    const phasesCount = extractPhasesFromNotes(body.metadata) ?? 4;
    const startDate = result.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const instanceId = `objective-milestone-${result.id}`;
    try {
      await c.env.OBJECTIVE_MILESTONE_WORKFLOW.create({
        id: instanceId,
        params: {
          objective_id: result.id,
          start_date: startDate,
          target_date: result.target_date,
          phases_count: phasesCount,
        },
      });
      await c.env.DB.prepare(
        `INSERT INTO objective_workflow_state (objective_id, workflow_run_id) VALUES (?, ?)`,
      )
        .bind(result.id, instanceId)
        .run();
    } catch (e) {
      console.error(
        `[Objectives] workflow spawn failed for objective ${result.id} (non-fatal):`,
        e,
      );
    }
  }

  return c.json({ objective: result }, 201);
});

// GET /api/objectives/:id - single objective (active only by default)
// ?include_trash=1 also returns soft-deleted rows (needed by trash-restore flow)
objectivesRouter.get('/:id', zValidator('param', ObjectiveIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const includeTrash = c.req.query('include_trash') === '1';
  const whereClause = includeTrash ? '' : ` AND deleted_at IS NULL`;
  const row = await c.env.DB.prepare(`SELECT * FROM objectives WHERE id = ?${whereClause}`)
    .bind(id)
    .first<ObjectiveRow>();
  if (!row) return c.json({ error: 'objective_not_found' }, 404);
  return c.json({ objective: row });
});

// PATCH /api/objectives/:id - extended PATCH accepting all editable fields.
// Free transitions: any status → any status.
// Returns 404 if the objective is soft-deleted (must restore first).
objectivesRouter.patch(
  '/:id',
  zValidator('param', ObjectiveIdParamSchema),
  zValidator('json', UpdateObjectiveSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');

    const existing = await c.env.DB.prepare(`SELECT id, deleted_at FROM objectives WHERE id = ?`)
      .bind(id)
      .first<{ id: number; deleted_at: string | null }>();

    if (!existing) return c.json({ error: 'objective_not_found' }, 404);
    if (existing.deleted_at != null)
      return c.json({ error: 'objective_is_soft_deleted_restore_first' }, 404);

    // Build dynamic SET clause from defined keys in patch.
    const jsonFields = new Set(['metadata']);
    const updates: string[] = [];
    const binds: unknown[] = [];

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      updates.push(`${key} = ?`);
      binds.push(jsonFields.has(key) && value != null ? JSON.stringify(value) : value);
    }

    if (updates.length === 0) return c.json({ ok: true, unchanged: true });
    binds.push(id);

    await c.env.DB.prepare(
      `UPDATE objectives SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(...binds)
      .run();

    const updated = await c.env.DB.prepare(`SELECT * FROM objectives WHERE id = ?`)
      .bind(id)
      .first<ObjectiveRow>();
    if (!updated) return c.json({ error: 'objective_not_found' }, 404);
    return c.json({ objective: updated });
  },
);

// DELETE /api/objectives/:id - soft-delete (idempotent)
// ?permanent=true - hard purge: requires deleted_at IS NOT NULL first.
//   Sets title='[supprimé]' + metadata.purged=true (preserves FK history).
objectivesRouter.delete('/:id', zValidator('param', ObjectiveIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  if (permanent) {
    // Permanent purge - must be soft-deleted already
    const row = await c.env.DB.prepare(`SELECT id, deleted_at FROM objectives WHERE id = ?`)
      .bind(id)
      .first<{ id: number; deleted_at: string | null }>();
    if (!row) return c.json({ error: 'objective_not_found' }, 404);
    if (!row.deleted_at) return c.json({ error: 'must_be_in_trash_first' }, 400);

    await c.env.DB.prepare(
      `UPDATE objectives
           SET title = '[supprimé]',
               metadata = json_set(COALESCE(metadata, '{}'), '$.purged', json('true'))
           WHERE id = ?`,
    )
      .bind(id)
      .run();

    return c.json({ ok: true, purged: true });
  }

  // Soft-delete: update only if not already deleted
  const res = await c.env.DB.prepare(
    `UPDATE objectives SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(id)
    .run();

  if (res.meta.changes === 0) {
    const exists = await c.env.DB.prepare(`SELECT id FROM objectives WHERE id = ?`)
      .bind(id)
      .first();
    return c.json({ ok: Boolean(exists), idempotent: true });
  }
  return c.json({ ok: true });
});

// ── Helper: extract phases_count from objective metadata/notes ───────────────
/**
 * Extracts an integer phases_count from the objective's
 * metadata JSON field. Looks for `{ "phases_count": N }` (integer 1-12).
 * Returns null if missing, malformed, or out of range.
 */
function extractPhasesFromNotes(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  if (!metadata) return null;
  const raw = metadata['phases_count'];
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > 12) return null;
  return raw;
}

// POST /api/objectives/:id/restore - un-soft-delete (idempotent)
objectivesRouter.post('/:id/restore', zValidator('param', ObjectiveIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const res = await c.env.DB.prepare(
    `UPDATE objectives SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
  )
    .bind(id)
    .run();

  if (res.meta.changes === 0) {
    const exists = await c.env.DB.prepare(`SELECT id FROM objectives WHERE id = ?`)
      .bind(id)
      .first();
    return c.json({ ok: Boolean(exists), idempotent: true });
  }
  return c.json({ ok: true });
});

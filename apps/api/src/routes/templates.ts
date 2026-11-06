import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings } from '../index';
import type { QuestTemplateRow } from '../lib/d1';
import { getAgent } from '../lib/agent';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  TemplateIdParamSchema,
} from '../schemas/templates';
import { AutoCompleteRuleSchema } from '../schemas/auto-complete';
import type { AutoCompleteRule } from '../lib/auto-complete/types';

export const templatesRouter = new Hono<{ Bindings: Bindings }>();

const ListQuery = z.object({
  active: z.enum(['true', 'false']).optional(),
  show: z.enum(['trash']).optional(),
});

/**
 * Defensively parses the raw auto_complete_rule JSON string from D1.
 * Returns the parsed rule on success, null on any failure (malformed JSON,
 * schema mismatch). Keeps the template usable even if the rule is corrupt.
 */
function hydrateRule(raw: string | null): AutoCompleteRule | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const ok = AutoCompleteRuleSchema.safeParse(parsed);
    return ok.success ? ok.data : null;
  } catch {
    return null;
  }
}

// GET /api/templates
// ?show=trash → soft-deleted rows; default → active (deleted_at IS NULL)
// Legacy ?active=true|false filter kept for backwards compatibility (applies
// only on the active set - trash mode ignores it).
templatesRouter.get('/', zValidator('query', ListQuery), async (c) => {
  const { active, show } = c.req.valid('query');
  const showTrash = show === 'trash';

  let sql: string;
  if (showTrash) {
    // Trash: soft-deleted rows, excluding purged ones.
    // json_extract returns a boolean true (integer 1) for json('true'), not the
    // string 'true'. Use != 1 to exclude purged rows.
    sql = `SELECT * FROM quest_templates WHERE deleted_at IS NOT NULL AND (metadata IS NULL OR COALESCE(json_extract(metadata, '$.purged'), 0) != 1) ORDER BY pillar_id, title`;
  } else {
    // Active set - honour legacy ?active filter
    let where = `deleted_at IS NULL`;
    if (active === 'true') where += ` AND active = 1`;
    else if (active === 'false') where += ` AND active = 0`;
    sql = `SELECT * FROM quest_templates WHERE ${where} ORDER BY pillar_id, id`;
  }

  const { results } = await c.env.DB.prepare(sql).all<QuestTemplateRow>();
  return c.json({
    templates: results.map((r) => ({
      ...r,
      auto_complete_rule: hydrateRule(r.auto_complete_rule),
    })),
  });
});

// POST /api/templates - create
templatesRouter.post('/', zValidator('json', CreateTemplateSchema), async (c) => {
  const body = c.req.valid('json');
  const agent = getAgent(c.env);
  const template = await agent.createTemplate(body);
  return c.json(
    { template: { ...template, auto_complete_rule: hydrateRule(template.auto_complete_rule) } },
    201,
  );
});

// GET /api/templates/:id - single template (active only by default)
// ?include_trash=1 also returns soft-deleted rows (needed by trash-restore flow)
templatesRouter.get('/:id', zValidator('param', TemplateIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const includeTrash = c.req.query('include_trash') === '1';
  const whereClause = includeTrash ? '' : ` AND deleted_at IS NULL`;
  const row = await c.env.DB.prepare(`SELECT * FROM quest_templates WHERE id = ?${whereClause}`)
    .bind(id)
    .first<QuestTemplateRow>();
  if (!row) return c.json({ error: 'template_not_found' }, 404);
  return c.json({ template: { ...row, auto_complete_rule: hydrateRule(row.auto_complete_rule) } });
});

// GET /api/templates/:id/completion-count
// Returns the number of completions linked to quests generated from this template.
// Used by the soft-delete confirmation modal copy.
templatesRouter.get(
  '/:id/completion-count',
  zValidator('param', TemplateIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt
         FROM completions c
         JOIN quests q ON c.quest_id = q.id
         WHERE q.template_id = ?`,
    )
      .bind(id)
      .first<{ cnt: number }>();
    return c.json({ count: row?.cnt ?? 0 });
  },
);

// PATCH /api/templates/:id - extended PATCH accepting all editable fields.
// Returns 404 if the template is soft-deleted (must restore first).
templatesRouter.patch(
  '/:id',
  zValidator('param', TemplateIdParamSchema),
  zValidator('json', UpdateTemplateSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');

    const existing = await c.env.DB.prepare(
      `SELECT id, deleted_at FROM quest_templates WHERE id = ?`,
    )
      .bind(id)
      .first<{ id: number; deleted_at: string | null }>();

    if (!existing) return c.json({ error: 'template_not_found' }, 404);
    if (existing.deleted_at != null)
      return c.json({ error: 'template_is_soft_deleted_restore_first' }, 404);

    // Build dynamic SET clause from defined keys in patch.
    const jsonFields = new Set([
      'progression_rule',
      'schedule_config',
      'metadata',
      'auto_complete_rule',
    ]);
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
      `UPDATE quest_templates SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(...binds)
      .run();

    const updated = await c.env.DB.prepare(`SELECT * FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first<QuestTemplateRow>();
    if (!updated) return c.json({ error: 'template_not_found' }, 404);
    return c.json({
      template: { ...updated, auto_complete_rule: hydrateRule(updated.auto_complete_rule) },
    });
  },
);

// DELETE /api/templates/:id - soft-delete (idempotent)
// ?permanent=true - hard purge: requires deleted_at IS NOT NULL first.
//   Sets title='[supprimé]' + metadata.purged=true (preserves FK history).
templatesRouter.delete('/:id', zValidator('param', TemplateIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  if (permanent) {
    // Permanent purge - must be soft-deleted already
    const row = await c.env.DB.prepare(`SELECT id, deleted_at FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first<{ id: number; deleted_at: string | null }>();
    if (!row) return c.json({ error: 'template_not_found' }, 404);
    if (!row.deleted_at) return c.json({ error: 'must_be_in_trash_first' }, 400);

    await c.env.DB.prepare(
      `UPDATE quest_templates
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
    `UPDATE quest_templates SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(id)
    .run();

  if (res.meta.changes === 0) {
    const exists = await c.env.DB.prepare(`SELECT id FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first();
    return c.json({ ok: Boolean(exists), idempotent: true });
  }
  return c.json({ ok: true });
});

// POST /api/templates/:id/restore - un-soft-delete (idempotent)
templatesRouter.post('/:id/restore', zValidator('param', TemplateIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const res = await c.env.DB.prepare(
    `UPDATE quest_templates SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
  )
    .bind(id)
    .run();

  if (res.meta.changes === 0) {
    const exists = await c.env.DB.prepare(`SELECT id FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first();
    return c.json({ ok: Boolean(exists), idempotent: true });
  }
  return c.json({ ok: true });
});

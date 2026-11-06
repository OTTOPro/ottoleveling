import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../index';
import type { ArcRow } from '../lib/arcs/types';

export const arcsRouter = new Hono<{ Bindings: Bindings }>();

const StatusFilter = z.enum(['active', 'completed', 'failed', 'abandoned']);

arcsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  let sql = `SELECT * FROM quest_arcs`;
  const binds: unknown[] = [];
  if (status) {
    const parsed = StatusFilter.safeParse(status);
    if (!parsed.success) return c.json({ error: 'invalid_status' }, 400);
    sql += ` WHERE status = ?`;
    binds.push(parsed.data);
  }
  sql += ` ORDER BY started_at DESC, id DESC`;
  const stmt = binds.length > 0 ? c.env.DB.prepare(sql).bind(...binds) : c.env.DB.prepare(sql);
  const { results } = await stmt.all<ArcRow>();
  return c.json({ arcs: results });
});

arcsRouter.post('/:id/abandon', async (c) => {
  const idParam = c.req.param('id');
  const id = Number(idParam);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ error: 'invalid_id' }, 400);
  }
  const row = await c.env.DB.prepare(`SELECT * FROM quest_arcs WHERE id = ?`)
    .bind(id)
    .first<ArcRow>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status === 'abandoned') {
    return c.json({ arc: row }); // idempotent
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE quest_arcs SET status = 'abandoned', completed_at = ? WHERE id = ?`,
  )
    .bind(now, id)
    .run();
  const updated = await c.env.DB.prepare(`SELECT * FROM quest_arcs WHERE id = ?`)
    .bind(id)
    .first<ArcRow>();
  return c.json({ arc: updated });
});

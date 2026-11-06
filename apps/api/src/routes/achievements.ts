import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../index';

export const achievementsRouter = new Hono<{ Bindings: Bindings }>();

/**
 * GET /api/achievements[?unlocked=true|false]
 *
 * Lists every achievement row (locked + unlocked) by default. The optional
 * `unlocked` query param narrows to unlocked-only or locked-only.
 *
 * Auth: x-dev-token (applied globally via app.use in src/index.ts - no
 * router-level middleware needed).
 *
 * Ordering note: D1 (SQLite) does not support `NULLS LAST`. SQLite sorts NULLs
 * FIRST with `DESC`, which is the opposite of what we want for the "all" case
 * (we'd prefer unlocked rows first). We compensate with a `CASE WHEN ... IS
 * NULL` discriminator so unlocked rows sort before locked rows; within each
 * group, `unlocked_at DESC` then `id ASC` provide deterministic order.
 */
const QuerySchema = z.object({
  unlocked: z.enum(['true', 'false']).optional(),
});

achievementsRouter.get('/', async (c) => {
  const parsed = QuerySchema.safeParse({ unlocked: c.req.query('unlocked') });
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_query', detail: parsed.error.flatten() }, 400);
  }

  let sql = `SELECT id, name, description, unlocked_at, pillar_id, trigger_type, trigger_config FROM achievements`;
  if (parsed.data.unlocked === 'true') sql += ` WHERE unlocked_at IS NOT NULL`;
  else if (parsed.data.unlocked === 'false') sql += ` WHERE unlocked_at IS NULL`;
  sql += ` ORDER BY CASE WHEN unlocked_at IS NULL THEN 1 ELSE 0 END, unlocked_at DESC, id ASC`;

  const { results } = await c.env.DB.prepare(sql).all();
  return c.json({ achievements: results });
});

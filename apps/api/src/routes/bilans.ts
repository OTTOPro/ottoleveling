import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { getAgent } from '../lib/agent';
import {
  BilanIdParamSchema,
  GenerateBilanBodySchema,
  ListBilansQuerySchema,
} from '../schemas/bilans';

interface BilanRow {
  id: number;
  period_type: 'weekly' | 'monthly' | 'yearly';
  period_start: string;
  period_end: string;
  stats: string;
  narrative: string;
  generated_at: string;
}

export const bilansRouter = new Hono<{ Bindings: Bindings }>();

bilansRouter.get('/', zValidator('query', ListBilansQuerySchema), async (c) => {
  const { period_type } = c.req.valid('query');
  let sql = `SELECT id, period_type, period_start, period_end, generated_at FROM bilans`;
  const binds: string[] = [];
  if (period_type) {
    sql += ` WHERE period_type = ?`;
    binds.push(period_type);
  }
  sql += ` ORDER BY period_start DESC`;
  const stmt = binds.length > 0 ? c.env.DB.prepare(sql).bind(...binds) : c.env.DB.prepare(sql);
  const { results } = await stmt.all();
  return c.json({ bilans: results });
});

bilansRouter.get('/:id', zValidator('param', BilanIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const row = await c.env.DB.prepare(`SELECT * FROM bilans WHERE id = ?`)
    .bind(id)
    .first<BilanRow>();
  if (!row) return c.json({ error: 'bilan_not_found' }, 404);
  let parsedStats: unknown;
  try {
    parsedStats = JSON.parse(row.stats);
  } catch {
    parsedStats = null;
  }
  return c.json({ bilan: { ...row, stats: parsedStats } });
});

bilansRouter.post('/generate', zValidator('json', GenerateBilanBodySchema), async (c) => {
  const body = c.req.valid('json');
  const agent = getAgent(c.env);
  const result = await agent.generateBilan(body.period_type, body.period_start, body.period_end);
  return c.json({ bilan: result });
});

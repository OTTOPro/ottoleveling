import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import type { QuestRow, CompletionRow } from '../lib/d1';
import {
  CreateManualQuestSchema,
  QuestIdParamSchema,
  CompleteQuestBodySchema,
} from '../schemas/quests';
import { getAgent } from '../lib/agent';
import { cacheKeyForToday, secondsUntilMidnightUtc, invalidateTodayCache } from '../lib/cache';

export const questsRouter = new Hono<{ Bindings: Bindings }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

questsRouter.get('/today', async (c) => {
  const date = new Date().toISOString().slice(0, 10);
  const key = cacheKeyForToday(date);

  // Read the async generation status flag set by the
  // queue consumer. Returns 'idle' | 'pending' | 'ready' | 'failed'.
  // The frontend uses this to render a skeleton when status === 'pending'.
  const generation_status = (await c.env.KV.get(`generation_status:${date}`)) ?? 'idle';

  // KV cache hit path.
  const cached = await c.env.KV.get(key);
  if (cached) {
    const parsed = JSON.parse(cached) as {
      quests: QuestRow[];
      reasoning: string | null;
      completions: CompletionRow[];
    };
    return c.json({ ...parsed, generation_status });
  }

  // D1 fallback.
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM quests WHERE scheduled_for = ? ORDER BY id`,
  )
    .bind(date)
    .all<QuestRow>();

  // Also fetch completions for today's quests so the frontend can hydrate
  // the completions Map and hide action buttons for already-resolved quests.
  const { results: completions } = await c.env.DB.prepare(
    `
      SELECT c.* FROM completions c
      INNER JOIN quests q ON q.id = c.quest_id
      WHERE q.scheduled_for = ?
    `,
  )
    .bind(date)
    .all<CompletionRow>();

  // The agent's reasoning is not persisted - it's transient at
  // generation time. Frontend handles null gracefully.
  const payload = { quests: results, reasoning: null, completions };

  // Cache for the rest of the UTC day.
  await c.env.KV.put(key, JSON.stringify(payload), {
    expirationTtl: secondsUntilMidnightUtc(),
  });

  return c.json({ ...payload, generation_status });
});

questsRouter.post('/manual', zValidator('json', CreateManualQuestSchema), async (c) => {
  const body = c.req.valid('json');
  const scheduled = body.scheduled_for ?? today();
  const result = await c.env.DB.prepare(
    `INSERT INTO quests
        (pillar_id, title, description, xp_value, difficulty, source, objective_id, scheduled_for)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
       RETURNING *`,
  )
    .bind(
      body.pillar_id,
      body.title,
      body.description ?? null,
      body.xp_value,
      body.difficulty,
      body.objective_id ?? null,
      scheduled,
    )
    .first<QuestRow>();
  if (!result) return c.json({ error: 'insert_failed' }, 500);
  await invalidateTodayCache(c.env.KV, result.scheduled_for);
  return c.json({ quest: result }, 201);
});

async function delegate(
  c: Context<{ Bindings: Bindings }>,
  id: number,
  action: 'complete' | 'fail' | 'skip',
  notes: string | null,
): Promise<Response> {
  const agent = getAgent(c.env);
  const result = await agent.recordCompletion(id, action, notes);
  if (!result.ok) {
    if (result.error === 'quest_not_found') return c.json({ error: 'quest_not_found' }, 404);
    if (result.error === 'already_completed') return c.json({ error: 'already_completed' }, 409);
    return c.json({ error: result.error }, 500);
  }
  return c.json({ completion: result.completion }, 200);
}

questsRouter.post(
  '/:id/complete',
  zValidator('param', QuestIdParamSchema),
  zValidator('json', CompleteQuestBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return delegate(c, id, 'complete', body?.notes ?? null);
  },
);

questsRouter.post(
  '/:id/fail',
  zValidator('param', QuestIdParamSchema),
  zValidator('json', CompleteQuestBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return delegate(c, id, 'fail', body?.notes ?? null);
  },
);

questsRouter.post(
  '/:id/skip',
  zValidator('param', QuestIdParamSchema),
  zValidator('json', CompleteQuestBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return delegate(c, id, 'skip', body?.notes ?? null);
  },
);

questsRouter.post('/generate', async (c) => {
  const agent = getAgent(c.env);
  const result = await agent.generateDaily();
  return c.json(result);
});

questsRouter.post('/regenerate', async (c) => {
  const agent = getAgent(c.env);
  const result = await agent.regenerateDaily();
  return c.json(result);
});

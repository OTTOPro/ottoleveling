import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { getAgent } from '../lib/agent';
import { SetFocusSchema } from '../schemas/focus';

export const focusRouter = new Hono<{ Bindings: Bindings }>();

focusRouter.get('/', async (c) => {
  const agent = getAgent(c.env);
  const focus = await agent.getFocus();
  return c.json({ focus });
});

focusRouter.post('/', zValidator('json', SetFocusSchema), async (c) => {
  const { pillar_id, horizon } = c.req.valid('json');
  const agent = getAgent(c.env);
  const focus = await agent.setFocus(pillar_id, horizon);
  return c.json({ focus }, 201);
});

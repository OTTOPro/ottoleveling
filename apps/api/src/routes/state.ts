import { Hono } from 'hono';
import type { Bindings } from '../index';
import { getAgent } from '../lib/agent';

export const stateRouter = new Hono<{ Bindings: Bindings }>();

stateRouter.get('/', async (c) => {
  const agent = getAgent(c.env);
  const state = await agent.getState();
  return c.json({ state });
});
